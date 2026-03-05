import { getOptionsChain, type Bar } from '../alpaca.js';

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
  minDte: number;           // 365
  maxDte: number;           // 900
  strikeProximityPct: number; // 10
  contractLowPct: number;   // kept for config compat
  minOpenInterest: number;  // 500
  minAvgVolume: number;     // kept for config compat
  maxSpreadPct: number;     // kept for config compat
}

// Abramowitz & Stegun normal CDF approximation (max error 7.5e-8)
function normalCDF(x: number): number {
  const a = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  let poly = 0, kn = k;
  for (const ai of a) { poly += ai * kn; kn *= k; }
  const pdf = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

function bsCall(S: number, K: number, T: number, r: number, sigma: number) {
  if (T <= 0) return { price: Math.max(S - K, 0), delta: S > K ? 1 : 0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return {
    price: S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2),
    delta: normalCDF(d1),
  };
}

// Annualized historical volatility from daily close prices (60-day window)
function annualVol(bars: Bar[]): number {
  if (bars.length < 20) return 0.30;
  const slice = bars.slice(-60);
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1].c > 0) returns.push(Math.log(slice[i].c / slice[i - 1].c));
  }
  if (returns.length < 10) return 0.30;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * 252);
}

export async function findLeapCandidates(
  symbol: string,
  preDipPrice: number,
  currentPrice: number,
  cfg: OptionsConfig,
  bars: Bar[] = [],
): Promise<LeapCandidate[]> {
  // Fetch chain filtered to the exact strike range we care about
  const strikeLow  = preDipPrice * (1 - cfg.strikeProximityPct / 100);
  const strikeHigh = preDipPrice * (1 + cfg.strikeProximityPct / 100);
  const chain = await getOptionsChain(symbol, cfg.minDte, cfg.maxDte, strikeLow, strikeHigh);
  if (!chain.length) return [];

  const sigma = annualVol(bars);
  const r = 0.045; // ~4.5% risk-free rate
  const today = new Date();
  const candidates: LeapCandidate[] = [];

  for (const contract of chain) {
    // Alpaca returns strike_price as a string
    const strike = parseFloat(contract.strike_price as any);
    const oi     = parseFloat((contract.open_interest as any) ?? '0') || 0;

    if (isNaN(strike) || strike <= 0) continue;
    if (oi < cfg.minOpenInterest) continue;

    const expDate = new Date(contract.expiration_date);
    const T   = (expDate.getTime() - today.getTime()) / (365.25 * 86400000);
    const dte = Math.round(T * 365.25);
    if (dte < cfg.minDte || dte > cfg.maxDte) continue;

    const { price, delta } = bsCall(currentPrice, strike, T, r, sigma);
    if (price < 0.50) continue; // skip effectively worthless deep-OTM contracts

    candidates.push({
      contractSymbol: contract.symbol,
      strike,
      expiry: contract.expiration_date,
      dte,
      contractPrice:    Math.round(price  * 100) / 100,
      contractLowAlltime: Math.round(price * 100) / 100,
      pctAboveLow:      0,
      openInterest:     Math.round(oi),
      avgDailyVolume:   Math.round(oi / 10), // rough proxy: ~10% monthly OI turnover
      bidAskSpreadPct:  3,                   // assumed for liquid large-cap LEAPs
      ivCurrent:        Math.round(sigma * 1000) / 1000,
      ivRank:           null,
      delta:            Math.round(delta * 1000) / 1000,
    });
  }

  // Sort: closest to ATM delta (0.5) first — the most balanced risk/reward
  return candidates.sort((a, b) =>
    Math.abs((a.delta ?? 0.5) - 0.5) - Math.abs((b.delta ?? 0.5) - 0.5)
  );
}
