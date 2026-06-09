import { getStockBars, getStockSnapshot, getOptionSnapshots } from './alpaca';
import type { Bar } from './alpaca';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Position {
  id: string;
  ticker: string;
  strike: number;
  expiry_date: string;
  quantity: number;
  avg_cost: number;
  entry_date: string;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PositionAxes {
  trend: number;
  time: number;
  structure: number;
  momentum: number;
}

export type SignalAction =
  | 'HOLD_STRONG'
  | 'HOLD'
  | 'WATCH'
  | 'TRIM'
  | 'EXIT'
  | 'ROLL'
  | 'RECOVER_COST';

export interface PositionScore {
  axes: PositionAxes;
  total: number;
  action: SignalAction;
  reasons: string[];
}

export interface LivePositionData {
  underlyingPrice: number;
  underlyingDayChangePct: number;
  optionMark: number | null;
  rsi14: number;
  sma200: number;
  high52w: number;
  dte: number;
  pctFromStrike: number;
  pctFrom52wHigh: number;
  pctAboveSma200: number;
}

export interface EnrichedPosition extends Position {
  live: LivePositionData | null;
  score: PositionScore | null;
  pnlPct: number | null;
  pnlDollars: number | null;
  currentMark: number | null;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map(c => Math.max(0, c));
  const losses = changes.map(c => Math.max(0, -c));
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcSMA(closes: number[], period: number): number {
  const slice = closes.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((a: number, b: number) => a + b, 0) / slice.length;
}

function buildOCCSymbol(ticker: string, expiryDate: string, strike: number): string {
  const [year, month, day] = expiryDate.split('-');
  const dateStr = year.slice(2) + month + day;
  const strikeStr = Math.round(strike * 1000).toString().padStart(8, '0');
  return `${ticker}${dateStr}C${strikeStr}`;
}

function calcDTE(expiryDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + 'T00:00:00');
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86400000));
}

// ── Score engine ──────────────────────────────────────────────────────────────

function scoreTrend(live: LivePositionData): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (live.pctAboveSma200 > 0) {
    score += 2;
    reasons.push(`Above 200d SMA (+${live.pctAboveSma200.toFixed(1)}%) — trend intact`);
  } else {
    score -= 2;
    reasons.push(`Below 200d SMA (${live.pctAboveSma200.toFixed(1)}%) — trend broken ⚠️`);
  }
  if (live.rsi14 >= 40 && live.rsi14 <= 70) {
    score += 1;
    reasons.push(`RSI healthy (${live.rsi14.toFixed(0)}) — no extremes`);
  } else if (live.rsi14 < 30) {
    score -= 1;
    reasons.push(`RSI oversold (${live.rsi14.toFixed(0)}) — sustained weakness`);
  } else if (live.rsi14 > 82) {
    score -= 1;
    reasons.push(`RSI very extended (${live.rsi14.toFixed(0)}) — mean-revert risk`);
  }
  return { score: Math.max(-3, Math.min(3, score)), reasons };
}

function scoreTime(dte: number): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score: number;
  if (dte > 180)      { score = 3;  reasons.push(`${dte}d to expiry — plenty of runway`); }
  else if (dte > 90)  { score = 2;  reasons.push(`${dte}d to expiry — good time left`); }
  else if (dte > 60)  { score = 1;  reasons.push(`${dte}d to expiry — monitor closely`); }
  else if (dte > 45)  { score = -1; reasons.push(`${dte}d to expiry — theta accelerating ⚠️`); }
  else                { score = -3; reasons.push(`${dte}d to expiry — theta destroying value ⚠️`); }
  return { score, reasons };
}

function scoreStructure(live: LivePositionData, pnlPct: number | null): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const pct = live.pctFromStrike;
  if (pct > 15) {
    score += 1;
    reasons.push(`Deep ITM (+${pct.toFixed(1)}%) — intrinsic value building`);
  } else if (pct >= -5) {
    score += 1;
    reasons.push(`Near/at strike (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`);
  } else if (pct < -20 && pnlPct !== null && pnlPct < -60) {
    score -= 2;
    reasons.push(`Deep OTM (${pct.toFixed(1)}%) + down ${Math.abs(pnlPct).toFixed(0)}% ⚠️`);
  } else if (pct < -20) {
    score -= 1;
    reasons.push(`Deep OTM (${pct.toFixed(1)}%) — needs stock to move`);
  } else {
    reasons.push(`OTM by ${Math.abs(pct).toFixed(1)}%`);
  }
  if (pnlPct !== null && pnlPct < -75) {
    score -= 3;
    reasons.push(`Down ${Math.abs(pnlPct).toFixed(0)}% — near total loss ⚠️`);
  }
  return { score: Math.max(-3, Math.min(3, score)), reasons };
}

function scoreMomentum(live: LivePositionData): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const pct = live.pctFrom52wHigh;
  let score: number;
  if (pct >= -10)      { score = 2;  reasons.push(`Near 52-week high (${pct.toFixed(1)}%) — momentum strong`); }
  else if (pct >= -25) { score = 1;  reasons.push(`${pct.toFixed(1)}% off 52w high — pullback within trend`); }
  else if (pct >= -40) { score = -1; reasons.push(`${pct.toFixed(1)}% off 52w high — significant correction`); }
  else                 { score = -2; reasons.push(`${pct.toFixed(1)}% off 52w high — deep correction ⚠️`); }
  return { score, reasons };
}

