import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const out: Record<string, any> = {};

  // 1. Fetch Yahoo Finance expiration dates for MSFT
  try {
    const url = 'https://query1.finance.yahoo.com/v7/finance/options/MSFT';
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    out.expiryStatus = r.status;
    if (r.ok) {
      const data = await r.json();
      const dates: number[] = data?.optionChain?.result?.[0]?.expirationDates ?? [];
      out.expiryDates = dates.map(ts => new Date(ts * 1000).toISOString().slice(0, 10));
      out.expiryCount = dates.length;

      // Filter to LEAP range (365-900 DTE)
      const today = new Date();
      const leapDates = dates.filter(ts => {
        const dte = Math.round((ts * 1000 - today.getTime()) / 86400000);
        return dte >= 365 && dte <= 900;
      });
      out.leapExpiries = leapDates.map(ts => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        dte: Math.round((ts * 1000 - today.getTime()) / 86400000),
      }));

      // 2. Fetch calls for first LEAP expiry
      if (leapDates.length > 0) {
        const expTs = leapDates[0];
        const url2 = `https://query1.finance.yahoo.com/v7/finance/options/MSFT?date=${expTs}`;
        const r2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        out.callsStatus = r2.status;
        if (r2.ok) {
          const data2 = await r2.json();
          const calls = data2?.optionChain?.result?.[0]?.options?.[0]?.calls ?? [];
          out.callsCount = calls.length;
          // Show strikes near $400 (MSFT current price)
          const nearATM = calls.filter((c: any) => c.strike >= 380 && c.strike <= 450);
          out.sampleCalls = nearATM.slice(0, 3).map((c: any) => ({
            symbol: c.contractSymbol,
            strike: c.strike,
            bid: c.bid,
            ask: c.ask,
            oi: c.openInterest,
            volume: c.volume,
            iv: c.impliedVolatility,
          }));
        } else {
          out.callsBody = await r2.text().then(t => t.slice(0, 300));
        }
      }
    } else {
      out.expiryBody = await r.text().then(t => t.slice(0, 300));
    }
  } catch (e: any) {
    out.error = e.message;
  }

  return res.status(200).json(out);
}
