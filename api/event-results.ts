import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Find the latest run_id (a single completed scan) so we don't return duplicate tickers
  // when multiple scans ran on the same day
  const { data: latestRun } = await db
    .from('scan_runs')
    .select('id, run_at')
    .eq('status', 'completed')
    .order('run_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestRun) return res.status(200).json({ results: [], scan_date: null });

  const { data, error } = await db
    .from('event_signals')
    .select('*')
    .eq('run_id', latestRun.id);

  if (error) return res.status(500).json({ error: error.message });
  const scanDate = latestRun.run_at.slice(0, 10);
  return res.status(200).json({ results: data ?? [], scan_date: scanDate });
}
