CREATE TABLE IF NOT EXISTS portfolio_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  strike numeric(10,2) NOT NULL,
  expiry_date date NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  avg_cost numeric(10,4) NOT NULL CHECK (avg_cost > 0),
  entry_date date NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_positions_active_idx ON portfolio_positions (is_active);
CREATE INDEX IF NOT EXISTS portfolio_positions_ticker_idx ON portfolio_positions (ticker);
