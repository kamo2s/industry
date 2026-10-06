-- Owner-approved cadence change. Missions, policies, accounts and safety stops
-- remain intact; migration never unpauses or revives a terminated business.
ALTER TABLE agents ADD COLUMN autonomy_state jsonb NOT NULL DEFAULT '{}';
ALTER TABLE jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK(status IN ('queued','running','succeeded','failed','cancelled','waiting'));
ALTER TABLE jobs DROP CONSTRAINT jobs_phase_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_phase_check CHECK(phase IN ('QUEUED','CLAIMED','RUNNING','WAITING_TOOL','WAITING_PAYMENT','COMPLETED','FAILED','RETRYING','CANCELLED','WAITING_INPUT'));
INSERT INTO business_config_history(business_id,profile_id,previous,current)
 SELECT business_id,creator_profile_id,config,jsonb_set(config,'{schedule}','"continuous"')
 FROM agents WHERE terminated_at IS NULL AND config->>'schedule'<>'continuous';
UPDATE agents SET config=jsonb_set(config,'{schedule}','"continuous"'),
 next_run_at=CASE WHEN paused OR config->'policy'->>'killSwitch'='true' THEN NULL ELSE now() END,
 autonomy_state='{"reason":"ready","cycle":0}',updated_at=now()
 WHERE terminated_at IS NULL;
