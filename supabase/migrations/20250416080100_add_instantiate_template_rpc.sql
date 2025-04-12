-- Migration to create the instantiate_template_rpc function

-- Helper function (reusable from instantiate-project-template Edge Function logic)
-- This is a simplified version for SQL. More complex placeholder logic might remain in Edge Function or require advanced SQL string manipulation.
-- For now, we assume simple key replacement based on provided JSON.
CREATE OR REPLACE FUNCTION resolve_sql_placeholders(
    template_text text,
    placeholder_values jsonb
)
RETURNS text AS $$
DECLARE
    placeholder_key text;
    placeholder_value text;
BEGIN
    IF template_text IS NULL OR placeholder_values IS NULL OR jsonb_typeof(placeholder_values) != 'object' THEN
        RETURN template_text;
    END IF;

    FOR placeholder_key, placeholder_value IN SELECT key, value::text FROM jsonb_each_text(placeholder_values) LOOP
        -- Basic replacement: {{key}} -> value
        -- Use replace function, ensuring key is properly formatted for replacement
        template_text := replace(template_text, '{{' || placeholder_key || '}}', placeholder_value);
    END LOOP;

    -- Remove any remaining unresolved placeholders (optional)
    -- template_text := regexp_replace(template_text, '\{\{.*?\}\}', '', 'g');

    RETURN template_text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Main RPC function for instantiating a template
CREATE OR REPLACE FUNCTION public.instantiate_template_rpc(
    p_template_version_id uuid,
    p_target_company_id uuid,
    p_new_project_name text,
    p_placeholder_values jsonb DEFAULT '{}'::jsonb,
    p_project_owner_id uuid DEFAULT NULL,
    p_requesting_user_id uuid DEFAULT auth.uid() -- User performing the action
)
RETURNS uuid -- Returns the ID of the newly created project
LANGUAGE plpgsql
VOLATILE -- Modifies the database
SECURITY DEFINER -- To perform multiple inserts across tables
SET search_path = public, extensions
AS $$
DECLARE
    v_new_project_id uuid;
    v_template_version RECORD;
    v_company_data RECORD;
    v_section_template RECORD;
    v_task_template RECORD;
    v_resolved_section_name text;
    v_resolved_task_name text;
    v_resolved_task_description text;
    v_new_section_id uuid;
    v_new_task_id uuid;
    v_custom_field_values_to_insert jsonb[] := ARRAY[]::jsonb[]; -- Array to collect CF values
