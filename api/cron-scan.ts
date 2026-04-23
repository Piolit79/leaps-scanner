import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runPullbackScan } from './lib/scanner/pullback-run.js';

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = req.headers['authorization'];
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: run, error: runErr } = await db
    .from('scan_runs')
    .insert({ status: 'running' })
    .select()
    .single();
  if (!run || runErr) return res.status(500).json({ error: runErr?.message ?? 'Failed to create run' });

  try {
    const { found } = await runPullbackScan(db, run.id);
    return res.status(200).json({ runId: run.id, found });
  } catch (e: any) {
    await db.from('scan_runs').update({ status: 'error', error: e.message }).eq('id', run.id);
    return res.status(500).json({ error: e.message });
  }
}
