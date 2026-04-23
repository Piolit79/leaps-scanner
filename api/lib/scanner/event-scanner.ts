import type { Bar } from '../alpaca.js';

export interface OHLCV {
  t: string; o: number; h: number; l: number; c: number; v: number;
}

export interface PullbackSignal {
  date: string;
  type: 'pullback';
  dailyChangePct: number;
  relVolume: number;
  rsi14: number;
  sma200: number;
  pctAboveSma200: number;
  pctFrom52wHigh: number;
  avgDailyVol30d: number;
}

export interface PullbackScanResult {
  ticker: string;
  companyName: string;
  marketCapB: number;
  currentPrice: number;
  signal: PullbackSignal;
  ohlc: OHLCV[];
}

export interface PullbackConfig {
  ohlcBars: number;
}

export const DEFAULT_CONFIG: PullbackConfig = {
  ohlcBars: 180,
};

function computeRSI14(bars: Bar[], endIdx: number): number {
  const period = 14;
  if (endIdx < period) return 50;

  // Seed with first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const chg = bars[i].c - bars[i - 1].c;
    if (chg >= 0) avgGain += chg; else avgLoss -= chg;
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smooth through to endIdx
  for (let i = period + 1; i <= endIdx; i++) {
    const chg = bars[i].c - bars[i - 1].c;
    avgGain = (avgGain * (period - 1) + (chg >= 0 ? chg : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (chg < 0 ? -chg : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
}

export function detectPullback(
  bars: Bar[],
  ticker: string,
  companyName: string,
  marketCapB: number,
  cfg: PullbackConfig = DEFAULT_CONFIG,
): PullbackScanResult | null {
  // Need 200 bars for SMA + buffer
  if (bars.length < 210) return null;

  const lastIdx = bars.length - 1;
  const cur  = bars[lastIdx];
  const prev = bars[lastIdx - 1];

  const sma200 = bars.slice(lastIdx - 199, lastIdx + 1).reduce((s, b) => s + b.c, 0) / 200;
  const high52w = Math.max(...bars.slice(Math.max(0, lastIdx - 251), lastIdx + 1).map(b => b.h));

  // Exclude today's bar from baseline volume averages
  const vol20Bars = bars.slice(lastIdx - 20, lastIdx);
  const avgVol20  = vol20Bars.reduce((s, b) => s + b.v, 0) / vol20Bars.length;
  const vol30Bars = bars.slice(Math.max(0, lastIdx - 30), lastIdx);
  const avgVol30  = vol30Bars.reduce((s, b) => s + b.v, 0) / vol30Bars.length;

  const signal: PullbackSignal = {
    date:             cur.t.slice(0, 10),
    type:             'pullback',
    dailyChangePct:   +((cur.c - prev.c) / prev.c * 100).toFixed(2),
    relVolume:        avgVol20 > 0 ? +(cur.v / avgVol20).toFixed(2) : 0,
    rsi14:            +computeRSI14(bars, lastIdx),
    sma200:           +sma200.toFixed(2),
    pctAboveSma200:   +((cur.c - sma200) / sma200 * 100).toFixed(2),
    pctFrom52wHigh:   +((cur.c - high52w) / high52w * 100).toFixed(2),
    avgDailyVol30d:   Math.round(avgVol30),
  };

  const ohlc: OHLCV[] = bars.slice(Math.max(0, lastIdx - cfg.ohlcBars + 1)).map(b => ({
    t: b.t.slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
  }));

  return { ticker, companyName, marketCapB, currentPrice: cur.c, signal, ohlc };
}
