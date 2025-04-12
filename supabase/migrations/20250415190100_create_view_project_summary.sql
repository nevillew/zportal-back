-- Migration to create the view_project_summary view

CREATE OR REPLACE VIEW public.view_project_summary AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.company_id,
    c.name AS company_name,
    p.status,
    p.stage,
    p.health_status,
    p.project_owner_id,
    po.full_name AS project_owner_name,
    (SELECT COUNT(*) FROM tasks t JOIN sections s ON t.section_id = s.id WHERE s.project_id = p.id) AS task_count,
    (SELECT COUNT(*) FROM tasks t JOIN sections s ON t.section_id = s.id WHERE s.project_id = p.id AND t.status = 'Complete') AS completed_task_count,
    (SELECT COUNT(*) FROM tasks t JOIN sections s ON t.section_id = s.id WHERE s.project_id = p.id AND t.status != 'Complete' AND t.due_date IS NOT NULL AND t.due_date < now()) AS overdue_task_count,
    p.created_at,
    p.updated_at
FROM
    projects p
JOIN
    companies c ON p.company_id = c.id
LEFT JOIN
    user_profiles po ON p.project_owner_id = po.user_id;

COMMENT ON VIEW public.view_project_summary IS 'Provides a summary of projects including company name, owner name, and task counts (total, completed, overdue).';
