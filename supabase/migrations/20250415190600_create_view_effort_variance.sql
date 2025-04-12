-- Migration to create the view_effort_variance view

CREATE OR REPLACE VIEW public.view_effort_variance AS
SELECT
    t.id AS task_id,
    t.name AS task_name,
    s.project_id,
    p.name AS project_name,
    p.company_id,
    c.name AS company_name,
    t.estimated_effort_hours AS estimated_effort_hours,
    t.actual_hours AS actual_hours_logged,
    (t.actual_hours - t.estimated_effort_hours) AS variance_hours,
    CASE
        WHEN t.estimated_effort_hours IS NOT NULL AND t.estimated_effort_hours > 0 THEN
            ((t.actual_hours - t.estimated_effort_hours) / t.estimated_effort_hours) * 100.0
        ELSE
            NULL -- Or 0, or some indicator for undefined variance
    END AS variance_percentage,
    t.status,
    t.updated_at
FROM
    tasks t
JOIN
    sections s ON t.section_id = s.id
JOIN
    projects p ON s.project_id = p.id
JOIN
    companies c ON p.company_id = c.id
WHERE
    t.estimated_effort_hours IS NOT NULL OR t.actual_hours IS NOT NULL; -- Only include tasks with some effort data

COMMENT ON VIEW public.view_effort_variance IS 'Calculates the variance between estimated effort and actual logged hours for tasks.';
