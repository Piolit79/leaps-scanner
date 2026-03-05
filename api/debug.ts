import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const results: Record<string, any> = {};

  // 1. Check env vars
  results.env = {
    alpaca_key: !!process.env.ALPACA_API_KEY,
    alpaca_secret: !!process.env.ALPACA_API_SECRET,
    fmp_key: !!process.env.FMP_API_KEY,
    supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabase_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  // 2. Test Supabase connection
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { count, error } = await db.from('scan_results').select('*', { count: 'exact', head: true });
    results.supabase = error ? { error: error.message } : { ok: true, rows: count };
  } catch (e: any) {
    results.supabase = { error: e.message };
  }

  // 3. Test Alpaca stock data
  try {
    const r = await fetch('https://data.alpaca.markets/v2/stocks/AAPL/bars?timeframe=1Day&limit=2', {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
      },
    });
    const data = await r.json();
    results.alpaca_stock = r.ok ? { ok: true, bars: data.bars?.length } : { error: data };
  } catch (e: any) {
    results.alpaca_stock = { error: e.message };
  }

  // 4. Test Alpaca options
  try {
    const r = await fetch('https://paper-api.alpaca.markets/v2/options/contracts?underlying_symbols=AAPL&limit=3', {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
      },
    });
    const data = await r.json();
    results.alpaca_options = r.ok ? { ok: true, contracts: data.option_contracts?.length } : { error: data };
  } catch (e: any) {
    results.alpaca_options = { error: e.message };
  }

  // 5. Test FMP
  try {
    const r = await fetch(`https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=${process.env.FMP_API_KEY}`);
    const data = await r.json();
    results.fmp = r.ok && data?.[0] ? { ok: true, mktCap: data[0].mktCap } : { error: data };
  } catch (e: any) {
    results.fmp = { error: e.message };
  }

  return res.status(200).json(results);
}
