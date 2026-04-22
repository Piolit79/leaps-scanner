CREATE TABLE IF NOT EXISTS sma_dip_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid,
  scan_date date NOT NULL,
  ticker text NOT NULL,
  company_name text,
  market_cap_b numeric,
  current_price numeric,
  current_sma20 numeric,
  current_drop_pct numeric,
  is_current boolean DEFAULT false,
  signal_count integer DEFAULT 0,
  max_drop_pct numeric,
  first_signal_date date,
  last_signal_date date,
  signals_json jsonb,
  price_history_json jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sma_dip_results_scan_date_idx ON sma_dip_results (scan_date);
CREATE INDEX IF NOT EXISTS sma_dip_results_ticker_idx ON sma_dip_results (ticker);
