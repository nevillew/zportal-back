-- Migration to create the view_overdue_tasks view

CREATE OR REPLACE VIEW public.view_overdue_tasks AS
SELECT
    t.id AS task_id,
    t.name AS task_name,
    t.section_id,
    s.name AS section_name,
    s.project_id,
    p.name AS project_name,
    p.company_id,
    c.name AS company_name,
    t.status,
    t.priority,
    t.assigned_to_id,
    a.full_name AS assignee_name,
    t.due_date,
    -- Calculate days overdue (integer division truncates)
    CASE
        WHEN t.due_date IS NOT NULL AND t.due_date < now() THEN
            EXTRACT(DAY FROM (now() - t.due_date))::integer
        ELSE
            0
    END AS days_overdue,
    t.created_at,
    t.updated_at
FROM
    tasks t
JOIN
    sections s ON t.section_id = s.id
JOIN
    projects p ON s.project_id = p.id
JOIN
    companies c ON p.company_id = c.id
LEFT JOIN
    user_profiles a ON t.assigned_to_id = a.user_id
WHERE
    t.status != 'Complete' AND t.due_date IS NOT NULL AND t.due_date < now();

COMMENT ON VIEW public.view_overdue_tasks IS 'Lists tasks that are not complete and whose due date is in the past, including calculated days overdue.';
