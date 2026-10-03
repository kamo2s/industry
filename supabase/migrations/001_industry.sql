CREATE TABLE profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), primary_wallet text UNIQUE NOT NULL, display_name text, credits bigint NOT NULL DEFAULT 100000000 CHECK(credits>=0), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE wallet_challenges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet text NOT NULL, nonce_hash text UNIQUE NOT NULL, message text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE TABLE sessions (token_hash text PRIMARY KEY, profile_id uuid NOT NULL REFERENCES profiles(id), expires_at timestamptz NOT NULL);
CREATE TABLE solana_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mint text NOT NULL, network text NOT NULL CHECK(network IN ('devnet','mainnet-beta')), name text NOT NULL, symbol text NOT NULL, decimals integer NOT NULL, metadata_uri text, verified_at timestamptz NOT NULL DEFAULT now(), raw_metadata jsonb NOT NULL DEFAULT '{}', UNIQUE(mint,network));
CREATE TABLE agents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, creator_profile_id uuid NOT NULL REFERENCES profiles(id), name text NOT NULL, ticker text, icon_url text NOT NULL DEFAULT '', description text NOT NULL, mission text NOT NULL, job_type text NOT NULL, category text NOT NULL, tags jsonb NOT NULL DEFAULT '[]', visibility text NOT NULL DEFAULT 'public', paused boolean NOT NULL DEFAULT false, health text NOT NULL DEFAULT 'OK', token_id uuid REFERENCES solana_tokens(id), config jsonb NOT NULL, last_run_at timestamptz, next_run_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE agent_tools (agent_id uuid REFERENCES agents(id), tool_key text NOT NULL, enabled boolean NOT NULL DEFAULT true, config jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(agent_id,tool_key));
CREATE TABLE wallet_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid UNIQUE REFERENCES agents(id), public_address text NOT NULL, network text NOT NULL CHECK(network IN ('sandbox','devnet')), signer_provider text NOT NULL, encrypted_key_reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE agent_services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES agents(id), slug text NOT NULL, name text NOT NULL, description text NOT NULL, category text NOT NULL, request_schema jsonb NOT NULL, response_schema jsonb NOT NULL, price_amount bigint NOT NULL CHECK(price_amount>0), price_currency text NOT NULL DEFAULT 'USDC' CHECK(price_currency='USDC'), max_seconds integer NOT NULL DEFAULT 60, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(agent_id,slug));
CREATE TABLE jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES agents(id), type text NOT NULL, trigger_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', output jsonb, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled')), priority integer NOT NULL DEFAULT 0, run_after timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3, locked_by text, lease uuid, locked_at timestamptz, heartbeat_at timestamptz, last_error text, idempotency_key text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz);
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, network text NOT NULL CHECK(network='sandbox'), payer_address text NOT NULL, payee_address text NOT NULL, amount bigint NOT NULL CHECK(amount>0), currency text NOT NULL DEFAULT 'USDC' CHECK(currency='USDC'), status text NOT NULL CHECK(status IN ('reserved','settled','refunded')), reference text UNIQUE NOT NULL, idempotency_key text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz);
CREATE TABLE service_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL REFERENCES agent_services(id), requester_profile_id uuid NOT NULL REFERENCES profiles(id), requester_agent_id uuid REFERENCES agents(id), provider_agent_id uuid NOT NULL REFERENCES agents(id), parent_job_id uuid REFERENCES jobs(id), input jsonb NOT NULL, output jsonb, status text NOT NULL DEFAULT 'queued', payment_id uuid UNIQUE NOT NULL REFERENCES payments(id), job_id uuid UNIQUE NOT NULL REFERENCES jobs(id), idempotency_key text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);
CREATE TABLE ledger_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES agents(id), direction text NOT NULL CHECK(direction IN ('credit','debit')), category text NOT NULL CHECK(category IN ('revenue','compute','tool','service_purchase','funding','refund')), amount bigint NOT NULL CHECK(amount>=0), currency text NOT NULL DEFAULT 'USDC', counterparty_agent_id uuid REFERENCES agents(id), payment_id uuid REFERENCES payments(id), service_request_id uuid REFERENCES service_requests(id), job_id uuid REFERENCES jobs(id), external boolean NOT NULL DEFAULT false, idempotency_key text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE activity_events (id bigserial PRIMARY KEY, agent_id uuid REFERENCES agents(id), related_agent_id uuid REFERENCES agents(id), job_id uuid REFERENCES jobs(id), service_request_id uuid REFERENCES service_requests(id), event_type text NOT NULL, action text NOT NULL, amount bigint, description text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', public boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE agent_memories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES agents(id), memory_type text NOT NULL, summary text NOT NULL, data jsonb NOT NULL DEFAULT '{}', source_job_id uuid UNIQUE REFERENCES jobs(id), importance integer NOT NULL DEFAULT 1, public boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz);
CREATE TABLE model_tool_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES jobs(id), agent_id uuid NOT NULL REFERENCES agents(id), kind text NOT NULL, provider text NOT NULL, model_or_tool text NOT NULL, cost_amount bigint NOT NULL CHECK(cost_amount>=0), status text NOT NULL, safe_metadata jsonb NOT NULL DEFAULT '{}', started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz NOT NULL DEFAULT now(), UNIQUE(job_id,model_or_tool));
CREATE TABLE treasury_snapshots (id bigserial PRIMARY KEY, agent_id uuid NOT NULL REFERENCES agents(id), balance_usdc numeric NOT NULL, revenue_24h numeric NOT NULL, revenue_7d numeric NOT NULL, cost_7d numeric NOT NULL, net_7d numeric NOT NULL, snapshot_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE agent_relationships (buyer_agent_id uuid REFERENCES agents(id), seller_agent_id uuid REFERENCES agents(id), jobs_count integer NOT NULL DEFAULT 0, total_paid bigint NOT NULL DEFAULT 0, last_activity_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(buyer_agent_id,seller_agent_id));
CREATE TABLE system_settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE idempotency_records (key text PRIMARY KEY, profile_id uuid NOT NULL REFERENCES profiles(id), operation text NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE worker_health (id text PRIMARY KEY, heartbeat_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL, reset_at timestamptz NOT NULL);
CREATE TABLE uploads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES profiles(id), content bytea NOT NULL, mime text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX agents_discovery ON agents(visibility,category,created_at DESC);
CREATE INDEX jobs_claim ON jobs(status,run_after,priority DESC);
CREATE INDEX activity_timeline ON activity_events(created_at DESC);
CREATE INDEX ledger_agent_time ON ledger_entries(agent_id,created_at DESC);
CREATE INDEX requests_status ON service_requests(provider_agent_id,status,created_at DESC);
CREATE INDEX service_category ON agent_services(category,active);
CREATE INDEX agents_owner ON agents(creator_profile_id);
CREATE INDEX jobs_agent ON jobs(agent_id,status);
CREATE INDEX memory_agent ON agent_memories(agent_id,created_at DESC);
CREATE INDEX challenges_expiry ON wallet_challenges(expires_at);

-- App sessions are verified server-side. No browser role may mutate economic records.
-- Supabase authenticated identities may read/update only their own simple profile fields.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','wallet_challenges','sessions','solana_tokens','agents','agent_tools','wallet_accounts','agent_services','jobs','payments','service_requests','ledger_entries','activity_events','agent_memories','model_tool_runs','treasury_snapshots','agent_relationships','system_settings','idempotency_records','worker_health','rate_limits','uploads'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;
CREATE POLICY agents_public ON agents FOR SELECT USING(visibility='public');
CREATE POLICY services_public ON agent_services FOR SELECT USING(active AND EXISTS(SELECT 1 FROM agents WHERE agents.id=agent_id AND visibility='public'));
CREATE POLICY activity_public ON activity_events FOR SELECT USING(public);
CREATE POLICY tokens_public ON solana_tokens FOR SELECT USING(true);
CREATE POLICY memory_public ON agent_memories FOR SELECT USING(public AND EXISTS(SELECT 1 FROM agents WHERE agents.id=agent_id AND visibility='public'));
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   GRANT SELECT ON agents,agent_services,activity_events,solana_tokens,agent_memories TO anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   GRANT SELECT ON agents,agent_services,activity_events,solana_tokens,agent_memories TO authenticated;
 END IF;
END $$;
