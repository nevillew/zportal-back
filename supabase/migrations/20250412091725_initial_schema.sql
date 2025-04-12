-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Create schema for Supabase migrations if it doesn't exist
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

-- ==========================================
-- HELPER FUNCTIONS (Removed - Handled by later migrations or moddatetime)
-- ==========================================

-- ==========================================
-- TENANCY & USER MANAGEMENT
-- ==========================================

-- Companies Table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  client_portal_logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  project_retention_days INTEGER,
  log_retention_days INTEGER
);

-- User Profiles Table (linked to auth.users)
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles Table
CREATE TABLE roles (
  role_name TEXT PRIMARY KEY,
  description TEXT,
  base_permissions JSONB NOT NULL,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company Users Junction Table
CREATE TABLE company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL REFERENCES roles(role_name) ON DELETE RESTRICT,
  custom_permissions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Create indexes for company_users
CREATE INDEX idx_company_users_company_id ON company_users(company_id);
CREATE INDEX idx_company_users_user_id ON company_users(user_id);
CREATE INDEX idx_company_users_company_user ON company_users(company_id, user_id);

-- Invitations Table
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL REFERENCES roles(role_name) ON DELETE RESTRICT,
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')) DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for invitations
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_status ON invitations(status);

-- SSO Configurations Table
CREATE TABLE sso_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  domain TEXT,
  metadata_url TEXT,
  metadata_xml TEXT,
  oidc_client_id TEXT,
  oidc_client_secret TEXT,
  oidc_discovery_url TEXT,
  attribute_mapping JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for sso_configurations
CREATE INDEX idx_sso_configurations_company_id ON sso_configurations(company_id);
CREATE INDEX idx_sso_configurations_domain ON sso_configurations(domain);
CREATE INDEX idx_sso_configurations_is_active ON sso_configurations(is_active);

-- ==========================================
-- PROJECTS MANAGEMENT
-- ==========================================

-- Projects Table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_template_version_id UUID, -- Will be linked to project_template_versions later
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  status TEXT NOT NULL CHECK (status IN ('Planning', 'Active', 'On Hold', 'Completed', 'Cancelled')),
  stage TEXT NOT NULL CHECK (stage IN ('Kick-off', 'Discovery', 'Build', 'UAT', 'Go Live', 'Post Go Live')),
  health_status TEXT CHECK (health_status IN ('On Track', 'At Risk', 'Off Track', 'Unknown')) DEFAULT 'Unknown',
  project_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for projects
CREATE INDEX idx_projects_company_id ON projects(company_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_stage ON projects(stage);
CREATE INDEX idx_projects_project_owner_id ON projects(project_owner_id);

-- Milestones Table
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  description TEXT,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Approved', 'Rejected')) DEFAULT 'Pending',
  "order" INTEGER NOT NULL DEFAULT 0,
  sign_off_required BOOLEAN NOT NULL DEFAULT false,
  signed_off_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_off_at TIMESTAMPTZ,
  approval_id UUID, -- Will be linked to approvals table if needed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for milestones
CREATE INDEX idx_milestones_project_id ON milestones(project_id);
CREATE INDEX idx_milestones_status ON milestones(status);
CREATE INDEX idx_milestones_due_date ON milestones(due_date);

-- Risks Table
CREATE TABLE risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  reported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('Potential', 'Open', 'Mitigated', 'Closed')) DEFAULT 'Potential',
  probability TEXT CHECK (probability IN ('Low', 'Medium', 'High')),
  impact TEXT CHECK (impact IN ('Low', 'Medium', 'High')),
  mitigation_plan TEXT,
  contingency_plan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for risks
CREATE INDEX idx_risks_project_id ON risks(project_id);
CREATE INDEX idx_risks_status ON risks(status);
CREATE INDEX idx_risks_assigned_to_user_id ON risks(assigned_to_user_id);

-- Issues Table
CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  reported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('Open', 'Investigating', 'Resolved', 'Closed')) DEFAULT 'Open',
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')) DEFAULT 'Medium',
  resolution TEXT,
  related_risk_id UUID REFERENCES risks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for issues
CREATE INDEX idx_issues_project_id ON issues(project_id);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_priority ON issues(priority);
CREATE INDEX idx_issues_assigned_to_user_id ON issues(assigned_to_user_id);

-- ==========================================
-- TASKS & SECTIONS
-- ==========================================

-- Sections Table
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_template_id UUID, -- Will be linked to section_templates later
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  type TEXT NOT NULL CHECK (type IN ('INFO', 'BUILD', 'UAT', 'GO_LIVE', 'PLANNING', 'OTHER')),
  status TEXT NOT NULL CHECK (status IN ('Not Started', 'In Progress', 'Completed')),
  is_public BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  percent_complete FLOAT CHECK (percent_complete >= 0 AND percent_complete <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for sections
CREATE INDEX idx_sections_project_id ON sections(project_id);
CREATE INDEX idx_sections_order ON sections("order");

-- Tasks Table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  task_template_id UUID, -- Will be linked to task_templates later
  parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  recurring_definition_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 100),
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('Open', 'In Progress', 'Complete', 'Blocked')),
  "order" INTEGER NOT NULL DEFAULT 0,
  due_date TIMESTAMPTZ,
  assigned_to_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  depends_on_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  condition JSONB,
  is_self_service BOOLEAN NOT NULL DEFAULT false,
  estimated_effort_hours NUMERIC,
  is_recurring_definition BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule TEXT,
  recurrence_end_date TIMESTAMPTZ,
  next_occurrence_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id != parent_task_id),
  CHECK (id != recurring_definition_task_id)
);

