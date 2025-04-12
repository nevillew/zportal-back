-- Apply the audit trigger to the 'milestones' table
CREATE TRIGGER milestones_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON milestones
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

-- Comment on the trigger
COMMENT ON TRIGGER milestones_audit_trigger ON milestones
IS 'Logs changes made to the milestones table into the audit_log table.';
