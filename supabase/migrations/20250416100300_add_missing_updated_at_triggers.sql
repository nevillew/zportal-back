-- Migration to add missing handle_updated_at triggers to tables

-- Apply trigger to pages
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to meetings
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to courses
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to lessons
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to task_files (created_at only, no updated_at column)
-- No trigger needed for task_files as it lacks an updated_at column.

-- Apply trigger to course_assignments
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.course_assignments
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to lesson_completions (created_at only, no updated_at column)
-- No trigger needed for lesson_completions as it lacks an updated_at column.

-- Apply trigger to badges
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.badges
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Apply trigger to user_badges (awarded_at only, no updated_at column)
-- No trigger needed for user_badges as it lacks an updated_at column.

-- Apply trigger to document_comments (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_comments') THEN
        CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.document_comments
          FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);
    END IF;
END $$;

-- Apply trigger to time_entries (already added in 20250415210100)
-- Apply trigger to active_timers (created_at only, no updated_at column)
-- Apply trigger to feedback (already added in 20250416010100)
-- Apply trigger to course_certificates (created_at only, no updated_at column)

COMMENT ON TRIGGER handle_updated_at ON public.pages IS 'Sets updated_at to current time before updating rows.';
COMMENT ON TRIGGER handle_updated_at ON public.meetings IS 'Sets updated_at to current time before updating rows.';
COMMENT ON TRIGGER handle_updated_at ON public.courses IS 'Sets updated_at to current time before updating rows.';
COMMENT ON TRIGGER handle_updated_at ON public.lessons IS 'Sets updated_at to current time before updating rows.';
COMMENT ON TRIGGER handle_updated_at ON public.course_assignments IS 'Sets updated_at to current time before updating rows.';
COMMENT ON TRIGGER handle_updated_at ON public.badges IS 'Sets updated_at to current time before updating rows.';
-- Add comment for document_comments trigger if created
-- COMMENT ON TRIGGER handle_updated_at ON public.document_comments IS 'Sets updated_at to current time before updating rows.';
