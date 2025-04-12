-- supabase/migrations/20250412213500_add_section_progress_calc.sql

-- 1. Create function to calculate section progress
CREATE OR REPLACE FUNCTION public.calculate_section_progress(section_id_param uuid)
RETURNS void AS $$
DECLARE
  total_tasks bigint;
  completed_tasks bigint;
  progress float;
BEGIN
  -- Count total non-sub-tasks and completed non-sub-tasks for the section
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'Complete')
  INTO total_tasks, completed_tasks
  FROM public.tasks
  WHERE section_id = section_id_param
    AND parent_task_id IS NULL; -- Exclude sub-tasks from direct calculation

  -- Calculate progress percentage
  IF total_tasks > 0 THEN
    progress := (completed_tasks::float / total_tasks::float) * 100.0;
  ELSE
    -- Define behavior for sections with no non-sub-tasks (e.g., 0% or 100%)
    progress := 0; -- Defaulting to 0% if no tasks
  END IF;

  -- Update the sections table
  UPDATE public.sections
  SET percent_complete = progress,
      -- Optionally update section status based on progress
      status = CASE
                 WHEN progress = 100 THEN 'Completed'
                 WHEN progress > 0 THEN 'In Progress'
                 ELSE 'Not Started'
               END
  WHERE id = section_id_param;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER allows the function to update the sections table even if the user triggering the task update doesn't have direct UPDATE permission on sections.
-- Ensure the function owner has the necessary privileges.

-- 2. Create trigger function
CREATE OR REPLACE FUNCTION public.section_progress_trigger_func()
RETURNS trigger AS $$
BEGIN
  -- If a task is deleted, update its old section's progress
  IF TG_OP = 'DELETE' THEN
    IF OLD.section_id IS NOT NULL THEN
      PERFORM public.calculate_section_progress(OLD.section_id);
    END IF;
  -- If a task is inserted or updated, update its new section's progress
  ELSEIF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.section_id IS NOT NULL THEN
      PERFORM public.calculate_section_progress(NEW.section_id);
    END IF;
    -- If the section_id changed during an UPDATE, also update the old section's progress
    IF TG_OP = 'UPDATE' AND NEW.section_id IS DISTINCT FROM OLD.section_id AND OLD.section_id IS NOT NULL THEN
       PERFORM public.calculate_section_progress(OLD.section_id);
    END IF;
  END IF;

  RETURN NULL; -- Result is ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger on the tasks table
--    Trigger fires after insert, delete, or update of status/section_id/parent_task_id
DROP TRIGGER IF EXISTS update_section_progress_trigger ON public.tasks;
CREATE TRIGGER update_section_progress_trigger
AFTER INSERT OR DELETE OR UPDATE OF status, section_id, parent_task_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.section_progress_trigger_func();

-- Comment explaining the trigger
COMMENT ON TRIGGER update_section_progress_trigger ON public.tasks
IS 'Updates the percent_complete and status fields on the related sections table whenever a task''s status, section, or parentage changes.';
