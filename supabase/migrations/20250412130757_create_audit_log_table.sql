-- Create the audit_log table
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY, -- Using BIGSERIAL for auto-incrementing primary key
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- User who performed the action
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')), -- Type of operation
  table_name TEXT NOT NULL, -- Name of the table affected
  record_id TEXT, -- Primary key of the affected record (TEXT to accommodate different PK types like UUID or INT)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(), -- When the action occurred
  old_value JSONB, -- State of the record before the change (for UPDATE/DELETE)
  new_value JSONB -- State of the record after the change (for INSERT/UPDATE)
);

-- Add indexes for common query patterns
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);

-- Optional: Add RLS to audit_log table if needed (e.g., restrict access to staff/admins)
-- Example: Allow only staff users to read the audit log
-- alter table audit_log enable row level security;
-- create policy "Allow SELECT for staff users"
-- on audit_log for select
-- using ( is_staff_user(auth.uid()) );
-- alter table audit_log force row level security;

-- Comment on the table
COMMENT ON TABLE audit_log IS 'Stores a log of significant data changes (INSERT, UPDATE, DELETE) across various tables.';
