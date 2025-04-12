-- Migration to schedule materialized view refreshes using pg_cron

-- NOTE: As of 2025-04-16, no materialized views have been explicitly created.
-- This migration adds placeholder schedules for the standard views created earlier,
-- assuming they *might* be converted to materialized views later.
-- If they remain standard views, these cron jobs will fail but are harmless.
-- If they are converted, these schedules will refresh them. Adjust schedules as needed.

-- Example: Refresh project summary view hourly
-- Assumes a UNIQUE INDEX exists on the view for CONCURRENTLY refresh.
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_view_project_summary_pk ON public.view_project_summary(project_id);
-- SELECT cron.schedule('refresh-project-summary', '0 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_project_summary');

-- Example: Refresh task details view every 2 hours
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_view_task_details_pk ON public.view_task_details(task_id);
-- SELECT cron.schedule('refresh-task-details', '0 */2 * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_task_details');

-- Add schedules for other views created in migrations 20250415190100 through 20250415201300
-- Adjust frequency based on data volatility and performance impact.

-- SELECT cron.schedule('refresh-overdue-tasks', '15 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_overdue_tasks');
-- SELECT cron.schedule('refresh-staff-workload', '30 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_staff_workload');
-- SELECT cron.schedule('refresh-time-tracking', '45 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_time_tracking_summary');
-- SELECT cron.schedule('refresh-effort-variance', '0 */2 * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_effort_variance');
-- SELECT cron.schedule('refresh-milestone-status', '10 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_milestone_status');
-- SELECT cron.schedule('refresh-training-compliance', '20 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_company_training_compliance');
-- SELECT cron.schedule('refresh-open-risks-issues', '35 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_open_risks_issues');
-- SELECT cron.schedule('refresh-template-performance', '50 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_template_performance');
-- SELECT cron.schedule('refresh-client-engagement', '5 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_client_engagement_summary');
-- SELECT cron.schedule('refresh-onboarding-cycle', '25 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_onboarding_cycle_time');
-- SELECT cron.schedule('refresh-document-usage', '40 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_document_usage');
-- SELECT cron.schedule('refresh-custom-field-analysis', '55 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.view_custom_field_analysis');

COMMENT ON EXTENSION pg_cron IS 'pg_cron scheduler used for running periodic jobs like materialized view refreshes.';
