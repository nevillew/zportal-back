-- Migration to add the get_open_risks_issues RPC function

CREATE OR REPLACE FUNCTION public.get_open_risks_issues(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid", "project_id": "uuid", "item_type": "risk"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_open_risks_issues
    item_type text,
    item_id uuid,
    project_id uuid,
    project_name text,
    company_id uuid,
    company_name text,
    description text,
    status text,
    risk_probability text,
    risk_impact text,
    issue_priority text,
    assigned_to_user_id uuid,
    assigned_to_name text,
    created_at timestamptz,
    updated_at timestamptz,
    total_count bigint -- Total number of matching results (for pagination)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_offset integer;
    v_filter_company_id uuid;
    v_filter_project_id uuid;
    v_filter_item_type text;
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;
    v_filter_project_id := (p_filters->>'project_id')::uuid;
    v_filter_item_type := p_filters->>'item_type';

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_open_risks_issues vori
    WHERE
        -- Apply RLS check: User must be staff or member of the item's company
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vori.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vori.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vori.project_id = v_filter_project_id)
        AND (v_filter_item_type IS NULL OR vori.item_type = v_filter_item_type);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vori.item_type,
        vori.item_id,
        vori.project_id,
        vori.project_name,
        vori.company_id,
        vori.company_name,
        vori.description,
        vori.status,
        vori.risk_probability,
        vori.risk_impact,
        vori.issue_priority,
        vori.assigned_to_user_id,
        vori.assigned_to_name,
        vori.created_at,
        vori.updated_at,
        v_total_count
    FROM public.view_open_risks_issues vori
    WHERE
        -- Apply RLS check
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vori.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vori.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vori.project_id = v_filter_project_id)
        AND (v_filter_item_type IS NULL OR vori.item_type = v_filter_item_type)
    ORDER BY vori.updated_at DESC -- Example sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_open_risks_issues(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_open_risks_issues(uuid, jsonb, integer, integer) IS 'Retrieves open risks and issues from view_open_risks_issues, applying filters, RLS checks, and pagination.';
