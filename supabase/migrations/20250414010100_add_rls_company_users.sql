-- Enable RLS
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users FORCE ROW LEVEL SECURITY;

-- Allow users to SELECT their own association record
CREATE POLICY "Allow SELECT own association"
ON public.company_users
FOR SELECT
USING (auth.role() = 'authenticated' AND user_id = auth.uid());

-- Allow staff or users with 'company:manage_users' permission to SELECT any user within a company they can access
CREATE POLICY "Allow SELECT for staff or managers"
ON public.company_users
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
);

-- Allow staff or users with 'company:manage_users' permission to INSERT new associations
CREATE POLICY "Allow INSERT for staff or managers"
ON public.company_users
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
);

-- Allow staff or users with 'company:manage_users' permission to UPDATE associations (e.g., change role)
CREATE POLICY "Allow UPDATE for staff or managers"
ON public.company_users
FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
)
WITH CHECK (
    -- Re-check permission on the row being updated
    is_staff_user(auth.uid()) OR
    (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    -- Add constraint: Cannot change own role? Cannot remove last admin? (Requires trigger logic)
);

-- Allow staff or users with 'company:manage_users' permission to DELETE associations (remove user from company)
CREATE POLICY "Allow DELETE for staff or managers"
ON public.company_users
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
    -- Add constraint: Cannot delete own record? Cannot remove last admin? (Requires trigger logic)
);

COMMENT ON POLICY "Allow SELECT own association" ON public.company_users IS 'Users can view their own company membership record.';
COMMENT ON POLICY "Allow SELECT for staff or managers" ON public.company_users IS 'Staff or users with manage permission can view all user associations within companies they can access.';
COMMENT ON POLICY "Allow INSERT for staff or managers" ON public.company_users IS 'Staff or users with manage permission can add users to companies.';
COMMENT ON POLICY "Allow UPDATE for staff or managers" ON public.company_users IS 'Staff or users with manage permission can update user associations (e.g., change role).';
COMMENT ON POLICY "Allow DELETE for staff or managers" ON public.company_users IS 'Staff or users with manage permission can remove users from companies.';
