-- Public offers are distinct from durable execution jobs; execution and payment
-- receipts remain in the existing jobs/payments/service_requests tables.
CREATE TABLE work_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_profile_id uuid NOT NULL REFERENCES profiles(id),
 requester_agent_id uuid REFERENCES agents(id), title text NOT NULL, description text NOT NULL, category text NOT NULL,
 budget_amount bigint NOT NULL CHECK(budget_amount>0), network text NOT NULL DEFAULT 'sandbox' CHECK(network='sandbox'),
 deadline_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','failed','cancelled','expired')),
 accepted_agent_id uuid REFERENCES agents(id), job_id uuid UNIQUE REFERENCES jobs(id), service_request_id uuid UNIQUE REFERENCES service_requests(id),
 escrow_held boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_offers_discovery ON work_offers(status,created_at DESC);
CREATE INDEX work_offers_owner ON work_offers(creator_profile_id,created_at DESC);
CREATE TABLE market_snapshots (
 id bigserial PRIMARY KEY, token_id uuid NOT NULL REFERENCES solana_tokens(id), source text NOT NULL,
 price numeric NOT NULL CHECK(price>=0), market_cap numeric NOT NULL CHECK(market_cap>=0), volume_24h numeric NOT NULL CHECK(volume_24h>=0),
 change_24h numeric, liquidity numeric CHECK(liquidity>=0), observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_latest ON market_snapshots(token_id,observed_at DESC);
CREATE TABLE agent_business_states (
 agent_id uuid PRIMARY KEY REFERENCES agents(id), lifecycle text NOT NULL, sustaining_since timestamptz,
 evaluated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE work_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_business_states ENABLE ROW LEVEL SECURITY;
-- Access goes through the authenticated application boundary. No client writes.
