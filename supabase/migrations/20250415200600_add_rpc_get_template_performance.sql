-- Migration to add the get_template_performance RPC function

CREATE OR REPLACE FUNCTION public.get_template_performance(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"template_id": "uuid"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_template_performance
    template_version_id uuid,
    template_version_name text,
    template_id uuid,
    template_name text,
    projects_completed_count bigint,
    avg_completion_seconds double precision,
    max_completion_seconds double precision,
    min_completion_seconds double precision,
    avg_tasks_per_project numeric,
    total_count bigint -- Total number of matching results (for pagination)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_offset integer;
    v_filter_template_id uuid;
    v_total_count bigint;
BEGIN
    -- RLS Check: Only staff users can access this data
    IF NOT is_staff_user(p_user_id) THEN
        RAISE EXCEPTION 'User % does not have permission to access template performance data.', p_user_id;
    END IF;

    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_template_id := (p_filters->>'template_id')::uuid;

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_template_performance vtp
    WHERE
        -- Apply optional filters
        (v_filter_template_id IS NULL OR vtp.template_id = v_filter_template_id);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vtp.template_version_id,
        vtp.template_version_name,
        vtp.template_id,
        vtp.template_name,
        vtp.projects_completed_count,
        vtp.avg_completion_seconds,
        vtp.max_completion_seconds,
        vtp.min_completion_seconds,
        vtp.avg_tasks_per_project,
        v_total_count
    FROM public.view_template_performance vtp
    WHERE
        -- Apply optional filters
        (v_filter_template_id IS NULL OR vtp.template_id = v_filter_template_id)
    ORDER BY vtp.template_name ASC, vtp.template_version_name DESC -- Example sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_template_performance(uuid, jsonb, integer, integer) TO authenticated; -- RLS check inside function

COMMENT ON FUNCTION public.get_template_performance(uuid, jsonb, integer, integer) IS 'Retrieves template performance data from view_template_performance, applying filters and pagination. Restricted to staff users.';
