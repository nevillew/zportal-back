-- Migration to create a standalone function for logging background job failures

CREATE OR REPLACE FUNCTION public.log_background_job_failure(
    p_job_name text,
    p_payload jsonb,
    p_error_message text,
    p_stack_trace text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Allows insertion into the failures table regardless of caller permissions
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.background_job_failures (job_name, payload, error_message, stack_trace, status)
    VALUES (p_job_name, p_payload, p_error_message, p_stack_trace, 'logged');
EXCEPTION
    WHEN others THEN
        -- If logging itself fails, raise a warning but don't fail the original operation
        RAISE WARNING 'CRITICAL: Failed to log background job failure for job "%": %', p_job_name, SQLERRM;
END;
$$;

-- Grant execute permission to roles that might call this (e.g., postgres for triggers, authenticated for RPCs if needed)
GRANT EXECUTE ON FUNCTION public.log_background_job_failure(text, jsonb, text, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.log_background_job_failure(text, jsonb, text, text) TO authenticated; -- Grant to authenticated role as well

COMMENT ON FUNCTION public.log_background_job_failure(text, jsonb, text, text) IS 'Logs details of a failed background job or trigger operation into the background_job_failures table.';
