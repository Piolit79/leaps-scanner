import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const results: Record<string, any> = {};

  try {
    const m = await import('./lib/alpaca');
    results.alpaca = { ok: true, exports: Object.keys(m) };
  } catch (e: any) { results.alpaca = { error: e.message }; }

  try {
    const m = await import('./lib/fmp');
    results.fmp = { ok: true, exports: Object.keys(m) };
  } catch (e: any) { results.fmp = { error: e.message }; }

  try {
    const m = await import('./lib/earnings');
    results.earnings = { ok: true, exports: Object.keys(m) };
  } catch (e: any) { results.earnings = { error: e.message }; }

  try {
    const m = await import('./lib/scanner/dips');
    results.dips = { ok: true, exports: Object.keys(m) };
  } catch (e: any) { results.dips = { error: e.message }; }

  try {
    const m = await import('./lib/scanner/scoring');
    results.scoring = { ok: true, exports: Object.keys(m) };
  } catch (e: any) { results.scoring = { error: e.message }; }

  try {
    const m = await import('./lib/scanner/options');
    results.options = { ok: true, exports: Object.keys(m) };
  } catch (e: any) { results.options = { error: e.message }; }

  try {
    const m = await import('./lib/scanner/index');
    results.scanner_index = { ok: true, exports: Object.keys(m) };
  } catch (e: any) { results.scanner_index = { error: e.message }; }

  return res.status(200).json(results);
}
