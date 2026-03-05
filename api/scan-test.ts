import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DEFAULT_CONFIG } from './lib/scanner/index';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ loaded: true, config: DEFAULT_CONFIG });
}
