import type { Bar } from '../alpaca.js';

export interface BacktestConfig {
  rsiMin: number;
  rsiMax: number;
  minDailyDrop: number;        // e.g. 3 → applied as <= -3%
  minRelVol: number;
  gapMin: number;              // most-negative allowed gap, e.g. -4
  gapMax: number;              // least-negative allowed gap, e.g. -1
  requireAbove50sma: boolean;
  requireBelowPriorLow: boolean;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  rsiMin: 35,
  rsiMax: 50,
  minDailyDrop: 3,
  minRelVol: 1.5,
  gapMin: -4,
  gapMax: -1,
  requireAbove50sma: false,
  requireBelowPriorLow: false,
};

export interface BacktestTrade {
  ticker: string;
  day0Date: string;
  day1Date: string;
  day0Close: number;
  day1Open: number;
  gapPct: number;
  day0Rsi: number;
  day0RelVol: number;
  day0Drop: number;
  return5d: number | null;
  return10d: number | null;
  return20d: number | null;
  maxDrawdown20d: number;
  hitProfit5: boolean;
  hitProfit10: boolean;
  hitStop5: boolean;
  hitStop8: boolean;
  reclaimSma20Days: number | null;
}

// ── precomputation helpers (O(n) per indicator) ────────────────────────────

function precomputeSMA(bars: Bar[], period: number): Float64Array {
  const out = new Float64Array(bars.length);
  if (bars.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].c;
  out[period - 1] = sum / period;
  for (let i = period; i < bars.length; i++) {
    sum += bars[i].c - bars[i - period].c;
    out[i] = sum / period;
  }
  return out;
}

