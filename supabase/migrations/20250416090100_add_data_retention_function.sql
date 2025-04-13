-- Migration to add data retention function and schedule it

-- 1. Create the data retention function
CREATE OR REPLACE FUNCTION public.apply_data_retention_policies()
RETURNS text -- Returns a summary message
LANGUAGE plpgsql
SECURITY DEFINER -- Needed to potentially delete data across companies/logs
SET search_path = public, extensions
AS $$
DECLARE
    v_company RECORD;
    v_deleted_projects_count integer := 0;
    v_deleted_logs_count integer := 0;
    v_audit_log_retention_days integer;
    v_project_retention_days integer;
BEGIN
    RAISE LOG 'Starting data retention policy application...';

    -- Loop through companies with retention policies defined
    FOR v_company IN SELECT id, name, project_retention_days, log_retention_days FROM public.companies
                     WHERE project_retention_days IS NOT NULL OR log_retention_days IS NOT NULL
    LOOP
        RAISE LOG 'Processing company: % (ID: %)', v_company.name, v_company.id;

        -- Apply Project Retention
        IF v_company.project_retention_days IS NOT NULL THEN
            v_project_retention_days := v_company.project_retention_days;
            RAISE LOG ' -> Applying project retention: % days', v_project_retention_days;
            BEGIN
                WITH deleted_projects AS (
                    DELETE FROM public.projects
                    WHERE company_id = v_company.id
                      AND status = 'Completed' -- Only delete completed projects
                      AND updated_at < (now() - (v_project_retention_days || ' days')::interval)
                    RETURNING id
                )
                SELECT count(*) INTO v_deleted_projects_count FROM deleted_projects;
                RAISE LOG '  -> Deleted % completed projects older than % days for company %', v_deleted_projects_count, v_project_retention_days, v_company.id;
            EXCEPTION
                WHEN others THEN
                    RAISE WARNING 'Error applying project retention for company %: %', v_company.id, SQLERRM;
                    -- Log failure to background_job_failures
                    INSERT INTO public.background_job_failures (job_name, payload, error_message, status)
                    VALUES ('apply_data_retention_policies', jsonb_build_object('company_id', v_company.id, 'policy_type', 'project'), SQLERRM, 'logged');
            END;
        END IF;

        -- Apply Audit Log Retention (Specific to this company's related logs)
        IF v_company.log_retention_days IS NOT NULL THEN
            v_audit_log_retention_days := v_company.log_retention_days;
            RAISE LOG ' -> Applying audit log retention: % days', v_audit_log_retention_days;
            BEGIN
                -- Delete logs related to this company older than the retention period
                -- This requires identifying logs related to the company, which can be complex.
                -- Example: Deleting logs where the action was on the company itself, or on projects/users within the company.
                -- This is a simplified example targeting only direct company logs. A more robust solution is needed.
                WITH deleted_logs AS (
                    DELETE FROM public.audit_log
                    WHERE table_name = 'companies' AND record_id = v_company.id::text
                      AND timestamp < (now() - (v_audit_log_retention_days || ' days')::interval)
                    RETURNING id
                ),
                -- Delete logs for projects within the company
                deleted_project_logs AS (
                    DELETE FROM public.audit_log
                    WHERE table_name = 'projects'
                      AND record_id IN (SELECT id::text FROM public.projects WHERE company_id = v_company.id)
                      AND timestamp < (now() - (v_audit_log_retention_days || ' days')::interval)
                    RETURNING id
                ),
                -- Delete logs for tasks within the company's projects
                deleted_task_logs AS (
                    DELETE FROM public.audit_log
                    WHERE table_name = 'tasks'
                      AND record_id IN (
                          SELECT t.id::text FROM public.tasks t
                          JOIN public.sections s ON t.section_id = s.id
                          JOIN public.projects p ON s.project_id = p.id
                          WHERE p.company_id = v_company.id
                      )
                      AND timestamp < (now() - (v_audit_log_retention_days || ' days')::interval)
                    RETURNING id
                ),
                -- Delete logs for company_users within the company
                deleted_cu_logs AS (
                    DELETE FROM public.audit_log
                    WHERE table_name = 'company_users'
                      AND record_id IN (SELECT id::text FROM public.company_users WHERE company_id = v_company.id)
                      AND timestamp < (now() - (v_audit_log_retention_days || ' days')::interval)
                    RETURNING id
                )
                -- Add similar CTEs for other relevant tables (risks, issues, milestones, documents, etc.) linked to the company
                SELECT
                    (SELECT count(*) FROM deleted_company_logs) +
                    (SELECT count(*) FROM deleted_project_logs) +
                    (SELECT count(*) FROM deleted_task_logs) +
                    (SELECT count(*) FROM deleted_cu_logs)
                    -- Add counts from other CTEs here
                INTO v_deleted_logs_count;

                RAISE LOG '  -> Deleted % related audit logs older than % days for company %', v_deleted_logs_count, v_audit_log_retention_days, v_company.id;
            EXCEPTION
                WHEN others THEN
                    RAISE WARNING 'Error applying audit log retention for company %: %', v_company.id, SQLERRM;
                    -- Log failure
                    INSERT INTO public.background_job_failures (job_name, payload, error_message, status)
                    VALUES ('apply_data_retention_policies', jsonb_build_object('company_id', v_company.id, 'policy_type', 'audit_log'), SQLERRM, 'logged');
            END;
        END IF;

    END LOOP;

    RAISE LOG 'Data retention policy application finished.';
    RETURN 'Data retention applied. Summary: Deleted Projects=' || v_deleted_projects_count || ', Deleted Logs=' || v_deleted_logs_count;

EXCEPTION
    WHEN others THEN
        RAISE WARNING 'Error during data retention execution: %', SQLERRM;
        -- Log general failure
        INSERT INTO public.background_job_failures (job_name, error_message, status)
        VALUES ('apply_data_retention_policies', SQLERRM, 'logged');
        RETURN 'Error: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_data_retention_policies() TO postgres; -- Grant to role running cron

COMMENT ON FUNCTION public.apply_data_retention_policies() IS 'Applies data retention policies based on company settings, deleting old completed projects and audit logs.';

-- 2. Schedule the function using pg_cron (e.g., run daily at 3:00 AM UTC)
-- Ensure pg_cron is enabled and the user running cron has execute permission on the function.
SELECT cron.schedule(
    'daily-data-retention', -- Job name
    '0 3 * * *', -- Cron schedule (3:00 AM UTC daily)
    $$ SELECT public.apply_data_retention_policies(); $$
);

COMMENT ON EXTENSION pg_cron IS 'pg_cron scheduler used for running periodic jobs like data retention.';
