-- Apply the audit trigger to remaining tables

-- invitations
CREATE TRIGGER invitations_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON invitations
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER invitations_audit_trigger ON invitations IS 'Logs changes made to the invitations table into the audit_log table.';

-- sso_configurations
CREATE TRIGGER sso_configurations_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON sso_configurations
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER sso_configurations_audit_trigger ON sso_configurations IS 'Logs changes made to the sso_configurations table into the audit_log table.';

-- sections
CREATE TRIGGER sections_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON sections
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER sections_audit_trigger ON sections IS 'Logs changes made to the sections table into the audit_log table.';

-- tasks
CREATE TRIGGER tasks_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER tasks_audit_trigger ON tasks IS 'Logs changes made to the tasks table into the audit_log table.';

-- task_files
CREATE TRIGGER task_files_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON task_files
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER task_files_audit_trigger ON task_files IS 'Logs changes made to the task_files table into the audit_log table.';

-- task_comments
CREATE TRIGGER task_comments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON task_comments
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER task_comments_audit_trigger ON task_comments IS 'Logs changes made to the task_comments table into the audit_log table.';

-- project_templates
CREATE TRIGGER project_templates_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON project_templates
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER project_templates_audit_trigger ON project_templates IS 'Logs changes made to the project_templates table into the audit_log table.';

-- project_template_versions
CREATE TRIGGER project_template_versions_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON project_template_versions
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER project_template_versions_audit_trigger ON project_template_versions IS 'Logs changes made to the project_template_versions table into the audit_log table.';

-- section_templates
CREATE TRIGGER section_templates_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON section_templates
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER section_templates_audit_trigger ON section_templates IS 'Logs changes made to the section_templates table into the audit_log table.';

-- task_templates
CREATE TRIGGER task_templates_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON task_templates
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER task_templates_audit_trigger ON task_templates IS 'Logs changes made to the task_templates table into the audit_log table.';

-- meetings
CREATE TRIGGER meetings_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON meetings
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER meetings_audit_trigger ON meetings IS 'Logs changes made to the meetings table into the audit_log table.';

-- meeting_attendees
CREATE TRIGGER meeting_attendees_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON meeting_attendees
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER meeting_attendees_audit_trigger ON meeting_attendees IS 'Logs changes made to the meeting_attendees table into the audit_log table.';

-- training_modules
CREATE TRIGGER training_modules_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON training_modules
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER training_modules_audit_trigger ON training_modules IS 'Logs changes made to the training_modules table into the audit_log table.';

-- training_enrollments
CREATE TRIGGER training_enrollments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON training_enrollments
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER training_enrollments_audit_trigger ON training_enrollments IS 'Logs changes made to the training_enrollments table into the audit_log table.';

-- training_completions
CREATE TRIGGER training_completions_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON training_completions
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER training_completions_audit_trigger ON training_completions IS 'Logs changes made to the training_completions table into the audit_log table.';

-- badges
CREATE TRIGGER badges_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON badges
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER badges_audit_trigger ON badges IS 'Logs changes made to the badges table into the audit_log table.';

-- user_badges
CREATE TRIGGER user_badges_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON user_badges
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER user_badges_audit_trigger ON user_badges IS 'Logs changes made to the user_badges table into the audit_log table.';

-- documents
CREATE TRIGGER documents_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER documents_audit_trigger ON documents IS 'Logs changes made to the documents table into the audit_log table.';

-- document_versions
CREATE TRIGGER document_versions_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON document_versions
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER document_versions_audit_trigger ON document_versions IS 'Logs changes made to the document_versions table into the audit_log table.';

-- approvals
CREATE TRIGGER approvals_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON approvals
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER approvals_audit_trigger ON approvals IS 'Logs changes made to the approvals table into the audit_log table.';

-- approval_steps
CREATE TRIGGER approval_steps_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON approval_steps
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER approval_steps_audit_trigger ON approval_steps IS 'Logs changes made to the approval_steps table into the audit_log table.';

-- notifications
CREATE TRIGGER notifications_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON notifications
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER notifications_audit_trigger ON notifications IS 'Logs changes made to the notifications table into the audit_log table.';

-- notification_settings
CREATE TRIGGER notification_settings_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON notification_settings
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER notification_settings_audit_trigger ON notification_settings IS 'Logs changes made to the notification_settings table into the audit_log table.';

-- reports
CREATE TRIGGER reports_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON reports
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER reports_audit_trigger ON reports IS 'Logs changes made to the reports table into the audit_log table.';

-- report_schedules
CREATE TRIGGER report_schedules_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON report_schedules
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER report_schedules_audit_trigger ON report_schedules IS 'Logs changes made to the report_schedules table into the audit_log table.';

-- integrations
CREATE TRIGGER integrations_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON integrations
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER integrations_audit_trigger ON integrations IS 'Logs changes made to the integrations table into the audit_log table.';

-- integration_configs
CREATE TRIGGER integration_configs_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON integration_configs
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER integration_configs_audit_trigger ON integration_configs IS 'Logs changes made to the integration_configs table into the audit_log table.';

-- custom_field_definitions
CREATE TRIGGER custom_field_definitions_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON custom_field_definitions
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER custom_field_definitions_audit_trigger ON custom_field_definitions IS 'Logs changes made to the custom_field_definitions table into the audit_log table.';

-- custom_field_values
CREATE TRIGGER custom_field_values_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON custom_field_values
FOR EACH ROW EXECUTE FUNCTION log_audit_changes();
COMMENT ON TRIGGER custom_field_values_audit_trigger ON custom_field_values IS 'Logs changes made to the custom_field_values table into the audit_log table.';
