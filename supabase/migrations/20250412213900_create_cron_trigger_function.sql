-- supabase/migrations/20250412213900_create_cron_trigger_function.sql
-- Note: Timestamp is slightly before the schedule migration (214000)

-- Ensure the vault schema exists (it should normally, but let's be safe)
CREATE SCHEMA IF NOT EXISTS supabase_vault;

-- Create a security definer function to trigger the edge function securely
CREATE OR REPLACE FUNCTION public.trigger_generate_recurring_tasks()
RETURNS text -- Return the request ID or an error message
LANGUAGE plpgsql
SECURITY DEFINER -- IMPORTANT: Allows the function to access secrets
-- Set search_path to include necessary schemas
SET search_path = extensions, public, pgsodium, supabase_vault
AS $$
DECLARE
  project_url text := 'https://vrlluuasunhfggetteet.supabase.co/functions/v1/generate-recurring-tasks'; -- Replaced <PROJECT_REF>
  service_key text;
  auth_header jsonb;
  response jsonb;
  request_id bigint;
BEGIN
  -- 1. Get the service role key from the vault
  --    Ensure the name matches the one used in the Vault ('service_role_key')
  SELECT decrypted_secret INTO service_key
  FROM supabase_vault.secrets
  WHERE name = 'service_role_key';

  IF service_key IS NULL THEN
    RAISE EXCEPTION 'Secret "service_role_key" not found in Supabase Vault.';
  END IF;

  -- 2. Construct headers
  auth_header := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_key
  );

  -- 3. Make the HTTP POST request using pg_net
  SELECT net.http_post(
      url := project_url,
      headers := auth_header,
      body := '{}'::jsonb, -- Empty body
      timeout_milliseconds := 55000 -- Timeout slightly less than function limit
  )
  INTO response;

  -- Check response status (optional but recommended)
  IF response IS NULL OR (response->>'status_code')::int >= 300 THEN
     RAISE WARNING 'generate-recurring-tasks function trigger failed: HTTP %', response->>'status_code';
     -- Consider logging the full response body to a background job failures table
     RETURN 'Error: HTTP ' || COALESCE((response->>'status_code')::text, 'request failed');
  END IF;

  -- Extract request_id (assuming pg_net returns it like this)
  -- Check if request_id exists and is not null before casting
  IF response->>'request_id' IS NOT NULL THEN
      request_id := (response->>'request_id')::bigint;
      RETURN 'Successfully triggered: request_id ' || request_id::text;
  ELSE
      RETURN 'Successfully triggered: request_id not returned in response.';
  END IF;

EXCEPTION
  WHEN others THEN
    RAISE WARNING 'Error in trigger_generate_recurring_tasks: %', SQLERRM;
    RETURN 'Error: ' || SQLERRM;
END;
$$;

-- Grant execute permission to the postgres role (or the role running cron jobs)
GRANT EXECUTE ON FUNCTION public.trigger_generate_recurring_tasks() TO postgres;
-- Grant usage on the vault schema to the postgres role
-- This is crucial for the SECURITY DEFINER function to access the vault
GRANT USAGE ON SCHEMA supabase_vault TO postgres;
-- Removed: GRANT SELECT ON TABLE supabase_vault.secrets TO postgres; (USAGE on schema + SECURITY DEFINER should suffice)

COMMENT ON FUNCTION public.trigger_generate_recurring_tasks() IS 'Securely triggers the generate-recurring-tasks Edge Function using a key from Vault.';
