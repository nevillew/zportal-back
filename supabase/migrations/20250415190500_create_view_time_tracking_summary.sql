-- Migration to create the view_time_tracking_summary view
-- Assumes a 'time_entries' table exists with columns: id, task_id, user_id, start_time, end_time, duration_hours, date_worked

CREATE OR REPLACE VIEW public.view_time_tracking_summary AS
SELECT
    te.id AS time_entry_id,
    te.user_id,
    up.full_name AS user_name,
    p.company_id,
    c.name AS company_name,
    s.project_id,
    p.name AS project_name,
    te.task_id,
    t.name AS task_name,
    te.date_worked,
    te.duration_hours AS total_hours_logged, -- Assuming duration_hours stores the logged time
    te.notes,
    te.created_at
FROM
    time_entries te -- Replace with your actual time entries table name if different
JOIN
    user_profiles up ON te.user_id = up.user_id
JOIN
    tasks t ON te.task_id = t.id
JOIN
    sections s ON t.section_id = s.id
JOIN
    projects p ON s.project_id = p.id
JOIN
    companies c ON p.company_id = c.id;

COMMENT ON VIEW public.view_time_tracking_summary IS 'Provides a summary of time entries, linking them to users, tasks, projects, and companies.';
