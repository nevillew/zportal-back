-- Apply the audit trigger to the 'user_profiles' table
-- Note: The primary key 'user_id' needs to be cast to TEXT for the audit log function.
CREATE TRIGGER user_profiles_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

-- Comment on the trigger
COMMENT ON TRIGGER user_profiles_audit_trigger ON user_profiles
IS 'Logs changes made to the user_profiles table into the audit_log table.';
