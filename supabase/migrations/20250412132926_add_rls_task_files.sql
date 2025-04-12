-- Enable RLS for the task_files table
alter table task_files enable row level security;

-- Allow SELECT access if the user can access the parent task's project
create policy "Allow SELECT for users who can access the project"
on task_files for select
using (
    exists (
        select 1
        from tasks t
        join sections s on t.section_id = s.id
        where t.id = task_files.task_id
        and can_access_project(auth.uid(), s.project_id)
    )
);

-- Allow INSERT access if the user has 'task:manage' permission for the project's company
create policy "Allow INSERT for users with permission"
on task_files for insert
with check (
    exists (
        select 1
        from tasks t
        join sections s on t.section_id = s.id
        join projects p on s.project_id = p.id
        where t.id = task_files.task_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'task:manage'))
        )
    )
);

-- Disallow UPDATE operations generally (file metadata is usually immutable after upload)
create policy "Disallow UPDATE"
on task_files for update
using (false);

-- Allow DELETE access if the user has 'task:manage' permission for the project's company
create policy "Allow DELETE for users with permission"
on task_files for delete
using (
    exists (
        select 1
        from tasks t
        join sections s on t.section_id = s.id
        join projects p on s.project_id = p.id
        where t.id = task_files.task_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'task:manage'))
        )
    )
);

-- Force RLS for table owners (recommended)
alter table task_files force row level security;
