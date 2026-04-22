import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getStockBars } from './lib/alpaca.js';
import { getProfile, FALLBACK_LARGE_CAPS } from './lib/fmp.js';
import { detectEvents, DEFAULT_CONFIG, type EventConfig } from './lib/scanner/event-scanner.js';

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

  // Merge caller config with defaults
  const cfgOverride: Partial<EventConfig> = req.body?.config ?? {};
  const cfg: EventConfig = { ...DEFAULT_CONFIG, ...cfgOverride };

  let found = 0;
  const BATCH = 10;

  for (let i = 0; i < FALLBACK_LARGE_CAPS.length; i += BATCH) {
    const batch = FALLBACK_LARGE_CAPS.slice(i, i + BATCH);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const bars = await getStockBars(ticker, 750);
        if (bars.length < 30) return;

        const profile = await getProfile(ticker);
        const result  = detectEvents(
          bars,
          ticker,
          profile?.companyName ?? ticker,
          profile ? profile.mktCap / 1e9 : 150,
          cfg,
        );
        if (!result) return;

        const { error } = await db.from('event_signals').insert({
          run_id:              run.id,
          scan_date:           scanDate,
          ticker:              result.ticker,
          company_name:        result.companyName,
          market_cap_b:        result.marketCapB,
          current_price:       result.currentPrice,
          recent_signals:      result.recentSignals,
          historical_signals:  result.historicalSignals,
          ohlc_json:           result.ohlc,
        });
        if (!error) found++;
        else console.error(`[${ticker}] DB: ${error.message}`);
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

  return res.status(200).json({ runId: run.id, found, config: cfg });
}
