-- Migration to add welcome notification trigger function and apply it

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.send_welcome_notification()
RETURNS TRIGGER AS $$
DECLARE
    user_record record;
    company_record record;
    notification_payload jsonb;
    notification_message text;
    notification_subject text;
    v_function_url text := supabase_url() || '/functions/v1/send-notification'; -- Construct function URL
    v_internal_secret text;
    v_auth_header jsonb;
    v_response jsonb;
BEGIN
    -- Fetch user details (email is crucial)
    SELECT email, full_name -- Add slack_user_id if available and used
    INTO user_record
    FROM public.user_profiles
    WHERE user_id = NEW.user_id;

    IF NOT FOUND OR user_record.email IS NULL THEN
        RAISE WARNING 'Welcome notification skipped: User profile or email not found for user_id %', NEW.user_id;
        RETURN NEW;
    END IF;

    -- Fetch company details
    SELECT name
    INTO company_record
    FROM public.companies
    WHERE id = NEW.company_id;

    IF NOT FOUND THEN
        RAISE WARNING 'Welcome notification skipped: Company not found for company_id %', NEW.company_id;
        RETURN NEW;
    END IF;

    -- Get the internal function secret from the vault
    BEGIN
        SELECT decrypted_secret INTO v_internal_secret
        FROM supabase_vault.secrets
        WHERE name = 'INTERNAL_FUNCTION_SECRET';

        IF v_internal_secret IS NULL THEN
            RAISE WARNING 'INTERNAL_FUNCTION_SECRET not found in Vault. Cannot send welcome notification.';
            RETURN NEW;
        END IF;
    EXCEPTION
        WHEN others THEN
            RAISE WARNING 'Error accessing Vault for INTERNAL_FUNCTION_SECRET: %. Cannot send welcome notification.', SQLERRM;
            RETURN NEW; -- Proceed without notification if Vault access fails
    END;

    v_auth_header := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_internal_secret
    );

    -- Construct notification message and subject
    notification_subject := 'Welcome to ZPortal for ' || company_record.name || '!';
    notification_message := 'Hello ' || COALESCE(user_record.full_name, user_record.email) ||
                            ',<br><br>Welcome aboard! You have been added to the ' || company_record.name ||
                            ' account on ZPortal.<br><br>You can log in and explore your onboarding projects here: [Link to Portal]' || -- TODO: Replace with actual portal link
                            '<br><br>Best regards,<br>The ZPortal Team';

    -- Construct payload for the send-notification function
    notification_payload := jsonb_build_object(
        'recipients', jsonb_build_array(
            -- Send via email
            jsonb_build_object('email', user_record.email)
            -- Add Slack recipient if slack_user_id exists and is desired
            -- jsonb_build_object('slackUserId', user_record.slack_user_id)
        ),
        'type', 'email', -- Or 'both' if Slack is added
        'subject', notification_subject,
        'message', notification_message, -- Assuming HTML content for email
        'context', jsonb_build_object(
            'trigger', 'welcome_sequence',
            'user_id', NEW.user_id,
            'company_id', NEW.company_id,
            'role_assigned', NEW.role
        )
    );

    -- Call the notification function asynchronously (best effort)
    BEGIN
        SELECT net.http_post(
            url := v_function_url,
            headers := v_auth_header,
            body := notification_payload
        )
        INTO v_response;
        RAISE LOG 'Welcome notification request sent for user %. Response: %', NEW.user_id, v_response;
    EXCEPTION
        WHEN others THEN
            RAISE WARNING 'Failed to send welcome notification for user %: %', NEW.user_id, SQLERRM;
            -- Optionally log to background_job_failures here
    END;

    RETURN NEW; -- Result is ignored for AFTER triggers, but required
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.send_welcome_notification() IS 'Trigger function to send a welcome notification when a user is added to a company.';

-- 2. Apply the trigger to company_users table
DROP TRIGGER IF EXISTS welcome_notification_trigger ON public.company_users;
CREATE TRIGGER welcome_notification_trigger
AFTER INSERT ON public.company_users
FOR EACH ROW
EXECUTE FUNCTION public.send_welcome_notification();

COMMENT ON TRIGGER welcome_notification_trigger ON public.company_users IS 'Sends a welcome notification when a user is first added to a company.';
