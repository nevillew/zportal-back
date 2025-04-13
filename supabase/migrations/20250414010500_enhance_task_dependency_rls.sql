-- Drop existing UPDATE policy (assuming it exists from 20250412125325_add_rls_tasks.sql)
DROP POLICY IF EXISTS "Allow UPDATE for users with permission or self-service" ON public.tasks;

-- Recreate UPDATE policy with dependency check in WITH CHECK clause
CREATE POLICY "Allow UPDATE for users with permission or self-service"
ON public.tasks
FOR UPDATE
USING (
    -- USING clause remains the same (who can attempt the update)
    exists (
        select 1
        from sections s
        join projects p on s.project_id = p.id
        where s.id = tasks.section_id
        and (
            is_staff_user(auth.uid()) OR
            (is_member_of_company(auth.uid(), p.company_id) AND has_permission(auth.uid(), p.company_id, 'task:edit')) OR
            (tasks.is_self_service = true AND tasks.assigned_to_id = auth.uid() AND is_member_of_company(auth.uid(), p.company_id))
        )
    )
)
WITH CHECK (
    -- Re-check USING conditions
    exists (
        select 1
        from sections s
        join projects p on s.project_id = p.id
        where s.id = tasks.section_id
        and (
            is_staff_user(auth.uid()) OR
            (is_member_of_company(auth.uid(), p.company_id) AND has_permission(auth.uid(), p.company_id, 'task:edit')) OR
            (tasks.is_self_service = true AND tasks.assigned_to_id = auth.uid() AND is_member_of_company(auth.uid(), p.company_id))
        )
    )
    -- Add dependency check: Prevent setting status to 'Complete' if dependency is not 'Complete'
    AND (
        status <> 'Complete' -- Allow update if status is not being set to Complete
        OR
        depends_on_task_id IS NULL -- Allow update if there is no dependency
        OR
        EXISTS ( -- Allow update if the dependency task IS Complete
            SELECT 1 FROM public.tasks dep WHERE dep.id = tasks.depends_on_task_id AND dep.status = 'Complete'
        )
    )
    -- Add recurrence definition edit restriction (from next step, combined here)
    AND (
        is_recurring_definition = OLD.is_recurring_definition -- Allow if recurrence flag isn't changing
        OR is_staff_user(auth.uid()) -- Allow staff to change recurrence flag
        OR has_permission(auth.uid(), (SELECT p.company_id FROM sections s JOIN projects p ON s.project_id = p.id WHERE s.id = tasks.section_id), 'task:manage') -- Allow users with manage perm
    )
    AND (
        recurrence_rule = OLD.recurrence_rule -- Allow if rule isn't changing
        OR is_staff_user(auth.uid()) -- Allow staff to change rule
        OR has_permission(auth.uid(), (SELECT p.company_id FROM sections s JOIN projects p ON s.project_id = p.id WHERE s.id = tasks.section_id), 'task:manage') -- Allow users with manage perm
    )
     AND (
        recurrence_end_date = OLD.recurrence_end_date -- Allow if end date isn't changing
        OR is_staff_user(auth.uid()) -- Allow staff to change end date
        OR has_permission(auth.uid(), (SELECT p.company_id FROM sections s JOIN projects p ON s.project_id = p.id WHERE s.id = tasks.section_id), 'task:manage') -- Allow users with manage perm
    )
);

COMMENT ON POLICY "Allow UPDATE for users with permission or self-service" ON public.tasks IS 'Allows task updates based on permissions or self-service flag, AND prevents completion if dependencies are not met, AND restricts editing recurrence definitions.';
