import type { Bar } from '../alpaca.js';

export interface OHLCV {
  t: string; o: number; h: number; l: number; c: number; v: number;
}

export interface EventSignal {
  date: string;
  type: 'gap_volume' | 'high_drop';
  closePct: number;
  gapPct: number;
  volumeRatio: number;
  dropFromHighPct: number;
  priceOnEvent: number;
  wasAboveSma20: boolean;
  recovery20d: number | null;
  recovery60d: number | null;
}

export interface EventScanResult {
  ticker: string;
  companyName: string;
  marketCapB: number;
  currentPrice: number;
  recentSignals: EventSignal[];
  historicalSignals: EventSignal[];
  ohlc: OHLCV[];
}

export interface EventConfig {
  gapPct: number;       // min single-day drop % for gap_volume (default 5)
  volRatio: number;     // min volume / 20d avg for gap_volume (default 1.3)
  highDropPct: number;  // min drop from 20-day high for high_drop (default 8)
  recentBars: number;   // "current" lookback in trading days (default 90)
}

export const DEFAULT_CONFIG: EventConfig = {
  gapPct: 5,
  volRatio: 1.3,
  highDropPct: 8,
  recentBars: 90,
};

const SMA_WIN = 20;
const GAP_COOLDOWN      = 5;   // trading days to skip after a gap_volume trigger
const HIGH_DROP_COOLDOWN = 15;  // longer cooldown for high_drop to avoid spam

function rollingAvg(bars: Bar[], endIdx: number, window: number, fn: (b: Bar) => number): number {
  const slice = bars.slice(Math.max(0, endIdx - window), endIdx);
  if (!slice.length) return 0;
  return slice.reduce((s, b) => s + fn(b), 0) / slice.length;
}

function rollingMax(bars: Bar[], endIdx: number, window: number, fn: (b: Bar) => number): number {
  const slice = bars.slice(Math.max(0, endIdx - window), endIdx);
  if (!slice.length) return 0;
  return Math.max(...slice.map(fn));
}

export function detectEvents(
  bars: Bar[],
  ticker: string,
  companyName: string,
  marketCapB: number,
  cfg: EventConfig = DEFAULT_CONFIG,
): EventScanResult | null {
  if (bars.length < SMA_WIN + 10) return null;

  const lastIdx = bars.length - 1;
  const currentPrice = bars[lastIdx].c;
  const recentStart = Math.max(SMA_WIN, lastIdx - cfg.recentBars + 1);

  const signals: EventSignal[] = [];
  // Separate cooldowns per type so a high_drop doesn't block a gap_volume
  let gapNextAllowed      = 0;
  let highDropNextAllowed = 0;

  for (let i = SMA_WIN; i <= lastIdx; i++) {
    const bar  = bars[i];
    const prev = bars[i - 1];

    const avgVol     = rollingAvg(bars, i, 20, b => b.v);
    const sma20      = rollingAvg(bars, i, SMA_WIN, b => b.c);
    const high20     = rollingMax(bars, i, 20, b => b.h);

    const closePct      = ((bar.c - prev.c) / prev.c) * 100;
    const gapPct        = ((bar.o - prev.c) / prev.c) * 100;
    const volRatio      = avgVol > 0 ? bar.v / avgVol : 0;
    const dropFromHigh  = high20 > 0 ? ((bar.c - high20) / high20) * 100 : 0;
    const wasAboveSma20 = prev.c > sma20;

    const rec20 = i + 20 <= lastIdx ? ((bars[i + 20].c - bar.c) / bar.c) * 100 : null;
    const rec60 = i + 60 <= lastIdx ? ((bars[i + 60].c - bar.c) / bar.c) * 100 : null;

    const base: Omit<EventSignal, 'type'> = {
      date: bar.t.slice(0, 10),
      closePct:        +closePct.toFixed(2),
      gapPct:          +gapPct.toFixed(2),
      volumeRatio:     +volRatio.toFixed(2),
      dropFromHighPct: +dropFromHigh.toFixed(2),
      priceOnEvent:    bar.c,
      wasAboveSma20,
      recovery20d:     rec20 !== null ? +rec20.toFixed(2) : null,
      recovery60d:     rec60 !== null ? +rec60.toFixed(2) : null,
    };

    // gap_volume: hard single-day drop with volume confirmation
    if (i >= gapNextAllowed &&
        (gapPct <= -cfg.gapPct || closePct <= -cfg.gapPct) &&
        volRatio >= cfg.volRatio) {
      signals.push({ ...base, type: 'gap_volume' });
      gapNextAllowed = i + GAP_COOLDOWN;
    }

    // high_drop: close is N% below the 20-day rolling high.
    // Uses its own cooldown — no "first crossing" check needed.
    // This means a stock persistently in a dip will fire ~once per cooldown period.
    if (i >= highDropNextAllowed && dropFromHigh <= -cfg.highDropPct) {
      // Don't double-count if a gap_volume just fired on the same bar
      if (!signals.length || signals[signals.length - 1].date !== base.date) {
        signals.push({ ...base, type: 'high_drop' });
      }
      highDropNextAllowed = i + HIGH_DROP_COOLDOWN;
    }
  }

  if (!signals.length) return null;

  const recentCutoff    = bars[recentStart]?.t.slice(0, 10) ?? '';
  const recentSignals   = signals.filter(s => s.date >= recentCutoff);
  const historicalSignals = signals
    .filter(s => s.date < recentCutoff)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!recentSignals.length) return null;

  const ohlc: OHLCV[] = bars.slice(-cfg.recentBars).map(b => ({
    t: b.t.slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
  }));

  return { ticker, companyName, marketCapB, currentPrice, recentSignals, historicalSignals, ohlc };
}
