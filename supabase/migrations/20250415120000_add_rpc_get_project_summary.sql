-- Migration to add the get_project_summary RPC function

-- Assumes a view named 'view_project_summary' exists with columns like:
-- project_id, project_name, company_id, company_name, status, stage, health_status,
-- project_owner_name, task_count, completed_task_count, overdue_task_count, etc.

CREATE OR REPLACE FUNCTION public.get_project_summary(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid", "status": "Active"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_project_summary that should be returned
    project_id uuid,
    project_name text,
    company_id uuid,
    company_name text,
    status text,
    stage text,
    health_status text,
    project_owner_name text,
    task_count bigint,
    completed_task_count bigint,
    overdue_task_count bigint,
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
    v_filter_status text;
    v_filter_stage text;
    v_filter_health text;
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;
    v_filter_status := p_filters->>'status';
    v_filter_stage := p_filters->>'stage';
    v_filter_health := p_filters->>'health_status';

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_project_summary vps -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the project's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vps.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vps.company_id = v_filter_company_id)
        AND (v_filter_status IS NULL OR vps.status = v_filter_status)
        AND (v_filter_stage IS NULL OR vps.stage = v_filter_stage)
        AND (v_filter_health IS NULL OR vps.health_status = v_filter_health);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vps.project_id,
        vps.project_name,
        vps.company_id,
        vps.company_name,
        vps.status,
        vps.stage,
        vps.health_status,
        vps.project_owner_name,
        vps.task_count,
        vps.completed_task_count,
        vps.overdue_task_count,
        -- Add other relevant columns from the view here...
        v_total_count -- Include total count in each row
    FROM public.view_project_summary vps -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the project's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vps.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vps.company_id = v_filter_company_id)
        AND (v_filter_status IS NULL OR vps.status = v_filter_status)
        AND (v_filter_stage IS NULL OR vps.stage = v_filter_stage)
        AND (v_filter_health IS NULL OR vps.health_status = v_filter_health)
    ORDER BY vps.project_name ASC -- Example default sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.get_project_summary(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_project_summary(uuid, jsonb, integer, integer) IS 'Retrieves project summary data from view_project_summary, applying filters, RLS checks, and pagination.';