-- Create indexes for tasks
CREATE INDEX idx_tasks_section_id ON tasks(section_id);
CREATE INDEX idx_tasks_milestone_id ON tasks(milestone_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX idx_tasks_depends_on_task_id ON tasks(depends_on_task_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_next_occurrence_date ON tasks(next_occurrence_date);
CREATE INDEX idx_tasks_is_recurring_definition ON tasks(is_recurring_definition);

-- Task Files Table
CREATE TABLE task_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for task_files
CREATE INDEX idx_task_files_task_id ON task_files(task_id);

-- Task Comments Table
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL CHECK (length(content) > 0),
  parent_comment_id UUID REFERENCES task_comments(id) ON DELETE CASCADE,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for task_comments
CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX idx_task_comments_user_id ON task_comments(user_id);
CREATE INDEX idx_task_comments_parent_comment_id ON task_comments(parent_comment_id);

-- ==========================================
-- SECURITY HELPER FUNCTIONS (Removed - Handled by later migration 20250412125115)
-- ==========================================

-- ==========================================
-- ROW LEVEL SECURITY POLICIES (Removed - Handled by later migrations)
-- ==========================================

-- ==========================================
-- SEED DATA
-- ==========================================

-- Insert default roles
INSERT INTO roles (role_name, description, base_permissions, is_system_role)
VALUES
  ('Staff Admin', 'Full access to all features across all companies',
   '{
     "view_tasks": true,
     "edit_tasks": true,
     "delete_tasks": true,
     "view_projects": true,
     "edit_projects": true,
     "delete_projects": true,
     "view_milestones": true,
     "edit_milestones": true,
     "approve_milestones": true,
     "view_risks": true,
     "edit_risks": true,
     "view_issues": true,
     "edit_issues": true,
     "view_documents": true,
     "edit_documents": true,
     "approve_documents": true,
     "view_meetings": true,
     "schedule_meetings": true,
     "view_training": true,
     "edit_training": true,
     "assign_training": true,
     "view_reports": true,
     "is_client_role": false,
     "can_manage_company_users": true,
     "can_manage_roles": true,
     "admin:manage_templates": true,
     "project:create": true,
     "project:edit_settings": true,
     "project:delete": true,
     "milestone:manage": true,
     "risk:manage": true,
     "issue:manage": true,
     "section:manage": true,
     "task:manage": true
   }', true),

  ('Company Admin', 'Administrative access within a specific company',
   '{
     "view_tasks": true,
     "edit_tasks": true,
     "delete_tasks": true,
     "view_projects": true,
     "edit_projects": true,
     "delete_projects": true,
     "view_milestones": true,
     "edit_milestones": true,
     "approve_milestones": true,
     "view_risks": true,
     "edit_risks": true,
     "view_issues": true,
     "edit_issues": true,
     "view_documents": true,
     "edit_documents": true,
     "approve_documents": true,
     "view_meetings": true,
     "schedule_meetings": true,
     "view_training": true,
     "assign_training": true,
     "view_reports": true,
     "is_client_role": false,
     "can_manage_company_users": true,
     "project:create": true,
     "project:edit_settings": true,
     "project:delete": true,
     "milestone:manage": true,
     "risk:manage": true,
     "issue:manage": true,
     "section:manage": true,
     "task:manage": true
   }', true),

  ('Project Manager', 'Manages projects within a company',
   '{
     "view_tasks": true,
     "edit_tasks": true,
     "delete_tasks": true,
     "view_projects": true,
     "edit_projects": true,
     "view_milestones": true,
     "edit_milestones": true,
     "approve_milestones": true,
     "view_risks": true,
     "edit_risks": true,
     "view_issues": true,
     "edit_issues": true,
     "view_documents": true,
     "edit_documents": true,
     "view_meetings": true,
     "schedule_meetings": true,
     "view_training": true,
     "view_reports": true,
     "is_client_role": false,
     "project:create": true,
     "project:edit_settings": true,
     "milestone:manage": true,
     "risk:manage": true,
     "issue:manage": true,
     "section:manage": true,
     "task:manage": true
   }', true),

  ('Client Admin', 'Client-side administrator with elevated permissions',
   '{
     "view_tasks": true,
     "edit_tasks": false,
     "view_projects": true,
     "view_milestones": true,
     "view_risks": true,
     "view_issues": true,
     "view_documents": true,
     "view_meetings": true,
     "view_training": true,
     "is_client_role": true,
     "can_manage_company_users": true
   }', true),

  ('Client Viewer', 'Basic client-side access for viewing project status',
   '{
     "view_tasks": true,
     "view_projects": true,
     "view_milestones": true,
     "view_documents": true,
     "view_meetings": true,
     "view_training": true,
     "is_client_role": true
   }', true);

-- Create a trigger to automatically create user_profiles when a new user is created
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, full_name)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();
