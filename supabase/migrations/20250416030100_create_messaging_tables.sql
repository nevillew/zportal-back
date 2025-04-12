-- Migration to create tables for in-app messaging

-- 1. Create conversations table
CREATE TABLE public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    topic text, -- Optional topic/subject for the conversation
    -- Optional links to other entities (e.g., a conversation about a specific project/task)
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
    company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE, -- Denormalized company context
    last_message_at timestamptz, -- Timestamp of the last message for sorting
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversations IS 'Represents a messaging thread between users.';
COMMENT ON COLUMN public.conversations.topic IS 'Optional subject or topic of the conversation.';
COMMENT ON COLUMN public.conversations.company_id IS 'Denormalized company context, derived from project or participants.';
COMMENT ON COLUMN public.conversations.last_message_at IS 'Timestamp of the most recent message in the conversation.';

-- Indexes
CREATE INDEX idx_conversations_project_id ON public.conversations(project_id);
CREATE INDEX idx_conversations_task_id ON public.conversations(task_id);
CREATE INDEX idx_conversations_company_id ON public.conversations(company_id);
CREATE INDEX idx_conversations_last_message_at ON public.conversations(last_message_at);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);


-- 2. Create conversation_participants table (Junction)
CREATE TABLE public.conversation_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now(),
    last_read_at timestamptz, -- Track when the user last read messages in this conversation

    CONSTRAINT unique_conversation_user UNIQUE (conversation_id, user_id)
);

COMMENT ON TABLE public.conversation_participants IS 'Links users to conversations they are part of.';
COMMENT ON COLUMN public.conversation_participants.last_read_at IS 'Timestamp indicating when the user last viewed messages in this conversation.';

-- Indexes
CREATE INDEX idx_conversation_participants_conversation_id ON public.conversation_participants(conversation_id);
CREATE INDEX idx_conversation_participants_user_id ON public.conversation_participants(user_id);


-- 3. Create messages table
CREATE TABLE public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Nullable if system messages allowed
    content text NOT NULL CHECK (length(content) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now() -- For potential edits
);

COMMENT ON TABLE public.messages IS 'Stores individual messages within a conversation.';
COMMENT ON COLUMN public.messages.sender_user_id IS 'The user who sent the message (null for system messages).';

-- Indexes
CREATE INDEX idx_messages_conversation_id_created_at ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_sender_user_id ON public.messages(sender_user_id);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Trigger to update conversation's last_message_at and potentially company_id
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER AS $$
DECLARE
    v_company_id uuid;
BEGIN
    -- Update last_message_at on the conversation
    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        updated_at = now() -- Also update conversation updated_at
    WHERE id = NEW.conversation_id;

    -- Attempt to set company_id on conversation if not already set (based on sender)
    -- This is a simple approach; might need refinement based on how conversations are initiated.
    IF (SELECT company_id FROM public.conversations WHERE id = NEW.conversation_id) IS NULL AND NEW.sender_user_id IS NOT NULL THEN
        SELECT company_id INTO v_company_id
        FROM public.company_users
        WHERE user_id = NEW.sender_user_id
        LIMIT 1; -- Assume user is primarily in one company for this context

        IF v_company_id IS NOT NULL THEN
            UPDATE public.conversations
            SET company_id = v_company_id
            WHERE id = NEW.conversation_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER message_updates_conversation_trigger
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();

COMMENT ON TRIGGER message_updates_conversation_trigger ON public.messages IS 'Updates the parent conversation''s last_message_at timestamp and potentially company_id upon new message insertion.';


-- 4. Enable RLS for messaging tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

-- Helper function to check if user is a participant in a conversation
CREATE OR REPLACE FUNCTION is_conversation_participant(p_user_id uuid, p_conversation_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = p_conversation_id AND cp.user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;

-- RLS Policies for 'conversations'
CREATE POLICY "Allow SELECT for participants or staff"
ON public.conversations FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        is_conversation_participant(auth.uid(), id)
    )
);

CREATE POLICY "Allow INSERT for authenticated users" -- Creating a conversation implies adding self as participant
ON public.conversations FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow UPDATE for participants or staff (e.g., topic)"
ON public.conversations FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        is_conversation_participant(auth.uid(), id)
    )
)
WITH CHECK (
    is_staff_user(auth.uid()) OR
    is_conversation_participant(auth.uid(), id)
);

CREATE POLICY "Allow DELETE for staff only" -- Or potentially conversation creator/admin?
ON public.conversations FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid())
);

-- RLS Policies for 'conversation_participants'
CREATE POLICY "Allow SELECT for participants or staff"
ON public.conversation_participants FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        user_id = auth.uid() OR -- Can see own participation record
        is_conversation_participant(auth.uid(), conversation_id) -- Can see other participants in own conversations
    )
);

CREATE POLICY "Allow INSERT for participants adding others (or self)"
ON public.conversation_participants FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    (
        -- Allow adding self if creating conversation
        user_id = auth.uid() OR
        -- Allow existing participants to add others
        is_conversation_participant(auth.uid(), conversation_id)
    )
);

CREATE POLICY "Allow UPDATE for user updating own read status"
ON public.conversation_participants FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
    -- Potentially restrict updates only to last_read_at
);

CREATE POLICY "Allow DELETE for participants removing self or staff removing anyone"
ON public.conversation_participants FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        user_id = auth.uid() -- Allow users to leave conversations
        -- OR is_conversation_participant(auth.uid(), conversation_id) -- Allow participants to remove others? Needs careful consideration.
    )
);

-- RLS Policies for 'messages'
CREATE POLICY "Allow SELECT for participants or staff"
ON public.messages FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        is_conversation_participant(auth.uid(), conversation_id)
    )
);

CREATE POLICY "Allow INSERT for participants"
ON public.messages FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    sender_user_id = auth.uid() AND -- Must send as self
    is_conversation_participant(auth.uid(), conversation_id) -- Must be participant
);

CREATE POLICY "Allow UPDATE for sender or staff"
ON public.messages FOR UPDATE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        sender_user_id = auth.uid()
    )
)
WITH CHECK (
    sender_user_id = auth.uid() -- Only sender can update own message content
    -- Staff might only be allowed to moderate, not change content? Requires more complex logic if so.
);

CREATE POLICY "Allow DELETE for sender or staff"
ON public.messages FOR DELETE
USING (
    auth.role() = 'authenticated' AND
    (
        is_staff_user(auth.uid()) OR
        sender_user_id = auth.uid()
    )
);

-- Apply audit triggers if desired
-- CREATE TRIGGER conversations_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON conversations FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
-- CREATE TRIGGER messages_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON messages FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
-- CREATE TRIGGER conversation_participants_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON conversation_participants FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
