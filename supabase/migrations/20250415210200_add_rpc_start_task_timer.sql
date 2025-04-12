-- Migration to add the start_task_timer RPC function

CREATE OR REPLACE FUNCTION public.start_task_timer(
    p_task_id uuid
)
RETURNS uuid -- Returns the ID of the new active_timer record
LANGUAGE plpgsql
VOLATILE -- Modifies the database
SECURITY DEFINER -- To check permissions and insert into active_timers
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_company_id uuid;
    v_project_id uuid;
    v_active_timer_id uuid;
BEGIN
    -- 1. Check if user can access the task
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

    -- 2. Check if user already has an active timer (handled by UNIQUE constraint, but check here for better error)
    IF EXISTS (SELECT 1 FROM public.active_timers WHERE user_id = v_user_id) THEN
        RAISE EXCEPTION 'User % already has an active timer running.', v_user_id;
    END IF;

    -- 3. Insert into active_timers
    INSERT INTO public.active_timers (task_id, user_id, start_time)
    VALUES (p_task_id, v_user_id, now())
    RETURNING id INTO v_active_timer_id;

    RETURN v_active_timer_id;

EXCEPTION
    WHEN unique_violation THEN
        -- Catch potential race condition if constraint is violated after check
        RAISE EXCEPTION 'User % already has an active timer running (constraint violation).', v_user_id;
    WHEN others THEN
        RAISE WARNING 'Error in start_task_timer for task % user %: %', p_task_id, v_user_id, SQLERRM;
        RAISE; -- Re-raise the original error
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.start_task_timer(uuid) TO authenticated;

COMMENT ON FUNCTION public.start_task_timer(uuid) IS 'Starts a timer for the given task for the currently authenticated user. Raises an error if the user already has an active timer.';
