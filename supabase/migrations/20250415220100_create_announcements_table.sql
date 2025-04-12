-- Migration to create the announcements table and RLS policies

-- 1. Create announcements table
CREATE TABLE public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (length(title) > 0 AND length(title) <= 150),
    content text NOT NULL,
    status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
    target_company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE, -- Nullable for global announcements
    target_role text REFERENCES public.roles(role_name) ON DELETE SET NULL, -- Nullable to target all roles
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE public.announcements IS 'Stores system-wide or company-specific announcements.';
COMMENT ON COLUMN public.announcements.status IS 'Draft, Published, or Archived status of the announcement.';
COMMENT ON COLUMN public.announcements.target_company_id IS 'If set, announcement is only visible to users of this company. If NULL, it''s global.';
COMMENT ON COLUMN public.announcements.target_role IS 'If set, announcement is only visible to users with this role (within the target company or globally).';
COMMENT ON COLUMN public.announcements.published_at IS 'Timestamp when the announcement was moved to published status.';

-- Add indexes
CREATE INDEX idx_announcements_status ON public.announcements(status);
CREATE INDEX idx_announcements_target_company_id ON public.announcements(target_company_id);
CREATE INDEX idx_announcements_published_at ON public.announcements(published_at);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;

-- RLS Policies for announcements
CREATE POLICY "Allow SELECT for relevant users on published announcements"
ON public.announcements
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    status = 'published' AND
    (
        -- Global announcements visible to all
        target_company_id IS NULL OR
        -- Company-specific announcements visible to members of that company
        is_member_of_company(auth.uid(), target_company_id)
    ) AND
    (
        -- Role-specific targeting (if target_role is set)
        target_role IS NULL OR
        EXISTS (
            SELECT 1 FROM company_users cu
            WHERE cu.user_id = auth.uid()
              AND cu.role = announcements.target_role
              AND (announcements.target_company_id IS NULL OR cu.company_id = announcements.target_company_id)
        )
    )
);

CREATE POLICY "Allow staff to manage all announcements"
ON public.announcements
FOR ALL -- Covers SELECT (including drafts), INSERT, UPDATE, DELETE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid()) -- Assumes staff have 'announcement:manage' implicitly
    -- OR has_permission(auth.uid(), COALESCE(target_company_id, '00000000-0000-0000-0000-000000000000'::uuid), 'announcement:manage') -- More granular check if needed
)
WITH CHECK (
    is_staff_user(auth.uid())
    -- OR has_permission(auth.uid(), COALESCE(target_company_id, '00000000-0000-0000-0000-000000000000'::uuid), 'announcement:manage')
);

-- Apply audit trigger if desired
-- CREATE TRIGGER announcements_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON announcements FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
