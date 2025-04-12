-- ==========================================
-- PROJECT TEMPLATES
-- ==========================================

-- Project Templates Table
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on project_templates
CREATE TRIGGER update_project_templates_updated_at
BEFORE UPDATE ON project_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Project Template Versions Table
CREATE TABLE project_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_template_id, version_number)
);

-- Create trigger for updated_at on project_template_versions
CREATE TRIGGER update_project_template_versions_updated_at
BEFORE UPDATE ON project_template_versions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Section Templates Table
CREATE TABLE section_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_template_version_id UUID NOT NULL REFERENCES project_template_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  type TEXT NOT NULL CHECK (type IN ('INFO', 'BUILD', 'UAT', 'GO_LIVE', 'PLANNING', 'OTHER')),
  description TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on section_templates
CREATE TRIGGER update_section_templates_updated_at
BEFORE UPDATE ON section_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Task Templates Table
CREATE TABLE task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_template_id UUID NOT NULL REFERENCES section_templates(id) ON DELETE CASCADE,
  parent_task_template_id UUID REFERENCES task_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  description TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  estimated_effort_hours NUMERIC,
  is_self_service BOOLEAN NOT NULL DEFAULT false,
  is_recurring_definition BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule TEXT,
  condition JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id != parent_task_template_id)
);

-- Create trigger for updated_at on task_templates
CREATE TRIGGER update_task_templates_updated_at
BEFORE UPDATE ON task_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- MEETINGS & TRAINING
-- ==========================================

-- Meetings Table
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) > 0 AND length(title) <= 100),
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  meeting_link TEXT,
  recording_url TEXT,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('Scheduled', 'In Progress', 'Completed', 'Cancelled')) DEFAULT 'Scheduled',
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- Create trigger for updated_at on meetings
CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON meetings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Meeting Attendees Table
CREATE TABLE meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Invited', 'Accepted', 'Declined', 'Tentative')) DEFAULT 'Invited',
  attended BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

-- Create trigger for updated_at on meeting_attendees
CREATE TRIGGER update_meeting_attendees_updated_at
BEFORE UPDATE ON meeting_attendees
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Training Modules Table
CREATE TABLE training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(title) > 0 AND length(title) <= 100),
  description TEXT,
  content_url TEXT,
  duration_minutes INTEGER,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on training_modules
CREATE TRIGGER update_training_modules_updated_at
BEFORE UPDATE ON training_modules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Training Enrollments Table
CREATE TABLE training_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  enrolled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(training_module_id, user_id, company_id)
);

-- Create trigger for updated_at on training_enrollments
CREATE TRIGGER update_training_enrollments_updated_at
BEFORE UPDATE ON training_enrollments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Training Completions Table
CREATE TABLE training_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_enrollment_id UUID NOT NULL REFERENCES training_enrollments(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  score NUMERIC,
  passed BOOLEAN NOT NULL,
  certificate_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- BADGES & ACHIEVEMENTS
-- ==========================================

-- Badges Table
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  description TEXT,
  image_url TEXT,
  criteria JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on badges
CREATE TRIGGER update_badges_updated_at
BEFORE UPDATE ON badges
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- User Badges Table
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  awarded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

-- ==========================================
-- DOCUMENTS & APPROVALS
-- ==========================================

-- Documents Table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) > 0 AND length(title) <= 100),
  description TEXT,
  document_type TEXT NOT NULL CHECK (document_type IN ('Requirements', 'Design', 'Technical', 'User', 'Testing', 'Other')),
  status TEXT NOT NULL CHECK (status IN ('Draft', 'In Review', 'Approved', 'Rejected', 'Archived')) DEFAULT 'Draft',
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on documents
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Document Versions Table
CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_number)
);

-- Approvals Table
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(title) > 0 AND length(title) <= 100),
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Approved', 'Rejected', 'Cancelled')) DEFAULT 'Pending',
  requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for updated_at on approvals
CREATE TRIGGER update_approvals_updated_at
BEFORE UPDATE ON approvals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Approval Steps Table
CREATE TABLE approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  approver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Skipped')) DEFAULT 'Pending',
  comments TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(approval_id, step_number)
);

-- Create trigger for updated_at on approval_steps
CREATE TRIGGER update_approval_steps_updated_at
BEFORE UPDATE ON approval_steps
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Update foreign keys for existing tables
ALTER TABLE projects ADD CONSTRAINT projects_project_template_version_id_fkey 
  FOREIGN KEY (project_template_version_id) REFERENCES project_template_versions(id) ON DELETE SET NULL;

