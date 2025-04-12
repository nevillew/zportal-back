-- Function to clone a project and its associated data
CREATE OR REPLACE FUNCTION public.clone_project(
    source_project_id uuid,
    target_company_id uuid,
    new_project_name text
)
RETURNS uuid -- Returns the ID of the newly created project
LANGUAGE plpgsql
SECURITY DEFINER -- Executes with the privileges of the function owner. Ensure owner has necessary permissions.
-- Set search_path to ensure helper functions are found if needed (though not directly used here)
SET search_path = public, extensions
AS $$
DECLARE
    new_project_id uuid;
    v_source_project RECORD;
    section_id_map jsonb := '{}'::jsonb; -- Map old section ID -> new section ID
    task_id_map jsonb := '{}'::jsonb; -- Map old task ID -> new task ID
    old_section_id uuid;
    new_section_id uuid;
    old_task_id uuid;
    new_task_id uuid;
BEGIN
    -- Validate source project exists (optional, SELECT below handles it)
    SELECT * INTO v_source_project FROM public.projects WHERE id = source_project_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source project with ID % not found.', source_project_id;
    END IF;

    -- 1. Create the new project record
    INSERT INTO public.projects (
        company_id,
        project_template_version_id, -- Copy template link if desired
        name,
        status, -- Reset status/stage/health for the new project
        stage,
        health_status,
        project_owner_id -- Copy owner if desired, or set to NULL/current user
        -- created_at, updated_at will default
    )
    SELECT
        target_company_id,
        project_template_version_id,
        new_project_name,
        'Planning', -- Default status for cloned project
        'Kick-off', -- Default stage
        'Unknown',  -- Default health
        project_owner_id -- Copy original owner
    FROM public.projects
    WHERE id = source_project_id
    RETURNING projects.id INTO new_project_id;

    -- 2. Clone Sections and build section ID map
    RAISE NOTICE 'Cloning sections for new project %', new_project_id;
    FOR old_section_id, new_section_id IN
        INSERT INTO public.sections (
            project_id,
            section_template_id, -- Copy template link
            name,
            type,
            status, -- Reset status
            is_public,
            "order",
            percent_complete -- Reset progress
            -- created_at, updated_at will default
        )
        SELECT
            new_project_id,
            section_template_id,
            name,
            type,
            'Not Started', -- Default status
            is_public,
            "order",
            0 -- Default progress
        FROM public.sections
        WHERE project_id = source_project_id
        RETURNING id, id -- Returning new ID twice temporarily for the loop variable assignment
    LOOP
        -- Find the corresponding old section ID based on order and name (less reliable)
        -- A better approach is to return both old and new IDs if INSERT supported RETURNING old.*
        -- Workaround: Fetch old ID based on matching properties (assuming order/name combo is unique within source project)
        SELECT id INTO old_section_id
        FROM public.sections
        WHERE project_id = source_project_id
          AND "order" = (SELECT "order" FROM public.sections WHERE id = new_section_id)
          AND name = (SELECT name FROM public.sections WHERE id = new_section_id)
        LIMIT 1;

        IF old_section_id IS NOT NULL THEN
             section_id_map := section_id_map || jsonb_build_object(old_section_id::text, new_section_id);
             RAISE NOTICE ' Mapped old section % to new section %', old_section_id, new_section_id;
        ELSE
             RAISE WARNING ' Could not map old section ID for new section %', new_section_id;
        END IF;
    END LOOP;
    RAISE NOTICE 'Section ID Map: %', section_id_map;


    -- 3. Clone Tasks (including sub-tasks) and build task ID map
    --    This needs careful handling of parent_task_id and depends_on_task_id
    RAISE NOTICE 'Cloning tasks...';
    WITH cloned_tasks AS (
        INSERT INTO public.tasks (
            section_id,
            milestone_id, -- Milestones are project-specific, maybe set to NULL? Or map if cloning milestones too? Setting NULL for now.
            task_template_id, -- Copy template link
            parent_task_id, -- Placeholder, will be updated later
            recurring_definition_task_id, -- Placeholder, will be updated later
            name,
            description,
            status, -- Reset status
            priority,
            actual_hours, -- Reset actuals
            "order",
            due_date, -- Copy due date? Or offset? Copying for now.
            assigned_to_id, -- Copy assignee? Or set to NULL? Copying for now.
            depends_on_task_id, -- Placeholder, will be updated later
            condition,
            is_self_service,
            estimated_effort_hours,
            is_recurring_definition, -- Copy recurrence definition status
            recurrence_rule,
            recurrence_end_date,
            next_occurrence_date -- Copy next occurrence? Or recalculate? Copying for now.
            -- created_at, updated_at will default
        )
        SELECT
            (section_id_map->>(s.id::text))::uuid, -- Map to new section ID
            NULL, -- milestone_id set to NULL
            t.task_template_id,
            t.parent_task_id, -- Keep old ID temporarily
            t.recurring_definition_task_id, -- Keep old ID temporarily
            t.name,
            t.description,
            'Open', -- Default status
            t.priority,
            NULL, -- Reset actual_hours
            t."order",
            t.due_date,
            t.assigned_to_id,
            t.depends_on_task_id, -- Keep old ID temporarily
            t.condition,
            t.is_self_service,
            t.estimated_effort_hours,
            t.is_recurring_definition,
            t.recurrence_rule,
            t.recurrence_end_date,
            t.next_occurrence_date
        FROM public.tasks t
        JOIN public.sections s ON t.section_id = s.id
        WHERE s.project_id = source_project_id
        RETURNING t.id as old_id, id as new_id, parent_task_id as old_parent_id, depends_on_task_id as old_depends_on_id, recurring_definition_task_id as old_recurring_def_id
    )
    -- Build the task ID map from the CTE result
    SELECT jsonb_object_agg(old_id::text, new_id)
    INTO task_id_map
    FROM cloned_tasks;
    RAISE NOTICE 'Task ID Map: %', task_id_map;

    -- Update parent_task_id and depends_on_task_id using the map
    RAISE NOTICE 'Updating task relationships...';
    UPDATE public.tasks new_t
    SET
        parent_task_id = (task_id_map->>(old_t.parent_task_id::text))::uuid,
        depends_on_task_id = (task_id_map->>(old_t.depends_on_task_id::text))::uuid,
        -- Also update recurring definition link if it points within the cloned set
        recurring_definition_task_id = CASE
            WHEN old_t.recurring_definition_task_id IS NOT NULL AND task_id_map ? old_t.recurring_definition_task_id::text THEN
                (task_id_map->>(old_t.recurring_definition_task_id::text))::uuid
            ELSE
                NULL -- Set to NULL if original definition wasn't part of the clone (or wasn't set)
            END
    FROM public.tasks old_t
    WHERE new_t.id = (task_id_map->>(old_t.id::text))::uuid -- Match new task to old task
      AND old_t.section_id IN (SELECT id FROM public.sections WHERE project_id = source_project_id); -- Ensure we only process tasks from the source project


    -- 4. Clone Risks
    RAISE NOTICE 'Cloning risks...';
    INSERT INTO public.risks (
        project_id,
        description,
        reported_by_user_id, -- Copy reporter? Or set to current user? Copying for now.
        assigned_to_user_id, -- Copy assignee?
        status, -- Reset status? Copying for now.
        probability,
        impact,
        mitigation_plan,
        contingency_plan
        -- created_at, updated_at will default
    )
    SELECT
        new_project_id,
        description,
        reported_by_user_id,
        assigned_to_user_id,
        status,
        probability,
        impact,
        mitigation_plan,
        contingency_plan
    FROM public.risks
    WHERE project_id = source_project_id;

    -- 5. Clone Issues
    RAISE NOTICE 'Cloning issues...';
    INSERT INTO public.issues (
        project_id,
        description,
        reported_by_user_id, -- Copy reporter?
        assigned_to_user_id, -- Copy assignee?
        status, -- Reset status?
        priority,
        resolution, -- Reset resolution?
        related_risk_id -- This FK might be invalid if risks aren't cloned first/mapped. Setting NULL for now.
        -- created_at, updated_at will default
    )
    SELECT
        new_project_id,
        description,
        reported_by_user_id,
        assigned_to_user_id,
        'Open', -- Default status
        priority,
        NULL, -- Reset resolution
        NULL -- Set related_risk_id to NULL
    FROM public.issues
    WHERE project_id = source_project_id;

    -- 6. Clone Project-Scoped Documents (Optional - depends on requirements)
    --    This assumes documents have a project_id FK.
    --    Requires mapping old doc ID to new doc ID if pages/comments are also cloned.
    -- INSERT INTO public.documents (...) SELECT ... FROM public.documents WHERE project_id = source_project_id;
    -- INSERT INTO public.pages (...) SELECT ... FROM public.pages WHERE document_id IN (...old doc ids...);
    -- INSERT INTO public.document_comments (...) SELECT ... FROM public.document_comments WHERE page_id IN (...old page ids...);

    -- 7. Clone Custom Field Values (Project, Sections, Tasks)
    RAISE NOTICE 'Cloning custom field values...';
    -- Clone Project custom fields
    INSERT INTO public.custom_field_values (definition_id, entity_id, value)
    SELECT definition_id, new_project_id, value
    FROM public.custom_field_values cfv
    JOIN public.custom_field_definitions cfd ON cfv.definition_id = cfd.id
    WHERE cfv.entity_id = source_project_id AND cfd.entity_type = 'project';

    -- Clone Section custom fields
    INSERT INTO public.custom_field_values (definition_id, entity_id, value)
    SELECT
        cfv.definition_id,
        (section_id_map->>(cfv.entity_id::text))::uuid, -- Map to new section ID
        cfv.value
    FROM public.custom_field_values cfv
    JOIN public.custom_field_definitions cfd ON cfv.definition_id = cfd.id
    WHERE cfd.entity_type = 'section'
      AND section_id_map ? cfv.entity_id::text; -- Ensure the old section ID was mapped

    -- Clone Task custom fields
    INSERT INTO public.custom_field_values (definition_id, entity_id, value)
    SELECT
        cfv.definition_id,
        (task_id_map->>(cfv.entity_id::text))::uuid, -- Map to new task ID
        cfv.value
    FROM public.custom_field_values cfv
    JOIN public.custom_field_definitions cfd ON cfv.definition_id = cfd.id
    WHERE cfd.entity_type = 'task'
      AND task_id_map ? cfv.entity_id::text; -- Ensure the old task ID was mapped

    RAISE NOTICE 'Project cloning complete. New project ID: %', new_project_id;
    RETURN new_project_id;

END;
$$;

-- Grant execute permission to authenticated users
-- Note: Actual permission to execute should be controlled by the calling context (e.g., Edge Function checking 'project:create' permission).
GRANT EXECUTE ON FUNCTION public.clone_project(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.clone_project(uuid, uuid, text) IS 'Clones a project including its sections, tasks (preserving hierarchy/dependencies), risks, issues, and custom fields into a new project under a target company.';
