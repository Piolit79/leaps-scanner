import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOptionsChain, getOptionSnapshots } from './lib/alpaca.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ticker = (req.query.ticker as string)?.toUpperCase();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    // 9-12 months = 274-365 DTE
    const contracts = await getOptionsChain(ticker, 274, 365);
    if (!contracts.length) return res.status(200).json({ contracts: [], ticker });

    const symbols = contracts.slice(0, 60).map(c => c.symbol);
    const snaps = await getOptionSnapshots(symbols);

    const today = new Date();

    const results = contracts
      .map(c => {
        const snap = snaps[c.symbol];
        const bid  = snap?.latestQuote?.bp ?? 0;
        const ask  = snap?.latestQuote?.ap ?? 0;
        const mid  = bid > 0 && ask > 0 ? (bid + ask) / 2 : (snap?.latestTrade?.p ?? null);
        const iv    = snap?.impliedVolatility ?? null;
        const delta = snap?.greeks?.delta ?? null;
        const oi    = snap?.openInterest ?? c.open_interest ?? null;
        const expiry = new Date(c.expiration_date);
        const dte   = Math.round((expiry.getTime() - today.getTime()) / 86400000);
        const spread = bid > 0 && ask > 0 ? ((ask - bid) / ask) * 100 : null;

        return { symbol: c.symbol, strike: c.strike_price, expiry: c.expiration_date, dte, mid, bid, ask, spread, iv, delta, oi };
      })
      .filter(c => c.mid && c.mid > 0.5 && (c.oi ?? 0) >= 50)
      .sort((a, b) => (a.iv ?? 99) - (b.iv ?? 99))
      .slice(0, 30);

    return res.status(200).json({ contracts: results, ticker });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
