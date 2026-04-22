import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStockBars } from './lib/alpaca.js';
import { DEFAULT_CONFIG } from './lib/scanner/event-scanner.js';
import type { Bar } from './lib/alpaca.js';

const TEST_TICKERS = ['META', 'TSLA', 'AMD', 'NVDA', 'MSFT', 'AMZN', 'AAPL', 'GOOGL'];

function rollingAvg(bars: Bar[], endIdx: number, window: number, fn: (b: Bar) => number): number {
  const slice = bars.slice(Math.max(0, endIdx - window), endIdx);
  if (!slice.length) return 0;
  return slice.reduce((s, b) => s + fn(b), 0) / slice.length;
}

function rollingMax(bars: Bar[], endIdx: number, window: number, fn: (b: Bar) => number): number {
  const slice = bars.slice(Math.max(0, endIdx - window), endIdx);
  if (!slice.length) return 0;
  return Math.max(...slice.map(fn));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cfg = { ...DEFAULT_CONFIG };
  const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.toUpperCase() : null;
  const tickers = ticker ? [ticker] : TEST_TICKERS;

  const out: Record<string, any> = { cfg };

  for (const sym of tickers) {
    try {
      const bars = await getStockBars(sym, 750);
      if (bars.length < 30) { out[sym] = { error: `only ${bars.length} bars` }; continue; }

      const lastIdx = bars.length - 1;
      const SMA_WIN = 20;
      const recentStart = Math.max(SMA_WIN, lastIdx - cfg.recentBars + 1);
      const recentCutoff = bars[recentStart]?.t.slice(0, 10) ?? '';

      // Scan all bars and collect every potential hit with raw values
      const hits: any[] = [];
      let gapNextAllowed = 0;
      let highDropNextAllowed = 0;

      for (let i = SMA_WIN; i <= lastIdx; i++) {
        const bar  = bars[i];
        const prev = bars[i - 1];
        const avgVol    = rollingAvg(bars, i, 20, b => b.v);
        const high20    = rollingMax(bars, i, 20, b => b.h);
        const closePct  = ((bar.c - prev.c) / prev.c) * 100;
        const gapPct    = ((bar.o - prev.c) / prev.c) * 100;
        const volRatio  = avgVol > 0 ? bar.v / avgVol : 0;
        const dropFromHigh = high20 > 0 ? ((bar.c - high20) / high20) * 100 : 0;
        const date = bar.t.slice(0, 10);
        const isRecent = date >= recentCutoff;

        const gapCond   = gapPct <= -cfg.gapPct || closePct <= -cfg.gapPct;
        const volCond   = volRatio >= cfg.volRatio;
        const highCond  = dropFromHigh <= -cfg.highDropPct;

        if (gapCond || highCond) {
          hits.push({
            date, isRecent,
            closePct: +closePct.toFixed(2),
            gapPct:   +gapPct.toFixed(2),
            volRatio: +volRatio.toFixed(2),
            dropFromHigh: +dropFromHigh.toFixed(2),
            gapCond, volCond, highCond,
            gapCooldownOk: i >= gapNextAllowed,
            highCooldownOk: i >= highDropNextAllowed,
            wouldFireGap:  gapCond && volCond && i >= gapNextAllowed,
            wouldFireHigh: highCond && i >= highDropNextAllowed,
          });
        }

        if (gapCond && volCond && i >= gapNextAllowed) gapNextAllowed = i + 5;
        if (highCond && i >= highDropNextAllowed)       highDropNextAllowed = i + 15;
      }

      const recentHits = hits.filter(h => h.isRecent);
      const firedGap   = hits.filter(h => h.wouldFireGap);
      const firedHigh  = hits.filter(h => h.wouldFireHigh);
      const firedRecent = hits.filter(h => h.isRecent && (h.wouldFireGap || h.wouldFireHigh));

      out[sym] = {
        barCount: bars.length,
        dateRange: `${bars[0].t.slice(0,10)} → ${bars[lastIdx].t.slice(0,10)}`,
        recentCutoff,
        currentPrice: bars[lastIdx].c,
        totalRawHits:   hits.length,
        recentRawHits:  recentHits.length,
        totalFiredGap:  firedGap.length,
        totalFiredHigh: firedHigh.length,
        firedRecentCount: firedRecent.length,
        // Show last 5 fired signals (any period)
        lastFiredSignals: [...firedGap, ...firedHigh]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 5),
        // Show recent-window hits that DIDN'T fire (for diagnosis)
        recentBlockedHits: recentHits
          .filter(h => !h.wouldFireGap && !h.wouldFireHigh)
          .slice(-5),
      };
    } catch (e: any) {
      out[sym] = { error: e.message };
    }
  }

  return res.status(200).json(out);
}
