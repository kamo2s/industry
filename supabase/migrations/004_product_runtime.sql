-- Preserve existing development history; chain money has its own ledger domain.
ALTER TABLE agents ADD COLUMN terminated_at timestamptz;
CREATE UNIQUE INDEX one_agent_per_token ON agents(token_id) WHERE token_id IS NOT NULL;
ALTER TABLE solana_tokens ADD COLUMN creator_wallet text;
ALTER TABLE solana_tokens ADD COLUMN launched_at timestamptz;
ALTER TABLE solana_tokens ADD COLUMN transaction_signature text;
ALTER TABLE solana_tokens ADD COLUMN official boolean NOT NULL DEFAULT false;
ALTER TABLE token_launches ADD COLUMN metadata_uri text NOT NULL DEFAULT '';
ALTER TABLE token_launches ADD COLUMN completed_at timestamptz;
CREATE FUNCTION preserve_agent_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.token_id IS DISTINCT FROM OLD.token_id OR NEW.creator_profile_id IS DISTINCT FROM OLD.creator_profile_id THEN
    RAISE EXCEPTION 'Agent token and creator identity are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_agent_identity BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION preserve_agent_identity();
CREATE FUNCTION preserve_token_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mint IS DISTINCT FROM OLD.mint OR NEW.network IS DISTINCT FROM OLD.network OR
     (OLD.official AND (NOT NEW.official OR NEW.creator_wallet IS DISTINCT FROM OLD.creator_wallet OR NEW.transaction_signature IS DISTINCT FROM OLD.transaction_signature)) THEN
    RAISE EXCEPTION 'Canonical token identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_token_identity BEFORE UPDATE ON solana_tokens FOR EACH ROW EXECUTE FUNCTION preserve_token_identity();

ALTER TABLE jobs ADD COLUMN trace_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE jobs ADD COLUMN run_id uuid;
ALTER TABLE jobs ADD COLUMN phase text NOT NULL DEFAULT 'QUEUED' CHECK(phase IN ('QUEUED','CLAIMED','RUNNING','WAITING_TOOL','WAITING_PAYMENT','COMPLETED','FAILED','RETRYING','CANCELLED'));
ALTER TABLE jobs ADD COLUMN dead_lettered_at timestamptz;
UPDATE jobs SET phase=CASE status WHEN 'succeeded' THEN 'COMPLETED' WHEN 'failed' THEN 'FAILED' WHEN 'cancelled' THEN 'CANCELLED' WHEN 'running' THEN 'RUNNING' ELSE 'QUEUED' END;
ALTER TABLE payments DROP CONSTRAINT payments_network_check;
ALTER TABLE payments ADD CONSTRAINT payments_network_check CHECK(network IN ('sandbox','devnet'));
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK(status IN ('reserved','settled','refunded','refund_required'));
ALTER TABLE payments ADD COLUMN transaction_signature text;
ALTER TABLE payments ADD COLUMN asset text;
ALTER TABLE ledger_entries ADD COLUMN network text NOT NULL DEFAULT 'sandbox' CHECK(network IN ('sandbox','devnet'));
CREATE INDEX ledger_network_agent_time ON ledger_entries(network,agent_id,created_at DESC);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES agent_services(id),
  requester_profile_id uuid REFERENCES profiles(id),
  requester_agent_id uuid REFERENCES agents(id),
  parent_job_id uuid REFERENCES jobs(id),
  idempotency_key text NOT NULL UNIQUE,
  fingerprint text NOT NULL,
  input jsonb NOT NULL,
  requirements jsonb NOT NULL,
  resource_url text NOT NULL,
  status text NOT NULL DEFAULT 'quoted' CHECK(status IN ('quoted','reserved','signed','verifying','settling','settled','failed','expired')),
  payment_payload jsonb,
  transaction_hash text UNIQUE,
  signature text UNIQUE,
  payer text,
  receipt jsonb,
  request_id uuid UNIQUE REFERENCES service_requests(id),
  last_error text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes'
);
CREATE INDEX payment_attempt_recovery ON payment_attempts(status,updated_at);
CREATE INDEX payment_attempt_buyer ON payment_attempts(requester_agent_id,created_at DESC);
CREATE TABLE indexed_records (
  agent_id uuid NOT NULL REFERENCES agents(id),
  url text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  fingerprint text NOT NULL,
  source_job_id uuid NOT NULL REFERENCES jobs(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(agent_id,url)
);
CREATE INDEX indexed_records_search ON indexed_records USING gin(to_tsvector('english',title || ' ' || content));
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id),
  agent_id uuid REFERENCES agents(id),
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE abuse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_profile_id uuid NOT NULL REFERENCES profiles(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  agent_id uuid REFERENCES agents(id),
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE indexed_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE abuse_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- All writes and private reads go through the authenticated application service.
