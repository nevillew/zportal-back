-- Enable RLS for the risks table
alter table risks enable row level security;

-- Allow SELECT access if the user can access the parent project
create policy "Allow SELECT for users who can access the project"
on risks for select
using (
    can_access_project(auth.uid(), project_id)
);

-- Allow INSERT access if the user has 'risk:manage' permission for the project's company
create policy "Allow INSERT for users with permission"
on risks for insert
with check (
    exists (
        select 1
        from projects p
        where p.id = risks.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'risk:manage'))
        )
    )
);

-- Allow UPDATE access if the user has 'risk:manage' permission for the project's company
create policy "Allow UPDATE for users with permission"
on risks for update
using (
     exists (
        select 1
        from projects p
        where p.id = risks.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'risk:manage'))
        )
    )
)
with check (
     exists (
        select 1
        from projects p
        where p.id = risks.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'risk:manage'))
        )
    )
);

-- Allow DELETE access if the user has 'risk:manage' permission for the project's company
create policy "Allow DELETE for users with permission"
on risks for delete
using (
     exists (
        select 1
        from projects p
        where p.id = risks.project_id
        and (
            is_staff_user(auth.uid()) or
            (is_member_of_company(auth.uid(), p.company_id) and has_permission(auth.uid(), p.company_id, 'risk:manage'))
        )
    )
);

-- Force RLS for table owners (recommended)
alter table risks force row level security;
