-- Migration to add notification trigger for issue changes

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.notify_issue_change()
RETURNS TRIGGER AS $$
DECLARE
    notification_payload jsonb;
    notification_message text;
    notification_subject text;
    recipient_user_record record;
    recipient_user_id uuid;
    project_record record;
    v_function_url text := supabase_url() || '/functions/v1/send-notification'; -- Construct function URL
    v_internal_secret text;
    v_auth_header jsonb;
    v_response jsonb;
    change_type text;
BEGIN
    -- Only proceed for UPDATE operations
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- Determine what changed and who to notify
    IF NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id AND NEW.assigned_to_user_id IS NOT NULL THEN
        -- Notify the new assignee
        recipient_user_id := NEW.assigned_to_user_id;
        change_type := 'assignment';
        notification_subject := 'You have been assigned a new issue';
        notification_message := 'You have been assigned the issue "' || NEW.description || '".';

    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        -- Notify the reporter (if different from updater) or assignee on status change
        IF NEW.reported_by_user_id IS NOT NULL AND NEW.reported_by_user_id != auth.uid() THEN
             recipient_user_id := NEW.reported_by_user_id;
        ELSIF NEW.assigned_to_user_id IS NOT NULL AND NEW.assigned_to_user_id != auth.uid() THEN
             recipient_user_id := NEW.assigned_to_user_id;
        ELSE
             -- Don't notify if the updater is the reporter/assignee
             RAISE LOG 'Issue % status changed by reporter/assignee. No notification sent.', NEW.id;
             RETURN NEW;
        END IF;

        change_type := 'status_change';
        notification_subject := 'Issue status updated';
        notification_message := 'The status of issue "' || NEW.description || '" has been updated to ' || NEW.status || '.';
    ELSE
        -- No relevant change detected
        RETURN NEW;
    END IF;

    -- Fetch recipient details
    SELECT email -- Add slack_user_id if needed
    INTO recipient_user_record
    FROM public.user_profiles
    WHERE user_id = recipient_user_id AND is_active = true;

    IF NOT FOUND OR recipient_user_record.email IS NULL THEN
        RAISE WARNING 'Issue notification skipped: Recipient user % not found, inactive, or has no email.', recipient_user_id;
        RETURN NEW;
    END IF;

    -- Fetch project details for context
    SELECT name INTO project_record FROM public.projects WHERE id = NEW.project_id;

    -- Add project context to message
    notification_message := notification_message || ' (Project: ' || COALESCE(project_record.name, 'Unknown') || ')';

    -- Get the internal function secret from the vault
    BEGIN
        SELECT decrypted_secret INTO v_internal_secret
        FROM supabase_vault.secrets
        WHERE name = 'INTERNAL_FUNCTION_SECRET';

        IF v_internal_secret IS NULL THEN
            RAISE WARNING 'INTERNAL_FUNCTION_SECRET not found in Vault. Cannot send issue notification.';
            RETURN NEW;
        END IF;
    EXCEPTION
        WHEN others THEN
            RAISE WARNING 'Error accessing Vault for INTERNAL_FUNCTION_SECRET: %. Cannot send issue notification.', SQLERRM;
            RETURN NEW;
    END;

    v_auth_header := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_internal_secret
    );

    -- Construct payload for the send-notification function
    notification_payload := jsonb_build_object(
        'recipients', jsonb_build_array(
            jsonb_build_object('email', recipient_user_record.email)
            -- Add Slack recipient if available
        ),
        'type', 'email', -- Or 'both'
        'subject', notification_subject,
        'message', notification_message,
        'context', jsonb_build_object(
            'trigger', 'issue_update',
            'change_type', change_type,
            'issue_id', NEW.id,
            'project_id', NEW.project_id,
            'recipient_user_id', recipient_user_id,
            'updater_user_id', auth.uid() -- ID of the user who caused the update
        )
    );

    -- Call the notification function asynchronously
    BEGIN
        SELECT net.http_post(
            url := v_function_url,
            headers := v_auth_header,
            body := notification_payload
        )
        INTO v_response;
        RAISE LOG 'Issue notification request sent for issue %. Response: %', NEW.id, v_response;
    EXCEPTION
        WHEN others THEN
            RAISE WARNING 'Failed to send issue notification for issue %: %', NEW.id, SQLERRM;
            -- Optionally log to background_job_failures here
    END;

    RETURN NEW; -- Result is ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.notify_issue_change() IS 'Trigger function to send notifications on issue assignment or status changes.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.notify_issue_change() TO postgres;
GRANT EXECUTE ON FUNCTION public.notify_issue_change() TO authenticated;

-- 2. Apply the trigger to issues table
DROP TRIGGER IF EXISTS issue_notification_trigger ON public.issues;
CREATE TRIGGER issue_notification_trigger
AFTER UPDATE OF assigned_to_user_id, status ON public.issues -- Fire only when assignment or status changes
FOR EACH ROW
WHEN (OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id OR OLD.status IS DISTINCT FROM NEW.status) -- Condition to ensure change happened
EXECUTE FUNCTION public.notify_issue_change();

COMMENT ON TRIGGER issue_notification_trigger ON public.issues IS 'Sends notifications when an issue is assigned or its status changes.';
