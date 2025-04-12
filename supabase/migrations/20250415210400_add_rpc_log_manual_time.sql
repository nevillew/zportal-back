-- Migration to add the log_manual_time RPC function

CREATE OR REPLACE FUNCTION public.log_manual_time(
    p_task_id uuid,
    p_start_time timestamptz,
    p_end_time timestamptz,
    p_notes text DEFAULT NULL
)
RETURNS uuid -- Returns the ID of the created time_entry record
LANGUAGE plpgsql
VOLATILE -- Modifies the database
SECURITY DEFINER -- To check permissions and insert into time_entries
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_company_id uuid;
    v_project_id uuid;
    v_duration_seconds numeric;
    v_duration_hours numeric;
    v_time_entry_id uuid;
BEGIN
    -- 1. Validate inputs
    IF p_start_time IS NULL OR p_end_time IS NULL THEN
        RAISE EXCEPTION 'Start time and end time are required for manual logging.';
    END IF;
    IF p_end_time < p_start_time THEN
        RAISE EXCEPTION 'End time cannot be before start time.';
    END IF;

    -- 2. Check if user can access the task and get context
    SELECT p.company_id, s.project_id
    INTO v_company_id, v_project_id
    FROM public.tasks t
    JOIN public.sections s ON t.section_id = s.id
    JOIN public.projects p ON s.project_id = p.id
    WHERE t.id = p_task_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    IF NOT can_access_project(v_user_id, v_project_id) THEN
        RAISE EXCEPTION 'User % does not have permission to access task %', v_user_id, p_task_id;
    END IF;

    -- 3. Calculate duration
    v_duration_seconds := EXTRACT(EPOCH FROM (p_end_time - p_start_time));
    v_duration_hours := v_duration_seconds / 3600.0;

    -- 4. Insert into time_entries
    INSERT INTO public.time_entries (
        task_id,
        user_id,
        company_id,
        project_id,
        start_time,
        end_time,
        duration_hours,
        date_worked,
        notes
    )
    VALUES (
        p_task_id,
        v_user_id,
        v_company_id,
        v_project_id,
        p_start_time,
        p_end_time,
        v_duration_hours,
        p_start_time::date, -- Use the date the work started
        p_notes
    )
    RETURNING id INTO v_time_entry_id;

    RETURN v_time_entry_id;

EXCEPTION
    WHEN others THEN
        RAISE WARNING 'Error in log_manual_time for task % user %: %', p_task_id, v_user_id, SQLERRM;
        RAISE; -- Re-raise the original error
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.log_manual_time(uuid, timestamptz, timestamptz, text) TO authenticated;

COMMENT ON FUNCTION public.log_manual_time(uuid, timestamptz, timestamptz, text) IS 'Logs a manual time entry for the given task for the currently authenticated user.';
