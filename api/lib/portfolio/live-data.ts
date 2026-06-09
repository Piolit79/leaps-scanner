import { getStockBars, getStockSnapshot, getOptionSnapshots } from '../alpaca';
import type { Bar } from '../alpaca';
import type { Position, LivePositionData, EnrichedPosition } from './types';
import { scorePosition } from './scorer';

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
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// Standard OCC option symbol format (no space padding — matches Alpaca's compact format)
export function buildOCCSymbol(ticker: string, expiryDate: string, strike: number): string {
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

export async function enrichPositions(positions: Position[]): Promise<EnrichedPosition[]> {
  if (positions.length === 0) return [];

  const tickers = [...new Set(positions.map(p => p.ticker))];

  // Parallel: bars + snapshots for all unique underlying tickers
  const [barsEntries, snapEntries] = await Promise.all([
    Promise.all(
      tickers.map(async t => {
        try {
          const bars = await getStockBars(t, 400);
          return [t, bars] as const;
        } catch {
          return [t, []] as const;
        }
      }),
    ),
    Promise.all(
      tickers.map(async t => {
        try {
          const snap = await getStockSnapshot(t);
          return [t, snap] as const;
        } catch {
          return [t, null] as const;
        }
      }),
    ),
  ]);

  const barsMap = Object.fromEntries(barsEntries);
  const snapMap = Object.fromEntries(snapEntries);

  // Build OCC symbols and batch-fetch option snapshots
  const occSymbols = positions.map(p => buildOCCSymbol(p.ticker, p.expiry_date, p.strike));
  const optSnaps = await getOptionSnapshots(occSymbols);

  return positions.map((p, i) => {
    const bars = barsMap[p.ticker] ?? [];
    const snap = snapMap[p.ticker];
    const occSym = occSymbols[i];

    if (!snap || bars.length < 20) {
      return { ...p, live: null, score: null, pnlPct: null, pnlDollars: null, currentMark: null };
    }

    const closes = (bars as Bar[]).map(b => b.c);
    const highs = (bars as Bar[]).map(b => b.h);

    const underlyingPrice =
      snap.latestTrade?.p ??
      snap.latestQuote?.ap ??
      bars[bars.length - 1]?.c ??
      0;
    const prevClose = snap.prevDailyBar?.c ?? bars[bars.length - 2]?.c ?? underlyingPrice;
    const underlyingDayChangePct =
      prevClose > 0 ? ((underlyingPrice - prevClose) / prevClose) * 100 : 0;

    const rsi14 = calcRSI(closes);
    const sma200 = calcSMA(closes, Math.min(200, closes.length));
    const high52w = Math.max(...highs.slice(-252));
    const dte = calcDTE(p.expiry_date);

    const pctFromStrike = p.strike > 0 ? ((underlyingPrice - p.strike) / p.strike) * 100 : 0;
    const pctFrom52wHigh = high52w > 0 ? ((underlyingPrice - high52w) / high52w) * 100 : 0;
    const pctAboveSma200 = sma200 > 0 ? ((underlyingPrice - sma200) / sma200) * 100 : 0;

    // Option mark from snapshot — try both padded and non-padded keys
    const optSnap = optSnaps[occSym] ?? optSnaps[occSym.padEnd(21, ' ')] ?? null;
    let optionMark: number | null = null;
    if (optSnap) {
      const bid = optSnap.latestQuote?.bp ?? 0;
      const ask = optSnap.latestQuote?.ap ?? 0;
      if (bid > 0 && ask > 0) optionMark = (bid + ask) / 2;
      else if (optSnap.latestTrade?.p) optionMark = optSnap.latestTrade.p;
    }

    const pnlPct =
      optionMark !== null ? ((optionMark - p.avg_cost) / p.avg_cost) * 100 : null;
    const pnlDollars =
      optionMark !== null ? (optionMark - p.avg_cost) * p.quantity * 100 : null;

    const live: LivePositionData = {
      underlyingPrice,
      underlyingDayChangePct,
      optionMark,
      rsi14,
      sma200,
      high52w,
      dte,
      pctFromStrike,
      pctFrom52wHigh,
      pctAboveSma200,
    };

    const score = scorePosition(live, pnlPct);

    return { ...p, live, score, pnlPct, pnlDollars, currentMark: optionMark };
  });
}
