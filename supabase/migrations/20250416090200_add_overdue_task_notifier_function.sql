-- Migration to add overdue task notifier function and schedule it

-- 1. Create the overdue task notifier function
CREATE OR REPLACE FUNCTION public.notify_overdue_tasks()
RETURNS text -- Returns a summary message
LANGUAGE plpgsql
SECURITY DEFINER -- Needed to access secrets and call http_post
SET search_path = public, extensions, supabase_vault
AS $$
DECLARE
    overdue_task RECORD;
    assignee_record RECORD;
    project_record RECORD;
    notification_payload jsonb;
    notification_message text;
    notification_subject text;
    v_function_url text := supabase_url() || '/functions/v1/send-notification';
    v_internal_secret text;
    v_auth_header jsonb;
    v_response jsonb;
    v_notification_count integer := 0;
    v_error_count integer := 0;
BEGIN
    RAISE LOG 'Starting overdue task notification process...';

    -- Get the internal function secret
    BEGIN
        SELECT decrypted_secret INTO v_internal_secret FROM supabase_vault.secrets WHERE name = 'INTERNAL_FUNCTION_SECRET';
        IF v_internal_secret IS NULL THEN RAISE EXCEPTION 'INTERNAL_FUNCTION_SECRET not found in Vault.'; END IF;
    EXCEPTION WHEN others THEN
        RAISE WARNING 'Error accessing Vault for INTERNAL_FUNCTION_SECRET: %. Cannot send notifications.', SQLERRM;
        RETURN 'Error: Could not access Vault secret.';
    END;

    v_auth_header := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_internal_secret);

    -- Loop through tasks that are overdue and have an assignee
    FOR overdue_task IN
        SELECT t.id as task_id, t.name as task_name, t.due_date, t.assigned_to_id, p.id as project_id, p.name as project_name
        FROM public.tasks t
        JOIN public.sections s ON t.section_id = s.id
        JOIN public.projects p ON s.project_id = p.id
        WHERE t.status != 'Complete'
          AND t.due_date IS NOT NULL
          AND t.due_date < now() -- Task is overdue
          AND t.assigned_to_id IS NOT NULL
        ORDER BY t.assigned_to_id -- Group notifications potentially by user if needed later
    LOOP
        -- Fetch assignee details (email needed)
        SELECT email, full_name INTO assignee_record FROM public.user_profiles WHERE user_id = overdue_task.assigned_to_id AND is_active = true;

        IF NOT FOUND OR assignee_record.email IS NULL THEN
            RAISE LOG 'Skipping notification for overdue task %: Assignee % not found, inactive, or has no email.', overdue_task.task_id, overdue_task.assigned_to_id;
            CONTINUE;
        END IF;

        -- Construct notification
        notification_subject := 'Overdue Task Reminder: ' || overdue_task.task_name;
        notification_message := 'Hello ' || COALESCE(assignee_record.full_name, assignee_record.email) ||
                                ',<br><br>This is a reminder that the task "' || overdue_task.task_name ||
                                '" in project "' || overdue_task.project_name || '" was due on ' ||
                                to_char(overdue_task.due_date, 'DD-Mon-YYYY') || ' and is overdue.' ||
                                '<br><br>Please update the task status or due date.' ||
                                '<br><br>Link: /projects/' || overdue_task.project_id::text || '/tasks/' || overdue_task.task_id::text; -- Example link

        notification_payload := jsonb_build_object(
            'recipients', jsonb_build_array(jsonb_build_object('email', assignee_record.email)),
            'type', 'email',
            'subject', notification_subject,
            'message', notification_message,
            'context', jsonb_build_object(
                'trigger', 'overdue_task_check',
                'task_id', overdue_task.task_id,
                'project_id', overdue_task.project_id,
                'assignee_user_id', overdue_task.assigned_to_id
            )
        );

        -- Call the notification function asynchronously
        BEGIN
            SELECT net.http_post(url := v_function_url, headers := v_auth_header, body := notification_payload) INTO v_response;
            IF v_response IS NULL OR (v_response->>'status_code')::int >= 300 THEN
                RAISE WARNING 'Failed to send overdue notification for task % to user %. Response: %', overdue_task.task_id, overdue_task.assigned_to_id, v_response;
                v_error_count := v_error_count + 1;
                -- Log failure
                INSERT INTO public.background_job_failures (job_name, payload, error_message, status)
                VALUES ('notify_overdue_tasks', notification_payload, 'HTTP ' || COALESCE((v_response->>'status_code')::text, 'request failed'), 'logged');
            ELSE
                v_notification_count := v_notification_count + 1;
                RAISE LOG 'Overdue notification request sent for task % to user %. Response: %', overdue_task.task_id, overdue_task.assigned_to_id, v_response;
            END IF;
        EXCEPTION
            WHEN others THEN
                RAISE WARNING 'Error sending overdue notification for task % to user %: %', overdue_task.task_id, overdue_task.assigned_to_id, SQLERRM;
                v_error_count := v_error_count + 1;
                -- Log failure
                INSERT INTO public.background_job_failures (job_name, payload, error_message, status)
                VALUES ('notify_overdue_tasks', notification_payload, SQLERRM, 'logged');
        END;

    END LOOP;

    RAISE LOG 'Overdue task notification process finished. Sent: %, Errors: %', v_notification_count, v_error_count;
    RETURN 'Overdue task notifications processed. Sent: ' || v_notification_count || ', Errors: ' || v_error_count;

EXCEPTION
    WHEN others THEN
        RAISE WARNING 'Error during overdue task notification execution: %', SQLERRM;
        -- Log general failure
        INSERT INTO public.background_job_failures (job_name, error_message, status)
        VALUES ('notify_overdue_tasks', SQLERRM, 'logged');
        RETURN 'Error: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_overdue_tasks() TO postgres; -- Grant to role running cron

COMMENT ON FUNCTION public.notify_overdue_tasks() IS 'Checks for overdue tasks and sends notifications to assignees via the send-notification function.';

-- 2. Schedule the function using pg_cron (e.g., run daily at 8:00 AM UTC)
SELECT cron.schedule(
    'daily-overdue-task-notifier', -- Job name
    '0 8 * * *', -- Cron schedule (8:00 AM UTC daily)
    $$ SELECT public.notify_overdue_tasks(); $$
);
