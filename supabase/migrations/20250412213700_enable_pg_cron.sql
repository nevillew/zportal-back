-- supabase/migrations/20250412213700_enable_pg_cron.sql
-- Note: Timestamp is before pgsodium, trigger function, and schedule migrations

-- Enable the pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to the postgres role (or the role that will own/run cron jobs)
GRANT USAGE ON SCHEMA cron TO postgres;

COMMENT ON EXTENSION pg_cron IS 'pg_cron scheduler for running periodic jobs.';
