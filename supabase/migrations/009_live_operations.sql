-- Only transient operational facts missing from jobs/usage/payment records.
CREATE TABLE operation_events (
 id bigserial PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES businesses(id),
 job_id uuid NOT NULL REFERENCES jobs(id),
 run_id uuid NOT NULL,
 event_key text NOT NULL,
 event_type text NOT NULL,
 stage text NOT NULL,
 status text NOT NULL CHECK(status IN ('RUNNING','COMPLETE','FAILED','WAITING')),
 public_summary text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',
 visibility text NOT NULL DEFAULT 'PUBLIC' CHECK(visibility IN ('PUBLIC','OWNER_ONLY','SYSTEM')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,run_id,event_key)
);
CREATE INDEX operation_events_job_time ON operation_events(job_id,created_at,id);
CREATE INDEX operation_events_business_time ON operation_events(business_id,created_at DESC);
ALTER TABLE operation_events ENABLE ROW LEVEL SECURITY;
-- No direct client policies: authenticated application service enforces visibility.
