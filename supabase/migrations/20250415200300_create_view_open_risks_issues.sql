-- Migration to create the view_open_risks_issues view

CREATE OR REPLACE VIEW public.view_open_risks_issues AS
SELECT
    'risk' AS item_type,
    r.id AS item_id,
    r.project_id,
    p.name AS project_name,
    p.company_id,
    c.name AS company_name,
    r.description,
    r.status,
    r.probability AS risk_probability,
    r.impact AS risk_impact,
    NULL AS issue_priority,
    r.assigned_to_user_id,
    up_assignee.full_name AS assigned_to_name,
    r.created_at,
    r.updated_at
FROM
    public.risks r
JOIN
    public.projects p ON r.project_id = p.id
JOIN
    public.companies c ON p.company_id = c.id
LEFT JOIN
    public.user_profiles up_assignee ON r.assigned_to_user_id = up_assignee.user_id
WHERE
    r.status IN ('Potential', 'Open') -- Define which statuses are considered 'open'

UNION ALL

SELECT
    'issue' AS item_type,
    i.id AS item_id,
    i.project_id,
    p.name AS project_name,
    p.company_id,
    c.name AS company_name,
    i.description,
    i.status,
    NULL AS risk_probability,
    NULL AS risk_impact,
    i.priority AS issue_priority,
    i.assigned_to_user_id,
    up_assignee.full_name AS assigned_to_name,
    i.created_at,
    i.updated_at
FROM
    public.issues i
JOIN
    public.projects p ON i.project_id = p.id
JOIN
    public.companies c ON p.company_id = c.id
LEFT JOIN
    public.user_profiles up_assignee ON i.assigned_to_user_id = up_assignee.user_id
WHERE
    i.status IN ('Open', 'Investigating'); -- Define which statuses are considered 'open'

COMMENT ON VIEW public.view_open_risks_issues IS 'Provides a combined list of open risks and issues across projects.';
