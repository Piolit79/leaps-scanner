import type { Bar } from '../alpaca.js';

export interface ScanConfig {
  earningsGapPct: number;       // default 10
  singleDayDropPct: number;     // default 10
  singleDayDropMaxPct: number;  // default 40
  highDropPct: number;          // default 20
  rollingDropPct: number;       // default 15
  rollingDays: number;          // default 30
  smaBelowPct: number;          // default 15
}

export interface DipResult {
  triggerEarningsGap: boolean;
  triggerSingleDay: boolean;
  triggerHighDrop: boolean;
  triggerRolling: boolean;
  anyTriggered: boolean;
  drop1dayPct: number | null;
  dropFromHighPct: number | null;
  drop30dayPct: number | null;
  dipDate: string | null;
  preDipPrice: number | null;
  price52wHigh: number | null;
  sma200: number | null;
  preDipAboveSma: boolean;
  postDipSmaPct: number | null;
  manualReview: boolean;
  currentPrice: number;
}

export function analyzeDips(bars: Bar[], earningsDate: string | null, cfg: ScanConfig): DipResult {
  if (bars.length < 50) {
    return emptyResult(bars.at(-1)?.c ?? 0);
  }

  const currentPrice = bars.at(-1)!.c;

  // 52-week high (last 252 trading days)
  const yr = bars.slice(-252);
  const price52wHigh = Math.max(...yr.map(b => b.h));

  // 200-day SMA
  const sma200Bars = bars.slice(-200);
  const sma200 = sma200Bars.reduce((s, b) => s + b.c, 0) / sma200Bars.length;

  // Rolling 30-day drop
  const rolling = bars.slice(-cfg.rollingDays);
  const rollingStart = rolling[0]?.c ?? currentPrice;
  const drop30dayPct = ((currentPrice - rollingStart) / rollingStart) * 100;

  // Single-day drop (most recent session)
  const prev = bars.at(-2)?.c ?? currentPrice;
  const drop1dayPct = ((currentPrice - prev) / prev) * 100;

  // Drop from 52w high
  const dropFromHighPct = ((currentPrice - price52wHigh) / price52wHigh) * 100;

  // Triggers
  const triggerHighDrop = dropFromHighPct <= -cfg.highDropPct;
  const triggerRolling = drop30dayPct <= -cfg.rollingDropPct;
  const triggerSingleDay =
    drop1dayPct <= -cfg.singleDayDropPct &&
    drop1dayPct >= -cfg.singleDayDropMaxPct;

  // Earnings gap-down: check if dip date matches an earnings date
  let triggerEarningsGap = false;
  let dipDate: string | null = null;
  let preDipPrice: number | null = null;

  if (earningsDate) {
    // Find the bar on/after earnings date with biggest single-day drop
    const earningsIdx = bars.findIndex(b => b.t.slice(0, 10) >= earningsDate);
    if (earningsIdx > 0) {
      const earningsBar = bars[earningsIdx];
      const priorClose = bars[earningsIdx - 1].c;
      const gapPct = ((earningsBar.o - priorClose) / priorClose) * 100;
      if (gapPct <= -cfg.earningsGapPct) {
        triggerEarningsGap = true;
        dipDate = earningsBar.t.slice(0, 10);
        preDipPrice = priorClose;
      }
    }
  }

  // For non-earnings dips, use most recent significant drop date as dip date
  if (!dipDate && (triggerSingleDay || triggerHighDrop || triggerRolling)) {
    dipDate = bars.at(-1)!.t.slice(0, 10);
    // Pre-dip price: close before the rolling window started
    preDipPrice = bars.slice(-cfg.rollingDays - 1)[0]?.c ?? currentPrice;
  }

  // Pre-dip above 200 SMA check
  const preDipBar = preDipPrice !== null
    ? bars.find(b => Math.abs(b.c - preDipPrice!) / preDipPrice! < 0.005)
    : bars.at(-cfg.rollingDays - 1);
  const sma200AtPreDip = computeSma200AtBar(bars, preDipBar);
  const preDipAboveSma = preDipBar ? preDipBar.c > (sma200AtPreDip ?? sma200) : false;

  // Manual review: if post-dip price is >15% below 200 SMA
  const postDipSmaPct = sma200 > 0 ? ((currentPrice - sma200) / sma200) * 100 : null;
  const manualReview = postDipSmaPct !== null && postDipSmaPct < -cfg.smaBelowPct;

  const anyTriggered = triggerEarningsGap || triggerSingleDay || triggerHighDrop || triggerRolling;

  return {
    triggerEarningsGap, triggerSingleDay, triggerHighDrop, triggerRolling,
    anyTriggered, drop1dayPct, dropFromHighPct, drop30dayPct,
    dipDate, preDipPrice, price52wHigh, sma200, preDipAboveSma,
    postDipSmaPct, manualReview, currentPrice,
  };
}

function computeSma200AtBar(bars: Bar[], targetBar: Bar | undefined): number | null {
  if (!targetBar) return null;
  const idx = bars.findIndex(b => b.t === targetBar.t);
  if (idx < 200) return null;
  const slice = bars.slice(idx - 200, idx);
  return slice.reduce((s, b) => s + b.c, 0) / slice.length;
}

function emptyResult(currentPrice: number): DipResult {
  return {
    triggerEarningsGap: false, triggerSingleDay: false,
    triggerHighDrop: false, triggerRolling: false, anyTriggered: false,
    drop1dayPct: null, dropFromHighPct: null, drop30dayPct: null,
    dipDate: null, preDipPrice: null, price52wHigh: null, sma200: null,
    preDipAboveSma: false, postDipSmaPct: null, manualReview: false, currentPrice,
  };
}
