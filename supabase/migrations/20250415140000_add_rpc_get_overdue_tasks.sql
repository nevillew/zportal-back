-- Migration to add the get_overdue_tasks RPC function

-- Assumes a view named 'view_overdue_tasks' exists with columns like:
-- task_id, task_name, project_id, project_name, section_name, company_id, company_name,
-- status, priority, assignee_id, assignee_name, due_date, days_overdue, etc.

CREATE OR REPLACE FUNCTION public.get_overdue_tasks(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid", "project_id": "uuid", "assignee_id": "uuid"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_overdue_tasks that should be returned
    task_id uuid,
    task_name text,
    project_id uuid,
    project_name text,
    section_name text,
    company_id uuid,
    company_name text,
    status text,
    priority text,
    assignee_id uuid,
    assignee_name text,
    due_date timestamptz,
    days_overdue integer,
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
    v_filter_company_id uuid;
    v_filter_project_id uuid;
    v_filter_assignee_id uuid;
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;
    v_filter_project_id := (p_filters->>'project_id')::uuid;
    v_filter_assignee_id := (p_filters->>'assignee_id')::uuid;

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_overdue_tasks vot -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the task's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vot.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vot.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vot.project_id = v_filter_project_id)
        AND (v_filter_assignee_id IS NULL OR vot.assignee_id = v_filter_assignee_id);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vot.task_id,
        vot.task_name,
        vot.project_id,
        vot.project_name,
        vot.section_name,
        vot.company_id,
        vot.company_name,
        vot.status,
        vot.priority,
        vot.assignee_id,
        vot.assignee_name,
        vot.due_date,
        vot.days_overdue,
        -- Add other relevant columns from the view here...
        v_total_count -- Include total count in each row
    FROM public.view_overdue_tasks vot -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the task's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vot.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vot.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vot.project_id = v_filter_project_id)
        AND (v_filter_assignee_id IS NULL OR vot.assignee_id = v_filter_assignee_id)
    ORDER BY vot.days_overdue DESC, vot.due_date ASC -- Example default sort order (most overdue first)
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.get_overdue_tasks(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_overdue_tasks(uuid, jsonb, integer, integer) IS 'Retrieves overdue task details from view_overdue_tasks, applying filters (company, project, assignee), RLS checks, and pagination.';
