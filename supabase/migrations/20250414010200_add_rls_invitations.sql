-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

-- Allow unauthenticated SELECT based on token (for frontend verification before login/signup)
-- WARNING: Exposes email, company_id, role, status, expires_at for a valid token.
CREATE POLICY "Allow SELECT by token for verification"
ON public.invitations
FOR SELECT
USING (true); -- Allow selection, but rely on WHERE clause filtering by token in the query.

-- Allow staff or users with 'company:manage_users' permission to SELECT invitations for their company
CREATE POLICY "Allow SELECT for staff or managers"
ON public.invitations
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
);

-- Allow staff or users with 'company:manage_users' permission to INSERT invitations
CREATE POLICY "Allow INSERT for staff or managers"
ON public.invitations
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
    -- Ensure invited_by_user_id is set correctly if needed
    AND (invited_by_user_id = auth.uid() OR is_staff_user(auth.uid()))
);

-- Disallow direct UPDATE by users (status updated by accept function/RPC)
-- Allow managers to potentially revoke (update status to 'revoked')
CREATE POLICY "Allow UPDATE (revoke) for staff or managers"
ON public.invitations
FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
)
WITH CHECK (
    -- Only allow updating status to 'revoked' by managers/staff
    status = 'revoked' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
);

-- Allow staff or users with 'company:manage_users' permission to DELETE pending/expired invitations
CREATE POLICY "Allow DELETE for staff or managers"
ON public.invitations
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'company:manage_users'))
    )
);

COMMENT ON POLICY "Allow SELECT by token for verification" ON public.invitations IS 'Allows public SELECT based on token for frontend verification (use WHERE clause).';
COMMENT ON POLICY "Allow SELECT for staff or managers" ON public.invitations IS 'Staff or users with manage permission can view invitations for companies they manage.';
COMMENT ON POLICY "Allow INSERT for staff or managers" ON public.invitations IS 'Staff or users with manage permission can create invitations.';
COMMENT ON POLICY "Allow UPDATE (revoke) for staff or managers" ON public.invitations IS 'Staff or users with manage permission can revoke invitations by updating status.';
COMMENT ON POLICY "Allow DELETE for staff or managers" ON public.invitations IS 'Staff or users with manage permission can delete invitations.';
