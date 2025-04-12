-- ==========================================
-- NOTIFICATIONS
-- ==========================================

-- Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) > 0 AND length(title) <= 100),
  message TEXT NOT NULL,
  link TEXT,
  type TEXT NOT NULL CHECK (type IN ('Task', 'Project', 'Meeting', 'Training', 'Approval', 'System', 'Other')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification Settings Table
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_assigned BOOLEAN NOT NULL DEFAULT true,
  task_completed BOOLEAN NOT NULL DEFAULT true,
  task_commented BOOLEAN NOT NULL DEFAULT true,
  project_updated BOOLEAN NOT NULL DEFAULT true,
  meeting_scheduled BOOLEAN NOT NULL DEFAULT true,
  meeting_updated BOOLEAN NOT NULL DEFAULT true,
  approval_requested BOOLEAN NOT NULL DEFAULT true,
  approval_completed BOOLEAN NOT NULL DEFAULT true,
  training_assigned BOOLEAN NOT NULL DEFAULT true,
  training_reminder BOOLEAN NOT NULL DEFAULT true,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  push_notifications BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create trigger for updated_at on notification_settings
CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON notification_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- REPORTING
-- ==========================================

-- Reports Table
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  description TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('Project', 'Task', 'User', 'Company', 'Training', 'Custom')),
  query_params JSONB NOT NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on reports
CREATE TRIGGER update_reports_updated_at
BEFORE UPDATE ON reports
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Report Schedules Table
CREATE TABLE report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  frequency TEXT NOT NULL CHECK (frequency IN ('Daily', 'Weekly', 'Monthly', 'Quarterly')),
  day_of_week INTEGER CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  day_of_month INTEGER CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
  time_of_day TIME NOT NULL,
  recipients JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on report_schedules
CREATE TRIGGER update_report_schedules_updated_at
BEFORE UPDATE ON report_schedules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- INTEGRATIONS
-- ==========================================

-- Integrations Table
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  description TEXT,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('Calendar', 'Email', 'CRM', 'Accounting', 'Project', 'Custom')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on integrations
CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Integration Configs Table
CREATE TABLE integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  config_data JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_id, company_id)
);

-- Create trigger for updated_at on integration_configs
CREATE TRIGGER update_integration_configs_updated_at
BEFORE UPDATE ON integration_configs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- AUDIT LOGS
-- ==========================================

-- Audit Logs Table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- ROW LEVEL SECURITY POLICIES
-- ==========================================

-- Enable RLS on all new tables
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (
    user_id = auth.uid()
  );

CREATE POLICY "Staff can manage all notifications" ON notifications
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Notification Settings policies
CREATE POLICY "Users can view their own notification settings" ON notification_settings
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update their own notification settings" ON notification_settings
  FOR UPDATE USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users can insert their own notification settings" ON notification_settings
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Staff can manage all notification settings" ON notification_settings
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Reports policies
CREATE POLICY "Staff can view all reports" ON reports
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view public reports" ON reports
  FOR SELECT USING (
    is_public = true
  );

CREATE POLICY "Users can view reports for their company" ON reports
  FOR SELECT USING (
    company_id IS NOT NULL AND
    is_member_of_company(auth.uid(), company_id)
  );

CREATE POLICY "Staff can manage all reports" ON reports
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Company admins can manage reports for their company" ON reports
  FOR ALL USING (
    company_id IS NOT NULL AND
    has_permission(auth.uid(), company_id, 'admin:manage_company')
  );

-- Report Schedules policies
CREATE POLICY "Staff can view all report schedules" ON report_schedules
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view report schedules for reports they can access" ON report_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_schedules.report_id
      AND (
        r.is_public = true OR
        (r.company_id IS NOT NULL AND is_member_of_company(auth.uid(), r.company_id))
      )
    )
  );

CREATE POLICY "Staff can manage all report schedules" ON report_schedules
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Company admins can manage report schedules for their company" ON report_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_schedules.report_id
      AND r.company_id IS NOT NULL
      AND has_permission(auth.uid(), r.company_id, 'admin:manage_company')
    )
  );

-- Integrations policies
CREATE POLICY "Anyone can view active integrations" ON integrations
  FOR SELECT USING (
    is_active = true
  );

CREATE POLICY "Staff can manage all integrations" ON integrations
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Integration Configs policies
CREATE POLICY "Staff can view all integration configs" ON integration_configs
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Company admins can view integration configs for their company" ON integration_configs
  FOR SELECT USING (
    has_permission(auth.uid(), company_id, 'admin:manage_company')
  );

