-- Enable RLS for the tasks table
alter table tasks enable row level security;

-- Allow SELECT access if the user can access the parent project
create policy "Allow SELECT for users who can access the project"
on tasks for select
using (
    exists (
        select 1
        from sections s
        where s.id = tasks.section_id
        and can_access_project(auth.uid(), s.project_id)
    )
);

-- Allow INSERT access if the user has 'task:create' permission for the project's company
create policy "Allow INSERT for users with permission"
on tasks for insert
with check (
    exists (
        select 1
        from sections s
        join projects p on s.project_id = p.id
        where s.id = tasks.section_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'task:create'))
        )
    )
);

-- Allow UPDATE access based on permissions or self-service flag
create policy "Allow UPDATE for users with permission or self-service"
on tasks for update
using (
    exists (
        select 1
        from sections s
        join projects p on s.project_id = p.id
        where s.id = tasks.section_id
        and (
            -- Staff can update
            is_staff_user(auth.uid())
            -- Or, members with 'task:edit' permission can update
            or (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'task:edit'))
            -- Or, if it's a self-service task, the assigned user can update (specific columns might be restricted further in application logic/triggers if needed)
            or (tasks.is_self_service = true and tasks.assigned_to_id = auth.uid() and is_member_of_company(auth.uid(), p.company_id))
        )
    )
)
with check (
    exists (
        select 1
        from sections s
        join projects p on s.project_id = p.id
        where s.id = tasks.section_id
        and (
            -- Staff can update
            is_staff_user(auth.uid())
            -- Or, members with 'task:edit' permission can update
            or (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'task:edit'))
             -- Or, if it's a self-service task, the assigned user can update
            or (tasks.is_self_service = true and tasks.assigned_to_id = auth.uid() and is_member_of_company(auth.uid(), p.company_id))
        )
    )
);

-- Allow DELETE access if the user has 'task:delete' permission for the project's company
create policy "Allow DELETE for users with permission"
on tasks for delete
using (
    exists (
        select 1
        from sections s
        join projects p on s.project_id = p.id
        where s.id = tasks.section_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'task:delete'))
        )
    )
);

-- Force RLS for table owners (recommended)
alter table tasks force row level security;