BEGIN
    -- Basic input validation (can add more checks)
    IF p_template_version_id IS NULL OR p_target_company_id IS NULL OR p_new_project_name IS NULL THEN
        RAISE EXCEPTION 'Template Version ID, Target Company ID, and New Project Name are required.';
    END IF;

    -- Permission Check (redundant if Edge Function checks, but good practice)
    -- User needs 'project:create' permission for the target company OR be staff
    IF NOT is_staff_user(p_requesting_user_id) AND
       NOT has_permission(p_requesting_user_id, p_target_company_id, 'project:create') THEN
        RAISE EXCEPTION 'User % does not have permission to create projects in company %', p_requesting_user_id, p_target_company_id;
    END IF;

    -- Fetch Template Version (needed for validation/context, though not directly used for placeholders here)
    SELECT * INTO v_template_version FROM public.project_template_versions WHERE id = p_template_version_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template Version % not found.', p_template_version_id;
    END IF;

    -- Fetch Company Data (needed for validation/context)
    SELECT * INTO v_company_data FROM public.companies WHERE id = p_target_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target Company % not found.', p_target_company_id;
    END IF;

    -- *** BEGIN TRANSACTION LOGIC ***
    -- (Implicit transaction in PL/pgSQL function unless EXCEPTION is caught and handled)

    -- 1. Create Project Record
    RAISE NOTICE 'Creating project record...';
    INSERT INTO public.projects (
        name, company_id, project_template_version_id, project_owner_id,
        status, stage, health_status
    )
    VALUES (
        p_new_project_name, -- Using the provided name directly
        p_target_company_id,
        p_template_version_id,
        p_project_owner_id,
        'Planning', 'Kick-off', 'Unknown' -- Default values
    )
    RETURNING id INTO v_new_project_id;
    RAISE NOTICE ' -> Project created with ID: %', v_new_project_id;

    -- 2. Loop through Section Templates and create Sections
    RAISE NOTICE 'Creating sections...';
    FOR v_section_template IN
        SELECT * FROM public.section_templates
        WHERE project_template_version_id = p_template_version_id
        ORDER BY "order" ASC
    LOOP
        -- Resolve placeholders (simple version)
        v_resolved_section_name := resolve_sql_placeholders(v_section_template.name, p_placeholder_values);

        INSERT INTO public.sections (
            project_id, section_template_id, name, type, "order", is_public, status
        )
        VALUES (
            v_new_project_id, v_section_template.id, v_resolved_section_name,
            v_section_template.type, v_section_template."order", v_section_template.is_public,
            'Not Started' -- Default status
        )
        RETURNING id INTO v_new_section_id;
        RAISE NOTICE '  -> Section "%" created with ID: %', v_resolved_section_name, v_new_section_id;

        -- 3. Loop through Task Templates for this Section and create Tasks
        FOR v_task_template IN
            SELECT * FROM public.task_templates
            WHERE section_template_id = v_section_template.id
            ORDER BY "order" ASC
        LOOP
            v_resolved_task_name := resolve_sql_placeholders(v_task_template.name, p_placeholder_values);
            v_resolved_task_description := resolve_sql_placeholders(v_task_template.description, p_placeholder_values);

            INSERT INTO public.tasks (
                section_id, task_template_id, name, description, "order", status,
                is_self_service, estimated_effort_hours, condition
            )
            VALUES (
                v_new_section_id, v_task_template.id, v_resolved_task_name, v_resolved_task_description,
                v_task_template."order", 'Open', v_task_template.is_self_service,
                v_task_template.estimated_effort_hours, v_task_template.condition_template
            )
            RETURNING id INTO v_new_task_id;
            RAISE NOTICE '    -> Task "%" created with ID: %', v_resolved_task_name, v_new_task_id;

            -- Collect custom field values to insert later
            IF v_task_template.custom_field_template_values IS NOT NULL THEN
                DECLARE
                    cf_def_id uuid;
                    cf_value jsonb;
                BEGIN
                    FOR cf_def_id, cf_value IN SELECT key::uuid, value FROM jsonb_each(v_task_template.custom_field_template_values) LOOP
                        v_custom_field_values_to_insert := array_append(v_custom_field_values_to_insert, jsonb_build_object(
                            'definition_id', cf_def_id,
                            'entity_id', v_new_task_id,
                            'value', cf_value
                        ));
                    END LOOP;
                END;
            END IF;

        END LOOP; -- End Task Template Loop
    END LOOP; -- End Section Template Loop

    -- 4. Bulk Insert Task Custom Field Values
    IF array_length(v_custom_field_values_to_insert, 1) > 0 THEN
        RAISE NOTICE 'Inserting % task custom field values...', array_length(v_custom_field_values_to_insert, 1);
        INSERT INTO public.custom_field_values (definition_id, entity_id, value)
        SELECT
            (elem->>'definition_id')::uuid,
            (elem->>'entity_id')::uuid,
            elem->'value'
        FROM unnest(v_custom_field_values_to_insert) elem;
        RAISE NOTICE ' -> Custom field values inserted.';
    END IF;

    -- *** END TRANSACTION LOGIC ***
    -- (Commit happens automatically on successful function exit)

    RAISE NOTICE 'Project instantiation complete. New project ID: %', v_new_project_id;
    RETURN v_new_project_id;

EXCEPTION
    WHEN others THEN
        -- Log the error (optional but recommended)
        RAISE WARNING 'Project instantiation failed for template %: %', p_template_version_id, SQLERRM;
        -- Re-raise the exception to ensure transaction rollback
        RAISE;
END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.instantiate_template_rpc(uuid, uuid, text, jsonb, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.instantiate_template_rpc(uuid, uuid, text, jsonb, uuid, uuid) IS 'Creates a new project from a template version, including sections, tasks, and custom fields, within a transaction.';
COMMENT ON FUNCTION public.resolve_sql_placeholders(text, jsonb) IS 'Helper to perform simple placeholder replacement in text using a JSONB object of key-value pairs.';
