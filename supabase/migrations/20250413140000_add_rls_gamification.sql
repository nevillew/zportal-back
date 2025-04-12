-- Enable RLS for gamification related tables
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Policies for 'badges' table
CREATE POLICY "Allow SELECT access to authenticated users"
ON public.badges
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow INSERT/UPDATE/DELETE for staff users"
ON public.badges
FOR ALL -- Covers INSERT, UPDATE, DELETE
USING (is_staff_user(auth.uid()))
WITH CHECK (is_staff_user(auth.uid()));

-- Policies for 'user_badges' table
CREATE POLICY "Allow SELECT for owning user or staff"
ON public.user_badges
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        user_id = auth.uid() OR
        is_staff_user(auth.uid())
    )
);

CREATE POLICY "Disallow direct INSERT by authenticated users"
ON public.user_badges
FOR INSERT
WITH CHECK (false); -- Inserts should be handled by backend trigger/function logic

CREATE POLICY "Disallow UPDATE by authenticated users"
ON public.user_badges
FOR UPDATE
USING (false); -- Generally, earned badges shouldn't be updated directly

CREATE POLICY "Allow DELETE for staff users only"
ON public.user_badges
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid())
);

-- Comments on policies
COMMENT ON POLICY "Allow SELECT access to authenticated users" ON public.badges IS 'Any logged-in user can view available badge definitions.';
COMMENT ON POLICY "Allow INSERT/UPDATE/DELETE for staff users" ON public.badges IS 'Only staff users can manage badge definitions.';
COMMENT ON POLICY "Allow SELECT for owning user or staff" ON public.user_badges IS 'Users can view their own earned badges; staff can view all.';
COMMENT ON POLICY "Disallow direct INSERT by authenticated users" ON public.user_badges IS 'Prevents users from directly awarding badges to themselves; must be done via backend logic.';
COMMENT ON POLICY "Disallow UPDATE by authenticated users" ON public.user_badges IS 'Prevents direct updates to earned badge records.';
COMMENT ON POLICY "Allow DELETE for staff users only" ON public.user_badges IS 'Only staff users can delete earned badge records.';
