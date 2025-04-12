-- Enable RLS for the sections table
alter table sections enable row level security;

-- Helper function to check project access (used by section policies)
-- Returns true if the user is staff or a member of the project's company.
-- This avoids repeating the join logic in every policy.
create or replace function can_access_project(user_id uuid, project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    is_staff_user(user_id) or
    exists (
      select 1
      from projects p
      where p.id = can_access_project.project_id
        and is_member_of_company(user_id, p.company_id)
    );
$$;

-- Grant execute permission on the helper function to the authenticated role
grant execute on function can_access_project(uuid, uuid) to authenticated;


-- Allow SELECT access if the user can access the parent project
create policy "Allow SELECT for users who can access the project"
on sections for select
using (
    can_access_project(auth.uid(), project_id)
);

-- Allow INSERT access if the user has 'section:create' permission for the project's company
create policy "Allow INSERT for users with permission"
on sections for insert
with check (
    exists (
        select 1
        from projects p
        where p.id = sections.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'section:create'))
        )
    )
);

-- Allow UPDATE access if the user has 'section:edit' permission for the project's company
create policy "Allow UPDATE for users with permission"
on sections for update
using (
     exists (
        select 1
        from projects p
        where p.id = sections.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'section:edit'))
        )
    )
)
with check (
     exists (
        select 1
        from projects p
        where p.id = sections.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'section:edit'))
        )
    )
);

-- Allow DELETE access if the user has 'section:delete' permission for the project's company
create policy "Allow DELETE for users with permission"
on sections for delete
using (
     exists (
        select 1
        from projects p
        where p.id = sections.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'section:delete'))
        )
    )
);

-- Force RLS for table owners (recommended)
alter table sections force row level security;
