-- Apply the audit trigger to the 'roles' table
-- Note: The primary key 'role_name' is TEXT, compatible with the audit log function.
CREATE TRIGGER roles_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON roles
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

-- Comment on the trigger
COMMENT ON TRIGGER roles_audit_trigger ON roles
IS 'Logs changes made to the roles table into the audit_log table.';
