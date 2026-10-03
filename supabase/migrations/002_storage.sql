-- Conditional so the exact migration is also executable in local Postgres/PGlite.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
   INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   VALUES('agent-icons','agent-icons',true,262144,ARRAY['image/png','image/jpeg','image/webp']) ON CONFLICT(id) DO NOTHING;
   EXECUTE 'CREATE POLICY industry_icons_read ON storage.objects FOR SELECT USING(bucket_id=''agent-icons'')';
   -- Uploads are validated and written by the server service role. Browser uploads are denied.
 END IF;
END $$;
