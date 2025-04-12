-- Enable RLS for training related tables
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_completions ENABLE ROW LEVEL SECURITY;

-- Policies for 'courses' table
CREATE POLICY "Allow SELECT access to authenticated users"
ON public.courses
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow INSERT/UPDATE/DELETE for staff users"
ON public.courses
FOR ALL -- Covers INSERT, UPDATE, DELETE
USING (is_staff_user(auth.uid()))
WITH CHECK (is_staff_user(auth.uid()));

-- Policies for 'lessons' table
CREATE POLICY "Allow SELECT access to authenticated users"
ON public.lessons
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow INSERT/UPDATE/DELETE for staff users"
ON public.lessons
FOR ALL -- Covers INSERT, UPDATE, DELETE
USING (is_staff_user(auth.uid()))
WITH CHECK (is_staff_user(auth.uid()));

-- Policies for 'course_assignments' table
CREATE POLICY "Allow SELECT for assigned user, staff, or managers"
ON public.course_assignments
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        user_id = auth.uid() OR
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'training:manage_assignments'))
    )
);

CREATE POLICY "Allow INSERT/UPDATE/DELETE for staff or managers"
ON public.course_assignments
FOR ALL -- Covers INSERT, UPDATE, DELETE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'training:manage_assignments'))
    )
)
WITH CHECK (
    -- Re-check permission on the specific row being modified/inserted
    is_staff_user(auth.uid()) OR
    (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'training:manage_assignments'))
);

-- Policies for 'lesson_completions' table
CREATE POLICY "Allow SELECT for completing user, staff, or reporting managers"
ON public.lesson_completions
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        user_id = auth.uid() OR
        is_staff_user(auth.uid()) OR
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'training:view_reports')) -- Permission to view reports implies viewing completions
    )
);

CREATE POLICY "Allow INSERT for completing user on assigned course"
ON public.lesson_completions
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    user_id = auth.uid() AND
    -- Ensure the user is assigned to the course this lesson belongs to in the relevant company
    EXISTS (
        SELECT 1
        FROM course_assignments ca
        JOIN lessons l ON l.course_id = ca.course_id
        WHERE ca.user_id = auth.uid()
          AND ca.company_id = lesson_completions.company_id
          AND l.id = lesson_completions.lesson_id
    )
);

CREATE POLICY "Allow UPDATE for completing user"
ON public.lesson_completions
FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
    -- Note: Further restrictions on *which* fields can be updated might be needed via triggers.
);

CREATE POLICY "Allow DELETE for staff users only"
ON public.lesson_completions
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid())
);

-- Comments on policies
COMMENT ON POLICY "Allow SELECT access to authenticated users" ON public.courses IS 'Any logged-in user can view available courses.';
COMMENT ON POLICY "Allow INSERT/UPDATE/DELETE for staff users" ON public.courses IS 'Only staff users can manage course definitions.';
COMMENT ON POLICY "Allow SELECT access to authenticated users" ON public.lessons IS 'Any logged-in user can view available lessons.';
COMMENT ON POLICY "Allow INSERT/UPDATE/DELETE for staff users" ON public.lessons IS 'Only staff users can manage lesson definitions.';
COMMENT ON POLICY "Allow SELECT for assigned user, staff, or managers" ON public.course_assignments IS 'Users see their own assignments; staff/managers see assignments based on permissions.';
COMMENT ON POLICY "Allow INSERT/UPDATE/DELETE for staff or managers" ON public.course_assignments IS 'Only staff or users with training management permissions can assign/modify course assignments.';
COMMENT ON POLICY "Allow SELECT for completing user, staff, or reporting managers" ON public.lesson_completions IS 'Users see their own completions; staff/managers see completions based on reporting permissions.';
COMMENT ON POLICY "Allow INSERT for completing user on assigned course" ON public.lesson_completions IS 'Users can mark lessons complete only if they are assigned to the corresponding course.';
COMMENT ON POLICY "Allow UPDATE for completing user" ON public.lesson_completions IS 'Users can update their own completion records (e.g., quiz score).';
COMMENT ON POLICY "Allow DELETE for staff users only" ON public.lesson_completions IS 'Only staff users can delete lesson completion records.';
