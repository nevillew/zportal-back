-- Migration to create the view_template_performance view

CREATE OR REPLACE VIEW public.view_template_performance AS
WITH project_durations AS (
    -- Calculate duration for completed projects linked to a template version
    SELECT
        p.project_template_version_id,
        p.id AS project_id,
        p.updated_at - p.created_at AS duration -- Simple duration, could be refined
    FROM public.projects p
    WHERE p.status = 'Completed' AND p.project_template_version_id IS NOT NULL
),
template_task_counts AS (
    -- Count tasks per template version (approximated by counting tasks in projects using the template)
    SELECT
        p.project_template_version_id,
        COUNT(t.id) AS total_tasks
    FROM public.tasks t
    JOIN public.sections s ON t.section_id = s.id
    JOIN public.projects p ON s.project_id = p.id
    WHERE p.project_template_version_id IS NOT NULL
    GROUP BY p.project_template_version_id
)
SELECT
    ptv.id AS template_version_id,
    ptv.name AS template_version_name,
    pt.id AS template_id,
    pt.name AS template_name,
    COUNT(DISTINCT pd.project_id) AS projects_completed_count,
    AVG(EXTRACT(EPOCH FROM pd.duration)) AS avg_completion_seconds, -- Average duration in seconds
    MAX(EXTRACT(EPOCH FROM pd.duration)) AS max_completion_seconds,
    MIN(EXTRACT(EPOCH FROM pd.duration)) AS min_completion_seconds,
    COALESCE(ttc.total_tasks / COUNT(DISTINCT pd.project_id), 0) AS avg_tasks_per_project -- Approximate average
FROM
    public.project_template_versions ptv
JOIN
    public.project_templates pt ON ptv.project_template_id = pt.id
LEFT JOIN
    project_durations pd ON ptv.id = pd.project_template_version_id
LEFT JOIN
    template_task_counts ttc ON ptv.id = ttc.project_template_version_id
GROUP BY
    ptv.id, ptv.name, pt.id, pt.name, ttc.total_tasks;

COMMENT ON VIEW public.view_template_performance IS 'Provides performance metrics for project template versions, such as average completion time and task counts.';
