-- Create the background_job_failures table
CREATE TABLE background_job_failures (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL, -- Name of the job/function that failed (e.g., 'generate-recurring-tasks')
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(), -- When the failure occurred
  payload JSONB, -- Input payload or context relevant to the failed job run
  error_message TEXT, -- The error message captured
  stack_trace TEXT, -- Optional: Stack trace if available
  status TEXT NOT NULL CHECK (status IN ('logged', 'retrying', 'resolved', 'ignored')) DEFAULT 'logged' -- Status of handling this failure
);

-- Add indexes for common query patterns
CREATE INDEX idx_background_job_failures_timestamp ON background_job_failures(timestamp);
CREATE INDEX idx_background_job_failures_job_name ON background_job_failures(job_name);
CREATE INDEX idx_background_job_failures_status ON background_job_failures(status);

-- Comment on the table
COMMENT ON TABLE background_job_failures IS 'Logs failures encountered during the execution of background jobs or scheduled functions.';

-- Optional: Add RLS if access needs to be restricted (e.g., only staff can view)
-- alter table background_job_failures enable row level security;
-- create policy "Allow SELECT for staff users"
-- on background_job_failures for select
-- using ( is_staff_user(auth.uid()) );
-- alter table background_job_failures force row level security;
