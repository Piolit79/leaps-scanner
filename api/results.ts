import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const date = req.query.date as string | undefined;
  const limit = Number(req.query.limit ?? 100);

  let query = db
    .from('scan_results')
    .select('*')
    .order('score', { ascending: false })
    .limit(limit);

  if (date) query = query.eq('scan_date', date);
  else {
    // Latest scan date
    const { data: latest } = await db
      .from('scan_results')
      .select('scan_date')
      .order('scan_date', { ascending: false })
      .limit(1)
      .single();
    if (latest) query = query.eq('scan_date', latest.scan_date);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ results: data ?? [], date });
}
