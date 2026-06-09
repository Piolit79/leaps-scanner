import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = db();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('portfolio_positions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ positions: data });
  }

  if (req.method === 'POST') {
    const { ticker, strike, expiry_date, quantity, avg_cost, notes } = req.body ?? {};
    if (!ticker || !strike || !expiry_date || !quantity || !avg_cost) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const { data, error } = await supabase
      .from('portfolio_positions')
      .insert({
        ticker: String(ticker).toUpperCase().trim(),
        strike: parseFloat(strike),
        expiry_date,
        quantity: parseInt(quantity),
        avg_cost: parseFloat(avg_cost),
        entry_date: new Date().toISOString().slice(0, 10),
        notes: notes || null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ position: data });
  }

  if (req.method === 'PATCH') {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const allowed = ['quantity', 'avg_cost', 'notes', 'is_active', 'closed_at'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body && key in req.body) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' });
    const { data, error } = await supabase
      .from('portfolio_positions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ position: data });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { error } = await supabase
      .from('portfolio_positions')
      .update({ is_active: false, closed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
