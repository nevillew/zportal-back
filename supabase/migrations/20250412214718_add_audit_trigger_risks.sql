-- Apply the audit trigger to the 'risks' table
CREATE TRIGGER risks_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON risks
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

-- Comment on the trigger
COMMENT ON TRIGGER risks_audit_trigger ON risks
IS 'Logs changes made to the risks table into the audit_log table.';
