-- Function to check for circular dependencies in tasks
CREATE OR REPLACE FUNCTION public.check_task_circular_dependency(
    task_id_to_check uuid,
    proposed_dependency_id uuid
)
RETURNS boolean AS $$
DECLARE
    is_circular boolean;
BEGIN
    -- If the proposed dependency is null, it cannot be circular
    IF proposed_dependency_id IS NULL THEN
        RETURN false;
    END IF;

    -- If the task is trying to depend on itself directly
    IF task_id_to_check = proposed_dependency_id THEN
        RETURN true;
    END IF;

    -- Use a recursive CTE to find all ancestors of the proposed dependency
    WITH RECURSIVE dependency_chain AS (
        -- Start with the proposed dependency
        SELECT id, depends_on_task_id
        FROM public.tasks
        WHERE id = proposed_dependency_id

        UNION ALL

        -- Recursively find the tasks that the current task depends on
        SELECT t.id, t.depends_on_task_id
        FROM public.tasks t
        INNER JOIN dependency_chain dc ON t.id = dc.depends_on_task_id
        WHERE t.depends_on_task_id IS NOT NULL -- Avoid infinite loop if a task depends on null
           AND t.id != dc.id -- Prevent trivial cycles within the CTE itself if data is weird
    )
    -- Check if the task we are trying to update (task_id_to_check) exists anywhere in the dependency chain
    SELECT EXISTS (
        SELECT 1
        FROM dependency_chain
        WHERE depends_on_task_id = task_id_to_check
    ) INTO is_circular;

    RETURN is_circular;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
-- STABLE because it doesn't modify the database but relies on its contents.
-- SECURITY DEFINER might be needed if RLS prevents checking tasks the user can't directly see,
-- but ensure the function owner (postgres) has SELECT permissions on tasks.

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.check_task_circular_dependency(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.check_task_circular_dependency(uuid, uuid) IS 'Checks if setting depends_on_task_id = proposed_dependency_id for task_id_to_check would create a circular dependency. Returns true if circular, false otherwise.';
