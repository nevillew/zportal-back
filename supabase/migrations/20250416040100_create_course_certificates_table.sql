-- Migration to create the course_certificates table and RLS policies

-- 1. Create course_certificates table
CREATE TABLE public.course_certificates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, -- Context for the completion
    certificate_url text NOT NULL, -- Path/URL in Supabase Storage
    issued_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_user_course_company_certificate UNIQUE (user_id, course_id, company_id)
);

-- Add comments
COMMENT ON TABLE public.course_certificates IS 'Stores generated certificates for course completions.';
COMMENT ON COLUMN public.course_certificates.company_id IS 'The company context in which the course was completed.';
COMMENT ON COLUMN public.course_certificates.certificate_url IS 'Path or URL to the certificate file in storage.';
COMMENT ON COLUMN public.course_certificates.issued_at IS 'Timestamp when the certificate was generated/issued.';

-- Add indexes
CREATE INDEX idx_course_certificates_user_id ON public.course_certificates(user_id);
CREATE INDEX idx_course_certificates_course_id ON public.course_certificates(course_id);
CREATE INDEX idx_course_certificates_company_id ON public.course_certificates(company_id);

-- Enable RLS
ALTER TABLE public.course_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_certificates FORCE ROW LEVEL SECURITY;

-- RLS Policies for course_certificates
CREATE POLICY "Allow SELECT for owning user or staff/managers"
ON public.course_certificates
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        user_id = auth.uid() OR -- User can see their own certificates
        is_staff_user(auth.uid()) OR -- Staff can see all
        (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'training:view_reports')) -- Managers can see company certs
    )
);

-- Disallow direct INSERT/UPDATE/DELETE by authenticated users
-- Certificates are created by the backend function. Deletion might be handled by staff/retention policies.
CREATE POLICY "Disallow direct INSERT" ON public.course_certificates FOR INSERT WITH CHECK (false);
CREATE POLICY "Disallow direct UPDATE" ON public.course_certificates FOR UPDATE USING (false);
CREATE POLICY "Allow DELETE for staff users only" ON public.course_certificates FOR DELETE USING (is_staff_user(auth.uid()));

-- Apply audit trigger if desired
-- CREATE TRIGGER course_certificates_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON course_certificates FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
