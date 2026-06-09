import type { VercelRequest, VercelResponse } from '@vercel/node';

const PAPER = 'https://paper-api.alpaca.markets';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ticker = (req.query.ticker as string | undefined)?.toUpperCase().trim();
  if (!ticker) return res.status(400).json({ error: 'Missing ticker' });

  const today = new Date();
  // Fetch LEAPS range: 3 months out to 2.5 years out
  const minDate = new Date(today.getTime() + 90  * 86400000).toISOString().slice(0, 10);
  const maxDate = new Date(today.getTime() + 900 * 86400000).toISOString().slice(0, 10);

  const url = `${PAPER}/v2/options/contracts?underlying_symbols=${ticker}&type=call&status=active` +
    `&expiration_date_gte=${minDate}&expiration_date_lte=${maxDate}&limit=500`;

  try {
    const r = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
      },
    });
    if (!r.ok) return res.status(502).json({ error: `Alpaca ${r.status}` });

    const data = await r.json() as { option_contracts?: Array<{ expiration_date: string }> };
    const contracts = data.option_contracts ?? [];

    const expiries = [...new Set(contracts.map(c => c.expiration_date))].sort();
    return res.json({ expiries });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
