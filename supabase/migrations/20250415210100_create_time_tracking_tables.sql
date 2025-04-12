-- Migration to create tables for time tracking

-- 1. Create time_entries table
CREATE TABLE public.time_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, -- Denormalized for easier RLS/reporting
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, -- Denormalized for easier RLS/reporting
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    duration_hours numeric NOT NULL CHECK (duration_hours >= 0), -- Calculated duration
    date_worked date NOT NULL, -- Date the work was performed (derived from start_time)
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT check_end_time_after_start_time CHECK (end_time >= start_time)
);

-- Add comments
COMMENT ON TABLE public.time_entries IS 'Stores logged time entries against tasks.';
COMMENT ON COLUMN public.time_entries.company_id IS 'Denormalized company ID for easier RLS and reporting.';
COMMENT ON COLUMN public.time_entries.project_id IS 'Denormalized project ID for easier RLS and reporting.';
COMMENT ON COLUMN public.time_entries.duration_hours IS 'Duration of the time entry in hours.';
COMMENT ON COLUMN public.time_entries.date_worked IS 'The calendar date on which the work was performed.';

-- Add indexes
CREATE INDEX idx_time_entries_task_id ON public.time_entries(task_id);
CREATE INDEX idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX idx_time_entries_company_id ON public.time_entries(company_id);
CREATE INDEX idx_time_entries_project_id ON public.time_entries(project_id);
CREATE INDEX idx_time_entries_date_worked ON public.time_entries(date_worked);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Enable RLS
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries FORCE ROW LEVEL SECURITY;

-- RLS Policies for time_entries
CREATE POLICY "Allow SELECT for user or staff/managers" ON public.time_entries
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        (
            user_id = auth.uid() OR -- User can see their own entries
            is_staff_user(auth.uid()) OR -- Staff can see all
            (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'time_tracking:view_all')) -- Or users with specific permission
        )
    );

CREATE POLICY "Allow INSERT for user on accessible task" ON public.time_entries
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        user_id = auth.uid() AND -- User can only log time for themselves
        -- Check if user can access the task they are logging time against
        EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.sections s ON t.section_id = s.id
            WHERE t.id = time_entries.task_id AND can_access_project(auth.uid(), s.project_id)
        ) AND
        -- Ensure denormalized IDs match the task's actual project/company
        company_id = (SELECT p.company_id FROM tasks t JOIN sections s ON t.section_id = s.id JOIN projects p ON s.project_id = p.id WHERE t.id = time_entries.task_id) AND
        project_id = (SELECT s.project_id FROM tasks t JOIN sections s ON t.section_id = s.id WHERE t.id = time_entries.task_id)
    );

CREATE POLICY "Allow UPDATE for user on own entries" ON public.time_entries
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        user_id = auth.uid()
    )
    WITH CHECK (
        user_id = auth.uid()
        -- Potentially restrict updates to certain fields (e.g., only 'notes')
    );

CREATE POLICY "Allow DELETE for user on own entries or staff/managers" ON public.time_entries
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND
        (
            user_id = auth.uid() OR -- User can delete their own entries
            is_staff_user(auth.uid()) OR -- Staff can delete any
            (is_member_of_company(auth.uid(), company_id) AND has_permission(auth.uid(), company_id, 'time_tracking:manage_all')) -- Or users with specific permission
        )
    );


-- 2. Create active_timers table
CREATE TABLE public.active_timers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    start_time timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Ensure a user can only have one active timer at a time
    CONSTRAINT unique_active_timer_per_user UNIQUE (user_id),
    -- Ensure only one timer per task per user (redundant if unique_active_timer_per_user exists, but good for clarity)
    CONSTRAINT unique_active_timer_per_task_user UNIQUE (task_id, user_id)
);

-- Add comments
COMMENT ON TABLE public.active_timers IS 'Tracks currently running timers for users on specific tasks.';

-- Add indexes
CREATE INDEX idx_active_timers_task_id ON public.active_timers(task_id);
CREATE INDEX idx_active_timers_user_id ON public.active_timers(user_id);

-- Enable RLS
ALTER TABLE public.active_timers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_timers FORCE ROW LEVEL SECURITY;

-- RLS Policies for active_timers
CREATE POLICY "Allow user to manage own timer" ON public.active_timers
    FOR ALL -- SELECT, INSERT, DELETE
    USING (
        auth.role() = 'authenticated' AND
        user_id = auth.uid()
    )
    WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY "Allow staff/managers to view timers" ON public.active_timers
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        (
            is_staff_user(auth.uid()) OR
            -- Check if user can view time tracking for the company associated with the task
            EXISTS (
                SELECT 1 FROM tasks t
                JOIN sections s ON t.section_id = s.id
                JOIN projects p ON s.project_id = p.id
                WHERE t.id = active_timers.task_id
                  AND is_member_of_company(auth.uid(), p.company_id)
                  AND has_permission(auth.uid(), p.company_id, 'time_tracking:view_all')
            )
        )
    );
-- Note: Staff/Managers generally shouldn't directly INSERT/DELETE timers for others via this table.

-- Apply audit triggers if desired (optional for active_timers)
-- CREATE TRIGGER time_entries_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON time_entries FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
-- CREATE TRIGGER active_timers_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON active_timers FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
