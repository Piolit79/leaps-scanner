import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const results: Record<string, any> = {};

  try {
    const mod = await import('../lib/scanner/index');
    results.scanner_index = { ok: true, keys: Object.keys(mod) };
  } catch (e: any) {
    results.scanner_index = { error: e.message, stack: e.stack?.slice(0, 300) };
  }

  try {
    const mod = await import('../lib/alpaca');
    results.alpaca = { ok: true, keys: Object.keys(mod) };
  } catch (e: any) {
    results.alpaca = { error: e.message };
  }

  try {
    const mod = await import('../lib/scanner/options');
    results.options = { ok: true, keys: Object.keys(mod) };
  } catch (e: any) {
    results.options = { error: e.message };
  }

  return res.status(200).json(results);
}
