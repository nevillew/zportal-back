-- Default Roles and Permissions

-- Clear existing roles to ensure seeding is idempotent (optional, use with caution in production)
-- DELETE FROM public.roles WHERE is_system_role = true;

-- Define Base Permissions JSON objects
-- Note: This is a representative set. Adjust keys and values based on the final permission list in permissions.ts/backend logic.
DO $$
DECLARE
    staff_admin_perms jsonb;
    project_manager_perms jsonb;
    implementation_specialist_perms jsonb;
    company_admin_perms jsonb;
    client_viewer_perms jsonb;
BEGIN
    staff_admin_perms := '{
        "admin:manage_roles": true,
        "admin:manage_templates": true,
        "admin:manage_custom_fields": true,
        "admin:manage_sso": true,
        "admin:view_audit_log": true,
        "company:view": true,
        "company:edit": true,
        "company:manage_users": true,
        "company:manage_settings": true,
        "project:create": true,
        "project:view": true,
        "project:edit_settings": true,
        "project:delete": true,
        "section:create": true,
        "section:edit": true,
        "section:delete": true,
        "task:create": true,
        "task:edit": true,
        "task:delete": true,
        "task:comment": true,
        "task:comment_internal": true,
        "task:edit_own_comment": true,
        "task:delete_own_comment": true,
        "task:delete_any_comment": true,
        "task:manage_files": true,
        "task:mark_complete_self_service": true,
        "milestone:create": true,
        "milestone:edit": true,
        "milestone:delete": true,
        "milestone:approve": true,
        "risk:create": true,
        "risk:edit": true,
        "risk:delete": true,
        "issue:create": true,
        "issue:edit": true,
        "issue:delete": true,
        "document:create": true,
        "document:edit": true,
        "document:delete": true,
        "document:approve": true,
        "document:comment": true,
        "document:comment_internal": true,
        "document:edit_own_comment": true,
        "document:delete_own_comment": true,
        "document:delete_any_comment": true,
        "meeting:view": true,
        "meeting:edit_notes": true,
        "training:view_assigned": true,
        "training:manage_content": true,
        "training:manage_assignments": true,
        "time_entry:log_own": true,
        "time_entry:view_all": true,
        "announcement:create": true,
        "announcement:view": true,
        "feedback:submit": true,
        "integration:manage_settings": true,
        "is_client_role": false
    }';

    project_manager_perms := '{
        "admin:manage_roles": false,
        "admin:manage_templates": false,
        "admin:manage_custom_fields": false,
        "admin:manage_sso": false,
        "admin:view_audit_log": false,
        "company:view": true,
        "company:edit": false,
        "company:manage_users": true, -- Can invite/manage users within their assigned companies
        "company:manage_settings": false,
        "project:create": true,
        "project:view": true,
        "project:edit_settings": true,
        "project:delete": false, -- Typically only admins delete projects
        "section:create": true,
        "section:edit": true,
        "section:delete": true,
        "task:create": true,
        "task:edit": true,
        "task:delete": true,
        "task:comment": true,
        "task:comment_internal": true,
        "task:edit_own_comment": true,
        "task:delete_own_comment": true,
        "task:delete_any_comment": false,
        "task:manage_files": true,
        "task:mark_complete_self_service": true, -- Staff can always mark complete
        "milestone:create": true,
        "milestone:edit": true,
        "milestone:delete": true,
        "milestone:approve": true,
        "risk:create": true,
        "risk:edit": true,
        "risk:delete": true,
        "issue:create": true,
        "issue:edit": true,
        "issue:delete": true,
        "document:create": true,
        "document:edit": true,
        "document:delete": true,
        "document:approve": true,
        "document:comment": true,
        "document:comment_internal": true,
        "document:edit_own_comment": true,
        "document:delete_own_comment": true,
        "document:delete_any_comment": false,
        "meeting:view": true,
        "meeting:edit_notes": true,
        "training:view_assigned": true,
        "training:manage_content": false,
        "training:manage_assignments": true, -- Can assign training to company users
        "time_entry:log_own": true,
        "time_entry:view_all": true, -- Can view time for their projects
        "announcement:create": true,
        "announcement:view": true,
        "feedback:submit": true,
        "integration:manage_settings": true,
        "is_client_role": false
    }';

    implementation_specialist_perms := '{
        "admin:manage_roles": false,
        "admin:manage_templates": false,
        "admin:manage_custom_fields": false,
        "admin:manage_sso": false,
        "admin:view_audit_log": false,
        "company:view": true,
        "company:edit": false,
        "company:manage_users": false,
        "company:manage_settings": false,
        "project:create": false,
        "project:view": true,
        "project:edit_settings": false,
        "project:delete": false,
        "section:create": false,
        "section:edit": false, -- Can edit tasks within sections
        "section:delete": false,
        "task:create": true, -- Can create sub-tasks? Or assigned tasks?
        "task:edit": true, -- Can edit tasks assigned to them or within their project
        "task:delete": false,
        "task:comment": true,
        "task:comment_internal": true,
        "task:edit_own_comment": true,
        "task:delete_own_comment": true,
        "task:delete_any_comment": false,
        "task:manage_files": true,
        "task:mark_complete_self_service": true, -- Staff can always mark complete
        "milestone:create": false,
        "milestone:edit": false, -- Can view status
        "milestone:delete": false,
        "milestone:approve": false,
        "risk:create": true, -- Can report risks
        "risk:edit": false, -- Can view
        "risk:delete": false,
        "issue:create": true, -- Can report issues
        "issue:edit": false, -- Can view
        "issue:delete": false,
        "document:create": true, -- Can create project documents?
        "document:edit": true, -- Can edit documents they created or are assigned?
        "document:delete": false,
        "document:approve": false,
        "document:comment": true,
        "document:comment_internal": true,
        "document:edit_own_comment": true,
        "document:delete_own_comment": true,
        "document:delete_any_comment": false,
        "meeting:view": true,
        "meeting:edit_notes": true, -- Can add notes to meetings they attended
        "training:view_assigned": true,
        "training:manage_content": false,
        "training:manage_assignments": false,
        "time_entry:log_own": true,
        "time_entry:view_all": false, -- Only own time
        "announcement:create": false,
        "announcement:view": true,
        "feedback:submit": true,
        "integration:manage_settings": false,
        "is_client_role": false
    }';

    company_admin_perms := '{
        "admin:manage_roles": false,
        "admin:manage_templates": false,
        "admin:manage_custom_fields": false,
        "admin:manage_sso": false,
        "admin:view_audit_log": false,
        "company:view": true,
        "company:edit": true, -- Can edit company details (logo, colors)
        "company:manage_users": true, -- Can invite/manage users within their own company
        "company:manage_settings": true, -- Can manage company-level settings (retention?)
        "project:create": false,
        "project:view": true,
        "project:edit_settings": false, -- Cannot change project status/stage/owner
        "project:delete": false,
        "section:create": false,
        "section:edit": false,
        "section:delete": false,
        "task:create": false,
        "task:edit": false, -- Can view tasks, potentially mark self-service complete
        "task:delete": false,
        "task:comment": true, -- Can make public comments
        "task:comment_internal": false,
        "task:edit_own_comment": true,
        "task:delete_own_comment": true,
        "task:delete_any_comment": false,
        "task:manage_files": true, -- Can upload files to tasks?
        "task:mark_complete_self_service": true, -- Can mark tasks flagged as self-service
        "milestone:create": false,
        "milestone:edit": false,
        "milestone:delete": false,
        "milestone:approve": true, -- Can approve milestones requiring sign-off
        "risk:create": true, -- Can report risks
        "risk:edit": false,
        "risk:delete": false,
        "issue:create": true, -- Can report issues
        "issue:edit": false,
        "issue:delete": false,
        "document:create": false, -- Can view public documents
        "document:edit": false,
        "document:delete": false,
        "document:approve": true, -- Can approve documents requiring sign-off
        "document:comment": true, -- Can make public comments
        "document:comment_internal": false,
        "document:edit_own_comment": true,
        "document:delete_own_comment": true,
        "document:delete_any_comment": false,
        "meeting:view": true,
        "meeting:edit_notes": false,
        "training:view_assigned": true,
        "training:manage_content": false,
        "training:manage_assignments": false, -- Cannot assign training
        "time_entry:log_own": false, -- Clients typically don't log time
        "time_entry:view_all": false,
        "announcement:create": false,
        "announcement:view": true,
        "feedback:submit": true,
        "integration:manage_settings": false,
        "is_client_role": true
    }';

    client_viewer_perms := '{
        "admin:manage_roles": false,
        "admin:manage_templates": false,
        "admin:manage_custom_fields": false,
        "admin:manage_sso": false,
        "admin:view_audit_log": false,
        "company:view": true,
        "company:edit": false,
        "company:manage_users": false,
        "company:manage_settings": false,
        "project:create": false,
        "project:view": true, -- Read-only view of project, public sections/tasks
        "project:edit_settings": false,
        "project:delete": false,
        "section:create": false,
        "section:edit": false,
        "section:delete": false,
        "task:create": false,
        "task:edit": false,
        "task:delete": false,
        "task:comment": true, -- Can make public comments
        "task:comment_internal": false,
        "task:edit_own_comment": true,
        "task:delete_own_comment": true,
        "task:delete_any_comment": false,
        "task:manage_files": false, -- Cannot upload files
        "task:mark_complete_self_service": false, -- Cannot mark tasks complete
        "milestone:create": false,
        "milestone:edit": false,
        "milestone:delete": false,
        "milestone:approve": false, -- Cannot approve milestones
        "risk:create": false, -- Cannot report risks
        "risk:edit": false,
        "risk:delete": false,
        "issue:create": false, -- Cannot report issues
        "issue:edit": false,
        "issue:delete": false,
        "document:create": false,
        "document:edit": false,
        "document:delete": false,
        "document:approve": false, -- Cannot approve documents
        "document:comment": true, -- Can make public comments
        "document:comment_internal": false,
        "document:edit_own_comment": true,
        "document:delete_own_comment": true,
        "document:delete_any_comment": false,
        "meeting:view": true,
        "meeting:edit_notes": false,
        "training:view_assigned": true,
        "training:manage_content": false,
        "training:manage_assignments": false,
        "time_entry:log_own": false,
        "time_entry:view_all": false,
        "announcement:create": false,
        "announcement:view": true,
        "feedback:submit": true,
        "integration:manage_settings": false,
        "is_client_role": true
    }';

    -- Insert roles using the defined JSONB permissions
    INSERT INTO public.roles (role_name, description, base_permissions, is_system_role)
    VALUES
        ('Staff Admin', 'Full administrative access across all companies and system settings.', staff_admin_perms, true),
        ('Project Manager', 'Manages assigned projects, tasks, resources, and client communication.', project_manager_perms, true),
        ('Implementation Specialist', 'Works on assigned tasks, documentation, and provides support.', implementation_specialist_perms, true),
        ('Company Admin', 'Client-side administrator managing users and settings for their company.', company_admin_perms, true),
        ('Client Viewer', 'Client-side user with read-only access to project status and documents.', client_viewer_perms, true)
    ON CONFLICT (role_name) DO UPDATE SET
        description = EXCLUDED.description,
        base_permissions = EXCLUDED.base_permissions,
        is_system_role = EXCLUDED.is_system_role,
        updated_at = now();

END $$;

-- Note: Seeding default project_templates requires defining template content first.
-- This section can be added later.
-- Example:
-- INSERT INTO public.project_templates (name, description) VALUES ('Standard Onboarding', 'Default template for new SaaS clients.');
-- ... add versions, sections, tasks ...