function precomputeRSI14(bars: Bar[]): Float64Array {
  const period = 14;
  const out = new Float64Array(bars.length).fill(50);
  if (bars.length <= period) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const chg = bars[i].c - bars[i - 1].c;
    if (chg >= 0) avgGain += chg; else avgLoss -= chg;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < bars.length; i++) {
    const chg = bars[i].c - bars[i - 1].c;
    avgGain = (avgGain * (period - 1) + (chg >= 0 ? chg : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (chg <  0 ? -chg : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// Rolling 30-day average volume (excludes current bar)
function precomputeRelVol(bars: Bar[], period = 30): Float64Array {
  const out = new Float64Array(bars.length);
  if (bars.length < period + 1) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].v;
  // out[period] = bars[period].v / (sum / period)
  for (let i = period; i < bars.length; i++) {
    const avg = sum / period;
    out[i] = avg > 0 ? bars[i].v / avg : 0;
    sum += bars[i].v - bars[i - period].v;
  }
  return out;
}

// ── stats helpers ──────────────────────────────────────────────────────────

function median(sorted: number[]): number {
  const n = sorted.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sharpe(returns: number[], periodDays: number): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return +(mean / std * Math.sqrt(252 / periodDays)).toFixed(2);
}

// ── core backtest ──────────────────────────────────────────────────────────

export function runBacktest(
  bars: Bar[],
  ticker: string,
  cfg: BacktestConfig,
): BacktestTrade[] {
  if (bars.length < 215) return [];

  const sma200 = precomputeSMA(bars, 200);
  const sma50  = precomputeSMA(bars, 50);
  const sma20  = precomputeSMA(bars, 20);
  const rsi14  = precomputeRSI14(bars);
  const relVol = precomputeRelVol(bars, 30);

  const trades: BacktestTrade[] = [];
  const lastIdx = bars.length - 1;

  for (let i = 210; i < lastIdx; i++) {
    const bar  = bars[i];
    const prev = bars[i - 1];
    const next = bars[i + 1];

    // ── Day 0 checks ──
    if (sma200[i] === 0 || bar.c <= sma200[i]) continue;
    if (cfg.requireAbove50sma && (sma50[i] === 0 || bar.c <= sma50[i])) continue;

    const dailyDrop = (bar.c - prev.c) / prev.c * 100;
    if (dailyDrop > -cfg.minDailyDrop) continue;

    if (relVol[i] < cfg.minRelVol) continue;

    const rsi = rsi14[i];
    if (rsi < cfg.rsiMin || rsi > cfg.rsiMax) continue;

    // ── Day 1 trigger ──
    const gapPct = (next.o - bar.c) / bar.c * 100;
    if (gapPct > cfg.gapMax || gapPct < cfg.gapMin) continue;
    if (cfg.requireBelowPriorLow && next.o >= bar.l) continue;

    // ── signal confirmed — compute forward returns ──
    const entry = next.o;

    const r5  = i + 6  <= lastIdx ? (bars[i + 6].c  - entry) / entry * 100 : null;
    const r10 = i + 11 <= lastIdx ? (bars[i + 11].c - entry) / entry * 100 : null;
    const r20 = i + 21 <= lastIdx ? (bars[i + 21].c - entry) / entry * 100 : null;

    let maxDd = 0;
    let hitP5 = false, hitP10 = false, hitS5 = false, hitS8 = false;
    const lookFwd = Math.min(i + 20, lastIdx);
    for (let j = i + 1; j <= lookFwd; j++) {
      const dd = (bars[j].l - entry) / entry * 100;
      if (dd < maxDd) maxDd = dd;
      if (bars[j].h >= entry * 1.05) hitP5  = true;
      if (bars[j].h >= entry * 1.10) hitP10 = true;
      if (bars[j].l <= entry * 0.95) hitS5  = true;
      if (bars[j].l <= entry * 0.92) hitS8  = true;
    }

    let reclaimDays: number | null = null;
    for (let j = i + 1; j <= Math.min(i + 30, lastIdx); j++) {
      if (sma20[j] > 0 && bars[j].c > sma20[j]) { reclaimDays = j - i; break; }
    }

    trades.push({
      ticker,
      day0Date:      bar.t.slice(0, 10),
      day1Date:      next.t.slice(0, 10),
      day0Close:     +bar.c.toFixed(2),
      day1Open:      +entry.toFixed(2),
      gapPct:        +gapPct.toFixed(2),
      day0Rsi:       +rsi.toFixed(1),
      day0RelVol:    +relVol[i].toFixed(2),
      day0Drop:      +dailyDrop.toFixed(2),
      return5d:      r5  !== null ? +r5.toFixed(2)  : null,
      return10d:     r10 !== null ? +r10.toFixed(2) : null,
      return20d:     r20 !== null ? +r20.toFixed(2) : null,
      maxDrawdown20d: +maxDd.toFixed(2),
      hitProfit5:    hitP5,
      hitProfit10:   hitP10,
      hitStop5:      hitS5,
      hitStop8:      hitS8,
      reclaimSma20Days: reclaimDays,
    });
  }

  return trades;
}

// ── aggregate metrics ──────────────────────────────────────────────────────

export interface PeriodStats {
  count: number;
  winRate: number;
  avg: number;
  med: number;
  sharpeRatio: number;
}

export interface BacktestMetrics {
  totalSignals: number;
  dateRange: { from: string; to: string };
  d5: PeriodStats;
  d10: PeriodStats;
  d20: PeriodStats;
  avgMaxDrawdown: number;
  hitProfit5Rate: number;
  hitProfit10Rate: number;
  hitStop5Rate: number;
  hitStop8Rate: number;
  avgReclaimDays: number | null;
  best: { ticker: string; date: string; return20d: number } | null;
  worst: { ticker: string; date: string; return20d: number } | null;
}

function periodStats(returns: (number | null)[], periodDays: number): PeriodStats {
  const valid = returns.filter((r): r is number => r !== null);
  if (!valid.length) return { count: 0, winRate: 0, avg: 0, med: 0, sharpeRatio: 0 };
  const wins = valid.filter(r => r > 0).length;
  const sorted = [...valid].sort((a, b) => a - b);
  const avg = valid.reduce((s, r) => s + r, 0) / valid.length;
  return {
    count:       valid.length,
    winRate:     +(wins / valid.length * 100).toFixed(1),
    avg:         +avg.toFixed(2),
    med:         +median(sorted).toFixed(2),
    sharpeRatio: sharpe(valid, periodDays),
  };
}

export function computeMetrics(trades: BacktestTrade[]): BacktestMetrics | null {
  if (!trades.length) return null;

  const n = trades.length;
  const dates = trades.map(t => t.day0Date).sort();

  const d5  = periodStats(trades.map(t => t.return5d),  5);
  const d10 = periodStats(trades.map(t => t.return10d), 10);
  const d20 = periodStats(trades.map(t => t.return20d), 20);

  const avgMaxDd = trades.reduce((s, t) => s + t.maxDrawdown20d, 0) / n;

  const reclaimArr = trades.map(t => t.reclaimSma20Days).filter((d): d is number => d !== null);
  const avgReclaim = reclaimArr.length
    ? +(reclaimArr.reduce((s, d) => s + d, 0) / reclaimArr.length).toFixed(1)
    : null;

  const withR20 = trades
    .filter(t => t.return20d !== null)
    .sort((a, b) => (b.return20d as number) - (a.return20d as number));

  return {
    totalSignals: n,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    d5, d10, d20,
    avgMaxDrawdown: +avgMaxDd.toFixed(2),
    hitProfit5Rate:  +(trades.filter(t => t.hitProfit5).length  / n * 100).toFixed(1),
    hitProfit10Rate: +(trades.filter(t => t.hitProfit10).length / n * 100).toFixed(1),
    hitStop5Rate:    +(trades.filter(t => t.hitStop5).length    / n * 100).toFixed(1),
    hitStop8Rate:    +(trades.filter(t => t.hitStop8).length    / n * 100).toFixed(1),
    avgReclaimDays:  avgReclaim,
    best:  withR20[0]                    ? { ticker: withR20[0].ticker,                    date: withR20[0].day0Date,                    return20d: withR20[0].return20d as number }                    : null,
    worst: withR20[withR20.length - 1]  ? { ticker: withR20[withR20.length - 1].ticker,  date: withR20[withR20.length - 1].day0Date,  return20d: withR20[withR20.length - 1].return20d as number }  : null,
  };
}
