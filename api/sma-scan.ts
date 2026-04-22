import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getStockBars } from './lib/alpaca.js';
import { getProfile, FALLBACK_LARGE_CAPS } from './lib/fmp.js';
import { analyzeSmaSignals } from './lib/scanner/sma-scanner.js';

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const scanDate = new Date().toISOString().slice(0, 10);

  const { data: run, error: runErr } = await db
    .from('scan_runs')
    .insert({ status: 'running' })
    .select()
    .single();
  if (runErr) return res.status(500).json({ error: runErr.message });

  let found = 0;
  const BATCH = 15;

  for (let i = 0; i < FALLBACK_LARGE_CAPS.length; i += BATCH) {
    const batch = FALLBACK_LARGE_CAPS.slice(i, i + BATCH);
    await Promise.all(batch.map(async (ticker) => {
      try {
        // 200 calendar days gives ~140 trading days — enough for 20 SMA + 90-day lookback
        const bars = await getStockBars(ticker, 200);
        if (bars.length < 25) return;
        const profile = await getProfile(ticker);
        const result = analyzeSmaSignals(
          bars,
          ticker,
          profile?.companyName ?? ticker,
          profile ? profile.mktCap / 1e9 : 150,
        );
        if (!result) return;

        await db.from('sma_dip_results').insert({
          run_id: run.id,
          scan_date: scanDate,
          ticker: result.ticker,
          company_name: result.companyName,
          market_cap_b: result.marketCapB,
          current_price: result.currentPrice,
          current_sma20: result.currentSma20,
          current_drop_pct: result.currentDropPct,
          is_current: result.isCurrent,
          signal_count: result.signalCount,
          max_drop_pct: result.maxDropPct,
          first_signal_date: result.firstSignalDate,
          last_signal_date: result.lastSignalDate,
          signals_json: result.signals,
          price_history_json: result.priceHistory,
        });
        found++;
      } catch (e: any) {
        console.error(`[${ticker}] ${e.message}`);
      }
    }));
  }

  await db.from('scan_runs').update({
    status: 'completed',
    stocks_scanned: FALLBACK_LARGE_CAPS.length,
    results_found: found,
  }).eq('id', run.id);

  return res.status(200).json({ runId: run.id, found });
}
