-- Migration to create the create_conversation RPC function for transactional conversation creation

CREATE OR REPLACE FUNCTION public.create_conversation(
    p_topic text,
    p_project_id uuid,
    p_task_id uuid,
    p_participant_ids uuid[], -- Array of user IDs to include (creator should be in this list)
    p_creator_id uuid -- The user initiating the creation
)
RETURNS uuid -- Returns the ID of the newly created conversation
LANGUAGE plpgsql
VOLATILE -- Modifies the database
SECURITY DEFINER -- To insert into conversations and participants
SET search_path = public, extensions
AS $$
DECLARE
    v_new_conversation_id uuid;
    v_company_id uuid;
    v_participant_id uuid;
BEGIN
    -- Basic validation
    IF p_creator_id IS NULL OR array_length(p_participant_ids, 1) IS NULL OR array_position(p_participant_ids, p_creator_id) IS NULL THEN
        RAISE EXCEPTION 'Creator ID and participant list (including creator) are required.';
    END IF;

    -- Determine company context (optional, could be derived from project/task or participants)
    -- For simplicity, we'll try to derive from project first, then task, then leave null for now.
    IF p_project_id IS NOT NULL THEN
        SELECT company_id INTO v_company_id FROM public.projects WHERE id = p_project_id;
    ELSIF p_task_id IS NOT NULL THEN
        SELECT p.company_id INTO v_company_id
        FROM public.tasks t
        JOIN public.sections s ON t.section_id = s.id
        JOIN public.projects p ON s.project_id = p.id
        WHERE t.id = p_task_id;
    END IF;

    -- *** BEGIN TRANSACTION (Implicit in PL/pgSQL function) ***

    -- 1. Create Conversation
    INSERT INTO public.conversations (topic, project_id, task_id, company_id, last_message_at)
    VALUES (p_topic, p_project_id, p_task_id, v_company_id, now()) -- Set last_message_at initially
    RETURNING id INTO v_new_conversation_id;

    -- 2. Add Participants
    FOREACH v_participant_id IN ARRAY p_participant_ids
    LOOP
        -- Check if participant exists (optional, depends on how IDs are validated before calling)
        -- IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_participant_id) THEN
        --     RAISE WARNING 'Participant user ID % not found, skipping.', v_participant_id;
        --     CONTINUE;
        -- END IF;

        INSERT INTO public.conversation_participants (conversation_id, user_id)
        VALUES (v_new_conversation_id, v_participant_id);
    END LOOP;

    -- *** END TRANSACTION (Commit happens automatically on success) ***

    RETURN v_new_conversation_id;

EXCEPTION
    WHEN others THEN
        RAISE WARNING 'Error creating conversation: %', SQLERRM;
        RAISE; -- Re-raise the exception to ensure transaction rollback
END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.create_conversation(text, uuid, uuid, uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.create_conversation(text, uuid, uuid, uuid[], uuid) IS 'Creates a new conversation and adds initial participants within a single transaction.';
