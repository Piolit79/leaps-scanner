import { getOptionsChain, getOptionSnapshots, getOptionBars, type OptionContract, type OptionSnapshot } from '../alpaca.js';

export interface LeapCandidate {
  contractSymbol: string;
  strike: number;
  expiry: string;
  dte: number;
  contractPrice: number;
  contractLowAlltime: number;
  pctAboveLow: number;
  openInterest: number;
  avgDailyVolume: number;
  bidAskSpreadPct: number;
  ivCurrent: number | null;
  ivRank: number | null;
  delta: number | null;
}

export interface OptionsConfig {
  minDte: number;          // 365
  maxDte: number;          // 900
  strikeProximityPct: number; // 10 — strike within 10% of pre-dip price
  contractLowPct: number;  // 25 — mid must be within 25% of all-time low
  minOpenInterest: number; // 500
  minAvgVolume: number;    // 50
  maxSpreadPct: number;    // 5
}

export async function findLeapCandidates(
  symbol: string,
  preDipPrice: number,
  currentPrice: number,
  cfg: OptionsConfig,
): Promise<LeapCandidate[]> {
  // Get options chain
  const chain = await getOptionsChain(symbol, cfg.minDte, cfg.maxDte);
  if (!chain.length) return [];

  // Filter by strike proximity to pre-dip price (not current depressed price)
  const filtered = chain.filter(c => {
    const proximity = Math.abs(c.strike_price - preDipPrice) / preDipPrice * 100;
    return proximity <= cfg.strikeProximityPct;
  });

  if (!filtered.length) return [];

  // Get current snapshots for all filtered contracts
  const symbols = filtered.map(c => c.symbol);
  const snapshots = await getOptionSnapshots(symbols);

  const today = new Date();
  const candidates: LeapCandidate[] = [];

  for (const contract of filtered) {
    const snap = snapshots[contract.symbol];
    if (!snap) continue;

    const bid = snap.latestQuote?.bp ?? 0;
    const ask = snap.latestQuote?.ap ?? 0;
    if (bid <= 0 || ask <= 0) continue;

    const mid = (bid + ask) / 2;
    const spreadPct = ((ask - bid) / mid) * 100;
    if (spreadPct > cfg.maxSpreadPct) continue;

    const oi = snap.openInterest ?? contract.open_interest ?? 0;
    if (oi < cfg.minOpenInterest) continue;

    // Get historical bars to find all-time low and avg volume
    const bars = await getOptionBars(contract.symbol);
    if (!bars.length) continue;

    const allTimeLow = Math.min(...bars.map(b => b.l));
    const pctAboveLow = ((mid - allTimeLow) / allTimeLow) * 100;
    if (pctAboveLow > cfg.contractLowPct) continue;

    const recentBars = bars.slice(-30);
    const avgDailyVolume = recentBars.reduce((s, b) => s + b.v, 0) / (recentBars.length || 1);
    if (avgDailyVolume < cfg.minAvgVolume) continue;

    const expDate = new Date(contract.expiration_date);
    const dte = Math.round((expDate.getTime() - today.getTime()) / 86400000);

    candidates.push({
      contractSymbol: contract.symbol,
      strike: contract.strike_price,
      expiry: contract.expiration_date,
      dte,
      contractPrice: mid,
      contractLowAlltime: allTimeLow,
      pctAboveLow,
      openInterest: oi,
      avgDailyVolume,
      bidAskSpreadPct: spreadPct,
      ivCurrent: snap.impliedVolatility ?? null,
      ivRank: null, // computed separately if ORATS added later
      delta: snap.greeks?.delta ?? null,
    });
  }

  // Sort: closest to all-time low first
  return candidates.sort((a, b) => a.pctAboveLow - b.pctAboveLow);
}
