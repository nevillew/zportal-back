-- Migration to add the get_effort_variance RPC function

-- Assumes a view named 'view_effort_variance' exists with columns like:
-- project_id, project_name, company_id, company_name, task_id, task_name,
-- estimated_effort_hours, actual_hours_logged, variance_hours, variance_percentage, etc.

CREATE OR REPLACE FUNCTION public.get_effort_variance(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid", "project_id": "uuid"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_effort_variance that should be returned
    project_id uuid,
    project_name text,
    company_id uuid,
    company_name text,
    task_id uuid,
    task_name text,
    estimated_effort_hours numeric,
    actual_hours_logged numeric,
    variance_hours numeric,
    variance_percentage numeric,
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
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;
    v_filter_project_id := (p_filters->>'project_id')::uuid;

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_effort_variance vev -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the entry's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vev.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vev.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vev.project_id = v_filter_project_id);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vev.project_id,
        vev.project_name,
        vev.company_id,
        vev.company_name,
        vev.task_id,
        vev.task_name,
        vev.estimated_effort_hours,
        vev.actual_hours_logged,
        vev.variance_hours,
        vev.variance_percentage,
        -- Add other relevant columns from the view here...
        v_total_count -- Include total count in each row
    FROM public.view_effort_variance vev -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the entry's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vev.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vev.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vev.project_id = v_filter_project_id)
    ORDER BY vev.project_name ASC, vev.task_name ASC -- Example default sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.get_effort_variance(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_effort_variance(uuid, jsonb, integer, integer) IS 'Retrieves task effort variance data from view_effort_variance, applying filters, RLS checks, and pagination.';
