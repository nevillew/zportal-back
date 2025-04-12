-- Migration to create the view_document_usage view

CREATE OR REPLACE VIEW public.view_document_usage AS
SELECT
    d.id AS document_id,
    d.name AS document_name,
    d.type AS document_type,
    d.project_id,
    p.name AS project_name,
    d.company_id,
    c.name AS company_name,
    d.created_at AS document_created_at,
    d.updated_at AS document_updated_at,
    (SELECT COUNT(*) FROM public.pages pg WHERE pg.document_id = d.id) AS page_count,
    (SELECT COUNT(*) FROM public.document_comments dc JOIN public.pages pg ON dc.page_id = pg.id WHERE pg.document_id = d.id) AS comment_count,
    (SELECT MAX(dc.created_at) FROM public.document_comments dc JOIN public.pages pg ON dc.page_id = pg.id WHERE pg.document_id = d.id) AS last_comment_at
    -- Note: Actual 'views' or 'reads' would require tracking in audit_logs or a dedicated table.
FROM
    public.documents d
LEFT JOIN
    public.projects p ON d.project_id = p.id
LEFT JOIN
    public.companies c ON d.company_id = c.id OR p.company_id = c.id;

COMMENT ON VIEW public.view_document_usage IS 'Provides usage statistics for documents, such as page count, comment count, and last activity.';
