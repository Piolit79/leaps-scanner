import type { Bar } from '../alpaca.js';

export interface OHLCV {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface EventSignal {
  date: string;
  type: 'gap_volume' | 'high_drop';
  closePct: number;       // close-to-close % change (negative = down)
  gapPct: number;         // open vs prior close % (negative = gap down)
  volumeRatio: number;    // volume / 20-day avg volume
  dropFromHighPct: number; // close vs 20-day high % (negative = below)
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

const GAP_PCT = 7;         // min single-day drop % to qualify as a gap event
const VOL_RATIO = 1.5;     // min volume vs 20-day avg to confirm event-driven
const HIGH_DROP_PCT = 10;  // min drop from 20-day high to trigger high_drop
const SMA_WIN = 20;
const RECENT_BARS = 90;    // "current" signals lookback in trading days
const COOLDOWN = 5;        // bars to skip after a trigger fires (dedup)

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
): EventScanResult | null {
  if (bars.length < SMA_WIN + 10) return null;

  const lastIdx = bars.length - 1;
  const currentPrice = bars[lastIdx].c;

  // Index where "recent" window starts
  const recentStart = Math.max(SMA_WIN, lastIdx - RECENT_BARS + 1);

  const signals: EventSignal[] = [];
  let nextAllowed = 0;

  for (let i = SMA_WIN; i <= lastIdx; i++) {
    if (i < nextAllowed) continue;

    const bar = bars[i];
    const prev = bars[i - 1];

    const avgVol  = rollingAvg(bars, i, 20, b => b.v);
    const sma20   = rollingAvg(bars, i, SMA_WIN, b => b.c);
    const high20  = rollingMax(bars, i, 20, b => b.h);

    const closePct       = ((bar.c - prev.c) / prev.c) * 100;
    const gapPct         = ((bar.o - prev.c) / prev.c) * 100;
    const volRatio       = avgVol > 0 ? bar.v / avgVol : 0;
    const dropFromHigh   = high20 > 0 ? ((bar.c - high20) / high20) * 100 : 0;
    const wasAboveSma20  = prev.c > sma20;

    let type: EventSignal['type'] | null = null;

    // Gap/hard-drop + volume spike → event-driven selloff
    if ((gapPct <= -GAP_PCT || closePct <= -GAP_PCT) && volRatio >= VOL_RATIO) {
      type = 'gap_volume';
    } else if (dropFromHigh <= -HIGH_DROP_PCT) {
      // Only fire once: when price first crosses the -10% threshold
      const prevHigh20 = rollingMax(bars, i - 1, 20, b => b.h);
      const prevDrop   = prevHigh20 > 0 ? ((prev.c - prevHigh20) / prevHigh20) * 100 : 0;
      if (prevDrop > -HIGH_DROP_PCT) type = 'high_drop';
    }

    if (!type) continue;

    const rec20 = i + 20 <= lastIdx ? ((bars[i + 20].c - bar.c) / bar.c) * 100 : null;
    const rec60 = i + 60 <= lastIdx ? ((bars[i + 60].c - bar.c) / bar.c) * 100 : null;

    signals.push({
      date: bar.t.slice(0, 10),
      type,
      closePct:        +closePct.toFixed(2),
      gapPct:          +gapPct.toFixed(2),
      volumeRatio:     +volRatio.toFixed(2),
      dropFromHighPct: +dropFromHigh.toFixed(2),
      priceOnEvent:    bar.c,
      wasAboveSma20,
      recovery20d:     rec20 !== null ? +rec20.toFixed(2) : null,
      recovery60d:     rec60 !== null ? +rec60.toFixed(2) : null,
    });

    nextAllowed = i + COOLDOWN;
  }

  if (!signals.length) return null;

  const recentCutoff = bars[recentStart]?.t.slice(0, 10) ?? '';
  const recentSignals = signals.filter(s => s.date >= recentCutoff);
  const historicalSignals = signals.filter(s => s.date < recentCutoff)
    .sort((a, b) => b.date.localeCompare(a.date));  // newest first

  if (!recentSignals.length) return null;

  const ohlc: OHLCV[] = bars.slice(-RECENT_BARS).map(b => ({
    t: b.t.slice(0, 10),
    o: b.o,
    h: b.h,
    l: b.l,
    c: b.c,
    v: b.v,
  }));

  return { ticker, companyName, marketCapB, currentPrice, recentSignals, historicalSignals, ohlc };
}
