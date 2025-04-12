-- Migration to create the view_staff_workload view

CREATE OR REPLACE VIEW public.view_staff_workload AS
SELECT
    up.user_id AS staff_user_id,
    up.full_name AS staff_name,
    COUNT(t.id) AS assigned_tasks_count,
    SUM(t.estimated_effort_hours) AS estimated_hours_total,
    COUNT(t.id) FILTER (WHERE t.status = 'Complete') AS completed_tasks_count,
    COUNT(t.id) FILTER (WHERE t.status != 'Complete' AND t.due_date IS NOT NULL AND t.due_date < now()) AS overdue_tasks_count
FROM
    user_profiles up
LEFT JOIN
    tasks t ON up.user_id = t.assigned_to_id AND t.status != 'Complete' -- Consider only active assignments for workload
WHERE
    up.is_staff = true AND up.is_active = true
GROUP BY
    up.user_id, up.full_name;

COMMENT ON VIEW public.view_staff_workload IS 'Summarizes workload for active staff members, including counts of assigned, completed, and overdue tasks, and total estimated hours for assigned tasks.';
