-- Apply the audit trigger to the 'issues' table
CREATE TRIGGER issues_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON issues
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

-- Comment on the trigger
COMMENT ON TRIGGER issues_audit_trigger ON issues
IS 'Logs changes made to the issues table into the audit_log table.';
