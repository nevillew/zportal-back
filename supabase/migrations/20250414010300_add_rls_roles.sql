-- Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT any role definition
CREATE POLICY "Allow SELECT for authenticated users"
ON public.roles
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow INSERT only for staff with 'admin:manage_roles' permission
CREATE POLICY "Allow INSERT for staff with permission"
ON public.roles
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid()) AND
    has_permission(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid, 'admin:manage_roles') -- Use placeholder company_id for global perm check
);

-- Allow UPDATE only for staff with 'admin:manage_roles' permission, disallowing updates to system roles
CREATE POLICY "Allow UPDATE for staff with permission (non-system)"
ON public.roles
FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid()) AND
    has_permission(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid, 'admin:manage_roles') AND
    is_system_role = false -- Prevent updating system roles
)
WITH CHECK (
    is_staff_user(auth.uid()) AND
    has_permission(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid, 'admin:manage_roles') AND
    is_system_role = false -- Prevent changing a role TO be a system role or updating existing system roles
);

-- Allow DELETE only for staff with 'admin:manage_roles' permission, disallowing deletion of system roles
CREATE POLICY "Allow DELETE for staff with permission (non-system)"
ON public.roles
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid()) AND
    has_permission(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid, 'admin:manage_roles') AND
    is_system_role = false -- Prevent deleting system roles
);

COMMENT ON POLICY "Allow SELECT for authenticated users" ON public.roles IS 'Any logged-in user can view role definitions.';
COMMENT ON POLICY "Allow INSERT for staff with permission" ON public.roles IS 'Only staff with role management permission can create new roles.';
COMMENT ON POLICY "Allow UPDATE for staff with permission (non-system)" ON public.roles IS 'Only staff with role management permission can update non-system roles.';
COMMENT ON POLICY "Allow DELETE for staff with permission (non-system)" ON public.roles IS 'Only staff with role management permission can delete non-system roles.';
