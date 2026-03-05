import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runScan, DEFAULT_CONFIG } from '../lib/scanner/index';

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Quick test mode: just verify the pipeline with 3 stocks
  const testMode = req.query.test === '1';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let run: any = null;
  try {
    const { data, error } = await db
      .from('scan_runs')
      .insert({ status: 'running' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: `Supabase insert failed: ${error.message}` });
    run = data;
  } catch (e: any) {
    return res.status(500).json({ error: `DB connection failed: ${e.message}` });
  }

  const cfg = {
    ...DEFAULT_CONFIG,
    ...(req.body?.config ?? {}),
    ...(testMode ? { universe: ['LLY', 'AAPL', 'TSLA'] } : {}),
  };

  try {
    const result = await runScan(cfg, run.id);
    return res.status(200).json({ runId: run.id, ...result });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error('runScan threw:', msg, e?.stack);
    await db.from('scan_runs').update({ status: 'error', error: msg }).eq('id', run.id).catch(() => {});
    return res.status(500).json({ error: msg, stack: e?.stack?.slice(0, 500) });
  }
}
