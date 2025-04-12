-- Migration to add gamification trigger function for awarding badges

-- 1. Create the trigger function for lesson completion badges
CREATE OR REPLACE FUNCTION public.award_badges_on_lesson_completion()
RETURNS TRIGGER AS $$
DECLARE
    badge_record record;
BEGIN
    RAISE LOG 'Checking badges for lesson completion: user_id=%, lesson_id=%', NEW.user_id, NEW.lesson_id;

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
            RAISE LOG 'Awarded badge % to user % for completing lesson %', badge_record.id, NEW.user_id, NEW.lesson_id;
            -- TODO(notification): Optionally trigger a notification about the awarded badge here?
        ELSE
            RAISE LOG 'User % already has badge %.', NEW.user_id, badge_record.id;
        END IF;

    END LOOP;

    -- TODO: Add logic here or in a separate trigger/function to check for COURSE completion badges
    -- This would involve checking if *all* lessons for the course associated with NEW.lesson_id
    -- are now complete for NEW.user_id in NEW.company_id context.

    RETURN NEW; -- Result is ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- SECURITY DEFINER might be needed if RLS on badges/user_badges restricts direct access

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

-- TODO: Apply similar triggers to other relevant tables (e.g., tasks, projects)
-- based on different badge criteria types ('task_completion', 'project_completion', etc.)