ALTER TABLE sections ADD CONSTRAINT sections_section_template_id_fkey 
  FOREIGN KEY (section_template_id) REFERENCES section_templates(id) ON DELETE SET NULL;

ALTER TABLE tasks ADD CONSTRAINT tasks_task_template_id_fkey 
  FOREIGN KEY (task_template_id) REFERENCES task_templates(id) ON DELETE SET NULL;

ALTER TABLE document_versions ADD CONSTRAINT document_versions_approval_id_fkey 
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL;

ALTER TABLE milestones ADD CONSTRAINT milestones_approval_id_fkey 
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL;

-- ==========================================
-- ROW LEVEL SECURITY POLICIES
-- ==========================================

-- Enable RLS on all new tables
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;

-- Project Templates policies
CREATE POLICY "Staff can view all project templates" ON project_templates
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view public project templates" ON project_templates
  FOR SELECT USING (
    is_public = true
  );

CREATE POLICY "Staff can manage project templates" ON project_templates
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Project Template Versions policies
CREATE POLICY "Staff can view all project template versions" ON project_template_versions
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view public project template versions" ON project_template_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_templates pt
      WHERE pt.id = project_template_versions.project_template_id
      AND pt.is_public = true
    )
  );

CREATE POLICY "Staff can manage project template versions" ON project_template_versions
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Section Templates policies
CREATE POLICY "Staff can view all section templates" ON section_templates
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view public section templates" ON section_templates
  FOR SELECT USING (
    is_public = true OR
    EXISTS (
      SELECT 1 FROM project_template_versions ptv
      JOIN project_templates pt ON ptv.project_template_id = pt.id
      WHERE ptv.id = section_templates.project_template_version_id
      AND pt.is_public = true
    )
  );

CREATE POLICY "Staff can manage section templates" ON section_templates
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Task Templates policies
CREATE POLICY "Staff can view all task templates" ON task_templates
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view public task templates" ON task_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM section_templates st
      JOIN project_template_versions ptv ON st.project_template_version_id = ptv.id
      JOIN project_templates pt ON ptv.project_template_id = pt.id
      WHERE st.id = task_templates.section_template_id
      AND (st.is_public = true OR pt.is_public = true)
    )
  );

CREATE POLICY "Staff can manage task templates" ON task_templates
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Meetings policies
CREATE POLICY "Users can view meetings of their projects" ON meetings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = meetings.project_id
      AND (
        is_staff_user(auth.uid()) OR 
        is_member_of_company(auth.uid(), p.company_id)
      )
    )
  );

CREATE POLICY "Staff and project managers can manage meetings" ON meetings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = meetings.project_id
      AND (
        is_staff_user(auth.uid()) OR 
        has_permission(auth.uid(), p.company_id, 'meeting:manage')
      )
    )
  );

-- Meeting Attendees policies
CREATE POLICY "Users can view meeting attendees of their meetings" ON meeting_attendees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings m
      JOIN projects p ON m.project_id = p.id
      WHERE m.id = meeting_attendees.meeting_id
      AND (
        is_staff_user(auth.uid()) OR 
        is_member_of_company(auth.uid(), p.company_id)
      )
    )
  );

CREATE POLICY "Staff and project managers can manage meeting attendees" ON meeting_attendees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      JOIN projects p ON m.project_id = p.id
      WHERE m.id = meeting_attendees.meeting_id
      AND (
        is_staff_user(auth.uid()) OR 
        has_permission(auth.uid(), p.company_id, 'meeting:manage')
      )
    )
  );

CREATE POLICY "Users can update their own meeting attendance" ON meeting_attendees
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid() AND
    (
      status IS NOT NULL OR
      attended IS NOT NULL
    )
  );

-- Training Modules policies
CREATE POLICY "Staff can view all training modules" ON training_modules
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view training modules they are enrolled in" ON training_modules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_enrollments te
      WHERE te.training_module_id = training_modules.id
      AND te.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage training modules" ON training_modules
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Training Enrollments policies
CREATE POLICY "Staff can view all training enrollments" ON training_enrollments
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view their own training enrollments" ON training_enrollments
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "Company admins can view training enrollments for their company" ON training_enrollments
  FOR SELECT USING (
    has_permission(auth.uid(), company_id, 'admin:manage_company_users')
  );

CREATE POLICY "Staff can manage training enrollments" ON training_enrollments
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Company admins can manage training enrollments for their company" ON training_enrollments
  FOR ALL USING (
    has_permission(auth.uid(), company_id, 'admin:manage_company_users')
  );

