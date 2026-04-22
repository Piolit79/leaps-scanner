import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const key    = process.env.ALPACA_API_KEY    ?? 'MISSING';
  const secret = process.env.ALPACA_API_SECRET ?? 'MISSING';
  return res.status(200).json({
    ALPACA_API_KEY:    key.slice(0, 6) + '...' + key.slice(-4) + ` (len=${key.length})`,
    ALPACA_API_SECRET: secret.slice(0, 4) + '...' + secret.slice(-4) + ` (len=${secret.length})`,
    SUPABASE_URL: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'MISSING').replace('https://', '').slice(0, 30),
  });
}
