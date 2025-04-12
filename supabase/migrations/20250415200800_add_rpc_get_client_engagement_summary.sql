-- Migration to add the get_client_engagement_summary RPC function

CREATE OR REPLACE FUNCTION public.get_client_engagement_summary(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_client_engagement_summary
    company_id uuid,
    company_name text,
    total_projects bigint,
    active_projects bigint,
    total_client_comments bigint,
    last_client_activity timestamptz,
    avg_training_completion float,
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
    v_total_count bigint;
BEGIN
    -- RLS Check: Only staff users can access this summary data
    IF NOT is_staff_user(p_user_id) THEN
        RAISE EXCEPTION 'User % does not have permission to access client engagement summary.', p_user_id;
    END IF;

    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_client_engagement_summary vces
    WHERE
        -- Apply optional filters
        (v_filter_company_id IS NULL OR vces.company_id = v_filter_company_id);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vces.company_id,
        vces.company_name,
        vces.total_projects,
        vces.active_projects,
        vces.total_client_comments,
        vces.last_client_activity,
        vces.avg_training_completion,
        v_total_count
    FROM public.view_client_engagement_summary vces
    WHERE
        -- Apply optional filters
        (v_filter_company_id IS NULL OR vces.company_id = v_filter_company_id)
    ORDER BY vces.company_name ASC -- Example sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_client_engagement_summary(uuid, jsonb, integer, integer) TO authenticated; -- RLS check inside function

COMMENT ON FUNCTION public.get_client_engagement_summary(uuid, jsonb, integer, integer) IS 'Retrieves client engagement summary data from view_client_engagement_summary, applying filters and pagination. Restricted to staff users.';
