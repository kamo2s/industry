CREATE TABLE browser_captures (
 id uuid PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES businesses(id),
 job_id uuid NOT NULL REFERENCES jobs(id),
 run_id uuid NOT NULL,
 capture_key text NOT NULL,
 storage_kind text NOT NULL CHECK(storage_kind IN ('local','supabase')),
 storage_path text NOT NULL,
 url text NOT NULL,
 title text NOT NULL,
 action text NOT NULL CHECK(action IN ('PAGE_OPENED','EVIDENCE_CAPTURED')),
 visibility text NOT NULL CHECK(visibility IN ('PUBLIC','OWNER_ONLY','SYSTEM')),
 width integer NOT NULL,
 height integer NOT NULL,
 bytes integer NOT NULL CHECK(bytes>0 AND bytes<=262144),
 captured_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 UNIQUE(job_id,run_id,capture_key)
);
CREATE INDEX browser_captures_job ON browser_captures(job_id,captured_at);
CREATE INDEX browser_captures_expiry ON browser_captures(expires_at);
ALTER TABLE browser_captures ENABLE ROW LEVEL SECURITY;
-- Images are private objects; all reads go through the application's job ACL.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='storage' AND table_name='buckets') THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('browser-captures','browser-captures',false,262144,ARRAY['image/webp']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=262144,allowed_mime_types=ARRAY['image/webp'];
 END IF;
END $$;
