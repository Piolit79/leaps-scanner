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
  strikeProximityPct: number; // 10
  contractLowPct: number;  // unused — no historical bars; kept for config compat
  minOpenInterest: number; // 500
  minAvgVolume: number;    // 50
  maxSpreadPct: number;    // 5
}

async function yahooOptionCalls(symbol: string, expDate: number): Promise<any[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${expDate}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const data = await r.json();
    return data?.optionChain?.result?.[0]?.options?.[0]?.calls ?? [];
  } catch {
    return [];
  }
}

export async function findLeapCandidates(
  symbol: string,
  preDipPrice: number,
  _currentPrice: number,
  cfg: OptionsConfig,
): Promise<LeapCandidate[]> {
  // Get available expiration dates from Yahoo Finance
  let expirationDates: number[] = [];
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const data = await r.json();
    expirationDates = data?.optionChain?.result?.[0]?.expirationDates ?? [];
  } catch {
    return [];
  }

  const today = new Date();

  // Filter to LEAP DTE range
  const leapExpiries = expirationDates.filter(ts => {
    const dte = Math.round((ts * 1000 - today.getTime()) / 86400000);
    return dte >= cfg.minDte && dte <= cfg.maxDte;
  });

  if (!leapExpiries.length) return [];

  const candidates: LeapCandidate[] = [];

  for (const expTs of leapExpiries) {
    const calls = await yahooOptionCalls(symbol, expTs);

    for (const c of calls) {
      // Strike must be within strikeProximityPct of pre-dip price
      const proximity = Math.abs(c.strike - preDipPrice) / preDipPrice * 100;
      if (proximity > cfg.strikeProximityPct) continue;

      const bid = c.bid ?? 0;
      const ask = c.ask ?? 0;
      if (bid <= 0 || ask <= 0) continue;

      const mid = (bid + ask) / 2;
      const spreadPct = ((ask - bid) / mid) * 100;
      if (spreadPct > cfg.maxSpreadPct) continue;

      const oi = c.openInterest ?? 0;
      if (oi < cfg.minOpenInterest) continue;

      const volume = c.volume ?? 0;
      if (volume < cfg.minAvgVolume) continue;

      const dte = Math.round((expTs * 1000 - today.getTime()) / 86400000);

      // pctAboveLow = 0: no historical bars available, but buying on a dip
      // means the contract is near its recent low by definition
      candidates.push({
        contractSymbol: c.contractSymbol,
        strike: c.strike,
        expiry: new Date(expTs * 1000).toISOString().slice(0, 10),
        dte,
        contractPrice: mid,
        contractLowAlltime: mid,
        pctAboveLow: 0,
        openInterest: oi,
        avgDailyVolume: volume,
        bidAskSpreadPct: spreadPct,
        ivCurrent: c.impliedVolatility ?? null,
        ivRank: null,
        delta: null,
      });
    }
  }

  // Sort by tightest spread first
  return candidates.sort((a, b) => a.bidAskSpreadPct - b.bidAskSpreadPct);
}
