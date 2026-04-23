import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStockBars } from './lib/alpaca.js';
import { FALLBACK_LARGE_CAPS } from './lib/fmp.js';
import {
  runBacktest,
  computeMetrics,
  DEFAULT_BACKTEST_CONFIG,
  type BacktestConfig,
  type BacktestTrade,
} from './lib/scanner/backtest-engine.js';

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const cfg: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, ...(req.body?.config ?? {}) };

  const allTrades: BacktestTrade[] = [];
  const BATCH = 20;

  for (let i = 0; i < FALLBACK_LARGE_CAPS.length; i += BATCH) {
    const batch = FALLBACK_LARGE_CAPS.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (ticker) => {
      try {
        // ~1500 calendar days → up to 1000 trading bars (~4 years)
        const bars = await getStockBars(ticker, 1500);
        return runBacktest(bars, ticker, cfg);
      } catch {
        return [] as BacktestTrade[];
      }
    }));
    results.forEach(trades => allTrades.push(...trades));
  }

  allTrades.sort((a, b) => b.day0Date.localeCompare(a.day0Date));

  const metrics = computeMetrics(allTrades);
  return res.status(200).json({ trades: allTrades, metrics, config: cfg });
}