CREATE POLICY "Staff can manage all integration configs" ON integration_configs
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Company admins can manage integration configs for their company" ON integration_configs
  FOR ALL USING (
    has_permission(auth.uid(), company_id, 'admin:manage_company')
  );

-- Audit Logs policies
CREATE POLICY "Staff can view all audit logs" ON audit_logs
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Company admins can view audit logs for their company" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN company_users cu ON up.user_id = cu.user_id
      WHERE up.user_id = auth.uid()
      AND cu.role = 'admin'
      AND (
        -- Company entity
        (entity_type = 'company' AND entity_id = cu.company_id) OR
        -- Project entity
        (entity_type = 'project' AND EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = entity_id
          AND p.company_id = cu.company_id
        )) OR
        -- User entity in same company
        (entity_type = 'user' AND EXISTS (
          SELECT 1 FROM company_users cu2
          WHERE cu2.user_id = entity_id
          AND cu2.company_id = cu.company_id
        )) OR
        -- Other entities related to company
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.company_id = cu.company_id
          AND (
            -- Section entity
            (entity_type = 'section' AND EXISTS (
              SELECT 1 FROM sections s
              WHERE s.id = entity_id
              AND s.project_id = p.id
            )) OR
            -- Task entity
            (entity_type = 'task' AND EXISTS (
              SELECT 1 FROM tasks t
              JOIN sections s ON t.section_id = s.id
              WHERE t.id = entity_id
              AND s.project_id = p.id
            )) OR
            -- Meeting entity
            (entity_type = 'meeting' AND EXISTS (
              SELECT 1 FROM meetings m
              WHERE m.id = entity_id
              AND m.project_id = p.id
            )) OR
            -- Document entity
            (entity_type = 'document' AND EXISTS (
              SELECT 1 FROM documents d
              WHERE d.id = entity_id
              AND d.project_id = p.id
            ))
          )
        )
      )
    )
  );

-- ==========================================
-- INDEXES
-- ==========================================

-- Notifications indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_type ON notifications(type);

-- Notification Settings indexes
CREATE INDEX idx_notification_settings_user_id ON notification_settings(user_id);

-- Reports indexes
CREATE INDEX idx_reports_report_type ON reports(report_type);
CREATE INDEX idx_reports_created_by_user_id ON reports(created_by_user_id);
CREATE INDEX idx_reports_company_id ON reports(company_id);
CREATE INDEX idx_reports_is_public ON reports(is_public);

-- Report Schedules indexes
CREATE INDEX idx_report_schedules_report_id ON report_schedules(report_id);
CREATE INDEX idx_report_schedules_is_active ON report_schedules(is_active);
CREATE INDEX idx_report_schedules_next_run_at ON report_schedules(next_run_at);
CREATE INDEX idx_report_schedules_created_by_user_id ON report_schedules(created_by_user_id);

-- Integrations indexes
CREATE INDEX idx_integrations_integration_type ON integrations(integration_type);
CREATE INDEX idx_integrations_is_active ON integrations(is_active);

-- Integration Configs indexes
CREATE INDEX idx_integration_configs_integration_id ON integration_configs(integration_id);
CREATE INDEX idx_integration_configs_company_id ON integration_configs(company_id);
CREATE INDEX idx_integration_configs_is_active ON integration_configs(is_active);
CREATE INDEX idx_integration_configs_created_by_user_id ON integration_configs(created_by_user_id);

-- Audit Logs indexes
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Grant permissions
GRANT ALL ON TABLE notifications TO anon, authenticated, service_role;
GRANT ALL ON TABLE notification_settings TO anon, authenticated, service_role;
GRANT ALL ON TABLE reports TO anon, authenticated, service_role;
GRANT ALL ON TABLE report_schedules TO anon, authenticated, service_role;
GRANT ALL ON TABLE integrations TO anon, authenticated, service_role;
GRANT ALL ON TABLE integration_configs TO anon, authenticated, service_role;
GRANT ALL ON TABLE audit_logs TO anon, authenticated, service_role;

-- Modify existing function to also create default notification settings for new users
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Create user profile
  INSERT INTO user_profiles (user_id, full_name)
  VALUES (NEW.id, NEW.email);
  
  -- Create default notification settings
  INSERT INTO notification_settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The trigger 'on_auth_user_created' already exists from the initial migration
-- and calls 'create_user_profile()'. We just modified the function it calls.

-- Create function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    ip_address,
    user_agent
  )
  VALUES (
    p_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_data,
    p_new_data,
    current_setting('request.headers')::json->>'x-forwarded-for',
    current_setting('request.headers')::json->>'user-agent'
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
