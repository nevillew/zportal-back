-- Migration to create the view_client_engagement_summary view

CREATE OR REPLACE VIEW public.view_client_engagement_summary AS
WITH client_comments AS (
    -- Count non-internal comments made by client users per project
    SELECT
        p.id AS project_id,
        p.company_id,
        COUNT(tc.id) AS client_comment_count
    FROM public.task_comments tc
    JOIN public.tasks t ON tc.task_id = t.id
    JOIN public.sections s ON t.section_id = s.id
    JOIN public.projects p ON s.project_id = p.id
    JOIN public.user_profiles up ON tc.user_id = up.user_id
    WHERE tc.is_internal = false AND up.is_staff = false
    GROUP BY p.id, p.company_id
),
client_logins AS (
    -- Get last login time for client users per company (approximated via last profile update for simplicity)
    -- A dedicated login tracking table would be better.
    SELECT
        cu.company_id,
        MAX(up.updated_at) AS last_client_activity -- Using updated_at as proxy
    FROM public.company_users cu
    JOIN public.user_profiles up ON cu.user_id = up.user_id
    WHERE up.is_staff = false AND up.is_active = true
    GROUP BY cu.company_id
),
client_training AS (
    -- Average training completion for client users per company
    SELECT
        company_id,
        AVG(completion_percentage) AS avg_training_completion
    FROM public.view_company_training_compliance
    WHERE user_id IN (SELECT user_id FROM public.user_profiles WHERE is_staff = false)
    GROUP BY company_id
)
SELECT
    c.id AS company_id,
    c.name AS company_name,
    COUNT(DISTINCT p.id) AS total_projects,
    COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'Active') AS active_projects,
    COALESCE(SUM(cc.client_comment_count), 0) AS total_client_comments,
    cl.last_client_activity,
    ct.avg_training_completion
FROM
    public.companies c
LEFT JOIN
    public.projects p ON c.id = p.company_id
LEFT JOIN
    client_comments cc ON c.id = cc.company_id AND p.id = cc.project_id
LEFT JOIN
    client_logins cl ON c.id = cl.company_id
LEFT JOIN
    client_training ct ON c.id = ct.company_id
GROUP BY
    c.id, c.name, cl.last_client_activity, ct.avg_training_completion;

COMMENT ON VIEW public.view_client_engagement_summary IS 'Provides a summary of client engagement metrics per company, including project counts, comments, last activity, and training completion.';
