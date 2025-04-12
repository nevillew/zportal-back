-- Enable RLS for notification related tables
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Policies for 'notifications' table

-- Allow SELECT access for the recipient user or staff users
CREATE POLICY "Allow SELECT for recipient or staff"
ON public.notifications
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        recipient_user_id = auth.uid() OR
        is_staff_user(auth.uid())
    )
);

-- Disallow direct INSERT by any authenticated user
-- Inserts are handled by backend logic (e.g., triggers, functions).
CREATE POLICY "Disallow direct INSERT"
ON public.notifications
FOR INSERT
WITH CHECK (false);

-- Disallow direct UPDATE by any authenticated user
-- Notification status (e.g., 'read') should be updated via specific functions/API calls if needed.
CREATE POLICY "Disallow direct UPDATE"
ON public.notifications
FOR UPDATE
USING (false);

-- Disallow direct DELETE by non-staff users
-- Allow staff to potentially clean up notifications if necessary.
CREATE POLICY "Allow DELETE for staff users only"
ON public.notifications
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid())
);


-- Policies for 'notification_settings' table

-- Allow SELECT access for the owner user or staff users
CREATE POLICY "Allow SELECT for owner or staff"
ON public.notification_settings
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        user_id = auth.uid() OR
        is_staff_user(auth.uid())
    )
);

-- Allow INSERT only for the user creating their own settings
CREATE POLICY "Allow INSERT for owner"
ON public.notification_settings
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    user_id = auth.uid()
);

-- Allow UPDATE only for the user modifying their own settings
CREATE POLICY "Allow UPDATE for owner"
ON public.notification_settings
FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);

-- Allow DELETE only for the user deleting their own settings
CREATE POLICY "Allow DELETE for owner"
ON public.notification_settings
FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    user_id = auth.uid()
);

-- Comments on policies
COMMENT ON POLICY "Allow SELECT for recipient or staff" ON public.notifications IS 'Users can read their own notifications; staff can read all.';
COMMENT ON POLICY "Disallow direct INSERT" ON public.notifications IS 'Prevents direct insertion of notifications; must be done via backend logic.';
COMMENT ON POLICY "Disallow direct UPDATE" ON public.notifications IS 'Prevents direct updates to notifications.';
COMMENT ON POLICY "Allow DELETE for staff users only" ON public.notifications IS 'Only staff users can delete notification records.';
COMMENT ON POLICY "Allow SELECT for owner or staff" ON public.notification_settings IS 'Users can view their own notification settings; staff can view all.';
COMMENT ON POLICY "Allow INSERT for owner" ON public.notification_settings IS 'Users can insert their own notification settings record.';
COMMENT ON POLICY "Allow UPDATE for owner" ON public.notification_settings IS 'Users can update their own notification settings.';
COMMENT ON POLICY "Allow DELETE for owner" ON public.notification_settings IS 'Users can delete their own notification settings.';
