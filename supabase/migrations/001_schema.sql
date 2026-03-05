-- Scan configuration (one row, updated by UI)
CREATE TABLE IF NOT EXISTS scan_config (
  id INT PRIMARY KEY DEFAULT 1,
  min_market_cap_b NUMERIC DEFAULT 100,
  earnings_gap_pct NUMERIC DEFAULT 10,
  single_day_drop_pct NUMERIC DEFAULT 10,
  single_day_drop_max_pct NUMERIC DEFAULT 40,
  high_drop_pct NUMERIC DEFAULT 20,
  rolling_drop_pct NUMERIC DEFAULT 15,
  rolling_days INT DEFAULT 30,
  sma_below_pct NUMERIC DEFAULT 15,
  min_dte INT DEFAULT 365,
  max_dte INT DEFAULT 900,
  strike_proximity_pct NUMERIC DEFAULT 10,
  contract_low_pct NUMERIC DEFAULT 25,
  min_open_interest INT DEFAULT 500,
  min_avg_volume INT DEFAULT 50,
  max_spread_pct NUMERIC DEFAULT 5,
  priority_score_threshold INT DEFAULT 8,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO scan_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Each daily scan run
CREATE TABLE IF NOT EXISTS scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'running',
  stocks_scanned INT DEFAULT 0,
  results_found INT DEFAULT 0,
  error TEXT
);

-- One row per result (ticker + contract) per scan run
CREATE TABLE IF NOT EXISTS scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES scan_runs(id) ON DELETE CASCADE,
  scan_date DATE DEFAULT CURRENT_DATE,

  -- Stock info
  ticker TEXT NOT NULL,
  company_name TEXT,
  market_cap_b NUMERIC,
  current_price NUMERIC,
  pre_dip_price NUMERIC,
  price_52w_high NUMERIC,

  -- Dip triggers
  trigger_earnings_gap BOOLEAN DEFAULT FALSE,
  trigger_single_day BOOLEAN DEFAULT FALSE,
  trigger_high_drop BOOLEAN DEFAULT FALSE,
  trigger_rolling BOOLEAN DEFAULT FALSE,
  drop_1day_pct NUMERIC,
  drop_from_high_pct NUMERIC,
  drop_30day_pct NUMERIC,
  dip_date DATE,
  earnings_date DATE,

  -- Trend check
  sma_200 NUMERIC,
  pre_dip_above_sma BOOLEAN,
  post_dip_sma_pct NUMERIC,
  manual_review BOOLEAN DEFAULT FALSE,

  -- LEAP contract
  contract_symbol TEXT,
  strike NUMERIC,
  expiry DATE,
  dte INT,
  contract_price NUMERIC,
  contract_low_alltime NUMERIC,
  pct_above_low NUMERIC,
  open_interest INT,
  avg_daily_volume NUMERIC,
  bid_ask_spread_pct NUMERIC,
  iv_rank NUMERIC,
  iv_current NUMERIC,

  -- Score
  score INT DEFAULT 0,
  score_breakdown JSONB,
  priority_alert BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_results_date ON scan_results(scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_scan_results_ticker ON scan_results(ticker);
CREATE INDEX IF NOT EXISTS idx_scan_results_score ON scan_results(score DESC);