function resolveAction(
  axes: PositionAxes,
  total: number,
  live: LivePositionData,
  pnlPct: number | null,
): SignalAction {
  if (pnlPct !== null && pnlPct >= 200) return 'RECOVER_COST';
  if (live.pctFromStrike > 15 && live.dte < 90) return 'ROLL';
  if (total < 0) return 'EXIT';
  if (total <= 1) return 'TRIM';
  if (total <= 3) return 'WATCH';
  if (total <= 6) return 'HOLD';
  return 'HOLD_STRONG';
}

export function scorePosition(live: LivePositionData, pnlPct: number | null): PositionScore {
  const t  = scoreTrend(live);
  const ti = scoreTime(live.dte);
  const s  = scoreStructure(live, pnlPct);
  const m  = scoreMomentum(live);
  const axes: PositionAxes = { trend: t.score, time: ti.score, structure: s.score, momentum: m.score };
  const total = axes.trend + axes.time + axes.structure + axes.momentum;
  const action = resolveAction(axes, total, live, pnlPct);
  return { axes, total, action, reasons: [...t.reasons, ...ti.reasons, ...s.reasons, ...m.reasons] };
}

// ── Live data enrichment ──────────────────────────────────────────────────────

export async function enrichPositions(positions: Position[]): Promise<EnrichedPosition[]> {
  if (positions.length === 0) return [];

  const tickers = [...new Set(positions.map(p => p.ticker))];

  const [barsEntries, snapEntries] = await Promise.all([
    Promise.all(
      tickers.map(async t => {
        try { return [t, await getStockBars(t, 400)] as [string, Bar[]]; }
        catch { return [t, [] as Bar[]] as [string, Bar[]]; }
      }),
    ),
    Promise.all(
      tickers.map(async t => {
        try { return [t, await getStockSnapshot(t)] as const; }
        catch { return [t, null] as const; }
      }),
    ),
  ]);

  const barsMap = Object.fromEntries(barsEntries) as Record<string, Bar[]>;
  const snapMap = Object.fromEntries(snapEntries);

  const occSymbols = positions.map(p => buildOCCSymbol(p.ticker, p.expiry_date, p.strike));
  const optSnaps = await getOptionSnapshots(occSymbols);

  return positions.map((p, i) => {
    const bars = barsMap[p.ticker] ?? [];
    const snap = snapMap[p.ticker];
    const occSym = occSymbols[i];

    if (!snap || bars.length < 20) {
      return { ...p, live: null, score: null, pnlPct: null, pnlDollars: null, currentMark: null };
    }

    const closes = bars.map((b: Bar) => b.c);
    const highs  = bars.map((b: Bar) => b.h);

    const underlyingPrice =
      snap.latestTrade?.p ?? snap.latestQuote?.ap ?? bars[bars.length - 1]?.c ?? 0;
    const prevClose = snap.prevDailyBar?.c ?? bars[bars.length - 2]?.c ?? underlyingPrice;
    const underlyingDayChangePct = prevClose > 0 ? ((underlyingPrice - prevClose) / prevClose) * 100 : 0;

    const rsi14       = calcRSI(closes);
    const sma200      = calcSMA(closes, Math.min(200, closes.length));
    const high52w     = highs.slice(-252).length > 0 ? Math.max(...highs.slice(-252)) : 0;
    const dte         = calcDTE(p.expiry_date);
    const pctFromStrike  = p.strike > 0 ? ((underlyingPrice - p.strike)  / p.strike)  * 100 : 0;
    const pctFrom52wHigh = high52w  > 0 ? ((underlyingPrice - high52w)   / high52w)   * 100 : 0;
    const pctAboveSma200 = sma200   > 0 ? ((underlyingPrice - sma200)    / sma200)    * 100 : 0;

    const optSnap = optSnaps[occSym] ?? null;
    let optionMark: number | null = null;
    if (optSnap) {
      const bid = optSnap.latestQuote?.bp ?? 0;
      const ask = optSnap.latestQuote?.ap ?? 0;
      if (bid > 0 && ask > 0) optionMark = (bid + ask) / 2;
      else if (optSnap.latestTrade?.p) optionMark = optSnap.latestTrade.p;
    }

    const pnlPct    = optionMark !== null ? ((optionMark - p.avg_cost) / p.avg_cost) * 100 : null;
    const pnlDollars = optionMark !== null ? (optionMark - p.avg_cost) * p.quantity * 100 : null;

    const live: LivePositionData = {
      underlyingPrice, underlyingDayChangePct, optionMark,
      rsi14, sma200, high52w, dte,
      pctFromStrike, pctFrom52wHigh, pctAboveSma200,
    };

    return { ...p, live, score: scorePosition(live, pnlPct), pnlPct, pnlDollars, currentMark: optionMark };
  });
}
