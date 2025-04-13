-- Migration to add gamification trigger function for awarding badges

-- 1. Create the trigger function for lesson completion badges
CREATE OR REPLACE FUNCTION public.award_badges_on_lesson_completion()
RETURNS TRIGGER AS $$
DECLARE
    badge_record record;
    v_course_id uuid;
    v_total_lessons integer;
    v_completed_lessons integer;
    v_user_name text;
    v_badge_name text;
    v_notification_payload jsonb;
    v_function_url text := supabase_url() || '/functions/v1/send-notification';
    v_internal_secret text;
    v_auth_header jsonb;
    v_response jsonb;
BEGIN
    RAISE LOG 'Checking badges for lesson completion: user_id=%, lesson_id=%', NEW.user_id, NEW.lesson_id;

    -- Get user name for notifications
    SELECT full_name INTO v_user_name FROM public.user_profiles WHERE user_id = NEW.user_id;

    -- Find badges specifically awarded for completing this particular lesson
    FOR badge_record IN
        SELECT id
        FROM public.badges
        WHERE is_active = true
          AND criteria->>'type' = 'lesson_completion'
          AND (criteria->>'lesson_id')::uuid = NEW.lesson_id
    LOOP
        RAISE LOG 'Found matching lesson completion badge: %', badge_record.id;

        -- Attempt to insert into user_badges, ignore if the user already has it
        INSERT INTO public.user_badges (user_id, badge_id, context)
        VALUES (
            NEW.user_id,
            badge_record.id,
            jsonb_build_object(
                'lesson_id', NEW.lesson_id,
                'lesson_completion_id', NEW.id,
                'company_id', NEW.company_id
            )
        )
        ON CONFLICT (user_id, badge_id) DO NOTHING; -- Ignore if user already has this badge

        IF FOUND THEN
            SELECT name INTO v_badge_name FROM public.badges WHERE id = badge_record.id;
            RAISE LOG 'Awarded badge "%" (%) to user % for completing lesson %', v_badge_name, badge_record.id, NEW.user_id, NEW.lesson_id;
            -- Send notification
            BEGIN
                SELECT decrypted_secret INTO v_internal_secret FROM supabase_vault.secrets WHERE name = 'INTERNAL_FUNCTION_SECRET';
                IF v_internal_secret IS NOT NULL THEN
                    v_auth_header := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_internal_secret);
                    v_notification_payload := jsonb_build_object(
                        'recipients', jsonb_build_array(jsonb_build_object('userId', NEW.user_id)), -- Assuming send-notification can handle userId lookup
                        'type', 'in_app', -- Or email/slack
                        'subject', 'New Badge Earned!',
                        'message', 'Congratulations ' || COALESCE(v_user_name, 'User') || '! You earned the "' || v_badge_name || '" badge!',
                        'context', jsonb_build_object('trigger', 'badge_award', 'badge_id', badge_record.id, 'lesson_id', NEW.lesson_id)
                    );
                    PERFORM net.http_post(url := v_function_url, headers := v_auth_header, body := v_notification_payload);
                ELSE RAISE WARNING 'INTERNAL_FUNCTION_SECRET not found, cannot send badge notification.'; END IF;
            EXCEPTION WHEN others THEN RAISE WARNING 'Failed to send badge notification: %', SQLERRM; END;
        ELSE
            RAISE LOG 'User % already has badge %.', NEW.user_id, badge_record.id;
        END IF;

    END LOOP;

    -- Check for COURSE completion badges
    SELECT course_id INTO v_course_id FROM public.lessons WHERE id = NEW.lesson_id;
    IF v_course_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_lessons FROM public.lessons WHERE course_id = v_course_id;
        SELECT COUNT(*) INTO v_completed_lessons
        FROM public.lesson_completions lc
        JOIN public.lessons l ON lc.lesson_id = l.id
        WHERE lc.user_id = NEW.user_id AND lc.company_id = NEW.company_id AND l.course_id = v_course_id;

        IF v_total_lessons > 0 AND v_completed_lessons >= v_total_lessons THEN
            RAISE LOG 'User % completed all % lessons for course % in company %.', NEW.user_id, v_completed_lessons, v_course_id, NEW.company_id;
            -- Find badges for completing this course
            FOR badge_record IN
                SELECT id, name FROM public.badges
                WHERE is_active = true
                  AND criteria->>'type' = 'course_completion'
                  AND (criteria->>'course_id')::uuid = v_course_id
            LOOP
                RAISE LOG 'Found matching course completion badge: %', badge_record.id;
                INSERT INTO public.user_badges (user_id, badge_id, context)
                VALUES (NEW.user_id, badge_record.id, jsonb_build_object('course_id', v_course_id, 'company_id', NEW.company_id))
                ON CONFLICT (user_id, badge_id) DO NOTHING;

                IF FOUND THEN
                    RAISE LOG 'Awarded badge "%" (%) to user % for completing course %', badge_record.name, badge_record.id, NEW.user_id, v_course_id;
                    -- Send notification (similar logic as above)
                    BEGIN
                        SELECT decrypted_secret INTO v_internal_secret FROM supabase_vault.secrets WHERE name = 'INTERNAL_FUNCTION_SECRET';
                        IF v_internal_secret IS NOT NULL THEN
                            v_auth_header := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_internal_secret);
                            v_notification_payload := jsonb_build_object(
                                'recipients', jsonb_build_array(jsonb_build_object('userId', NEW.user_id)),
                                'type', 'in_app',
                                'subject', 'New Badge Earned!',
                                'message', 'Congratulations ' || COALESCE(v_user_name, 'User') || '! You earned the "' || badge_record.name || '" badge for completing the course!',
                                'context', jsonb_build_object('trigger', 'badge_award', 'badge_id', badge_record.id, 'course_id', v_course_id)
                            );
                            PERFORM net.http_post(url := v_function_url, headers := v_auth_header, body := v_notification_payload);
                        ELSE RAISE WARNING 'INTERNAL_FUNCTION_SECRET not found, cannot send badge notification.'; END IF;
                    EXCEPTION WHEN others THEN RAISE WARNING 'Failed to send badge notification: %', SQLERRM; END;
                ELSE
                    RAISE LOG 'User % already has badge %.', NEW.user_id, badge_record.id;
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW; -- Result is ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.award_badges_on_lesson_completion() IS 'Trigger function to award badges based on completing specific lessons.';