-- Training Completions policies
CREATE POLICY "Staff can view all training completions" ON training_completions
  FOR SELECT USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can view their own training completions" ON training_completions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_enrollments te
      WHERE te.id = training_completions.training_enrollment_id
      AND te.user_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can view training completions for their company" ON training_completions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_enrollments te
      WHERE te.id = training_completions.training_enrollment_id
      AND has_permission(auth.uid(), te.company_id, 'admin:manage_company_users')
    )
  );

CREATE POLICY "Staff can manage training completions" ON training_completions
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Badges policies
CREATE POLICY "Anyone can view badges" ON badges
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage badges" ON badges
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- User Badges policies
CREATE POLICY "Anyone can view user badges" ON user_badges
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage user badges" ON user_badges
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

-- Documents policies
CREATE POLICY "Users can view documents of their projects" ON documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = documents.project_id
      AND (
        is_staff_user(auth.uid()) OR 
        is_member_of_company(auth.uid(), p.company_id)
      )
    )
  );

CREATE POLICY "Staff and project managers can manage documents" ON documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = documents.project_id
      AND (
        is_staff_user(auth.uid()) OR 
        has_permission(auth.uid(), p.company_id, 'document:manage')
      )
    )
  );

-- Document Versions policies
CREATE POLICY "Users can view document versions of their projects" ON document_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = document_versions.document_id
      AND (
        is_staff_user(auth.uid()) OR 
        is_member_of_company(auth.uid(), p.company_id)
      )
    )
  );

CREATE POLICY "Staff and project managers can manage document versions" ON document_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = document_versions.document_id
      AND (
        is_staff_user(auth.uid()) OR 
        has_permission(auth.uid(), p.company_id, 'document:manage')
      )
    )
  );

-- Approvals policies
CREATE POLICY "Users can view approvals they are involved in" ON approvals
  FOR SELECT USING (
    is_staff_user(auth.uid()) OR
    requested_by_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM approval_steps aps
      WHERE aps.approval_id = approvals.id
      AND aps.approver_user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN projects p ON m.project_id = p.id
      WHERE m.approval_id = approvals.id
      AND is_member_of_company(auth.uid(), p.company_id)
    ) OR
    EXISTS (
      SELECT 1 FROM document_versions dv
      JOIN documents d ON dv.document_id = d.id
      JOIN projects p ON d.project_id = p.id
      WHERE dv.approval_id = approvals.id
      AND is_member_of_company(auth.uid(), p.company_id)
    )
  );

CREATE POLICY "Staff can manage approvals" ON approvals
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Users can request approvals" ON approvals
  FOR INSERT WITH CHECK (
    auth.uid() = requested_by_user_id
  );

-- Approval Steps policies
CREATE POLICY "Users can view approval steps they are involved in" ON approval_steps
  FOR SELECT USING (
    is_staff_user(auth.uid()) OR
    approver_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM approvals a
      WHERE a.id = approval_steps.approval_id
      AND a.requested_by_user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM approvals a
      JOIN milestones m ON m.approval_id = a.id
      JOIN projects p ON m.project_id = p.id
      WHERE a.id = approval_steps.approval_id
      AND is_member_of_company(auth.uid(), p.company_id)
    ) OR
    EXISTS (
      SELECT 1 FROM approvals a
      JOIN document_versions dv ON dv.approval_id = a.id
      JOIN documents d ON dv.document_id = d.id
      JOIN projects p ON d.project_id = p.id
      WHERE a.id = approval_steps.approval_id
      AND is_member_of_company(auth.uid(), p.company_id)
    )
  );

CREATE POLICY "Staff can manage approval steps" ON approval_steps
  FOR ALL USING (
    is_staff_user(auth.uid())
  );

CREATE POLICY "Approvers can update their own approval steps" ON approval_steps
  FOR UPDATE USING (
    approver_user_id = auth.uid()
  ) WITH CHECK (
    approver_user_id = auth.uid() AND
    status IN ('Approved', 'Rejected')
  );

-- ==========================================
-- INDEXES
-- ==========================================

-- Project Templates indexes
CREATE INDEX idx_project_templates_is_active ON project_templates(is_active);
CREATE INDEX idx_project_templates_is_public ON project_templates(is_public);
CREATE INDEX idx_project_templates_created_by_user_id ON project_templates(created_by_user_id);

-- Project Template Versions indexes
CREATE INDEX idx_project_template_versions_project_template_id ON project_template_versions(project_template_id);
CREATE INDEX idx_project_template_versions_is_active ON project_template_versions(is_active);
CREATE INDEX idx_project_template_versions_created_by_user_id ON project_template_versions(created_by_user_id);

