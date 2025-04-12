-- Migration to create the view_company_training_compliance view

CREATE OR REPLACE VIEW public.view_company_training_compliance AS
WITH course_lessons AS (
    -- Count total lessons per course
    SELECT
        course_id,
        COUNT(id) AS total_lessons
    FROM public.lessons
    GROUP BY course_id
),
user_lesson_completions AS (
    -- Count completed lessons per user per course per company
    SELECT
        lc.user_id,
        l.course_id,
        lc.company_id,
        COUNT(lc.id) AS completed_lessons
    FROM public.lesson_completions lc
    JOIN public.lessons l ON lc.lesson_id = l.id
    GROUP BY lc.user_id, l.course_id, lc.company_id
)
SELECT
    ca.id AS assignment_id,
    ca.user_id,
    up.full_name AS user_name,
    ca.company_id,
    comp.name AS company_name,
    ca.course_id,
    crs.name AS course_name,
    ca.assigned_at,
    ca.due_date,
    cl.total_lessons,
    COALESCE(ulc.completed_lessons, 0) AS completed_lessons,
    CASE
        WHEN cl.total_lessons > 0 THEN
            (COALESCE(ulc.completed_lessons, 0)::float / cl.total_lessons::float) * 100.0
        ELSE
            0 -- Or 100 if no lessons means complete? Defaulting to 0.
    END AS completion_percentage,
    -- Determine overall status
    CASE
        WHEN COALESCE(ulc.completed_lessons, 0) = cl.total_lessons AND cl.total_lessons > 0 THEN 'Completed'
        WHEN ca.due_date IS NOT NULL AND ca.due_date < now() THEN 'Overdue'
        WHEN COALESCE(ulc.completed_lessons, 0) > 0 THEN 'In Progress'
        ELSE 'Not Started'
    END AS assignment_status
FROM
    public.course_assignments ca
JOIN
    public.user_profiles up ON ca.user_id = up.user_id
JOIN
    public.companies comp ON ca.company_id = comp.id
JOIN
    public.courses crs ON ca.course_id = crs.id
LEFT JOIN
    course_lessons cl ON ca.course_id = cl.course_id
LEFT JOIN
    user_lesson_completions ulc ON ca.user_id = ulc.user_id AND ca.course_id = ulc.course_id AND ca.company_id = ulc.company_id;

COMMENT ON VIEW public.view_company_training_compliance IS 'Provides a summary of training compliance per user per course assignment, including completion percentage and status.';
