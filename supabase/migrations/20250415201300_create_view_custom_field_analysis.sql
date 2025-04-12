-- Migration to create the view_custom_field_analysis view

CREATE OR REPLACE VIEW public.view_custom_field_analysis AS
SELECT
    cfv.id AS value_id,
    cfv.definition_id,
    cfd.name AS field_name,
    cfd.label AS field_label,
    cfd.entity_type,
    cfd.field_type,
    cfv.entity_id,
    cfv.value,
    -- Attempt to link to parent entity name/company for context
    CASE cfd.entity_type
        WHEN 'project' THEN (SELECT p.name FROM public.projects p WHERE p.id = cfv.entity_id)
        WHEN 'task' THEN (SELECT t.name FROM public.tasks t WHERE t.id = cfv.entity_id)
        WHEN 'company' THEN (SELECT c.name FROM public.companies c WHERE c.id = cfv.entity_id)
        WHEN 'user' THEN (SELECT up.full_name FROM public.user_profiles up WHERE up.user_id = cfv.entity_id)
        WHEN 'document' THEN (SELECT d.name FROM public.documents d WHERE d.id = cfv.entity_id)
        ELSE NULL
    END AS entity_name,
    CASE cfd.entity_type
        WHEN 'project' THEN (SELECT p.company_id FROM public.projects p WHERE p.id = cfv.entity_id)
        WHEN 'task' THEN (SELECT p.company_id FROM public.tasks t JOIN public.sections s ON t.section_id = s.id JOIN public.projects p ON s.project_id = p.id WHERE t.id = cfv.entity_id)
        WHEN 'company' THEN cfv.entity_id
        WHEN 'user' THEN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = cfv.entity_id LIMIT 1) -- May not be unique if user in multiple companies
        WHEN 'document' THEN (SELECT COALESCE(d.company_id, p.company_id) FROM public.documents d LEFT JOIN public.projects p ON d.project_id = p.id WHERE d.id = cfv.entity_id)
        ELSE NULL
    END AS associated_company_id,
    cfv.created_at,
    cfv.updated_at
FROM
    public.custom_field_values cfv
JOIN
    public.custom_field_definitions cfd ON cfv.definition_id = cfd.id;

COMMENT ON VIEW public.view_custom_field_analysis IS 'Provides a denormalized view of custom field values linked to their definitions and parent entities for analysis.';
