-- Enable RLS for the companies table
alter table companies enable row level security;

-- Allow SELECT access to staff or members of the company
create policy "Allow SELECT for staff or members"
on companies for select
using (
    is_staff_user(auth.uid()) or
    is_member_of_company(auth.uid(), id)
);

-- Allow INSERT access only to staff users (can be expanded later with permissions)
-- Assuming a permission like 'admin:create_company' might be used later.
create policy "Allow INSERT for staff users"
on companies for insert
with check (
    is_staff_user(auth.uid())
    -- Example for future expansion: OR has_global_permission(auth.uid(), 'admin:create_company')
);

-- Allow UPDATE access to staff or members with 'company:edit_settings' permission
create policy "Allow UPDATE for staff or members with permission"
on companies for update
using (
    is_staff_user(auth.uid()) or
    (is_member_of_company(auth.uid(), id) and has_permission(auth.uid(), id, 'company:edit_settings'))
)
with check (
    is_staff_user(auth.uid()) or
    (is_member_of_company(auth.uid(), id) and has_permission(auth.uid(), id, 'company:edit_settings'))
);

-- Allow DELETE access to staff or members with 'company:delete' permission
create policy "Allow DELETE for staff or members with permission"
on companies for delete
using (
    is_staff_user(auth.uid()) or
    (is_member_of_company(auth.uid(), id) and has_permission(auth.uid(), id, 'company:delete'))
);

-- Force RLS for table owners (recommended)
alter table companies force row level security;
