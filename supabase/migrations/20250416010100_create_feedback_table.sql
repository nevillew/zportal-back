-- Migration to create the feedback table and RLS policies

-- 1. Create feedback table
CREATE TABLE public.feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- User who submitted feedback (nullable if anonymous allowed)
    feedback_type text NOT NULL CHECK (feedback_type IN ('bug_report', 'feature_request', 'general_comment', 'rating')),
    content text NOT NULL CHECK (length(content) > 0),
    rating integer CHECK ((feedback_type = 'rating' AND rating >= 1 AND rating <= 5) OR feedback_type != 'rating'), -- Rating 1-5, only if type is 'rating'
    context jsonb, -- Optional context (e.g., current page, project ID, browser info)
    status text NOT NULL CHECK (status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'wont_fix')) DEFAULT 'new',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE public.feedback IS 'Stores user feedback submissions.';
COMMENT ON COLUMN public.feedback.user_id IS 'The user who submitted the feedback.';
COMMENT ON COLUMN public.feedback.feedback_type IS 'Type of feedback submitted.';
COMMENT ON COLUMN public.feedback.content IS 'The main content of the feedback.';
COMMENT ON COLUMN public.feedback.rating IS 'Numerical rating (1-5) if feedback_type is ''rating''.';
COMMENT ON COLUMN public.feedback.context IS 'Additional context about the submission (e.g., URL, user agent).';
COMMENT ON COLUMN public.feedback.status IS 'Processing status of the feedback item.';

-- Add indexes
CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX idx_feedback_type ON public.feedback(feedback_type);
CREATE INDEX idx_feedback_status ON public.feedback(status);
CREATE INDEX idx_feedback_created_at ON public.feedback(created_at);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback FORCE ROW LEVEL SECURITY;

-- RLS Policies for feedback
CREATE POLICY "Allow authenticated users to INSERT feedback"
ON public.feedback
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    (user_id = auth.uid() OR user_id IS NULL) -- Allow inserting own feedback or anonymous if user_id is nullable
);

CREATE POLICY "Allow staff users to SELECT/UPDATE/DELETE all feedback"
ON public.feedback
FOR ALL -- Covers SELECT, UPDATE, DELETE
USING (
    auth.role() = 'authenticated' AND
    is_staff_user(auth.uid())
)
WITH CHECK (
    is_staff_user(auth.uid())
);

-- Optional: Allow users to view their own submitted feedback
CREATE POLICY "Allow users to SELECT their own feedback"
ON public.feedback
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    user_id = auth.uid()
);

-- Apply audit trigger if desired
-- CREATE TRIGGER feedback_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON feedback FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
