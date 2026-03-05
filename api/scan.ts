import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runScan, DEFAULT_CONFIG } from './lib/scanner/index.js';

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let run: any = null;
  try {
    const { data, error } = await db.from('scan_runs').insert({ status: 'running' }).select().single();
    if (error) return res.status(500).json({ error: `DB insert failed: ${error.message}` });
    run = data;
  } catch (e: any) {
    return res.status(500).json({ error: `DB connection failed: ${e.message}` });
  }

  const override = req.body?.config ?? {};
  const cfg = {
    ...DEFAULT_CONFIG,
    ...override,
    dip: { ...DEFAULT_CONFIG.dip, ...(override.dip ?? {}) },
    options: { ...DEFAULT_CONFIG.options, ...(override.options ?? {}) },
  };

  try {
    const result = await runScan(cfg, run.id);
    return res.status(200).json({ runId: run.id, ...result });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    await db.from('scan_runs').update({ status: 'error', error: msg }).eq('id', run.id).catch(() => {});
    return res.status(500).json({ error: msg });
  }
}
