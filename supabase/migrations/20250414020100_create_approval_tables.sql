-- 1. Create approvals table
CREATE TABLE public.approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL CHECK (entity_type IN ('milestone', 'document')), -- Expand as needed
    entity_id uuid NOT NULL, -- ID of the milestone or document being approved
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')) DEFAULT 'pending',
    requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    finalized_at timestamptz, -- When the overall approval reached approved/rejected/cancelled
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.approvals IS 'Stores overall approval requests for entities like milestones or documents.';
COMMENT ON COLUMN public.approvals.entity_type IS 'The type of entity requiring approval.';
COMMENT ON COLUMN public.approvals.entity_id IS 'The ID of the specific entity instance requiring approval.';
COMMENT ON COLUMN public.approvals.status IS 'The overall status of the approval request.';

-- Indexes
CREATE INDEX idx_approvals_entity ON public.approvals(entity_type, entity_id);
CREATE INDEX idx_approvals_status ON public.approvals(status);
CREATE INDEX idx_approvals_requested_by ON public.approvals(requested_by_user_id);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- 2. Create approval_steps table
CREATE TABLE public.approval_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id uuid NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
    approver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- User required to approve this step
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')) DEFAULT 'pending',
    comments text, -- Optional comments from the approver
    actioned_at timestamptz, -- When this specific step was actioned
    "order" integer NOT NULL DEFAULT 0, -- For sequential approvals if needed
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
    -- UNIQUE constraint might be needed depending on workflow (e.g., UNIQUE(approval_id, approver_user_id) or UNIQUE(approval_id, order))
);

COMMENT ON TABLE public.approval_steps IS 'Stores individual steps or required approvers for an approval request.';
COMMENT ON COLUMN public.approval_steps.approver_user_id IS 'The user responsible for actioning this step.';
COMMENT ON COLUMN public.approval_steps.status IS 'The status of this specific approval step.';
COMMENT ON COLUMN public.approval_steps.actioned_at IS 'Timestamp when the approver took action (approved/rejected).';
COMMENT ON COLUMN public.approval_steps."order" IS 'Order for sequential approval steps.';

-- Indexes
CREATE INDEX idx_approval_steps_approval_id ON public.approval_steps(approval_id);
CREATE INDEX idx_approval_steps_approver_user_id ON public.approval_steps(approver_user_id);
CREATE INDEX idx_approval_steps_status ON public.approval_steps(status);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.approval_steps
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- 3. Add approval_id FK to milestones (if not already added by previous migration)
ALTER TABLE public.milestones
ADD COLUMN IF NOT EXISTS approval_id uuid REFERENCES public.approvals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_milestones_approval_id ON public.milestones(approval_id);

-- 4. Enable RLS (Policies TBD - depends on specific access requirements)
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps FORCE ROW LEVEL SECURITY;

-- Basic RLS Policies (Example - Refine as needed)
CREATE POLICY "Allow SELECT on Approvals for involved users/staff" ON public.approvals FOR SELECT USING (
    auth.role() = 'authenticated' AND (
        is_staff_user(auth.uid()) OR
        requested_by_user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM approval_steps WHERE approval_id = approvals.id AND approver_user_id = auth.uid()) OR
        -- Check access via related entity (e.g., project member for milestone approval)
        (entity_type = 'milestone' AND EXISTS (SELECT 1 FROM milestones m JOIN projects p ON m.project_id = p.id WHERE m.id = approvals.entity_id AND is_member_of_company(auth.uid(), p.company_id)))
        -- Add checks for other entity_types
    )
);
CREATE POLICY "Allow SELECT on Approval Steps for involved users/staff" ON public.approval_steps FOR SELECT USING (
    auth.role() = 'authenticated' AND (
        is_staff_user(auth.uid()) OR
        approver_user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM approvals WHERE id = approval_steps.approval_id AND requested_by_user_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM approvals a JOIN milestones m ON a.entity_id = m.id JOIN projects p ON m.project_id = p.id WHERE a.id = approval_steps.approval_id AND a.entity_type = 'milestone' AND is_member_of_company(auth.uid(), p.company_id))
        -- Add checks for other entity_types
    )
);
-- INSERT/UPDATE/DELETE policies need careful definition based on workflow rules.
CREATE POLICY "Allow Staff to Manage Approvals" ON public.approvals FOR ALL USING (is_staff_user(auth.uid()));
CREATE POLICY "Allow Staff/Approvers to Manage Steps" ON public.approval_steps FOR ALL USING (is_staff_user(auth.uid()) OR approver_user_id = auth.uid());
