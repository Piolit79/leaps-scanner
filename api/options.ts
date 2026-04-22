import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOptionsChain, getOptionSnapshots, getStockSnapshot } from './lib/alpaca.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ticker = (req.query.ticker as string)?.toUpperCase();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    // Get current stock price to filter strikes to near-money LEAPS
    const stockSnap = await getStockSnapshot(ticker).catch(() => null);
    const underlyingPrice =
      stockSnap?.latestTrade?.p ??
      stockSnap?.latestQuote?.ap ??
      stockSnap?.dailyBar?.c ??
      0;

    // 9-12 months = 274-365 DTE
    const allContracts = await getOptionsChain(ticker, 274, 365);
    if (!allContracts.length) return res.status(200).json({ contracts: [], ticker });

    // Keep only near-money strikes (0.7x – 1.5x underlying) to skip illiquid extremes
    const contracts = underlyingPrice > 0
      ? allContracts.filter(c => {
          const s = parseFloat(String(c.strike_price));
          return s >= underlyingPrice * 0.7 && s <= underlyingPrice * 1.5;
        })
      : allContracts;

    const symbols = (contracts.length > 0 ? contracts : allContracts).slice(0, 60).map(c => c.symbol);
    const snaps = await getOptionSnapshots(symbols);

    const today = new Date();
    const results = symbols
      .map(sym => {
        const c    = (contracts.length > 0 ? contracts : allContracts).find(x => x.symbol === sym)!;
        const snap = snaps[sym];
        const bid  = snap?.latestQuote?.bp ?? 0;
        const ask  = snap?.latestQuote?.ap ?? 0;
        const mid  = bid > 0 && ask > 0 ? (bid + ask) / 2 : (snap?.latestTrade?.p ?? null);
        const iv    = snap?.impliedVolatility ?? null;
        const delta = snap?.greeks?.delta ?? null;
        const oi    = snap?.openInterest != null
          ? parseInt(String(snap.openInterest))
          : (c.open_interest != null ? parseInt(String(c.open_interest)) : null);
        const expiry = new Date(c.expiration_date);
        const dte   = Math.round((expiry.getTime() - today.getTime()) / 86400000);
        const spread = bid > 0 && ask > 0 ? ((ask - bid) / ask) * 100 : null;
        const strike = parseFloat(String(c.strike_price));
        return { symbol: sym, strike, expiry: c.expiration_date, dte, mid, bid, ask, spread, iv, delta, oi };
      })
      .filter(c => c.mid && c.mid > 0.5 && (c.oi ?? 0) >= 50)
      .sort((a, b) => (a.iv ?? 99) - (b.iv ?? 99))
      .slice(0, 30);

    return res.status(200).json({ contracts: results, ticker, underlyingPrice });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
