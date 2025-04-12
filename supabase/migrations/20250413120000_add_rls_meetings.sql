-- Enable Row Level Security for the meetings table
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Allow SELECT access to staff or members of the associated company/project
CREATE POLICY "Allow SELECT access to staff or members"
ON public.meetings
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        is_member_of_company(auth.uid(), company_id) OR
        EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = meetings.project_id AND is_member_of_company(auth.uid(), p.company_id)
        )
    )
);

-- Disallow direct INSERT by authenticated users via API (intended for webhook/staff)
-- If an API endpoint for staff is created later, it might need a specific policy or use service_role.
CREATE POLICY "Disallow direct INSERT by authenticated users"
ON public.meetings
FOR INSERT
WITH CHECK (false); -- Effectively blocks direct inserts for 'authenticated' role

-- Allow UPDATE for staff or users with 'meeting:manage' permission, respecting status lock
CREATE POLICY "Allow UPDATE for staff or managers, respecting status lock"
ON public.meetings
FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (
            -- Check membership and permission
            (
                is_member_of_company(auth.uid(), company_id) OR
                EXISTS (
                    SELECT 1 FROM projects p
                    WHERE p.id = meetings.project_id AND is_member_of_company(auth.uid(), p.company_id)
                )
            ) AND
            has_permission(auth.uid(), COALESCE(company_id, (SELECT p.company_id FROM projects p WHERE p.id = meetings.project_id)), 'meeting:manage')
        )
    )
)
WITH CHECK (
    -- Prevent updates if status is 'completed', unless only notes or recording_url are changing
    (
        status <> 'completed' OR
        (status = 'completed' AND notes IS NOT DISTINCT FROM NEW.notes AND recording_url IS NOT DISTINCT FROM NEW.recording_url)
    ) AND
    -- Re-check permission for the row being updated
    (
        is_staff_user(auth.uid()) OR
        (
            (
                is_member_of_company(auth.uid(), company_id) OR
                EXISTS (
                    SELECT 1 FROM projects p
                    WHERE p.id = meetings.project_id AND is_member_of_company(auth.uid(), p.company_id)
                )
            ) AND
            has_permission(auth.uid(), COALESCE(company_id, (SELECT p.company_id FROM projects p WHERE p.id = meetings.project_id)), 'meeting:manage')
        )
    )
);


-- Allow DELETE for staff or users with 'meeting:manage' permission
CREATE POLICY "Allow DELETE for staff or managers"
ON public.meetings
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (
            -- Check membership and permission
            (
                is_member_of_company(auth.uid(), company_id) OR
                EXISTS (
                    SELECT 1 FROM projects p
                    WHERE p.id = meetings.project_id AND is_member_of_company(auth.uid(), p.company_id)
                )
            ) AND
            has_permission(auth.uid(), COALESCE(company_id, (SELECT p.company_id FROM projects p WHERE p.id = meetings.project_id)), 'meeting:manage')
        )
    )
);

COMMENT ON POLICY "Allow SELECT access to staff or members" ON public.meetings IS 'Staff or members of the associated company/project can view meetings.';
COMMENT ON POLICY "Disallow direct INSERT by authenticated users" ON public.meetings IS 'Prevents direct API inserts by normal users; inserts should come from webhook or privileged functions.';
COMMENT ON POLICY "Allow UPDATE for staff or managers, respecting status lock" ON public.meetings IS 'Staff or users with meeting:manage permission can update, but not if status is completed (except notes/recording).';
COMMENT ON POLICY "Allow DELETE for staff or managers" ON public.meetings IS 'Staff or users with meeting:manage permission can delete meetings.';
