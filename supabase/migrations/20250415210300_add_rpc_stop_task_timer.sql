-- Migration to add the stop_task_timer RPC function

CREATE OR REPLACE FUNCTION public.stop_task_timer(
    p_task_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS uuid -- Returns the ID of the created time_entry record
LANGUAGE plpgsql
VOLATILE -- Modifies the database
SECURITY DEFINER -- To access active_timers and insert into time_entries
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_active_timer record;
    v_end_time timestamptz := now();
    v_duration_seconds numeric;
    v_duration_hours numeric;
    v_company_id uuid;
    v_project_id uuid;
    v_time_entry_id uuid;
BEGIN
    -- 1. Find the active timer for this user and task
    SELECT *
    INTO v_active_timer
    FROM public.active_timers
    WHERE user_id = v_user_id AND task_id = p_task_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active timer found for user % on task %.', v_user_id, p_task_id;
    END IF;

    -- 2. Get Project/Company context for the time entry
    SELECT p.company_id, s.project_id
    INTO v_company_id, v_project_id
    FROM public.tasks t
    JOIN public.sections s ON t.section_id = s.id
    JOIN public.projects p ON s.project_id = p.id
    WHERE t.id = p_task_id;

    IF NOT FOUND THEN
        -- This shouldn't happen if an active timer exists, but check defensively
        RAISE EXCEPTION 'Task % not found while stopping timer.', p_task_id;
    END IF;

    -- 3. Calculate duration
    v_duration_seconds := EXTRACT(EPOCH FROM (v_end_time - v_active_timer.start_time));
    -- Ensure duration is not negative (clock skew?)
    IF v_duration_seconds < 0 THEN v_duration_seconds := 0; END IF;
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
        v_active_timer.start_time,
        v_end_time,
        v_duration_hours,
        v_active_timer.start_time::date, -- Use the date the timer started
        p_notes
    )
    RETURNING id INTO v_time_entry_id;

    -- 5. Delete the active timer record
    DELETE FROM public.active_timers WHERE id = v_active_timer.id;

    RETURN v_time_entry_id;

EXCEPTION
    WHEN others THEN
        RAISE WARNING 'Error in stop_task_timer for task % user %: %', p_task_id, v_user_id, SQLERRM;
        RAISE; -- Re-raise the original error
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.stop_task_timer(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.stop_task_timer(uuid, text) IS 'Stops the active timer for the given task for the currently authenticated user, calculates duration, creates a time_entry record, and removes the active timer.';
