-- Migration to add the get_time_tracking_summary RPC function

-- Assumes a view named 'view_time_tracking_summary' exists with columns like:
-- user_id, user_name, company_id, company_name, project_id, project_name, task_id, task_name,
-- date_worked, total_hours_logged, etc.

CREATE OR REPLACE FUNCTION public.get_time_tracking_summary(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid", "project_id": "uuid", "user_id": "uuid", "date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_time_tracking_summary that should be returned
    user_id uuid,
    user_name text,
    company_id uuid,
    company_name text,
    project_id uuid,
    project_name text,
    task_id uuid,
    task_name text,
    date_worked date,
    total_hours_logged numeric,
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
    v_filter_user_id uuid;
    v_filter_date_from date;
    v_filter_date_to date;
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;
    v_filter_project_id := (p_filters->>'project_id')::uuid;
    v_filter_user_id := (p_filters->>'user_id')::uuid;
    v_filter_date_from := (p_filters->>'date_from')::date;
    v_filter_date_to := (p_filters->>'date_to')::date;

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_time_tracking_summary vtts -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the entry's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vtts.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vtts.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vtts.project_id = v_filter_project_id)
        AND (v_filter_user_id IS NULL OR vtts.user_id = v_filter_user_id)
        AND (v_filter_date_from IS NULL OR vtts.date_worked >= v_filter_date_from)
        AND (v_filter_date_to IS NULL OR vtts.date_worked <= v_filter_date_to);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vtts.user_id,
        vtts.user_name,
        vtts.company_id,
        vtts.company_name,
        vtts.project_id,
        vtts.project_name,
        vtts.task_id,
        vtts.task_name,
        vtts.date_worked,
        vtts.total_hours_logged,
        -- Add other relevant columns from the view here...
        v_total_count -- Include total count in each row
    FROM public.view_time_tracking_summary vtts -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the entry's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vtts.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vtts.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vtts.project_id = v_filter_project_id)
        AND (v_filter_user_id IS NULL OR vtts.user_id = v_filter_user_id)
        AND (v_filter_date_from IS NULL OR vtts.date_worked >= v_filter_date_from)
        AND (v_filter_date_to IS NULL OR vtts.date_worked <= v_filter_date_to)
    ORDER BY vtts.date_worked DESC, vtts.user_name ASC -- Example default sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.get_time_tracking_summary(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_time_tracking_summary(uuid, jsonb, integer, integer) IS 'Retrieves time tracking summary data from view_time_tracking_summary, applying filters, RLS checks, and pagination.';
