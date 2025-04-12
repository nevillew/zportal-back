-- Migration to create the view_task_details view

CREATE OR REPLACE VIEW public.view_task_details AS
SELECT
    t.id AS task_id,
    t.name AS task_name,
    t.description,
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
    t.estimated_effort_hours AS estimated_hours, -- Alias to match RPC expectation
    t.actual_hours,
    t.milestone_id,
    m.name AS milestone_name,
    t.depends_on_task_id,
    dep.name AS depends_on_task_name,
    t.parent_task_id,
    parent.name AS parent_task_name,
    t.is_recurring_definition,
    t.next_occurrence_date,
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
LEFT JOIN
    milestones m ON t.milestone_id = m.id
LEFT JOIN
    tasks dep ON t.depends_on_task_id = dep.id
LEFT JOIN
    tasks parent ON t.parent_task_id = parent.id;

COMMENT ON VIEW public.view_task_details IS 'Provides detailed information about tasks, including related project, section, company, assignee, milestone, and dependency names.';
