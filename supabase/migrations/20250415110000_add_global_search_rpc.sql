-- Migration to add the global_search RPC function

CREATE OR REPLACE FUNCTION public.global_search(
    p_user_id uuid, -- The user performing the search (for RLS checks)
    p_query text, -- The search query string
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"entity_type": "task", "company_id": "uuid"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    entity_type text,
    entity_id uuid,
    company_id uuid,
    title text,
    description text,
    rank real, -- Relevance score
    total_count bigint -- Total number of matching results (for pagination)
)
LANGUAGE plpgsql
STABLE -- Function does not modify the database
SECURITY DEFINER -- Allows checking permissions using helper functions
SET search_path = public, extensions -- Ensure helper functions are found
AS $$
DECLARE
    v_query tsquery;
    v_offset integer;
    v_filter_entity_type text;
    v_filter_company_id uuid;
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Convert the user's search query into a tsquery
    -- Use websearch_to_tsquery for more flexible parsing (handles operators like OR, -, quotes)
    v_query := websearch_to_tsquery('english', p_query);

    -- Extract filters from JSONB
    v_filter_entity_type := p_filters->>'entity_type';
    v_filter_company_id := (p_filters->>'company_id')::uuid; -- Cast to UUID, will be NULL if not present or invalid

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.search_index si
    WHERE
        -- Apply FTS query
        si.search_vector @@ v_query
        -- Apply RLS check: User must be staff or member of the result's company
        AND (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, si.company_id))
        -- Apply optional entity_type filter
        AND (v_filter_entity_type IS NULL OR si.entity_type = v_filter_entity_type)
        -- Apply optional company_id filter
        AND (v_filter_company_id IS NULL OR si.company_id = v_filter_company_id);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        si.entity_type,
        si.entity_id,
        si.company_id,
        si.title,
        si.description,
        ts_rank_cd(si.search_vector, v_query)::real as rank,
        v_total_count -- Include total count in each row
    FROM public.search_index si
    WHERE
        -- Apply FTS query
        si.search_vector @@ v_query
        -- Apply RLS check: User must be staff or member of the result's company
        AND (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, si.company_id))
        -- Apply optional entity_type filter
        AND (v_filter_entity_type IS NULL OR si.entity_type = v_filter_entity_type)
        -- Apply optional company_id filter
        AND (v_filter_company_id IS NULL OR si.company_id = v_filter_company_id)
    ORDER BY rank DESC, si.updated_at DESC -- Order by relevance, then by update date
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.global_search(uuid, text, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.global_search(uuid, text, jsonb, integer, integer) IS 'Performs a full-text search across indexed entities (projects, tasks, etc.), applying filters, RLS checks, and pagination.';