-- Grant execute permission (adjust role if needed, e.g., postgres if SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.award_badges_on_lesson_completion() TO postgres; -- Grant to owner role for SECURITY DEFINER
GRANT EXECUTE ON FUNCTION public.award_badges_on_lesson_completion() TO authenticated; -- Also grant to authenticated if not SECURITY DEFINER or if needed

-- 2. Apply the trigger to lesson_completions table
DROP TRIGGER IF EXISTS gamification_lesson_completion_trigger ON public.lesson_completions;
CREATE TRIGGER gamification_lesson_completion_trigger
AFTER INSERT ON public.lesson_completions -- Fire only when a lesson is first marked complete
FOR EACH ROW
EXECUTE FUNCTION public.award_badges_on_lesson_completion();

COMMENT ON TRIGGER gamification_lesson_completion_trigger ON public.lesson_completions IS 'Awards badges based on specific lesson completions.';

-- TODO: Apply similar triggers to other relevant tables (e.g., projects)
-- based on different badge criteria types ('project_completion', etc.)

-- 3. Create trigger function for task completion badges
CREATE OR REPLACE FUNCTION public.award_badges_on_task_completion()
RETURNS TRIGGER AS $$
DECLARE
    badge_record record;
    v_user_name text;
    v_badge_name text;
    v_notification_payload jsonb;
    v_function_url text := supabase_url() || '/functions/v1/send-notification';
    v_internal_secret text;
    v_auth_header jsonb;
BEGIN
    -- Only award if task status changes TO 'Complete' and it has an assignee
    IF TG_OP = 'UPDATE' AND NEW.status = 'Complete' AND OLD.status <> 'Complete' AND NEW.assigned_to_id IS NOT NULL THEN
        RAISE LOG 'Checking badges for task completion: user_id=%, task_id=%', NEW.assigned_to_id, NEW.id;

        -- Get user name for notifications
        SELECT full_name INTO v_user_name FROM public.user_profiles WHERE user_id = NEW.assigned_to_id;

        -- Find badges awarded for completing this specific task
        FOR badge_record IN
            SELECT id, name
            FROM public.badges
            WHERE is_active = true
              AND criteria->>'type' = 'task_completion'
              AND (criteria->>'task_id')::uuid = NEW.id
        LOOP
            RAISE LOG 'Found matching task completion badge: %', badge_record.id;

            -- Attempt to insert into user_badges, ignore if the user already has it
            INSERT INTO public.user_badges (user_id, badge_id, context)
            VALUES (
                NEW.assigned_to_id,
                badge_record.id,
                jsonb_build_object('task_id', NEW.id)
            )
            ON CONFLICT (user_id, badge_id) DO NOTHING;

            IF FOUND THEN
                RAISE LOG 'Awarded badge "%" (%) to user % for completing task %', badge_record.name, badge_record.id, NEW.assigned_to_id, NEW.id;
                -- Send notification (similar logic as lesson completion)
                BEGIN
                    SELECT decrypted_secret INTO v_internal_secret FROM supabase_vault.secrets WHERE name = 'INTERNAL_FUNCTION_SECRET';
                    IF v_internal_secret IS NOT NULL THEN
                        v_auth_header := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_internal_secret);
                        v_notification_payload := jsonb_build_object(
                            'recipients', jsonb_build_array(jsonb_build_object('userId', NEW.assigned_to_id)),
                            'type', 'in_app',
                            'subject', 'New Badge Earned!',
                            'message', 'Congratulations ' || COALESCE(v_user_name, 'User') || '! You earned the "' || badge_record.name || '" badge for completing a task!',
                            'context', jsonb_build_object('trigger', 'badge_award', 'badge_id', badge_record.id, 'task_id', NEW.id)
                        );
                        PERFORM net.http_post(url := v_function_url, headers := v_auth_header, body := v_notification_payload);
                    ELSE RAISE WARNING 'INTERNAL_FUNCTION_SECRET not found, cannot send badge notification.'; END IF;
                EXCEPTION WHEN others THEN RAISE WARNING 'Failed to send badge notification: %', SQLERRM; END;
            ELSE
                RAISE LOG 'User % already has badge %.', NEW.assigned_to_id, badge_record.id;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.award_badges_on_task_completion() IS 'Trigger function to award badges based on completing specific tasks.';

GRANT EXECUTE ON FUNCTION public.award_badges_on_task_completion() TO postgres;
GRANT EXECUTE ON FUNCTION public.award_badges_on_task_completion() TO authenticated;

-- 4. Apply the trigger to the tasks table
DROP TRIGGER IF EXISTS gamification_task_completion_trigger ON public.tasks;
CREATE TRIGGER gamification_task_completion_trigger
AFTER UPDATE OF status ON public.tasks -- Fire when status is updated
FOR EACH ROW
EXECUTE FUNCTION public.award_badges_on_task_completion();

COMMENT ON TRIGGER gamification_task_completion_trigger ON public.tasks IS 'Awards badges based on specific task completions when status changes to Complete.';
