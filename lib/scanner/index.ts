import { getStockBars } from '../alpaca';
import { getProfile, getLargeCapUniverse, hasPositiveRevenueGrowth, FALLBACK_LARGE_CAPS } from '../fmp';
import { getEarningsCalendar } from '../earnings';
import { analyzeDips, type ScanConfig } from './dips';
import { findLeapCandidates, type OptionsConfig } from './options';
import { scoreResult } from './scoring';
import { createClient } from '@supabase/supabase-js';

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface ScannerConfig {
  dip: ScanConfig;
  options: OptionsConfig;
  minMarketCapB: number;
  priorityScoreThreshold: number;
  requireRevenueGrowth: boolean;
}

export const DEFAULT_CONFIG: ScannerConfig = {
  minMarketCapB: 100,
  priorityScoreThreshold: 8,
  requireRevenueGrowth: true,
  dip: {
    earningsGapPct: 10,
    singleDayDropPct: 10,
    singleDayDropMaxPct: 40,
    highDropPct: 20,
    rollingDropPct: 15,
    rollingDays: 30,
    smaBelowPct: 15,
  },
  options: {
    minDte: 365,
    maxDte: 900,
    strikeProximityPct: 10,
    contractLowPct: 25,
    minOpenInterest: 500,
    minAvgVolume: 50,
    maxSpreadPct: 5,
  },
};

export async function runScan(cfg: ScannerConfig, runId: string, onProgress?: (msg: string) => void) {
  const db = supabase();
  const log = (msg: string) => { console.log(msg); onProgress?.(msg); };

  log('Fetching earnings calendar...');
  const earningsMap = await getEarningsCalendar(90);

  log('Building stock universe...');
  let universe: string[];
  try {
    universe = await getLargeCapUniverse(cfg.minMarketCapB);
  } catch {
    universe = FALLBACK_LARGE_CAPS;
  }

  log(`Scanning ${universe.length} stocks...`);
  let stocksScanned = 0;
  let resultsFound = 0;

  for (const ticker of universe) {
    try {
      log(`[${ticker}] Fetching bars...`);
      const bars = await getStockBars(ticker, 260);
      if (bars.length < 50) continue;

      // Market cap filter
      const profile = await getProfile(ticker);
      const marketCapB = profile ? profile.mktCap / 1e9 : 0;
      if (marketCapB < cfg.minMarketCapB) continue;

      // Revenue growth filter (skip if FMP unavailable)
      if (cfg.requireRevenueGrowth && process.env.FMP_API_KEY) {
        const hasGrowth = await hasPositiveRevenueGrowth(ticker);
        if (hasGrowth === false) continue;
      }

      stocksScanned++;

      // Analyze dips
      const earningsDate = earningsMap[ticker] ?? null;
      const dip = analyzeDips(bars, earningsDate, cfg.dip);
      if (!dip.anyTriggered) continue;

      log(`[${ticker}] Dip triggered! Finding LEAP contracts...`);

      const preDipPrice = dip.preDipPrice ?? dip.currentPrice;
      const candidates = await findLeapCandidates(ticker, preDipPrice, dip.currentPrice, cfg.options);
      if (!candidates.length) continue;

      // Take the best contract (lowest pctAboveLow)
      const contract = candidates[0];
      const score = scoreResult(dip, contract, marketCapB);

      const row = {
        run_id: runId,
        ticker,
        company_name: profile?.companyName ?? ticker,
        market_cap_b: marketCapB,
        current_price: dip.currentPrice,
        pre_dip_price: preDipPrice,
        price_52w_high: dip.price52wHigh,
        trigger_earnings_gap: dip.triggerEarningsGap,
        trigger_single_day: dip.triggerSingleDay,
        trigger_high_drop: dip.triggerHighDrop,
        trigger_rolling: dip.triggerRolling,
        drop_1day_pct: dip.drop1dayPct,
        drop_from_high_pct: dip.dropFromHighPct,
        drop_30day_pct: dip.drop30dayPct,
        dip_date: dip.dipDate,
        earnings_date: earningsDate,
        sma_200: dip.sma200,
        pre_dip_above_sma: dip.preDipAboveSma,
        post_dip_sma_pct: dip.postDipSmaPct,
        manual_review: dip.manualReview,
        contract_symbol: contract.contractSymbol,
        strike: contract.strike,
        expiry: contract.expiry,
        dte: contract.dte,
        contract_price: contract.contractPrice,
        contract_low_alltime: contract.contractLowAlltime,
        pct_above_low: contract.pctAboveLow,
        open_interest: contract.openInterest,
        avg_daily_volume: contract.avgDailyVolume,
        bid_ask_spread_pct: contract.bidAskSpreadPct,
        iv_rank: contract.ivRank,
        iv_current: contract.ivCurrent,
        score: score.total,
        score_breakdown: score,
        priority_alert: score.total >= cfg.priorityScoreThreshold,
      };

      await db.from('scan_results').insert(row);
      resultsFound++;
      log(`[${ticker}] Score ${score.total}/16 — saved.`);
    } catch (err: any) {
      log(`[${ticker}] Error: ${err.message}`);
    }
  }

  await db.from('scan_runs').update({
    status: 'completed',
    stocks_scanned: stocksScanned,
    results_found: resultsFound,
  }).eq('id', runId);

  log(`Scan complete. ${stocksScanned} stocks scanned, ${resultsFound} results.`);
  return { stocksScanned, resultsFound };
}
