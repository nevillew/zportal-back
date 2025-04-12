-- Migration to add the get_onboarding_cycle_time RPC function

CREATE OR REPLACE FUNCTION public.get_onboarding_cycle_time(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_onboarding_cycle_time
    project_id uuid,
    project_name text,
    company_id uuid,
    company_name text,
    project_start_time timestamptz,
    last_task_complete_time timestamptz,
    project_completion_time timestamptz,
    total_cycle_seconds double precision,
    time_to_build_complete_seconds double precision,
    time_build_to_uat_seconds double precision,
    time_uat_to_completion_seconds double precision,
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
    -- RLS Check: Only staff users can access this data
    IF NOT is_staff_user(p_user_id) THEN
        RAISE EXCEPTION 'User % does not have permission to access onboarding cycle time data.', p_user_id;
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
    FROM public.view_onboarding_cycle_time voct
    WHERE
        -- Apply optional filters
        (v_filter_company_id IS NULL OR voct.company_id = v_filter_company_id);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        voct.project_id,
        voct.project_name,
        voct.company_id,
        voct.company_name,
        voct.project_start_time,
        voct.last_task_complete_time,
        voct.project_completion_time,
        voct.total_cycle_seconds,
        voct.time_to_build_complete_seconds,
        voct.time_build_to_uat_seconds,
        voct.time_uat_to_completion_seconds,
        v_total_count
    FROM public.view_onboarding_cycle_time voct
    WHERE
        -- Apply optional filters
        (v_filter_company_id IS NULL OR voct.company_id = v_filter_company_id)
    ORDER BY voct.project_start_time DESC -- Example sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_onboarding_cycle_time(uuid, jsonb, integer, integer) TO authenticated; -- RLS check inside function

COMMENT ON FUNCTION public.get_onboarding_cycle_time(uuid, jsonb, integer, integer) IS 'Retrieves onboarding cycle time data from view_onboarding_cycle_time, applying filters and pagination. Restricted to staff users.';
