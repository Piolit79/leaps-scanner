import type { DipResult } from './dips.js';
import type { LeapCandidate } from './options.js';

export interface ScoreBreakdown {
  earningsGap: number;       // +3
  multiTrigger: number;      // +2
  nearContractLow: number;   // +3 (within 10%) or +1 (10-25%)
  preDipAboveSma: number;    // +2
  ivRankLow: number;         // +2
  largeCap: number;          // +1 (mktCap > $200B)
  highOI: number;            // +1 (OI > 2000)
  total: number;
}

export function scoreResult(
  dip: DipResult,
  contract: LeapCandidate,
  marketCapB: number,
): ScoreBreakdown {
  let earningsGap = 0;
  let multiTrigger = 0;
  let nearContractLow = 0;
  let preDipAboveSma = 0;
  let ivRankLow = 0;
  let largeCap = 0;
  let highOI = 0;

  // +3 earnings gap-down trigger
  if (dip.triggerEarningsGap) earningsGap = 3;

  // +2 multiple triggers
  const triggerCount = [dip.triggerEarningsGap, dip.triggerSingleDay, dip.triggerHighDrop, dip.triggerRolling]
    .filter(Boolean).length;
  if (triggerCount >= 2) multiTrigger = 2;

  // +3 within 10% of contract low, +1 for 10-25%
  if (contract.pctAboveLow <= 10) nearContractLow = 3;
  else if (contract.pctAboveLow <= 25) nearContractLow = 1;

  // +2 pre-dip above 200 SMA
  if (dip.preDipAboveSma) preDipAboveSma = 2;

  // +2 IV rank < 30
  if (contract.ivRank !== null && contract.ivRank < 30) ivRankLow = 2;
  // If no IV rank data, use IV level as proxy — below 0.25 (25%) is low
  else if (contract.ivCurrent !== null && contract.ivCurrent < 0.25) ivRankLow = 2;

  // +1 market cap > $200B
  if (marketCapB > 200) largeCap = 1;

  // +1 OI > 2000
  if (contract.openInterest > 2000) highOI = 1;

  const total = earningsGap + multiTrigger + nearContractLow + preDipAboveSma + ivRankLow + largeCap + highOI;

  return { earningsGap, multiTrigger, nearContractLow, preDipAboveSma, ivRankLow, largeCap, highOI, total };
}
