-- Migration to create the pages table and RLS policies

-- 1. Create pages table
CREATE TABLE public.pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
    "order" integer NOT NULL DEFAULT 0,
    content text, -- Stores main page content (e.g., Markdown, HTML)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE public.pages IS 'Stores individual pages within a document.';
COMMENT ON COLUMN public.pages.document_id IS 'The document this page belongs to.';
COMMENT ON COLUMN public.pages.name IS 'The title or name of the page.';
COMMENT ON COLUMN public.pages."order" IS 'The display order of the page within the document.';
COMMENT ON COLUMN public.pages.content IS 'The main content of the page (e.g., Markdown, HTML).';

-- Add indexes
CREATE INDEX idx_pages_document_id ON public.pages(document_id);
CREATE INDEX idx_pages_order ON public.pages("order");

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Enable RLS
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages FORCE ROW LEVEL SECURITY;

-- RLS Policies for pages
-- Inherit access based on the parent document's RLS policies

-- Helper function to check if user can access the parent document
CREATE OR REPLACE FUNCTION can_access_document(p_user_id uuid, p_document_id uuid)
RETURNS boolean AS $$
DECLARE
    v_company_id uuid;
    v_project_id uuid;
BEGIN
    -- Get document scope
    SELECT company_id, project_id INTO v_company_id, v_project_id
    FROM public.documents WHERE id = p_document_id;

    IF NOT FOUND THEN RETURN false; END IF; -- Document doesn't exist

    -- Check access based on scope
    RETURN (
        -- Global documents are visible to all authenticated users
        (v_company_id IS NULL AND v_project_id IS NULL AND auth.role() = 'authenticated')
        -- Company-scoped documents are visible to staff or members of that company
        OR (v_company_id IS NOT NULL AND v_project_id IS NULL AND (is_staff_user(p_user_id) OR is_member_of_company(p_user_id, v_company_id)))
        -- Project-scoped documents are visible to users who can access the project
        OR (v_project_id IS NOT NULL AND can_access_project(p_user_id, v_project_id))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.can_access_document(uuid, uuid) TO authenticated;

-- Helper function to check if user can manage the parent document
CREATE OR REPLACE FUNCTION can_manage_document(p_user_id uuid, p_document_id uuid)
RETURNS boolean AS $$
DECLARE
    v_company_id uuid;
    v_project_id uuid;
BEGIN
    -- Get document scope
    SELECT company_id, project_id INTO v_company_id, v_project_id
    FROM public.documents WHERE id = p_document_id;

    IF NOT FOUND THEN RETURN false; END IF; -- Document doesn't exist

    -- Check management permission based on scope
    RETURN (
        -- Staff can manage any scope
        is_staff_user(p_user_id)
        -- Or, members can manage company-scoped docs if they have permission in that company
        OR (v_company_id IS NOT NULL AND v_project_id IS NULL AND is_member_of_company(p_user_id, v_company_id) AND has_permission(p_user_id, v_company_id, 'document:edit')) -- Use edit perm for manage
        -- Or, members can manage project-scoped docs if they have permission in the project's company
        OR (v_project_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM projects p WHERE p.id = v_project_id AND is_member_of_company(p_user_id, p.company_id) AND has_permission(p_user_id, p.company_id, 'document:edit')
            ))
        -- Assuming only staff can manage global docs
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.can_manage_document(uuid, uuid) TO authenticated;


-- RLS Policies for 'pages' table
CREATE POLICY "Allow SELECT if user can access parent document"
ON public.pages
FOR SELECT
USING (
    can_access_document(auth.uid(), document_id)
);

CREATE POLICY "Allow INSERT if user can manage parent document"
ON public.pages
FOR INSERT
WITH CHECK (
    can_manage_document(auth.uid(), document_id)
);

CREATE POLICY "Allow UPDATE if user can manage parent document"
ON public.pages
FOR UPDATE
USING (
    can_manage_document(auth.uid(), document_id)
)
WITH CHECK (
    can_manage_document(auth.uid(), document_id)
);

CREATE POLICY "Allow DELETE if user can manage parent document"
ON public.pages
FOR DELETE
USING (
    can_manage_document(auth.uid(), document_id)
);

-- Apply audit trigger if desired
-- CREATE TRIGGER pages_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON pages FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
