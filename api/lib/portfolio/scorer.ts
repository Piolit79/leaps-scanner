import type { LivePositionData, PositionAxes, PositionScore, SignalAction } from './types';

function trendScore(live: LivePositionData): { score: number; reasons: string[] } {
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

function timeScore(dte: number): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score: number;

  if (dte > 180) {
    score = 3;
    reasons.push(`${dte}d to expiry — plenty of runway`);
  } else if (dte > 90) {
    score = 2;
    reasons.push(`${dte}d to expiry — good time left`);
  } else if (dte > 60) {
    score = 1;
    reasons.push(`${dte}d to expiry — monitor closely`);
  } else if (dte > 45) {
    score = -1;
    reasons.push(`${dte}d to expiry — theta accelerating ⚠️`);
  } else {
    score = -3;
    reasons.push(`${dte}d to expiry — theta destroying value ⚠️`);
  }

  return { score, reasons };
}

function structureScore(live: LivePositionData, pnlPct: number | null): { score: number; reasons: string[] } {
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

function momentumScore(live: LivePositionData): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const pct = live.pctFrom52wHigh;
  let score: number;

  if (pct >= -10) {
    score = 2;
    reasons.push(`Near 52-week high (${pct.toFixed(1)}%) — momentum strong`);
  } else if (pct >= -25) {
    score = 1;
    reasons.push(`${pct.toFixed(1)}% off 52w high — pullback within trend`);
  } else if (pct >= -40) {
    score = -1;
    reasons.push(`${pct.toFixed(1)}% off 52w high — significant correction`);
  } else {
    score = -2;
    reasons.push(`${pct.toFixed(1)}% off 52w high — deep correction ⚠️`);
  }

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
  const t = trendScore(live);
  const ti = timeScore(live.dte);
  const s = structureScore(live, pnlPct);
  const m = momentumScore(live);

  const axes: PositionAxes = {
    trend: t.score,
    time: ti.score,
    structure: s.score,
    momentum: m.score,
  };

  const total = axes.trend + axes.time + axes.structure + axes.momentum;
  const action = resolveAction(axes, total, live, pnlPct);
  const reasons = [...t.reasons, ...ti.reasons, ...s.reasons, ...m.reasons];

  return { axes, total, action, reasons };
}
