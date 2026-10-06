-- Run once in the existing MemeSplice Supabase SQL Editor as postgres.
-- No existing public tables, token metadata, storage objects or roles are removed.
-- Do not add industry to the public Data API's exposed schemas.
BEGIN;
CREATE SCHEMA IF NOT EXISTS industry AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA industry FROM PUBLIC, anon, authenticated;
COMMIT;
-- The database broker uses DATABASE_SCHEMA=industry; it must not fall back to public.
