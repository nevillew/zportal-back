-- Migration to add mention processing trigger function and apply it

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.process_mentions_and_notify()
RETURNS TRIGGER AS $$
DECLARE
    mention_pattern text := '@([\w\s.-]+)'; -- Regex to find @ followed by word chars, whitespace, dot, hyphen
    matches text[];
    mention text;
    trimmed_mention text;
    mentioned_user_record record;
    notification_payload jsonb;
    notification_message text;
    notification_link text;
    v_function_url text := supabase_url() || '/functions/v1/send-notification'; -- Construct function URL
    v_internal_secret text;
    v_auth_header jsonb;
    v_response jsonb;
BEGIN
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
        -- WARNING: This is ambiguous if names are not unique!
        -- Consider using @username or @userid for robustness if possible.
        SELECT id, email -- Select email for potential email notification fallback
        INTO mentioned_user_record
        FROM public.user_profiles up
        WHERE up.full_name ILIKE trimmed_mention AND up.is_active = true
        LIMIT 1; -- Take the first match if multiple exist

        IF mentioned_user_record IS NOT NULL AND mentioned_user_record.id != NEW.user_id THEN -- Don't notify user for mentioning themselves
            RAISE LOG 'Mention found for user % (ID: %)', trimmed_mention, mentioned_user_record.id;

            -- Construct notification message and link
            -- TODO: Refine message and link structure based on frontend routing
            notification_message := (SELECT full_name FROM public.user_profiles WHERE user_id = NEW.user_id) ||
                                    ' mentioned you in a comment on task "' ||
                                    (SELECT name FROM public.tasks WHERE id = NEW.task_id) || '".';
            notification_link := '/projects/' || (SELECT project_id FROM sections s JOIN tasks t ON s.id = t.section_id WHERE t.id = NEW.task_id)::text ||
                                 '/tasks/' || NEW.task_id::text || '?comment=' || NEW.id::text; -- Example link

            -- Construct payload for the send-notification function
            notification_payload := jsonb_build_object(
                'recipients', jsonb_build_array(
                    -- Attempt Slack notification if possible (requires slack_user_id in user_profiles or lookup)
                    -- jsonb_build_object('slackUserId', mentioned_user_record.slack_user_id),
                    -- Fallback to email
                    jsonb_build_object('email', mentioned_user_record.email)
                ),
                'type', 'email', -- Or 'slack' or 'both' depending on recipient data availability
                'subject', 'You were mentioned in a comment',
                'message', notification_message || '\n\nLink: ' || notification_link,
                'context', jsonb_build_object(
                    'trigger', 'mention',
                    'comment_id', NEW.id,
                    'task_id', NEW.task_id,
                    'mentioned_user_id', mentioned_user_record.id,
                    'mentioner_user_id', NEW.user_id
                )
            );

            -- Call the notification function asynchronously (best effort)
            -- Use pg_net for HTTP requests
            BEGIN
                SELECT net.http_post(
                    url := v_function_url,
                    headers := v_auth_header,
                    body := notification_payload
                )
                INTO v_response;
                RAISE LOG 'Notification request sent for mention of user %. Response: %', mentioned_user_record.id, v_response;
            EXCEPTION
                WHEN others THEN
                    RAISE WARNING 'Failed to send notification for mention of user %: %', mentioned_user_record.id, SQLERRM;
                    -- Optionally log to background_job_failures here
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

COMMENT ON TRIGGER mention_trigger ON public.task_comments IS 'Processes @mentions in new or updated comments and sends notifications.';

-- TODO: Apply the same trigger to 'document_comments' table when it's implemented.
-- CREATE TRIGGER mention_trigger ON public.document_comments
-- AFTER INSERT OR UPDATE OF content ON public.document_comments
-- FOR EACH ROW
-- EXECUTE FUNCTION public.process_mentions_and_notify();
