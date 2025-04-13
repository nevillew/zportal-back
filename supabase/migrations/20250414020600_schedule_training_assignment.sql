-- Schedule the assign-training function to run daily (e.g., at 5:00 AM UTC)

-- Function to trigger the Edge Function
CREATE OR REPLACE FUNCTION public.trigger_assign_training()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, supabase_vault
AS $$
DECLARE
  v_function_url text := supabase_url() || '/functions/v1/assign-training';
  v_service_key text;
  v_auth_header jsonb;
  v_response jsonb;
BEGIN
    SELECT decrypted_secret INTO v_service_key FROM supabase_vault.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
    IF v_service_key IS NULL THEN RAISE EXCEPTION 'Secret SUPABASE_SERVICE_ROLE_KEY not found.'; END IF;

    v_auth_header := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key, 'apikey', (SELECT anon_key FROM public.get_supabase_settings()));

    SELECT net.http_post(url := v_function_url, headers := v_auth_header, body := '{}'::jsonb, timeout_milliseconds := 290000)
    INTO v_response;

    IF v_response IS NULL OR (v_response->>'status_code')::int >= 300 THEN
        RAISE WARNING 'trigger_assign_training failed: HTTP %', v_response->>'status_code';
        RETURN 'Error: HTTP ' || COALESCE((v_response->>'status_code')::text, 'request failed');
    END IF;

    RETURN 'Triggered assign-training function. Response: ' || (v_response->>'status_code')::text;
EXCEPTION WHEN others THEN
    RAISE WARNING 'Error in trigger_assign_training: %', SQLERRM;
    RETURN 'Error: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_assign_training() TO postgres;

-- Schedule the trigger function
SELECT cron.schedule(
    'daily-training-assignment', -- Job name
    '0 5 * * *', -- Cron schedule (5:00 AM UTC daily)
    $$ SELECT public.trigger_assign_training(); $$
);

COMMENT ON EXTENSION pg_cron IS 'pg_cron scheduler used for running periodic jobs like training auto-assignment.';
