-- Create the audit trigger function
CREATE OR REPLACE FUNCTION log_audit_changes()
RETURNS TRIGGER AS $$
DECLARE
  audit_record_id TEXT;
  audit_old_value JSONB := null;
  audit_new_value JSONB := null;
BEGIN
  -- Determine record ID (assuming 'id' column exists and is UUID or similar convertible to TEXT)
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    audit_record_id := NEW.id::TEXT;
  ELSE
    audit_record_id := OLD.id::TEXT;
  END IF;

  -- Determine old and new values
  IF (TG_OP = 'UPDATE') THEN
    audit_old_value := to_jsonb(OLD);
    audit_new_value := to_jsonb(NEW);
  ELSIF (TG_OP = 'DELETE') THEN
    audit_old_value := to_jsonb(OLD);
  ELSIF (TG_OP = 'INSERT') THEN
    audit_new_value := to_jsonb(NEW);
  END IF;

  -- Insert into audit_log table
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_value, new_value)
  VALUES (
    auth.uid(),       -- Get the user ID from the session context
    TG_OP,            -- INSERT, UPDATE, or DELETE
    TG_TABLE_NAME,    -- Name of the table that triggered the event
    audit_record_id,  -- Primary key of the affected row
    audit_old_value,  -- Previous state of the row (for UPDATE/DELETE)
    audit_new_value   -- New state of the row (for INSERT/UPDATE)
  );

  RETURN NULL; -- Result is ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER allows the function to potentially access auth.uid() and insert into audit_log
-- Ensure the function owner (usually postgres) has necessary privileges.

-- Apply the trigger to the 'projects' table
CREATE TRIGGER projects_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

-- Comment on the trigger
COMMENT ON TRIGGER projects_audit_trigger ON projects
IS 'Logs changes made to the projects table into the audit_log table.';

-- Note: This trigger needs to be applied similarly to other tables requiring auditing.

-- Specific trigger function for tables with TEXT primary key named 'role_name' (like 'roles')
CREATE OR REPLACE FUNCTION log_audit_changes_text_pk_role_name()
RETURNS TRIGGER AS $$
DECLARE
  audit_record_id TEXT;
  audit_old_value JSONB := null;
  audit_new_value JSONB := null;
BEGIN
  -- Determine record ID using 'role_name'
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    audit_record_id := NEW.role_name;
  ELSE
    audit_record_id := OLD.role_name;
  END IF;

  -- Determine old and new values
  IF (TG_OP = 'UPDATE') THEN
    audit_old_value := to_jsonb(OLD);
    audit_new_value := to_jsonb(NEW);
  ELSIF (TG_OP = 'DELETE') THEN
    audit_old_value := to_jsonb(OLD);
  ELSIF (TG_OP = 'INSERT') THEN
    audit_new_value := to_jsonb(NEW);
  END IF;

  -- Insert into audit_log table
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_value, new_value)
  VALUES (
    auth.uid(),       -- Get the user ID from the session context
    TG_OP,            -- INSERT, UPDATE, or DELETE
    TG_TABLE_NAME,    -- Name of the table that triggered the event
    audit_record_id,  -- Primary key of the affected row (role_name)
    audit_old_value,  -- Previous state of the row (for UPDATE/DELETE)
    audit_new_value   -- New state of the row (for INSERT/UPDATE)
  );

  RETURN NULL; -- Result is ignored for AFTER triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
