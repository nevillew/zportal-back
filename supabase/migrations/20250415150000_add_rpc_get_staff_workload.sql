-- Migration to add the get_staff_workload RPC function

-- Assumes a view named 'view_staff_workload' exists with columns like:
-- staff_user_id, staff_name, assigned_tasks_count, estimated_hours_total,
-- completed_tasks_count, overdue_tasks_count, etc.

CREATE OR REPLACE FUNCTION public.get_staff_workload(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"staff_user_id": "uuid"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_staff_workload that should be returned
    staff_user_id uuid,
    staff_name text,
    assigned_tasks_count bigint,
    estimated_hours_total numeric,
    completed_tasks_count bigint,
    overdue_tasks_count bigint,
    -- Add other relevant columns from the view here...
    total_count bigint -- Total number of matching results (for pagination)
)
LANGUAGE plpgsql
STABLE -- Function does not modify the database
SECURITY DEFINER -- Allows checking permissions using helper functions
SET search_path = public, extensions -- Ensure helper functions are found
AS $$
DECLARE
    v_offset integer;
    v_filter_staff_user_id uuid;
    v_total_count bigint;
BEGIN
    -- RLS Check: Only staff users can access this data
    IF NOT is_staff_user(p_user_id) THEN
        RAISE EXCEPTION 'User % does not have permission to access staff workload.', p_user_id;
    END IF;

    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_staff_user_id := (p_filters->>'staff_user_id')::uuid;

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_staff_workload vsw -- Query the view
    WHERE
        -- Apply optional filters
        (v_filter_staff_user_id IS NULL OR vsw.staff_user_id = v_filter_staff_user_id);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vsw.staff_user_id,
        vsw.staff_name,
        vsw.assigned_tasks_count,
        vsw.estimated_hours_total,
        vsw.completed_tasks_count,
        vsw.overdue_tasks_count,
        -- Add other relevant columns from the view here...
        v_total_count -- Include total count in each row
    FROM public.view_staff_workload vsw -- Query the view
    WHERE
        -- Apply optional filters
        (v_filter_staff_user_id IS NULL OR vsw.staff_user_id = v_filter_staff_user_id)
    ORDER BY vsw.staff_name ASC -- Example default sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission to the authenticated role (RLS check inside function restricts access)
GRANT EXECUTE ON FUNCTION public.get_staff_workload(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_staff_workload(uuid, jsonb, integer, integer) IS 'Retrieves staff workload data from view_staff_workload, applying filters and pagination. Restricted to staff users.';
