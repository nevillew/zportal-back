-- Apply the audit trigger to the 'companies' table
CREATE TRIGGER companies_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

-- Comment on the trigger
COMMENT ON TRIGGER companies_audit_trigger ON companies
IS 'Logs changes made to the companies table into the audit_log table.';
