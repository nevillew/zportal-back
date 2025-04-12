-- supabase/migrations/20250412221500_update_tasks_table.sql

-- Add priority column to tasks table
ALTER TABLE public.tasks
ADD COLUMN priority text CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')) DEFAULT 'Medium';

COMMENT ON COLUMN public.tasks.priority IS 'Priority level of the task (Low, Medium, High, Critical).';

-- Add actual_hours column to tasks table
ALTER TABLE public.tasks
ADD COLUMN actual_hours numeric; -- Nullable

COMMENT ON COLUMN public.tasks.actual_hours IS 'Actual time spent on the task in hours.';

-- Note: The estimated_effort_hours field name was already correct in the spec (plan.md v3.3).
-- The discrepancy was in the Edge Function code which used 'estimated_hours'.
-- We will correct the Edge Function code in the next step.
