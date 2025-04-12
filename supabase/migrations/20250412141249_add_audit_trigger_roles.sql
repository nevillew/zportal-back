-- Apply the specific audit trigger for TEXT primary key 'role_name' to the 'roles' table
CREATE TRIGGER roles_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON roles
FOR EACH ROW EXECUTE FUNCTION log_audit_changes_text_pk_role_name(); -- Use specific function

-- Comment on the trigger
COMMENT ON TRIGGER roles_audit_trigger ON roles
IS 'Logs changes made to the roles table into the audit_log table using a specific trigger for TEXT primary key.';
