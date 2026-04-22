CREATE TABLE IF NOT EXISTS event_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid,
  scan_date date NOT NULL,
  ticker text NOT NULL,
  company_name text,
  market_cap_b numeric,
  current_price numeric,
  recent_signals jsonb DEFAULT '[]',
  historical_signals jsonb DEFAULT '[]',
  ohlc_json jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_signals_scan_date_idx ON event_signals (scan_date);
CREATE INDEX IF NOT EXISTS event_signals_ticker_idx ON event_signals (ticker);
