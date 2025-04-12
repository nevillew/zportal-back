-- Migration to add certificate generation trigger function and apply it

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_certificate_generation()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id uuid;
    v_course_id uuid;
    v_company_id uuid;
    total_lessons integer;
    completed_lessons integer;
    already_has_certificate boolean;
    notification_payload jsonb;
    v_function_url text := supabase_url() || '/functions/v1/generate-certificate'; -- Construct function URL
    v_internal_secret text;
    v_auth_header jsonb;
    v_response jsonb;
BEGIN
    -- Determine the relevant user, course, and company from the changed row
    v_user_id := NEW.user_id;
    v_company_id := NEW.company_id;
    SELECT course_id INTO v_course_id FROM public.lessons WHERE id = NEW.lesson_id;

    IF v_course_id IS NULL THEN
        RAISE WARNING 'Could not determine course_id for lesson_id %', NEW.lesson_id;
        RETURN NEW;
    END IF;

    -- Check if certificate already exists for this user/course/company combination
    SELECT EXISTS (
        SELECT 1 FROM public.course_certificates
        WHERE user_id = v_user_id AND course_id = v_course_id AND company_id = v_company_id
    ) INTO already_has_certificate;

    IF already_has_certificate THEN
        RAISE LOG 'Certificate already exists for user %, course %, company %. Skipping generation.', v_user_id, v_course_id, v_company_id;
        RETURN NEW;
    END IF;

    -- Check if all lessons for this course are now complete for this user/company
    SELECT COUNT(*) INTO total_lessons FROM public.lessons WHERE course_id = v_course_id;

    SELECT COUNT(*) INTO completed_lessons
    FROM public.lesson_completions lc
    JOIN public.lessons l ON lc.lesson_id = l.id
    WHERE lc.user_id = v_user_id
      AND lc.company_id = v_company_id
      AND l.course_id = v_course_id;

    RAISE LOG 'User % completed lesson %. Total lessons: %, Completed lessons: % for course % in company %',
        v_user_id, NEW.lesson_id, total_lessons, completed_lessons, v_course_id, v_company_id;

    -- If all lessons are complete and there are lessons in the course
    IF total_lessons > 0 AND completed_lessons >= total_lessons THEN
        RAISE LOG 'Course % completed by user % in company %. Triggering certificate generation.', v_course_id, v_user_id, v_company_id;

        -- Get the internal function secret from the vault
        BEGIN
            SELECT decrypted_secret INTO v_internal_secret
            FROM supabase_vault.secrets
            WHERE name = 'INTERNAL_FUNCTION_SECRET';

            IF v_internal_secret IS NULL THEN
                RAISE WARNING 'INTERNAL_FUNCTION_SECRET not found in Vault. Cannot trigger certificate generation.';
                RETURN NEW;
            END IF;
        EXCEPTION
            WHEN others THEN
                RAISE WARNING 'Error accessing Vault for INTERNAL_FUNCTION_SECRET: %. Cannot trigger certificate generation.', SQLERRM;
                RETURN NEW;
        END;

        v_auth_header := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_internal_secret
        );

        -- Construct payload for the generate-certificate function
        notification_payload := jsonb_build_object(
            'user_id', v_user_id,
            'course_id', v_course_id,
            'company_id', v_company_id
        );

        -- Call the function asynchronously (best effort)
        BEGIN
            SELECT net.http_post(
                url := v_function_url,
                headers := v_auth_header,
                body := notification_payload
            )
            INTO v_response;
            RAISE LOG 'Certificate generation request sent for user %, course %. Response: %', v_user_id, v_course_id, v_response;
        EXCEPTION
            WHEN others THEN
                RAISE WARNING 'Failed to send certificate generation request for user %, course %: %', v_user_id, v_course_id, SQLERRM;
                -- Optionally log to background_job_failures here
        END;
    END IF;

    RETURN NEW; -- Result is ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.trigger_certificate_generation() IS 'Trigger function to check for course completion and invoke the certificate generation function.';

-- 2. Apply the trigger to lesson_completions table
DROP TRIGGER IF EXISTS certificate_generation_trigger ON public.lesson_completions;
CREATE TRIGGER certificate_generation_trigger
AFTER INSERT OR UPDATE ON public.lesson_completions -- Fire when a lesson is marked complete
FOR EACH ROW
EXECUTE FUNCTION public.trigger_certificate_generation();

COMMENT ON TRIGGER certificate_generation_trigger ON public.lesson_completions IS 'Checks if a course is completed upon lesson completion and triggers certificate generation.';
