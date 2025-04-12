-- Enable RLS for the audit_log table
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policies for 'audit_log' table

-- Allow SELECT access only to staff users
CREATE POLICY "Allow SELECT access for staff users"
ON public.audit_log
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid())
);

-- Disallow direct INSERT by any authenticated user
-- Inserts are handled exclusively by the audit triggers.
CREATE POLICY "Disallow direct INSERT"
ON public.audit_log
FOR INSERT
WITH CHECK (false);

-- Disallow direct UPDATE by any authenticated user
CREATE POLICY "Disallow direct UPDATE"
ON public.audit_log
FOR UPDATE
USING (false);

-- Disallow direct DELETE by any authenticated user
-- Data retention policies should handle cleanup via scheduled functions if needed.
CREATE POLICY "Disallow direct DELETE"
ON public.audit_log
FOR DELETE
USING (false);

-- Comments on policies
COMMENT ON POLICY "Allow SELECT access for staff users" ON public.audit_log IS 'Only staff users can view audit log records.';
COMMENT ON POLICY "Disallow direct INSERT" ON public.audit_log IS 'Prevents direct insertion into the audit log; inserts must come from triggers.';
COMMENT ON POLICY "Disallow direct UPDATE" ON public.audit_log IS 'Prevents direct updates to audit log records.';
COMMENT ON POLICY "Disallow direct DELETE" ON public.audit_log IS 'Prevents direct deletion of audit log records; use retention policies if needed.';
