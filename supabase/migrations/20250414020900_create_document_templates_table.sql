-- Create table for simple document content templates
CREATE TABLE public.document_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE CHECK (length(name) > 0 AND length(name) <= 100),
    description text,
    type text NOT NULL CHECK (type IN ('solution', 'support', 'guide', 'project_plan', 'SOW', 'kb_article')), -- Should match document types
    default_content text, -- The template content (e.g., Markdown)
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_templates IS 'Stores templates for pre-populating document page content.';
COMMENT ON COLUMN public.document_templates.type IS 'The type of document this template is intended for.';
COMMENT ON COLUMN public.document_templates.default_content IS 'The default Markdown or text content for the template.';

-- Indexes
CREATE INDEX idx_document_templates_type ON public.document_templates(type);
CREATE INDEX idx_document_templates_is_active ON public.document_templates(is_active);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Enable RLS (Restrict management to staff)
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage document templates" ON public.document_templates
    FOR ALL USING (is_staff_user(auth.uid())) WITH CHECK (is_staff_user(auth.uid()));
CREATE POLICY "Allow authenticated users to read active templates" ON public.document_templates
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);
