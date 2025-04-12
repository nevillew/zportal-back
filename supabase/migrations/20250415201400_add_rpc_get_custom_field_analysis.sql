-- Migration to add the get_custom_field_analysis RPC function

CREATE OR REPLACE FUNCTION public.get_custom_field_analysis(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"definition_id": "uuid", "entity_type": "project", "associated_company_id": "uuid"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_custom_field_analysis
    value_id uuid,
    definition_id uuid,
    field_name text,
    field_label text,
    entity_type text,
    field_type text,
    entity_id uuid,
    value jsonb,
    entity_name text,
    associated_company_id uuid,
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
    v_filter_definition_id uuid;
    v_filter_entity_type text;
    v_filter_company_id uuid;
    v_total_count bigint;
BEGIN
    -- RLS Check: Only staff users can access this raw analysis data
    IF NOT is_staff_user(p_user_id) THEN
        RAISE EXCEPTION 'User % does not have permission to access custom field analysis data.', p_user_id;
    END IF;

    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_definition_id := (p_filters->>'definition_id')::uuid;
    v_filter_entity_type := p_filters->>'entity_type';
    v_filter_company_id := (p_filters->>'associated_company_id')::uuid;

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_custom_field_analysis vcfa
    WHERE
        -- Apply optional filters
        (v_filter_definition_id IS NULL OR vcfa.definition_id = v_filter_definition_id)
        AND (v_filter_entity_type IS NULL OR vcfa.entity_type = v_filter_entity_type)
        AND (v_filter_company_id IS NULL OR vcfa.associated_company_id = v_filter_company_id);
        -- Note: Further filtering based on the 'value' JSONB column would require specific JSON operators.

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vcfa.value_id,
        vcfa.definition_id,
        vcfa.field_name,
        vcfa.field_label,
        vcfa.entity_type,
        vcfa.field_type,
        vcfa.entity_id,
        vcfa.value,
        vcfa.entity_name,
        vcfa.associated_company_id,
        vcfa.created_at,
        vcfa.updated_at,
        v_total_count
    FROM public.view_custom_field_analysis vcfa
    WHERE
        -- Apply optional filters
        (v_filter_definition_id IS NULL OR vcfa.definition_id = v_filter_definition_id)
        AND (v_filter_entity_type IS NULL OR vcfa.entity_type = v_filter_entity_type)
        AND (v_filter_company_id IS NULL OR vcfa.associated_company_id = v_filter_company_id)
    ORDER BY vcfa.updated_at DESC -- Example sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_custom_field_analysis(uuid, jsonb, integer, integer) TO authenticated; -- RLS check inside function

COMMENT ON FUNCTION public.get_custom_field_analysis(uuid, jsonb, integer, integer) IS 'Retrieves custom field analysis data from view_custom_field_analysis, applying filters and pagination. Restricted to staff users.';
