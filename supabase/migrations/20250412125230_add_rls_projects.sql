-- Enable RLS for the projects table
alter table projects enable row level security;

-- Allow SELECT access to staff or members of the project's company
create policy "Allow SELECT for staff or company members"
on projects for select
using (
    is_staff_user(auth.uid()) or
    is_member_of_company(auth.uid(), company_id)
);

-- Allow INSERT access to staff or members with 'project:create' permission in the target company
create policy "Allow INSERT for staff or members with permission"
on projects for insert
with check (
    is_staff_user(auth.uid()) or
    (is_member_of_company(auth.uid(), company_id) and has_permission(auth.uid(), company_id, 'project:create'))
);

-- Allow UPDATE access to staff or members with 'project:edit' permission in the project's company
create policy "Allow UPDATE for staff or members with permission"
on projects for update
using (
    is_staff_user(auth.uid()) or
    (is_member_of_company(auth.uid(), company_id) and has_permission(auth.uid(), company_id, 'project:edit'))
)
with check (
    is_staff_user(auth.uid()) or
    (is_member_of_company(auth.uid(), company_id) and has_permission(auth.uid(), company_id, 'project:edit'))
);

-- Allow DELETE access to staff or members with 'project:delete' permission in the project's company
create policy "Allow DELETE for staff or members with permission"
on projects for delete
using (
    is_staff_user(auth.uid()) or
    (is_member_of_company(auth.uid(), company_id) and has_permission(auth.uid(), company_id, 'project:delete'))
);

-- Force RLS for table owners (recommended)
alter table projects force row level security;
