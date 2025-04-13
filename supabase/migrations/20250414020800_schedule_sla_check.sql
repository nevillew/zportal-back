-- Schedule the check-sla function to run periodically (e.g., every hour)

-- Function to trigger the Edge Function
CREATE OR REPLACE FUNCTION public.trigger_check_sla()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, supabase_vault
AS $$
DECLARE
  v_function_url text := supabase_url() || '/functions/v1/check-sla';
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
        RAISE WARNING 'trigger_check_sla failed: HTTP %', v_response->>'status_code';
        RETURN 'Error: HTTP ' || COALESCE((v_response->>'status_code')::text, 'request failed');
    END IF;

    RETURN 'Triggered check-sla function. Response: ' || (v_response->>'status_code')::text;
EXCEPTION WHEN others THEN
    RAISE WARNING 'Error in trigger_check_sla: %', SQLERRM;
    RETURN 'Error: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_check_sla() TO postgres;

-- Schedule the trigger function (e.g., hourly)
SELECT cron.schedule(
    'hourly-sla-check', -- Job name
    '0 * * * *', -- Cron schedule (at the start of every hour)
    $$ SELECT public.trigger_check_sla(); $$
);

COMMENT ON EXTENSION pg_cron IS 'pg_cron scheduler used for running periodic jobs like SLA checks.';
