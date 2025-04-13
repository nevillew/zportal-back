-- Schedule the update-project-health function to run daily (e.g., at 4:00 AM UTC)
-- Assumes the trigger_edge_function helper exists or uses direct pg_net call
-- Using direct pg_net call for simplicity here

-- Function to trigger the Edge Function (requires pg_net extension)
CREATE OR REPLACE FUNCTION public.trigger_update_project_health()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- To access secrets if needed, though service key used directly here
SET search_path = public, extensions, supabase_vault
AS $$
DECLARE
  v_function_url text := supabase_url() || '/functions/v1/update-project-health';
  v_service_key text;
  v_auth_header jsonb;
  v_response jsonb;
BEGIN
    -- Get service role key (alternative to internal secret if preferred for cron)
    SELECT decrypted_secret INTO v_service_key FROM supabase_vault.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
    IF v_service_key IS NULL THEN RAISE EXCEPTION 'Secret SUPABASE_SERVICE_ROLE_KEY not found.'; END IF;

    v_auth_header := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key, 'apikey', (SELECT anon_key FROM public.get_supabase_settings())); -- Include anon key as well

    SELECT net.http_post(url := v_function_url, headers := v_auth_header, body := '{}'::jsonb, timeout_milliseconds := 290000) -- 290 sec timeout
    INTO v_response;

    IF v_response IS NULL OR (v_response->>'status_code')::int >= 300 THEN
        RAISE WARNING 'trigger_update_project_health failed: HTTP %', v_response->>'status_code';
        RETURN 'Error: HTTP ' || COALESCE((v_response->>'status_code')::text, 'request failed');
    END IF;

    RETURN 'Triggered update-project-health function. Response: ' || (v_response->>'status_code')::text;
EXCEPTION WHEN others THEN
    RAISE WARNING 'Error in trigger_update_project_health: %', SQLERRM;
    RETURN 'Error: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_update_project_health() TO postgres;

-- Schedule the trigger function
SELECT cron.schedule(
    'daily-project-health-update', -- Job name
    '0 4 * * *', -- Cron schedule (4:00 AM UTC daily)
    $$ SELECT public.trigger_update_project_health(); $$
);

COMMENT ON EXTENSION pg_cron IS 'pg_cron scheduler used for running periodic jobs like project health updates.';
