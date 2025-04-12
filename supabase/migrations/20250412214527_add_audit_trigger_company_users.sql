-- Apply the audit trigger to the 'company_users' table
CREATE TRIGGER company_users_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON company_users
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

-- Comment on the trigger
COMMENT ON TRIGGER company_users_audit_trigger ON company_users
IS 'Logs changes made to the company_users table into the audit_log table.';
