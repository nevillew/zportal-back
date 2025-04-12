-- supabase/migrations/20250412222600_add_task_hierarchy_constraints.sql

-- Add constraint to prevent a task from being its own parent
ALTER TABLE public.tasks
ADD CONSTRAINT check_task_not_own_parent
CHECK (id <> parent_task_id);

-- Add constraint to prevent a task from depending on itself
ALTER TABLE public.tasks
ADD CONSTRAINT check_task_not_own_dependency
CHECK (id <> depends_on_task_id);

COMMENT ON CONSTRAINT check_task_not_own_parent ON public.tasks IS 'Ensures a task cannot be its own parent.';
COMMENT ON CONSTRAINT check_task_not_own_dependency ON public.tasks IS 'Ensures a task cannot depend on itself.';
