-- Migration to add missing handle_updated_at triggers to tables

-- Apply trigger to pages
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);
COMMENT ON TRIGGER handle_updated_at ON public.pages IS 'Sets updated_at to current time before updating rows.';

-- Apply trigger to meetings
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);
COMMENT ON TRIGGER handle_updated_at ON public.meetings IS 'Sets updated_at to current time before updating rows.';

-- Apply trigger to courses
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);
COMMENT ON TRIGGER handle_updated_at ON public.courses IS 'Sets updated_at to current time before updating rows.';

-- Apply trigger to lessons
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);
COMMENT ON TRIGGER handle_updated_at ON public.lessons IS 'Sets updated_at to current time before updating rows.';

-- Apply trigger to task_files (No updated_at column)

-- Apply trigger to course_assignments
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.course_assignments
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);
COMMENT ON TRIGGER handle_updated_at ON public.course_assignments IS 'Sets updated_at to current time before updating rows.';

-- Apply trigger to lesson_completions (No updated_at column)

-- Apply trigger to badges
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.badges
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);
COMMENT ON TRIGGER handle_updated_at ON public.badges IS 'Sets updated_at to current time before updating rows.';

-- Apply trigger to user_badges (No updated_at column)

-- Apply trigger to document_comments (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_comments') THEN
        CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.document_comments
          FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);
        COMMENT ON TRIGGER handle_updated_at ON public.document_comments IS 'Sets updated_at to current time before updating rows.';
    END IF;
END $$;

-- Apply trigger to time_entries (Already added)
-- Apply trigger to active_timers (No updated_at column)
-- Apply trigger to feedback (Already added)
-- Apply trigger to course_certificates (No updated_at column)
-- Apply trigger to announcements (Already added)
-- Apply trigger to custom_field_definitions (Already added)
-- Apply trigger to custom_field_values (Already added)
-- Apply trigger to search_index (Already added)
