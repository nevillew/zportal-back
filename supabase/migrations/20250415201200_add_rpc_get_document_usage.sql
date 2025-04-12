-- Migration to add the get_document_usage RPC function

CREATE OR REPLACE FUNCTION public.get_document_usage(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid", "project_id": "uuid", "document_type": "guide"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_document_usage
    document_id uuid,
    document_name text,
    document_type text,
    project_id uuid,
    project_name text,
    company_id uuid,
    company_name text,
    document_created_at timestamptz,
    document_updated_at timestamptz,
    page_count bigint,
    comment_count bigint,
    last_comment_at timestamptz,
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
    v_filter_document_type text;
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;
    v_filter_project_id := (p_filters->>'project_id')::uuid;
    v_filter_document_type := p_filters->>'document_type';

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_document_usage vdu
    WHERE
        -- Apply RLS check: User must be staff or member of the document's company/project
        (
            is_staff_user(p_user_id) OR
            (vdu.company_id IS NOT NULL AND is_member_of_company(p_user_id, vdu.company_id)) OR
            (vdu.project_id IS NOT NULL AND can_access_project(p_user_id, vdu.project_id)) OR
            (vdu.company_id IS NULL AND vdu.project_id IS NULL) -- Allow access to global docs
        )
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vdu.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vdu.project_id = v_filter_project_id)
        AND (v_filter_document_type IS NULL OR vdu.document_type = v_filter_document_type);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vdu.document_id,
        vdu.document_name,
        vdu.document_type,
        vdu.project_id,
        vdu.project_name,
        vdu.company_id,
        vdu.company_name,
        vdu.document_created_at,
        vdu.document_updated_at,
        vdu.page_count,
        vdu.comment_count,
        vdu.last_comment_at,
        v_total_count
    FROM public.view_document_usage vdu
    WHERE
        -- Apply RLS check
        (
            is_staff_user(p_user_id) OR
            (vdu.company_id IS NOT NULL AND is_member_of_company(p_user_id, vdu.company_id)) OR
            (vdu.project_id IS NOT NULL AND can_access_project(p_user_id, vdu.project_id)) OR
            (vdu.company_id IS NULL AND vdu.project_id IS NULL)
        )
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vdu.company_id = v_filter_company_id)
        AND (v_filter_project_id IS NULL OR vdu.project_id = v_filter_project_id)
        AND (v_filter_document_type IS NULL OR vdu.document_type = v_filter_document_type)
    ORDER BY vdu.document_updated_at DESC -- Example sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_document_usage(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_document_usage(uuid, jsonb, integer, integer) IS 'Retrieves document usage data from view_document_usage, applying filters, RLS checks, and pagination.';
