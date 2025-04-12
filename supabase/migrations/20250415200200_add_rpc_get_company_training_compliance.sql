-- Migration to add the get_company_training_compliance RPC function

CREATE OR REPLACE FUNCTION public.get_company_training_compliance(
    p_user_id uuid, -- The user performing the query (for RLS checks)
    p_filters jsonb DEFAULT '{}'::jsonb, -- Optional filters (e.g., {"company_id": "uuid", "user_id": "uuid", "course_id": "uuid", "assignment_status": "Overdue"})
    p_page integer DEFAULT 1, -- Page number (1-based)
    p_page_size integer DEFAULT 20 -- Number of results per page
)
RETURNS TABLE (
    -- Mirror columns from view_company_training_compliance
    assignment_id uuid,
    user_id uuid,
    user_name text,
    company_id uuid,
    company_name text,
    course_id uuid,
    course_name text,
    assigned_at timestamptz,
    due_date timestamptz,
    total_lessons bigint,
    completed_lessons bigint,
    completion_percentage float,
    assignment_status text,
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
    v_filter_user_id uuid;
    v_filter_course_id uuid;
    v_filter_assignment_status text;
    v_total_count bigint;
BEGIN
    -- Validate inputs
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size <= 0 THEN p_page_size := 20; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Extract filters from JSONB
    v_filter_company_id := (p_filters->>'company_id')::uuid;
    v_filter_user_id := (p_filters->>'user_id')::uuid;
    v_filter_course_id := (p_filters->>'course_id')::uuid;
    v_filter_assignment_status := p_filters->>'assignment_status';

    -- Calculate total count matching the criteria (before pagination)
    SELECT count(*)
    INTO v_total_count
    FROM public.view_company_training_compliance vctc
    WHERE
        -- Apply RLS check: User must be staff or member of the company being viewed
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vctc.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vctc.company_id = v_filter_company_id)
        AND (v_filter_user_id IS NULL OR vctc.user_id = v_filter_user_id)
        AND (v_filter_course_id IS NULL OR vctc.course_id = v_filter_course_id)
        AND (v_filter_assignment_status IS NULL OR vctc.assignment_status = v_filter_assignment_status);

    -- Return the paginated results
    RETURN QUERY
    SELECT
        vctc.assignment_id,
        vctc.user_id,
        vctc.user_name,
        vctc.company_id,
        vctc.company_name,
        vctc.course_id,
        vctc.course_name,
        vctc.assigned_at,
        vctc.due_date,
        vctc.total_lessons,
        vctc.completed_lessons,
        vctc.completion_percentage,
        vctc.assignment_status,
        v_total_count
    FROM public.view_company_training_compliance vctc
    WHERE
        -- Apply RLS check
        (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, vctc.company_id))
        -- Apply optional filters
        AND (v_filter_company_id IS NULL OR vctc.company_id = v_filter_company_id)
        AND (v_filter_user_id IS NULL OR vctc.user_id = v_filter_user_id)
        AND (v_filter_course_id IS NULL OR vctc.course_id = v_filter_course_id)
        AND (v_filter_assignment_status IS NULL OR vctc.assignment_status = v_filter_assignment_status)
    ORDER BY vctc.company_name ASC, vctc.user_name ASC, vctc.course_name ASC -- Example sort order
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_company_training_compliance(uuid, jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_company_training_compliance(uuid, jsonb, integer, integer) IS 'Retrieves training compliance data from view_company_training_compliance, applying filters, RLS checks, and pagination.';
