CREATE TABLE provider_budget_reservations (
 run_id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES jobs(id), business_id uuid NOT NULL REFERENCES businesses(id),
 budget_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date, environment text NOT NULL,
 reserved_micro bigint NOT NULL CHECK(reserved_micro>=0), charged_micro bigint NOT NULL DEFAULT 0 CHECK(charged_micro>=0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','settled')), created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz
);
CREATE INDEX provider_budget_day ON provider_budget_reservations(environment,budget_day);
ALTER TABLE provider_budget_reservations ENABLE ROW LEVEL SECURITY;
CREATE TABLE process_health (id text PRIMARY KEY, kind text NOT NULL, state text NOT NULL, heartbeat_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL DEFAULT '{}');
ALTER TABLE process_health ENABLE ROW LEVEL SECURITY;
-- Public access goes through sanitized application projections. Base agent config
-- and memory JSON may contain private mandates and source snippets.
DROP POLICY agents_public ON agents;
DROP POLICY services_public ON agent_services;
DROP POLICY memory_public ON agent_memories;
CREATE POLICY agents_public ON agents FOR SELECT USING(visibility='public');
CREATE POLICY services_public ON agent_services FOR SELECT USING(active AND EXISTS(SELECT 1 FROM agents WHERE agents.id=agent_id AND visibility='public'));
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON agents,agent_services,agent_memories,activity_events,solana_tokens FROM %I',r);
   EXECUTE format('REVOKE EXECUTE ON FUNCTION post_ledger_transfer(text,uuid,uuid,bigint,text,uuid,text,text,jsonb,timestamptz) FROM %I',r);
  END IF;
 END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION post_ledger_transfer(text,uuid,uuid,bigint,text,uuid,text,text,jsonb,timestamptz) FROM PUBLIC;
-- The trusted DB service owns the schema. Browser access is through wallet ACLs.
