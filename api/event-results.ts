import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: latest } = await db
    .from('event_signals')
    .select('scan_date')
    .order('scan_date', { ascending: false })
    .limit(1)
    .single();

  if (!latest) return res.status(200).json({ results: [], scan_date: null });

  const { data, error } = await db
    .from('event_signals')
    .select('*')
    .eq('scan_date', latest.scan_date);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ results: data ?? [], scan_date: latest.scan_date });
}