-- Section Templates indexes
CREATE INDEX idx_section_templates_project_template_version_id ON section_templates(project_template_version_id);
CREATE INDEX idx_section_templates_order ON section_templates("order");
CREATE INDEX idx_section_templates_is_public ON section_templates(is_public);

-- Task Templates indexes
CREATE INDEX idx_task_templates_section_template_id ON task_templates(section_template_id);
CREATE INDEX idx_task_templates_parent_task_template_id ON task_templates(parent_task_template_id);
CREATE INDEX idx_task_templates_order ON task_templates("order");
CREATE INDEX idx_task_templates_is_recurring_definition ON task_templates(is_recurring_definition);

-- Meetings indexes
CREATE INDEX idx_meetings_project_id ON meetings(project_id);
CREATE INDEX idx_meetings_start_time ON meetings(start_time);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_created_by_user_id ON meetings(created_by_user_id);

-- Meeting Attendees indexes
CREATE INDEX idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);
CREATE INDEX idx_meeting_attendees_user_id ON meeting_attendees(user_id);
CREATE INDEX idx_meeting_attendees_status ON meeting_attendees(status);

-- Training Modules indexes
CREATE INDEX idx_training_modules_is_active ON training_modules(is_active);
CREATE INDEX idx_training_modules_is_required ON training_modules(is_required);
CREATE INDEX idx_training_modules_created_by_user_id ON training_modules(created_by_user_id);

-- Training Enrollments indexes
CREATE INDEX idx_training_enrollments_training_module_id ON training_enrollments(training_module_id);
CREATE INDEX idx_training_enrollments_user_id ON training_enrollments(user_id);
CREATE INDEX idx_training_enrollments_company_id ON training_enrollments(company_id);
CREATE INDEX idx_training_enrollments_due_date ON training_enrollments(due_date);

-- Training Completions indexes
CREATE INDEX idx_training_completions_training_enrollment_id ON training_completions(training_enrollment_id);
CREATE INDEX idx_training_completions_completed_at ON training_completions(completed_at);
CREATE INDEX idx_training_completions_passed ON training_completions(passed);

-- Badges indexes
CREATE INDEX idx_badges_is_active ON badges(is_active);
CREATE INDEX idx_badges_created_by_user_id ON badges(created_by_user_id);

-- User Badges indexes
CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX idx_user_badges_awarded_at ON user_badges(awarded_at);
CREATE INDEX idx_user_badges_awarded_by_user_id ON user_badges(awarded_by_user_id);

-- Documents indexes
CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_document_type ON documents(document_type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_by_user_id ON documents(created_by_user_id);

-- Document Versions indexes
CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX idx_document_versions_version_number ON document_versions(version_number);
CREATE INDEX idx_document_versions_uploaded_by_user_id ON document_versions(uploaded_by_user_id);
CREATE INDEX idx_document_versions_approval_id ON document_versions(approval_id);

-- Approvals indexes
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_requested_by_user_id ON approvals(requested_by_user_id);

-- Approval Steps indexes
CREATE INDEX idx_approval_steps_approval_id ON approval_steps(approval_id);
CREATE INDEX idx_approval_steps_step_number ON approval_steps(step_number);
CREATE INDEX idx_approval_steps_approver_user_id ON approval_steps(approver_user_id);
CREATE INDEX idx_approval_steps_status ON approval_steps(status);

-- Grant permissions
GRANT ALL ON TABLE project_templates TO anon, authenticated, service_role;
GRANT ALL ON TABLE project_template_versions TO anon, authenticated, service_role;
GRANT ALL ON TABLE section_templates TO anon, authenticated, service_role;
GRANT ALL ON TABLE task_templates TO anon, authenticated, service_role;
GRANT ALL ON TABLE meetings TO anon, authenticated, service_role;
GRANT ALL ON TABLE meeting_attendees TO anon, authenticated, service_role;
GRANT ALL ON TABLE training_modules TO anon, authenticated, service_role;
GRANT ALL ON TABLE training_enrollments TO anon, authenticated, service_role;
GRANT ALL ON TABLE training_completions TO anon, authenticated, service_role;
GRANT ALL ON TABLE badges TO anon, authenticated, service_role;
GRANT ALL ON TABLE user_badges TO anon, authenticated, service_role;
GRANT ALL ON TABLE documents TO anon, authenticated, service_role;
GRANT ALL ON TABLE document_versions TO anon, authenticated, service_role;
GRANT ALL ON TABLE approvals TO anon, authenticated, service_role;
GRANT ALL ON TABLE approval_steps TO anon, authenticated, service_role;
