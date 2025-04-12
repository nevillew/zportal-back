-- Migration to add the get_milestone_status RPC function

-- Assumes a view named 'view_milestone_status' exists with columns like:
-- milestone_id, milestone_name, project_id, project_name, company_id, company_name,
-- status, due_date, sign_off_required, signed_off_by_name, signed_off_at, etc.

CREATE OR REPLACE FUNCTION public.get_milestone_status(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid", "project_id": "uuid", "status": "Pending"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_milestone_status that should be returned
    milestone_id uuid,
    milestone_name text,
    project_id uuid,
    project_name text,
    company_id uuid,
    company_name text,
    status text,
    due_date timestamptz,
    sign_off_required boolean,
    signed_off_by_name text,
    signed_off_at timestamptz,
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
    v_filter_status text;
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;
    v_filter_project_id := (p_filters->>'project_id')::uuid;
    v_filter_status := p_filters->>'status';

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_milestone_status vms -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the entry's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vms.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vms.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vms.project_id = v_filter_project_id)
        AND (v_filter_status IS NULL OR vms.status = v_filter_status);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vms.milestone_id,
        vms.milestone_name,
        vms.project_id,
        vms.project_name,
        vms.company_id,
        vms.company_name,
        vms.status,
        vms.due_date,
        vms.sign_off_required,
        vms.signed_off_by_name,
        vms.signed_off_at,
        -- Add other relevant columns from the view here...
        v_total_count -- Include total count in each row
    FROM public.view_milestone_status vms -- Query the view
    WHERE
        -- Apply RLS check: User must be staff or member of the entry's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vms.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vms.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vms.project_id = v_filter_project_id)
        AND (v_filter_status IS NULL OR vms.status = v_filter_status)
    ORDER BY vms.project_name ASC, vms.due_date ASC, vms.milestone_name ASC -- Example default sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.get_milestone_status(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_milestone_status(uuid, jsonb, integer, integer) IS 'Retrieves milestone status data from view_milestone_status, applying filters, RLS checks, and pagination.';
