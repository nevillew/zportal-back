-- Create table to store rules for automatic training assignment
CREATE TABLE public.training_assignment_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE, -- Nullable for global rules
    role_name text REFERENCES public.roles(role_name) ON DELETE CASCADE, -- Role to target (nullable if targeting all in company?)
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE, -- Course to assign
    is_active boolean NOT NULL DEFAULT true, -- Whether the rule is currently active
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_assignment_rule UNIQUE (company_id, role_name, course_id) -- Prevent duplicate rules
);

COMMENT ON TABLE public.training_assignment_rules IS 'Defines rules for automatically assigning training courses based on company and/or role.';
COMMENT ON COLUMN public.training_assignment_rules.company_id IS 'Target company for the rule. NULL means applies globally (if role specified).';
COMMENT ON COLUMN public.training_assignment_rules.role_name IS 'Target role for the rule. NULL means applies to all roles in the target company (if company specified).';
COMMENT ON COLUMN public.training_assignment_rules.course_id IS 'The training course to be assigned.';

-- Indexes
CREATE INDEX idx_training_assignment_rules_company_id ON public.training_assignment_rules(company_id);
CREATE INDEX idx_training_assignment_rules_role_name ON public.training_assignment_rules(role_name);
CREATE INDEX idx_training_assignment_rules_course_id ON public.training_assignment_rules(course_id);
CREATE INDEX idx_training_assignment_rules_is_active ON public.training_assignment_rules(is_active);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.training_assignment_rules
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Enable RLS (Restrict management to staff)
ALTER TABLE public.training_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_assignment_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage assignment rules" ON public.training_assignment_rules
    FOR ALL USING (is_staff_user(auth.uid())) WITH CHECK (is_staff_user(auth.uid()));
CREATE POLICY "Allow authenticated users to read active rules" ON public.training_assignment_rules
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);
