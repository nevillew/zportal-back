-- Migration to add mention processing trigger function and apply it

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.process_mentions_and_notify()
RETURNS TRIGGER AS $$
DECLARE
    mention_pattern text := '@([\w\s.-]+)'; -- Regex to find @ followed by word chars, whitespace, dot, hyphen
    matches text[];
    mention text;
    trimmed_mention text;
    mentioned_user_record record; -- Will hold id, email, slack_user_id
    notification_payload jsonb;
    notification_message text;
    notification_link text;
    v_function_url text := supabase_url() || '/functions/v1/send-notification'; -- Construct function URL
    v_internal_secret text;
    v_auth_header jsonb;
    v_response jsonb;
    v_notification_type text;
    v_recipients jsonb[];
BEGIN
    -- Determine entity type and ID based on the trigger table
    DECLARE
        v_entity_type text;
        v_entity_id uuid;
        v_entity_name text;
        v_project_id uuid;
    BEGIN
        IF TG_TABLE_NAME = 'task_comments' THEN
            v_entity_type := 'task';
            v_entity_id := NEW.task_id;
            SELECT name, s.project_id INTO v_entity_name, v_project_id FROM public.tasks t JOIN public.sections s ON t.section_id = s.id WHERE t.id = v_entity_id;
            notification_link := '/projects/' || v_project_id::text || '/tasks/' || v_entity_id::text || '?comment=' || NEW.id::text;
        ELSIF TG_TABLE_NAME = 'document_comments' THEN
            v_entity_type := 'document';
            v_entity_id := (SELECT document_id FROM public.pages WHERE id = NEW.page_id); -- Get document ID from page
            SELECT name, project_id INTO v_entity_name, v_project_id FROM public.documents WHERE id = v_entity_id;
            notification_link := '/documents/' || v_entity_id::text || '?page=' || NEW.page_id::text || '&comment=' || NEW.id::text; -- Adjust link format
        ELSE
            RAISE LOG 'Mention trigger fired on unexpected table: %', TG_TABLE_NAME;
            RETURN NEW;
        END IF;
    END;

    -- Extract all mentions from the new content
    matches := regexp_matches(NEW.content, mention_pattern, 'g');

    IF array_length(matches, 1) IS NULL THEN
        RETURN NEW; -- No mentions found
    END IF;

    -- Get the internal function secret from the vault
    -- Ensure the function owner (postgres) has USAGE on supabase_vault schema
    BEGIN
        SELECT decrypted_secret INTO v_internal_secret
        FROM supabase_vault.secrets
        WHERE name = 'INTERNAL_FUNCTION_SECRET';

        IF v_internal_secret IS NULL THEN
            RAISE WARNING 'INTERNAL_FUNCTION_SECRET not found in Vault. Cannot send mention notifications.';
            RETURN NEW;
        END IF;
    EXCEPTION
        WHEN others THEN
            RAISE WARNING 'Error accessing Vault for INTERNAL_FUNCTION_SECRET: %. Cannot send mention notifications.', SQLERRM;
            RETURN NEW; -- Proceed without notification if Vault access fails
    END;

    v_auth_header := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_internal_secret
    );

    -- Process each mention
    FOREACH mention IN ARRAY matches LOOP
        -- Extract the name part (remove '@' and trim whitespace)
        trimmed_mention := trim(substring(mention from 2));

        -- Find the user by full_name (case-insensitive)
        -- WARNING: This is ambiguous if names are not unique! Consider @username or @userid.
        SELECT id, email, slack_user_id -- Select email and slack_user_id
        INTO mentioned_user_record
        FROM public.user_profiles up
        WHERE up.full_name ILIKE trimmed_mention AND up.is_active = true
        LIMIT 1; -- Take the first match

        IF mentioned_user_record IS NOT NULL AND mentioned_user_record.id != NEW.user_id THEN
            RAISE LOG 'Mention found for user % (ID: %)', trimmed_mention, mentioned_user_record.id;

            -- Construct notification message
            notification_message := (SELECT full_name FROM public.user_profiles WHERE user_id = NEW.user_id) ||
                                    ' mentioned you in a comment on ' || v_entity_type || ' "' ||
                                    v_entity_name || '".';

            -- Construct recipients array and determine type
            v_recipients := ARRAY[]::jsonb[];
            v_notification_type := NULL;
            IF mentioned_user_record.email IS NOT NULL THEN
                v_recipients := array_append(v_recipients, jsonb_build_object('email', mentioned_user_record.email));
                v_notification_type := 'email';
            END IF;
            IF mentioned_user_record.slack_user_id IS NOT NULL THEN
                v_recipients := array_append(v_recipients, jsonb_build_object('slackUserId', mentioned_user_record.slack_user_id));
                v_notification_type := CASE WHEN v_notification_type = 'email' THEN 'both' ELSE 'slack' END;
            END IF;

            IF array_length(v_recipients, 1) IS NULL THEN
                RAISE LOG 'Mentioned user % has no email or Slack ID configured. Skipping notification.', mentioned_user_record.id;
                CONTINUE; -- Skip to next mention
            END IF;

            -- Construct payload
            notification_payload := jsonb_build_object(
                'recipients', v_recipients,
                'type', v_notification_type,
                'subject', 'You were mentioned in a comment',
                'message', notification_message || '\n\nLink: ' || notification_link,
                'context', jsonb_build_object(
                    'trigger', 'mention',
                    'comment_id', NEW.id,
                    'entity_type', v_entity_type,
                    'entity_id', v_entity_id,
                    'mentioned_user_id', mentioned_user_record.id,
                    'mentioner_user_id', NEW.user_id
                )
            );

            -- Call the notification function
            BEGIN
                SELECT net.http_post(url := v_function_url, headers := v_auth_header, body := notification_payload) INTO v_response;
                RAISE LOG 'Notification request sent for mention of user %. Response: %', mentioned_user_record.id, v_response;
                IF v_response IS NULL OR (v_response->>'status_code')::int >= 300 THEN
                    RAISE WARNING 'Notification function call failed for mention of user %. Status: %, Body: %', mentioned_user_record.id, v_response->>'status_code', v_response->>'body';
                    -- Log failure
                    PERFORM public.log_background_job_failure('mention_notification', notification_payload, 'HTTP ' || COALESCE((v_response->>'status_code')::text, 'request failed'), NULL);
                END IF;
            EXCEPTION
                WHEN others THEN
                    RAISE WARNING 'Failed to send notification for mention of user %: %', mentioned_user_record.id, SQLERRM;
                    -- Log failure
                    PERFORM public.log_background_job_failure('mention_notification', notification_payload, SQLERRM, NULL);
            END;

        ELSE
            RAISE LOG 'Mention "%" did not resolve to an active user or user mentioned themselves.', trimmed_mention;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.process_mentions_and_notify() IS 'Trigger function to parse @mentions in comments, find users, and call the send-notification function.';

-- 2. Apply the trigger to task_comments table
DROP TRIGGER IF EXISTS mention_trigger ON public.task_comments;
CREATE TRIGGER mention_trigger
AFTER INSERT OR UPDATE OF content ON public.task_comments -- Fire only when content changes
FOR EACH ROW
EXECUTE FUNCTION public.process_mentions_and_notify();

COMMENT ON TRIGGER mention_trigger ON public.task_comments IS 'Processes @mentions in new or updated task comments and sends notifications.';

-- Apply the trigger to document_comments table
DROP TRIGGER IF EXISTS mention_trigger ON public.document_comments;
CREATE TRIGGER mention_trigger
AFTER INSERT OR UPDATE OF content ON public.document_comments -- Fire only when content changes
FOR EACH ROW
EXECUTE FUNCTION public.process_mentions_and_notify();

COMMENT ON TRIGGER mention_trigger ON public.document_comments IS 'Processes @mentions in new or updated document comments and sends notifications.';
