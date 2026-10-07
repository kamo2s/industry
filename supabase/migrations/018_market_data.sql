-- Unknown market fields must remain unknown, never fabricated zeroes.
ALTER TABLE market_snapshots ALTER COLUMN price DROP NOT NULL;
ALTER TABLE market_snapshots ALTER COLUMN market_cap DROP NOT NULL;
ALTER TABLE market_snapshots ALTER COLUMN volume_24h DROP NOT NULL;
CREATE TABLE market_refresh_state (
 token_id uuid PRIMARY KEY REFERENCES solana_tokens(id),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz,
 status text NOT NULL DEFAULT 'pending'
);
ALTER TABLE market_refresh_state ENABLE ROW LEVEL SECURITY;
