-- Migration to create the view_milestone_status view

CREATE OR REPLACE VIEW public.view_milestone_status AS
SELECT
    m.id AS milestone_id,
    m.name AS milestone_name,
    m.project_id,
    p.name AS project_name,
    p.company_id,
    c.name AS company_name,
    m.status,
    m.due_date,
    m.sign_off_required,
    m.signed_off_by_user_id,
    so.full_name AS signed_off_by_name,
    m.signed_off_at,
    m.order,
    m.created_at,
    m.updated_at
FROM
    milestones m
JOIN
    projects p ON m.project_id = p.id
JOIN
    companies c ON p.company_id = c.id
LEFT JOIN
    user_profiles so ON m.signed_off_by_user_id = so.user_id;

COMMENT ON VIEW public.view_milestone_status IS 'Provides details about milestones, including project/company context and sign-off information.';
