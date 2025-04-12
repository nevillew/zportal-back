-- Enable RLS for the custom_field_values table
ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

-- Helper function to check if a user can manage a specific entity type based on its ID
-- This simplifies the main RLS policies.
-- Note: This function needs careful testing and refinement based on exact permission needs.
CREATE OR REPLACE FUNCTION can_manage_entity_for_custom_field(
    p_user_id uuid,
    p_entity_type text, -- e.g., 'company', 'project', 'task'
    p_entity_id uuid
)
RETURNS boolean AS $$
DECLARE
    v_company_id uuid;
    v_project_id uuid;
    v_permission_key text;
BEGIN
    IF p_entity_type = 'company' THEN
        -- Check if user is member and has company management permission
        RETURN is_member_of_company(p_user_id, p_entity_id) AND has_permission(p_user_id, p_entity_id, 'admin:manage_company_settings'); -- Adjust permission key as needed
    ELSIF p_entity_type = 'project' THEN
        -- Get company_id for the project
        SELECT company_id INTO v_company_id FROM projects WHERE id = p_entity_id;
        -- Check if user is member and has project management permission
        RETURN is_member_of_company(p_user_id, v_company_id) AND has_permission(p_user_id, v_company_id, 'project:edit'); -- Adjust permission key
    ELSIF p_entity_type = 'task' THEN
        -- Get project_id, then company_id for the task
        SELECT s.project_id INTO v_project_id FROM tasks t JOIN sections s ON t.section_id = s.id WHERE t.id = p_entity_id;
        SELECT company_id INTO v_company_id FROM projects WHERE id = v_project_id;
        -- Check if user is member and has task management permission
        RETURN is_member_of_company(p_user_id, v_company_id) AND has_permission(p_user_id, v_company_id, 'task:manage'); -- Adjust permission key
    ELSIF p_entity_type = 'user' THEN
        -- Users can manage their own custom fields, or staff can manage any
        RETURN p_user_id = p_entity_id; -- Check if the user is managing their own profile fields
    ELSIF p_entity_type = 'document' THEN
        -- Get project_id or company_id for the document
        SELECT project_id, company_id INTO v_project_id, v_company_id FROM documents WHERE id = p_entity_id;
        IF v_project_id IS NOT NULL THEN
             SELECT company_id INTO v_company_id FROM projects WHERE id = v_project_id;
        END IF;
        -- Check if user is member and has document management permission
        RETURN is_member_of_company(p_user_id, v_company_id) AND has_permission(p_user_id, v_company_id, 'document:manage'); -- Adjust permission key
    -- Add similar checks for meeting, risk, issue based on their parent project/company and required permissions
    -- ELSIF p_entity_type = 'meeting' THEN ...
    -- ELSIF p_entity_type = 'risk' THEN ...
    -- ELSIF p_entity_type = 'issue' THEN ...
    ELSE
        RETURN false; -- Unknown entity type
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Policies for 'custom_field_values' table

-- Allow SELECT access if user is staff or can view the parent entity
CREATE POLICY "Allow SELECT based on parent entity access"
ON public.custom_field_values
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        -- Check access based on the specific parent entity
        (company_id IS NOT NULL AND is_member_of_company(auth.uid(), company_id)) OR
        (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.id = custom_field_values.project_id AND is_member_of_company(auth.uid(), p.company_id))) OR
        (task_id IS NOT NULL AND EXISTS (SELECT 1 FROM tasks t JOIN sections s ON t.section_id = s.id JOIN projects p ON s.project_id = p.id WHERE t.id = custom_field_values.task_id AND is_member_of_company(auth.uid(), p.company_id))) OR
        (user_id IS NOT NULL AND user_id = auth.uid()) OR -- Users can see their own profile custom fields
        (document_id IS NOT NULL AND EXISTS (SELECT 1 FROM documents d LEFT JOIN projects p ON d.project_id = p.id WHERE d.id = custom_field_values.document_id AND is_member_of_company(auth.uid(), COALESCE(d.company_id, p.company_id))))
        -- Add similar EXISTS checks for meeting, risk, issue based on their parent project/company access
    )
);

-- Allow INSERT/UPDATE/DELETE if user is staff or can manage the parent entity
CREATE POLICY "Allow modification based on parent entity management"
ON public.custom_field_values
FOR ALL -- Covers INSERT, UPDATE, DELETE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        -- Check management permission based on the specific parent entity
        (company_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'company', company_id)) OR
        (project_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'project', project_id)) OR
        (task_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'task', task_id)) OR
        (user_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'user', user_id)) OR
        (document_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'document', document_id))
        -- Add similar checks for meeting, risk, issue
    )
)
WITH CHECK (
    -- Re-check permission for the row being modified/inserted
    is_staff_user(auth.uid()) OR
    (company_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'company', company_id)) OR
    (project_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'project', project_id)) OR
    (task_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'task', task_id)) OR
    (user_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'user', user_id)) OR
    (document_id IS NOT NULL AND can_manage_entity_for_custom_field(auth.uid(), 'document', document_id))
    -- Add similar checks for meeting, risk, issue
);


-- Comments on policies
COMMENT ON FUNCTION can_manage_entity_for_custom_field IS 'Helper function for custom_field_values RLS to check if a user can manage the parent entity.';
COMMENT ON POLICY "Allow SELECT based on parent entity access" ON public.custom_field_values IS 'Allows users to view custom field values if they can view the associated company, project, task, etc., or if they are staff.';
COMMENT ON POLICY "Allow modification based on parent entity management" ON public.custom_field_values IS 'Allows users to insert, update, or delete custom field values if they have management permissions on the associated entity, or if they are staff.';
