import type { SupabaseClient } from '@supabase/supabase-js';
import { getStockBars } from '../alpaca.js';
import { getProfile, FALLBACK_LARGE_CAPS } from '../fmp.js';
import { detectPullback, DEFAULT_CONFIG } from './event-scanner.js';

export async function runPullbackScan(
  db: SupabaseClient,
  runId: string,
): Promise<{ found: number }> {
  const scanDate = new Date().toISOString().slice(0, 10);
  let found = 0;
  const BATCH = 20;

  for (let i = 0; i < FALLBACK_LARGE_CAPS.length; i += BATCH) {
    const batch = FALLBACK_LARGE_CAPS.slice(i, i + BATCH);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const bars = await getStockBars(ticker, 750);
        if (bars.length < 210) return;

        const profile = await getProfile(ticker);
        const result  = detectPullback(
          bars,
          ticker,
          profile?.companyName ?? ticker,
          profile ? profile.mktCap / 1e9 : 150,
          DEFAULT_CONFIG,
        );
        if (!result) return;

        const { error } = await db.from('event_signals').insert({
          run_id:             runId,
          scan_date:          scanDate,
          ticker:             result.ticker,
          company_name:       result.companyName,
          market_cap_b:       result.marketCapB,
          current_price:      result.currentPrice,
          recent_signals:     [result.signal],
          historical_signals: [],
          ohlc_json:          result.ohlc,
        });
        if (!error) found++;
        else console.error(`[${ticker}] DB: ${error.message}`);
      } catch (e: any) {
        console.error(`[${ticker}] ${e.message}`);
      }
    }));
  }

  await db.from('scan_runs').update({
    status:         'completed',
    stocks_scanned: FALLBACK_LARGE_CAPS.length,
    results_found:  found,
  }).eq('id', runId);

  return { found };
}
