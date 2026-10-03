ALTER TABLE agent_memories DROP CONSTRAINT agent_memories_source_job_id_key;
ALTER TABLE agent_memories ADD CONSTRAINT agent_memory_per_job UNIQUE(agent_id,source_job_id);
CREATE TABLE token_launches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES profiles(id),idempotency_key text UNIQUE NOT NULL,fingerprint text NOT NULL,name text NOT NULL,symbol text NOT NULL,payer_address text NOT NULL,payer_encrypted text NOT NULL,mint_address text NOT NULL,mint_encrypted text NOT NULL,status text NOT NULL DEFAULT 'prepared',signature text,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE token_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ADD COLUMN storage_path text;
ALTER TABLE uploads ALTER COLUMN content DROP NOT NULL;
