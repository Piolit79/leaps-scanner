import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runScan, DEFAULT_CONFIG } from './lib/scanner/index.js';

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = req.headers['authorization'];
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: run } = await db.from('scan_runs').insert({ status: 'running' }).select().single();
  if (!run) return res.status(500).json({ error: 'Failed to create scan run' });

  try {
    const result = await runScan(DEFAULT_CONFIG, run.id);
    return res.status(200).json({ runId: run.id, ...result });
  } catch (e: any) {
    await db.from('scan_runs').update({ status: 'error', error: e.message }).eq('id', run.id);
    return res.status(500).json({ error: e.message });
  }
}
