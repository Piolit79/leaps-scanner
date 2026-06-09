export interface Position {
  id: string;
  ticker: string;
  strike: number;
  expiry_date: string;   // YYYY-MM-DD
  quantity: number;
  avg_cost: number;      // per contract (multiply by 100 for dollar value)
  entry_date: string;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PositionAxes {
  trend: number;       // -3 to +3
  time: number;        // -3 to +3
  structure: number;   // -3 to +3
  momentum: number;    // -3 to +3
}

export type SignalAction =
  | 'HOLD_STRONG'
  | 'HOLD'
  | 'WATCH'
  | 'TRIM'
  | 'EXIT'
  | 'ROLL'
  | 'RECOVER_COST';

export interface PositionScore {
  axes: PositionAxes;
  total: number;
  action: SignalAction;
  reasons: string[];
}

export interface LivePositionData {
  underlyingPrice: number;
  underlyingDayChangePct: number;
  optionMark: number | null;
  rsi14: number;
  sma200: number;
  high52w: number;
  dte: number;
  pctFromStrike: number;   // positive = ITM, negative = OTM
  pctFrom52wHigh: number;  // negative = below high
  pctAboveSma200: number;  // positive = above SMA200
}

export interface EnrichedPosition extends Position {
  live: LivePositionData | null;
  score: PositionScore | null;
  pnlPct: number | null;
  pnlDollars: number | null;
  currentMark: number | null;
}
