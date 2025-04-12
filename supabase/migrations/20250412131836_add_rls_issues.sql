-- Enable RLS for the issues table
alter table issues enable row level security;

-- Allow SELECT access if the user can access the parent project
create policy "Allow SELECT for users who can access the project"
on issues for select
using (
    can_access_project(auth.uid(), project_id)
);

-- Allow INSERT access if the user has 'issue:manage' permission for the project's company
create policy "Allow INSERT for users with permission"
on issues for insert
with check (
    exists (
        select 1
        from projects p
        where p.id = issues.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'issue:manage'))
        )
    )
);

-- Allow UPDATE access if the user has 'issue:manage' permission for the project's company
create policy "Allow UPDATE for users with permission"
on issues for update
using (
     exists (
        select 1
        from projects p
        where p.id = issues.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'issue:manage'))
        )
    )
)
with check (
     exists (
        select 1
        from projects p
        where p.id = issues.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'issue:manage'))
        )
    )
);

-- Allow DELETE access if the user has 'issue:manage' permission for the project's company
create policy "Allow DELETE for users with permission"
on issues for delete
using (
     exists (
        select 1
        from projects p
        where p.id = issues.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'issue:manage'))
        )
    )
);

-- Force RLS for table owners (recommended)
alter table issues force row level security;
