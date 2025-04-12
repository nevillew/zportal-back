-- Enable RLS for the task_comments table
alter table task_comments enable row level security;

-- Allow SELECT access if the user can access the parent project, respecting the is_internal flag
create policy "Allow SELECT based on project access and internal flag"
on task_comments for select
using (
    exists (
        select 1
        from tasks t
        join sections s on t.section_id = s.id
        where t.id = task_comments.task_id
        and can_access_project(auth.uid(), s.project_id)
    )
    and (is_internal = false or is_staff_user(auth.uid())) -- Non-staff can only see non-internal comments
);

-- Allow INSERT access if the user can access the parent project, respecting the is_internal flag
create policy "Allow INSERT based on project access and internal flag"
on task_comments for insert
with check (
    exists (
        select 1
        from tasks t
        join sections s on t.section_id = s.id
        where t.id = task_comments.task_id
        and can_access_project(auth.uid(), s.project_id)
    )
    and (is_internal = false or is_staff_user(auth.uid())) -- Only staff can create internal comments
    and user_id = auth.uid() -- User can only insert comments as themselves
);

-- Allow users to UPDATE their own comments
create policy "Allow UPDATE for own comments"
on task_comments for update
using (
    user_id = auth.uid()
)
with check (
    user_id = auth.uid()
    -- Add check to prevent changing is_internal flag after creation, if desired
    -- and is_internal = (select is_internal from task_comments where id = task_comments.id)
);

-- Allow staff to UPDATE any comment (e.g., for moderation) - Requires appropriate permission check
create policy "Allow UPDATE for staff with permission"
on task_comments for update
using (
    is_staff_user(auth.uid()) and has_permission(auth.uid(), null::uuid, 'admin:moderate_comments') -- Example global permission
)
with check (
    is_staff_user(auth.uid()) and has_permission(auth.uid(), null::uuid, 'admin:moderate_comments')
);


-- Allow users to DELETE their own comments
create policy "Allow DELETE for own comments"
on task_comments for delete
using (
    user_id = auth.uid()
);

-- Allow staff to DELETE any comment (e.g., for moderation) - Requires appropriate permission check
create policy "Allow DELETE for staff with permission"
on task_comments for delete
using (
    is_staff_user(auth.uid()) and has_permission(auth.uid(), null::uuid, 'admin:moderate_comments') -- Example global permission
);


-- Force RLS for table owners (recommended)
alter table task_comments force row level security;

-- Note: The 'admin:moderate_comments' permission used in staff UPDATE/DELETE policies is an example.
-- Adjust the permission key and potentially the scope (global vs. company) as needed.
-- The has_permission function might need modification to handle null company_id for global checks if not already done.
