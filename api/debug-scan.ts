import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStockBars, getOptionsChain, getOptionSnapshots, getOptionBars } from './lib/alpaca.js';
import { analyzeDips } from './lib/scanner/dips.js';
import { getEarningsCalendar } from './lib/earnings.js';

const TEST_STOCKS = ['NVDA', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'LLY', 'AVGO'];

const DIP_CFG = {
  earningsGapPct: 10, singleDayDropPct: 10, singleDayDropMaxPct: 40,
  highDropPct: 20, rollingDropPct: 15, rollingDays: 30, smaBelowPct: 15,
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const out: Record<string, any> = {};

  // 1. Earnings calendar
  let earningsMap: Record<string, string> = {};
  try {
    earningsMap = await getEarningsCalendar(90);
    out.earningsMap = Object.fromEntries(
      TEST_STOCKS.filter(t => earningsMap[t]).map(t => [t, earningsMap[t]])
    );
  } catch (e: any) {
    out.earningsMap = { error: e.message };
  }

  // 2. Bars + dip analysis for each test stock
  out.stocks = {};
  const triggered: string[] = [];

  for (const ticker of TEST_STOCKS) {
    try {
      const bars = await getStockBars(ticker, 260);
      const dip = analyzeDips(bars, earningsMap[ticker] ?? null, DIP_CFG);
      out.stocks[ticker] = {
        barsCount: bars.length,
        currentPrice: dip.currentPrice,
        drop1dayPct: dip.drop1dayPct?.toFixed(2),
        drop30dayPct: dip.drop30dayPct?.toFixed(2),
        dropFromHighPct: dip.dropFromHighPct?.toFixed(2),
        triggerEarningsGap: dip.triggerEarningsGap,
        triggerSingleDay: dip.triggerSingleDay,
        triggerHighDrop: dip.triggerHighDrop,
        triggerRolling: dip.triggerRolling,
        anyTriggered: dip.anyTriggered,
      };
      if (dip.anyTriggered) triggered.push(ticker);
    } catch (e: any) {
      out.stocks[ticker] = { error: e.message };
    }
  }

  out.triggered = triggered;

  // 3. For each triggered stock, check options data
  out.options = {};
  for (const ticker of triggered.slice(0, 3)) { // limit to 3 to avoid timeout
    const optInfo: Record<string, any> = {};
    try {
      const chain = await getOptionsChain(ticker, 365, 900);
      optInfo.chainCount = chain.length;
      optInfo.sampleContracts = chain.slice(0, 3).map(c => ({
        symbol: c.symbol,
        strike: c.strike_price,
        expiry: c.expiration_date,
      }));

      if (chain.length > 0) {
        const symbols = chain.slice(0, 10).map(c => c.symbol);
        const snaps = await getOptionSnapshots(symbols);
        const snapCount = Object.keys(snaps).length;
        optInfo.snapshotCount = snapCount;

        const firstSnap = Object.entries(snaps)[0];
        if (firstSnap) {
          const [sym, snap] = firstSnap;
          optInfo.sampleSnapshot = { sym, snap };

          // Try historical bars for first contract
          const bars = await getOptionBars(sym);
          optInfo.sampleBarsCount = bars.length;
          if (bars.length > 0) {
            optInfo.sampleBarLow = Math.min(...bars.map(b => b.l));
            optInfo.sampleBarLatestClose = bars.at(-1)?.c;
          }
        } else {
          // Even if no snapshots, try bars on first chain contract
          const sym = chain[0].symbol;
          const bars = await getOptionBars(sym);
          optInfo.sampleBarsCount = bars.length;
          optInfo.noSnapshots = true;
        }
      }
    } catch (e: any) {
      optInfo.error = e.message;
    }
    out.options[ticker] = optInfo;
  }

  return res.status(200).json(out);
}
