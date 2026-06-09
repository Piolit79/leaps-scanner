import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { enrichPositions } from './lib/portfolio';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('portfolio_positions')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.json({ positions: [], refreshed_at: new Date().toISOString() });

  try {
    const enriched = await enrichPositions(data);
    return res.json({ positions: enriched, refreshed_at: new Date().toISOString() });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
