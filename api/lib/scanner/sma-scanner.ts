import type { Bar } from '../alpaca.js';

export interface SmaDipSignal {
  date: string;
  close: number;
  sma20: number;
  dropPct: number;
}

export interface SmaStockResult {
  ticker: string;
  companyName: string;
  marketCapB: number;
  currentPrice: number;
  currentSma20: number;
  currentDropPct: number;
  isCurrent: boolean;
  signals: SmaDipSignal[];
  signalCount: number;
  maxDropPct: number;
  firstSignalDate: string | null;
  lastSignalDate: string | null;
  priceHistory: Array<{ date: string; close: number; sma20: number }>;
}

const SMA_WINDOW = 20;
const DROP_THRESHOLD_PCT = 10;
const LOOKBACK_TRADING_DAYS = 90;

function smaAt(bars: Bar[], idx: number): number | null {
  if (idx < SMA_WINDOW - 1) return null;
  let sum = 0;
  for (let i = idx - SMA_WINDOW + 1; i <= idx; i++) sum += bars[i].c;
  return sum / SMA_WINDOW;
}

export function analyzeSmaSignals(
  bars: Bar[],
  ticker: string,
  companyName: string,
  marketCapB: number,
): SmaStockResult | null {
  if (bars.length < SMA_WINDOW + 5) return null;

  const lastIdx = bars.length - 1;
  const currentSma20 = smaAt(bars, lastIdx);
  if (!currentSma20) return null;

  const currentPrice = bars[lastIdx].c;
  const currentDropPct = ((currentPrice - currentSma20) / currentSma20) * 100;
  const isCurrent = currentDropPct <= -DROP_THRESHOLD_PCT;

  const startIdx = Math.max(SMA_WINDOW - 1, bars.length - LOOKBACK_TRADING_DAYS);

  const signals: SmaDipSignal[] = [];
  const priceHistory: Array<{ date: string; close: number; sma20: number }> = [];

  for (let i = startIdx; i <= lastIdx; i++) {
    const s = smaAt(bars, i);
    if (!s) continue;
    const bar = bars[i];
    const dropPct = ((bar.c - s) / s) * 100;
    priceHistory.push({ date: bar.t.slice(0, 10), close: bar.c, sma20: +s.toFixed(4) });
    if (dropPct <= -DROP_THRESHOLD_PCT) {
      signals.push({ date: bar.t.slice(0, 10), close: bar.c, sma20: +s.toFixed(4), dropPct: +dropPct.toFixed(2) });
    }
  }

  if (signals.length === 0 && !isCurrent) return null;

  const maxDropPct = signals.length > 0
    ? Math.min(...signals.map(s => s.dropPct))
    : +currentDropPct.toFixed(2);

  return {
    ticker,
    companyName,
    marketCapB,
    currentPrice,
    currentSma20: +currentSma20.toFixed(4),
    currentDropPct: +currentDropPct.toFixed(2),
    isCurrent,
    signals,
    signalCount: signals.length,
    maxDropPct: +maxDropPct.toFixed(2),
    firstSignalDate: signals[0]?.date ?? null,
    lastSignalDate: signals[signals.length - 1]?.date ?? null,
    priceHistory,
  };
}
