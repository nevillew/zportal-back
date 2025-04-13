-- Enable RLS
ALTER TABLE public.sso_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_configurations FORCE ROW LEVEL SECURITY;

-- Allow SELECT for staff or company admins of the associated company
CREATE POLICY "Allow SELECT for staff or company admins"
ON public.sso_configurations
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'admin:manage_sso')) -- Use specific SSO permission
    )
);

-- Allow INSERT/UPDATE/DELETE only for staff with 'admin:manage_sso' permission
CREATE POLICY "Allow modification for staff with permission"
ON public.sso_configurations
FOR ALL -- Covers INSERT, UPDATE, DELETE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid()) AND
    has_permission(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid, 'admin:manage_sso') -- Global permission check
)
WITH CHECK (
    is_staff_user(auth.uid()) AND
    has_permission(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid, 'admin:manage_sso')
);

COMMENT ON POLICY "Allow SELECT for staff or company admins" ON public.sso_configurations IS 'Staff or Company Admins with SSO permission can view SSO configurations.';
COMMENT ON POLICY "Allow modification for staff with permission" ON public.sso_configurations IS 'Only staff with SSO management permission can create, update, or delete SSO configurations.';
