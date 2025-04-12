-- Migration to create the view_onboarding_cycle_time view

CREATE OR REPLACE VIEW public.view_onboarding_cycle_time AS
WITH project_stage_times AS (
    -- Find the first time a project entered key stages (approximated by first task completion in that stage's sections)
    -- This is complex and approximate; a dedicated project_history table would be better.
    SELECT
        p.id AS project_id,
        p.company_id,
        p.created_at AS project_start_time,
        MIN(t.updated_at) FILTER (WHERE s.type = 'BUILD' AND t.status = 'Complete') AS first_build_complete_time,
        MIN(t.updated_at) FILTER (WHERE s.type = 'UAT' AND t.status = 'Complete') AS first_uat_complete_time,
        MAX(t.updated_at) FILTER (WHERE t.status = 'Complete') AS last_task_complete_time,
        p.updated_at AS project_updated_at,
        p.status AS project_status
    FROM public.projects p
    LEFT JOIN public.sections s ON p.id = s.project_id
    LEFT JOIN public.tasks t ON s.id = t.section_id
    GROUP BY p.id, p.company_id, p.created_at, p.updated_at, p.status
)
SELECT
    pst.project_id,
    p.name AS project_name,
    pst.company_id,
    c.name AS company_name,
    pst.project_start_time,
    pst.last_task_complete_time,
    CASE
        WHEN pst.project_status = 'Completed' THEN pst.project_updated_at -- Use project update time if marked completed
        ELSE pst.last_task_complete_time -- Otherwise use last task completion
    END AS project_completion_time,
    -- Calculate cycle times in seconds (can be formatted later)
    EXTRACT(EPOCH FROM (
        CASE
            WHEN pst.project_status = 'Completed' THEN pst.project_updated_at
            ELSE pst.last_task_complete_time
        END - pst.project_start_time
    )) AS total_cycle_seconds,
    EXTRACT(EPOCH FROM (pst.first_build_complete_time - pst.project_start_time)) AS time_to_build_complete_seconds,
    EXTRACT(EPOCH FROM (pst.first_uat_complete_time - pst.first_build_complete_time)) AS time_build_to_uat_seconds,
    EXTRACT(EPOCH FROM (
        CASE
            WHEN pst.project_status = 'Completed' THEN pst.project_updated_at
            ELSE pst.last_task_complete_time
        END - pst.first_uat_complete_time
    )) AS time_uat_to_completion_seconds
FROM
    project_stage_times pst
JOIN
    public.projects p ON pst.project_id = p.id
JOIN
    public.companies c ON pst.company_id = c.id;

COMMENT ON VIEW public.view_onboarding_cycle_time IS 'Calculates approximate cycle times for different phases of the onboarding process based on project and task timestamps.';
