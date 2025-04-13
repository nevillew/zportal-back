# ZPortal Backend Implementation Checklist (Based on Spec v3.3)

This checklist covers all items specified in `plan.md` version 3.3.

## 1. Overview (Informational - No Checklist Items)

## 2. Tenancy & User Management

### 2.1 Multi-Tenancy Model (Conceptual)
- [ ] Define "Company" as the Tenant.
- [ ] Define User Association via `company_users` table.
- [ ] Define Staff Access via `user_profiles.is_staff = true`.
- [ ] Define User Lifecycle (Invitation, Deactivation, SSO).

### 2.2 Data Model for Tenancy
- [ ] **`companies` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `logo_url` (text, nullable).
    - [ ] Define `primary_color` (text, nullable).
    - [ ] Define `secondary_color` (text, nullable).
    - [ ] Define `client_portal_logo_url` (text, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Define `project_retention_days` (integer, nullable).
    - [ ] Define `log_retention_days` (integer, nullable).
    - [ ] Implement `updated_at` trigger for `companies`.
- [ ] **`users` Table (auth.users):**
    - [ ] Acknowledge reliance on Supabase Auth schema.
- [ ] **`user_profiles` Table:**
    - [ ] Define `user_id` (uuid, PK, FK -> auth.users.id ON DELETE CASCADE).
    - [ ] Define `full_name` (text, nullable).
    - [ ] Define `avatar_url` (text, nullable).
    - [ ] Define `is_staff` (boolean, default false, not null).
    - [ ] Define `is_active` (boolean, default true, not null).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Implement trigger to create profile on `auth.users` insert.
    - [ ] Implement `updated_at` trigger for `user_profiles`.
    - [ ] Ensure login checks/RLS consider `is_active = true`.
- [ ] **`company_users` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, not null).
    - [ ] Define `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, not null).
    - [ ] Define `role` (text, FK -> roles.role_name ON DELETE RESTRICT, not null).
    - [ ] Define `custom_permissions` (jsonb, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Add index on `company_id`.
    - [ ] Add index on `user_id`.
    - [ ] Add index on (`company_id`, `user_id`).
    - [ ] Add UNIQUE constraint on (`company_id`, `user_id`).
- [ ] **`invitations` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `email` (text, required).
    - [ ] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, required).
    - [ ] Define `role` (text, FK -> roles.role_name ON DELETE RESTRICT, required).
    - [ ] Define `invited_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [ ] Define `token` (text, required, UNIQUE).
    - [ ] Define `status` (text, required, CHECK ('pending', 'accepted', 'expired', 'revoked'), default 'pending').
    - [ ] Define `expires_at` (timestamptz, required).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `email`.
    - [ ] Add index on `token`.
    - [ ] Add index on `status`.
    - [ ] Implement `updated_at` trigger for `invitations`.
- [ ] **`roles` Table:**
    - [ ] Define `role_name` (text, PK).
    - [ ] Define `description` (text, nullable).
    - [ ] Define `base_permissions` (jsonb, required).
    - [ ] Define `is_system_role` (boolean, default false, not null).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Implement `updated_at` trigger for `roles`.
    - [ ] Seed default roles (Staff Admin, Company Admin, Project Manager, Client Admin, Client Viewer).
- [ ] **`sso_configurations` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, UNIQUE, required).
    - [ ] Define `provider_type` (text, CHECK ('saml', 'oidc'), required).
    - [ ] Define `is_active` (boolean, default false, not null).
    - [ ] Define `domain` (text, nullable, indexed).
    - [ ] Define `metadata_url` (text, nullable).
    - [ ] Define `metadata_xml` (text, nullable).
    - [ ] Define `oidc_client_id` (text, nullable).
    - [ ] Define `oidc_client_secret` (text, nullable, store securely).
    - [ ] Define `oidc_discovery_url` (text, nullable).
    - [ ] Define `attribute_mapping` (jsonb, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `company_id`.
    - [ ] Add index on `domain`.
    - [ ] Add index on `is_active`.
    - [ ] Implement `updated_at` trigger for `sso_configurations`.
    - [ ] Ensure `oidc_client_secret` is stored securely (e.g., Supabase Vault).

### 2.3 Logic for Tenancy & Access Control
- [ ] **Login & Access Logic:**
    - [ ] Verify `user_profiles.is_active = true` post-login.
    - [ ] Fetch user roles/permissions via `company_users` and `roles`.
    - [ ] Implement logic to combine `base_permissions` and `custom_permissions`.
- [ ] **Invitation Flow Logic:**
    - [ ] API/UI creates `invitations` record.
    - [ ] Edge Function generates unique `token`.
    - [ ] Edge Function sets `expires_at`.
    - [ ] Edge Function sends email via Resend with invitation link.
    - [ ] Frontend verifies token status/expiry via API.
    - [ ] Frontend prompts signup/login.
    - [ ] Frontend calls 'accept invite' API endpoint post-auth.
    - [ ] Backend (Edge Function/RPC) verifies token again.
    - [ ] Backend creates `company_users` record.
    - [ ] Backend updates invitation `status` to 'accepted'.
- [ ] **User Deactivation Logic:**
    - [ ] API endpoint sets `user_profiles.is_active = false`.
- [ ] **Role & Permission Management UI:** (Frontend Task)
- [ ] **Tenant/Company Admin Dashboard:** (Frontend Task)
- [ ] **Single Sign-On (SSO) Logic:**
    - [ ] Implement SSO Configuration UI (Frontend Task).
    - [ ] Enable Supabase Auth SAML/OIDC providers.
    - [ ] Implement Frontend SSO Login Flow (`signInWithSSO`).
    - [ ] Implement IdP discovery (domain matching, user selection, or URL param).
    - [ ] Implement Supabase Auth Hook for JIT Provisioning.
    - [ ] Implement JIT Provisioning Edge Function:
        - [ ] Receive claims/user ID.
        - [ ] Lookup `sso_configurations`.
        - [ ] Parse claims based on `attribute_mapping`.
        - [ ] Upsert `user_profiles` (create if needed, set `full_name`).
        - [ ] Upsert `company_users` record.
        - [ ] Map IdP groups/attributes to internal role (using `attribute_mapping`).
        - [ ] Ensure `user_profiles.is_active = true`.
        - [ ] Return custom claims for JWT.

### 2.4 Security Rules (RLS Policies in Supabase)
- [ ] Enable RLS on all relevant tables.
- [ ] Use default `DENY` policy where applicable.
- [ ] Apply policies `TO authenticated` generally.
- [ ] Implement `is_active_user` helper function.
- [ ] Implement `is_staff_user` helper function.
- [ ] Implement `is_member_of_company` helper function.
- [ ] Implement `has_permission` helper function (combining base/custom perms).
- [ ] Define centralized permission keys (e.g., in `permissions.ts`).
- [ ] Ensure RLS policies consistently use defined permission keys.
- [ ] Implement RLS policy for `companies`.
- [ ] Implement RLS policy for `user_profiles`.
- [ ] Implement RLS policy for `company_users`.
- [ ] Implement RLS policy for `invitations`.
- [ ] Implement RLS policy for `roles`.
- [ ] Implement RLS policy for `sso_configurations`.
- [ ] Verify RLS policies correctly filter data based on relationships (company -> project -> task etc.).

## 3. Projects Management

### 3.1 Projects (Conceptual)
- [ ] Define Project concept.

### 3.2 Data Model for Projects
- [ ] **`projects` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `project_template_version_id` (uuid, FK -> project_template_versions.id ON DELETE SET NULL, nullable).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `status` (text, required, CHECK ('Planning', 'Active', 'On Hold', 'Completed', 'Cancelled')).
    - [ ] Define `stage` (text, required, CHECK ('Kick-off', 'Discovery', 'Build', 'UAT', 'Go Live', 'Post Go Live')).
    - [ ] Define `health_status` (text, CHECK ('On Track', 'At Risk', 'Off Track', 'Unknown'), default 'Unknown', nullable).
    - [ ] Define `project_owner_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `company_id`.
    - [ ] Add index on `status`.
    - [ ] Add index on `stage`.
    - [ ] Add index on `project_owner_id`.
    - [ ] Implement `updated_at` trigger for `projects`.
- [ ] **`milestones` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `description` (text, nullable).
    - [ ] Define `due_date` (timestamptz, nullable).
    - [ ] Define `status` (text, required, CHECK ('Pending', 'In Progress', 'Completed', 'Approved', 'Rejected'), default 'Pending').
    - [ ] Define `order` (integer, default 0, not null).
    - [ ] Define `sign_off_required` (boolean, default false, not null).
    - [ ] Define `signed_off_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [ ] Define `signed_off_at` (timestamptz, nullable).
    - [ ] Define `approval_id` (uuid, FK -> approvals.id ON DELETE SET NULL, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `project_id`.
    - [ ] Add index on `status`.
    - [ ] Add index on `due_date`.
    - [ ] Implement `updated_at` trigger for `milestones`.
- [ ] **`risks` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `description` (text, required).
    - [ ] Define `reported_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [ ] Define `assigned_to_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [ ] Define `status` (text, required, CHECK ('Potential', 'Open', 'Mitigated', 'Closed'), default 'Potential').
    - [ ] Define `probability` (text, CHECK ('Low', 'Medium', 'High'), nullable).
    - [ ] Define `impact` (text, CHECK ('Low', 'Medium', 'High'), nullable).
    - [ ] Define `mitigation_plan` (text, nullable).
    - [ ] Define `contingency_plan` (text, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `project_id`.
    - [ ] Add index on `status`.
    - [ ] Add index on `assigned_to_user_id`.
    - [ ] Implement `updated_at` trigger for `risks`.
- [ ] **`issues` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `description` (text, required).
    - [ ] Define `reported_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [ ] Define `assigned_to_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [ ] Define `status` (text, required, CHECK ('Open', 'Investigating', 'Resolved', 'Closed'), default 'Open').
    - [ ] Define `priority` (text, CHECK ('Low', 'Medium', 'High', 'Critical'), default 'Medium', indexed).
    - [ ] Define `resolution` (text, nullable).
    - [ ] Define `related_risk_id` (uuid, FK -> risks.id ON DELETE SET NULL, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `project_id`.
    - [ ] Add index on `status`.
    - [ ] Add index on `priority`.
    - [ ] Add index on `assigned_to_user_id`.
    - [ ] Implement `updated_at` trigger for `issues`.

### 3.3 Logic for Projects
- [ ] **Milestone Tracking Logic:**
    - [ ] UI visualizes milestones.
    - [ ] Trigger notifications on status updates.
    - [ ] Implement sign-off workflow (if `sign_off_required`):
        - [ ] On 'Completed' status set, check flag.
        - [ ] If true, create `approvals` record (if using formal table).
        - [ ] Send approval request notification.
        - [ ] On approval action, update status, `signed_off_by_user_id`, `signed_off_at`.
- [ ] **Risk/Issue Management Logic:**
    - [ ] Implement UI CRUD operations.
    - [ ] Trigger notifications on assignment.
    - [ ] Trigger notifications on significant status changes.
- [ ] **Project Health Logic:**
    - [ ] Allow manual setting via UI/API.
    - [ ] Implement scheduled background job for automated calculation (if defined).

### 3.4 Security Rules (RLS) for Projects
- [ ] Implement RLS policy for `projects`.
- [ ] Implement RLS policy for `milestones`.
- [ ] Implement RLS policy for `risks`.
- [ ] Implement RLS policy for `issues`.
- [ ] Ensure policies check parent project access and specific action permissions.

### 3.5 Project Tasks & Sections (Conceptual)
- [ ] Define Section/Task relationship.

### 3.6 Data Model for Sections
- [ ] **`sections` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `section_template_id` (uuid, FK -> section_templates.id ON DELETE SET NULL, nullable).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `type` (text, required, CHECK ('INFO', 'BUILD', 'UAT', 'GO_LIVE', 'PLANNING', 'OTHER')).
    - [ ] Define `status` (text, required, CHECK ('Not Started', 'In Progress', 'Completed')).
    - [ ] Define `is_public` (boolean, default false, not null).
    - [ ] Define `order` (integer, default 0, not null, indexed).
    - [ ] Define `percent_complete` (float, CHECK (>= 0 AND <= 100)).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `project_id`.
    - [ ] Add index on `order`.
    - [ ] Implement `updated_at` trigger for `sections`.
    - [ ] Implement trigger on `tasks` to update `percent_complete`.

### 3.7 Data Model for Tasks
- [ ] **`tasks` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `section_id` (uuid, FK -> sections.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `milestone_id` (uuid, FK -> milestones.id ON DELETE SET NULL, nullable, indexed).
    - [ ] Define `task_template_id` (uuid, FK -> task_templates.id ON DELETE SET NULL, nullable).
    - [ ] Define `parent_task_id` (uuid, FK -> tasks.id ON DELETE CASCADE, nullable, indexed).
    - [ ] Define `recurring_definition_task_id` (uuid, FK -> tasks.id ON DELETE SET NULL, nullable).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `description` (text, nullable).
    - [ ] Define `status` (text, required, CHECK ('Open', 'In Progress', 'Complete', 'Blocked'), indexed).
    - [ ] Define `priority` (text, CHECK ('Low', 'Medium', 'High', 'Critical'), default 'Medium', nullable).
    - [ ] Define `actual_hours` (numeric, nullable).
    - [ ] Define `order` (integer, default 0, not null).
    - [ ] Define `due_date` (timestamptz, nullable, indexed).
    - [ ] Define `assigned_to_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [ ] Define `depends_on_task_id` (uuid, FK -> tasks.id ON DELETE SET NULL, nullable, indexed).
    - [ ] Define `condition` (jsonb, nullable).
    - [ ] Define `is_self_service` (boolean, default false, not null).
    - [ ] Define `estimated_effort_hours` (numeric, nullable).
    - [ ] Define `is_recurring_definition` (boolean, default false, not null, indexed).
    - [ ] Define `recurrence_rule` (text, nullable).
    - [ ] Define `recurrence_end_date` (timestamptz, nullable).
    - [ ] Define `next_occurrence_date` (timestamptz, nullable, indexed).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `section_id`.
    - [ ] Add index on `milestone_id`.
    - [ ] Add index on `parent_task_id`.
    - [ ] Add index on `assigned_to_id`.
    - [ ] Add index on `depends_on_task_id`.
    - [ ] Add index on `status`.
    - [ ] Add index on `due_date`.
    - [ ] Add index on `next_occurrence_date`.
    - [ ] Add index on `is_recurring_definition`.
    - [ ] Add CHECK constraint `id != parent_task_id`.
    - [ ] Add CHECK constraint `id != recurring_definition_task_id`.
    - [ ] Implement `updated_at` trigger for `tasks`.
- [ ] **`task_files` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `task_id` (uuid, FK -> tasks.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `file_path` (text, required).
    - [ ] Define `file_name` (text, required).
    - [ ] Define `file_size` (bigint, nullable).
    - [ ] Define `mime_type` (text, nullable).
    - [ ] Define `uploaded_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Ensure Storage bucket `task_attachments` policies are defined.
- [ ] **`task_comments` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `task_id` (uuid, FK -> tasks.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [ ] Define `content` (text, required, length check).
    - [ ] Define `parent_comment_id` (uuid, FK -> task_comments.id ON DELETE CASCADE, nullable, indexed).
    - [ ] Define `is_internal` (boolean, default false, not null).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `task_id`.
    - [ ] Add index on `user_id`.
    - [ ] Add index on `parent_comment_id`.
    - [ ] Implement `updated_at` trigger for `task_comments`.
    - [ ] Enable Supabase Realtime for `task_comments`.

### 3.8 Logic for Tasks & Sections
- [ ] Implement Section Progress Calculation trigger/function.
- [ ] Implement Frontend DND logic for `order` updates.
- [ ] Implement Conditional Task evaluation logic (frontend/backend).
- [ ] Implement Dependency enforcement logic (trigger/RLS/frontend).
- [ ] Implement Sub-Task UI hierarchy and completion logic.
- [ ] Implement Recurring Task definition UI.
- [ ] Implement Scheduled Function for recurring task instance creation.
- [ ] Implement failure logging for recurring task job.
- [ ] Store Task Effort Estimation value.
- [ ] Implement Internal Comment visibility logic (RLS/UI).
- [ ] Enable Supabase Realtime for `tasks`.

### 3.9 Security Rules (RLS) for Tasks & Sections
- [ ] Implement RLS policies for `sections`.
- [ ] Implement RLS policies for `tasks`.
- [ ] Implement RLS policies for `task_files`.
- [ ] Implement RLS policies for `task_comments` (including `is_internal` check).
- [ ] Ensure policies check parent project access.
- [ ] Ensure `tasks` policy checks `is_self_service`.
- [ ] Ensure `tasks` policy enforces dependencies.
- [ ] Ensure `tasks` policy restricts recurrence definition edits.

### 3.10 Project Templates (Conceptual)
- [ ] Define Template concept.

### 3.11 Data Model for Templates
- [ ] **`project_templates` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `name` (text, required, UNIQUE).
    - [ ] Define `description` (text, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
- [ ] **`project_template_versions` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `project_template_id` (uuid, FK -> project_templates.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `version_number` (integer, required, default 1).
    - [ ] Define `is_latest_version` (boolean, default true, not null).
    - [ ] Define `notes` (text, nullable).
    - [ ] Define `defined_placeholders` (jsonb, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Add index on `project_template_id`.
    - [ ] Add UNIQUE constraint on (`project_template_id`, `version_number`).
    - [ ] Implement logic to update `is_latest_version` flags.
- [ ] **`section_templates` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `project_template_version_id` (uuid, FK -> project_template_versions.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `name` (text, required, placeholder support).
    - [ ] Define `type` (text, required).
    - [ ] Define `order` (integer, default 0, not null).
    - [ ] Define `is_public` (boolean, default false, not null).
    - [ ] Define `created_at` (timestamptz, default, not null).
- [ ] **`task_templates` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `section_template_id` (uuid, FK -> section_templates.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `name` (text, required, placeholder support).
    - [ ] Define `description` (text, nullable, placeholder support).
    - [ ] Define `order` (integer, default 0, not null).
    - [ ] Define `is_self_service` (boolean, default false, not null).
    - [ ] Define `estimated_effort_hours` (numeric, nullable).
    - [ ] Define `condition_template` (jsonb, nullable).
    - [ ] Define `custom_field_template_values` (jsonb, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).

### 3.12 Logic for Templates
- [ ] **Creating from Template Logic:**
    - [ ] Implement UI for template selection and placeholder input.
    - [ ] Implement Backend function/RPC for instantiation.
    - [ ] Implement Placeholder Resolution logic (API -> defined source -> company fields -> custom fields -> default empty).
    - [ ] Implement Project creation logic.
    - [ ] Implement Section iteration/creation logic (with placeholder substitution).
    - [ ] Implement Task iteration/creation logic (with placeholder substitution).
    - [ ] Implement Custom Field Value creation from template defaults.
- [ ] **Versioning Logic:**
    - [ ] Implement Admin UI for version management.
    - [ ] Implement logic to update `is_latest_version` flag.

### 3.13 Security Rules (RLS) for Templates
- [ ] Implement RLS policies for `project_templates`.
- [ ] Implement RLS policies for `project_template_versions`.
- [ ] Implement RLS policies for `section_templates`.
- [ ] Implement RLS policies for `task_templates`.
- [ ] Ensure policies allow authenticated read and restrict write to staff with permission.

## 4. Documentation

### 4.1 Data Model for Documentation
- [ ] **`documents` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, nullable, indexed).
    - [ ] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, nullable, indexed).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `type` (text, required, CHECK ('solution', 'support', 'guide', 'project_plan', 'SOW', 'kb_article'), indexed).
    - [ ] Define `order` (integer, default 0, not null).
    - [ ] Define `version` (integer, default 1, not null).
    - [ ] Define `is_approved` (boolean, default false, not null).
    - [ ] Define `approved_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [ ] Define `approved_at` (timestamptz, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `company_id`.
    - [ ] Add index on `project_id`.
    - [ ] Add index on `type`.
    - [ ] Add CHECK constraint for valid scoping.
    - [ ] Implement `updated_at` trigger for `documents`.
- [ ] **`pages` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `document_id` (uuid, FK -> documents.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `order` (integer, default 0, not null, indexed).
    - [ ] Define `content` (text, required).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `document_id`.
    - [ ] Add index on `order`.
    - [ ] Implement `updated_at` trigger for `pages`.
    - [ ] Consider FTS index on `content`.
- [ ] **`document_comments` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `page_id` (uuid, FK -> pages.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [ ] Define `content` (text, required, length check).
    - [ ] Define `parent_comment_id` (uuid, FK -> document_comments.id ON DELETE CASCADE, nullable, indexed).
    - [ ] Define `is_internal` (boolean, default false, not null).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `page_id`.
    - [ ] Add index on `user_id`.
    - [ ] Add index on `parent_comment_id`.
    - [ ] Implement `updated_at` trigger for `document_comments`.
    - [ ] Enable Supabase Realtime for `document_comments`.

### 4.2 Logic for Documentation
- [ ] Implement Scope Filtering logic in queries.
- [ ] Implement simple Version Control logic (increment `version`).
- [ ] Implement Approval Workflow logic (manage `is_approved` status).
- [ ] Implement Document/Page Linking logic (frontend editor/renderer).
- [ ] Implement Internal Comment visibility logic (RLS/UI).

### 4.3 Security Rules (RLS) for Documentation
- [ ] Implement RLS policy for `documents`.
- [ ] Implement RLS policy for `pages`.
- [ ] Implement RLS policy for `document_comments` (including `is_internal` check).
- [ ] Ensure policies check scope and permissions correctly.

## 5. Meetings

### 5.1 Data Model for Meetings
- [ ] **`meetings` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, nullable, indexed).
    - [ ] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, nullable, indexed).
    - [ ] Define `calendly_event_uri` (text, required, indexed).
    - [ ] Define `calendly_invitee_uri` (text, required, indexed).
    - [ ] Define `name` (text, required).
    - [ ] Define `type` (text, required, CHECK ('adhoc', 'discovery', 'solution_walkthrough', 'build_walkthrough', 'uat_kickoff', 'uat_signoff', 'check_in')).
    - [ ] Define `status` (text, required, CHECK ('scheduled', 'completed', 'cancelled'), indexed).
    - [ ] Define `scheduled_at` (timestamptz, required, indexed).
    - [ ] Define `duration_minutes` (integer, nullable).
    - [ ] Define `attendees` (jsonb, nullable).
    - [ ] Define `recording_url` (text, nullable).
    - [ ] Define `notes` (text, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `company_id`.
    - [ ] Add index on `project_id`.
    - [ ] Add index on `calendly_event_uri`.
    - [ ] Add index on `scheduled_at`.
    - [ ] Add index on `status`.
    - [ ] Add CHECK constraint `(company_id IS NOT NULL OR project_id IS NOT NULL)`.
    - [ ] Implement `updated_at` trigger for `meetings`.

### 5.2 Logic for Meetings
- [ ] **Calendly Integration Logic:**
    - [ ] Implement Calendly Webhook Edge Function endpoint.
    - [ ] Implement payload parsing (`invitee.created`, `invitee.canceled`).
    - [ ] Implement context identification (company/project ID).
    - [ ] Implement `meetings` record upsert logic.
    - [ ] Implement error handling/logging for webhook.
- [ ] Implement Reschedule/Cancellation logic (via webhook).
- [ ] Implement Completion Lock logic (RLS/trigger).

### 5.3 Security Rules (RLS) for Meetings
- [ ] Implement RLS policy for `meetings`.
- [ ] Ensure policies check company/project access or staff status.
- [ ] Ensure policies restrict INSERT/UPDATE/DELETE based on role/status.

## 6. Training

### 6.1 Data Model for Training
- [ ] **`courses` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `description` (text, nullable).
    - [ ] Define `image_url` (text, nullable).
    - [ ] Define `is_active` (boolean, default true, not null, indexed).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `is_active`.
    - [ ] Implement `updated_at` trigger for `courses`.
- [ ] **`lessons` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `course_id` (uuid, FK -> courses.id ON DELETE CASCADE, required, indexed).
    - [ ] Define `name` (text, required, length check).
    - [ ] Define `type` (text, required, CHECK ('video', 'pdf', 'text', 'quiz', 'external_link')).
    - [ ] Define `content_url` (text, nullable).
    - [ ] Define `markdown_content` (text, nullable).
    - [ ] Define `quiz_data` (jsonb, nullable).
    - [ ] Define `order` (integer, default 0, not null, indexed).
    - [ ] Define `estimated_duration_minutes` (integer, nullable).
    - [ ] Define `created_at` (timestamptz, default, not null).
    - [ ] Define `updated_at` (timestamptz, default, not null).
    - [ ] Add index on `course_id`.
    - [ ] Add index on `order`.
    - [ ] Implement `updated_at` trigger for `lessons`.
    - [ ] Ensure Storage bucket `training_content` policies are defined.
- [ ] **`course_assignments` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `course_id` (uuid, FK -> courses.id ON DELETE CASCADE, not null, indexed).
    - [ ] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, not null).
    - [ ] Define `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, not null).
    - [ ] Define `assigned_at` (timestamptz, default, not null).
    - [ ] Define `due_date` (timestamptz, nullable).
    - [ ] Add index on (`user_id`, `company_id`).
    - [ ] Add index on `course_id`.
    - [ ] Add UNIQUE constraint on (`course_id`, `company_id`, `user_id`).
- [ ] **`lesson_completions` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `lesson_id` (uuid, FK -> lessons.id ON DELETE CASCADE, not null).
    - [ ] Define `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, not null).
    - [ ] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, not null).
    - [ ] Define `completed_at` (timestamptz, default, not null).
    - [ ] Define `quiz_score` (float, nullable, CHECK (>= 0 AND <= 100)).
    - [ ] Add index on (`user_id`, `company_id`, `lesson_id`).
    - [ ] Add UNIQUE constraint on (`lesson_id`, `user_id`, `company_id`).
- [ ] **`badges` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `name` (text, required, UNIQUE).
    - [ ] Define `description` (text, required).
    - [ ] Define `image_url` (text, required).
    - [ ] Define `criteria` (jsonb, required).
    - [ ] Define `created_at` (timestamptz, default, not null).
- [ ] **`user_badges` Table:**
    - [ ] Define `id` (uuid, PK, default).
    - [ ] Define `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, not null, indexed).
    - [ ] Define `badge_id` (uuid, FK -> badges.id ON DELETE CASCADE, not null, indexed).
    - [ ] Define `earned_at` (timestamptz, default, not null).
    - [ ] Define `context` (jsonb, nullable).
    - [ ] Add index on `user_id`.
    - [ ] Add index on `badge_id`.
    - [ ] Add UNIQUE constraint on (`user_id`, `badge_id`).

### 6.2 Logic for Training
- [ ] Implement Course Progress calculation (via Reporting Views).
- [ ] Implement Course Access filtering based on `course_assignments`.
- [ ] Implement Auto-Assignment logic (Edge Function/trigger, rules table TBD).
- [ ] Implement Certification logic:
    - [ ] Trigger on course completion.
    - [ ] Edge Function for PDF generation (PDFMonkey).
    - [ ] Upload PDF to `certificates` bucket.
    - [ ] Create `course_certificates` record (Schema TBD).
- [ ] Implement Gamification logic:
    - [ ] Backend logic/trigger evaluates `badges.criteria`.
    - [ ] Insert into `user_badges` if criteria met.
    - [ ] Implement UI display for earned badges.
- [ ] Implement Quiz logic:
    - [ ] Frontend renders quiz from `lessons.quiz_data`.
    - [ ] Backend endpoint validates submission.
    - [ ] Backend calculates `quiz_score`.
    - [ ] Backend records completion in `lesson_completions`.

### 6.3 Security Rules (RLS) for Training
- [ ] Implement RLS policy for `courses`.
- [ ] Implement RLS policy for `lessons`.
- [ ] Implement RLS policy for `course_assignments`.
- [ ] Implement RLS policy for `lesson_completions`.
- [ ] Implement RLS policy for `badges`.
- [ ] Implement RLS policy for `user_badges`.
- [ ] Define Storage policies for `training_images`.
- [ ] Define Storage policies for `training_content`.
- [ ] Define Storage policies for `certificates`.
- [ ] Define Storage policies for `badge_images`.

## 7. Additional Features

### 7.1 Dashboard and Analytics
- [ ] Ensure Reporting Views (Section 11) support dashboard requirements.

### 7.2 Advanced Workflow Features
- [ ] Ensure `tasks.condition` is evaluated correctly.
- [ ] Ensure `tasks.depends_on_task_id` is enforced.
- [ ] Implement Training Auto-Assignment (if rules defined).
- [ ] Implement SLA Tracking (scheduled function).

### 7.3 Client Experience Enhancements
- [ ] Ensure Role-based UI rendering is supported by backend permissions.
- [ ] Ensure `tasks.is_self_service` flag is respected.
- [ ] Implement Feedback Collection (`feedback` table/API).
- [ ] Implement Welcome Sequence (trigger/function).
- [ ] Implement Client Portal Customization (CSS Vars from `companies` table).

### 7.4 Integration Capabilities
- [ ] Implement Document Generation (Edge Function + PDFMonkey).
- [ ] Implement Email Sending (Edge Function + Resend).
- [ ] Implement Slack Integration (Edge Function + Slack API).

### 7.5 Advanced Permission System
- [ ] Ensure `roles`, `company_users.role`, `company_users.custom_permissions` are used correctly.
- [ ] Implement Role Management UI (Frontend Task).

### 7.6 Implementation Features
- [ ] Ensure Project Templates logic is implemented (Section 3.12).
- [ ] Implement Bulk Operations where feasible (client library).
- [ ] Implement Project Duplication Function (`clone_project`).

### 7.7 Technical Enhancements
- [ ] **Audit Logging:**
    - [ ] Define `audit_log` table.
    - [ ] Implement triggers to populate `audit_log`.
    - [ ] Implement Audit Log Viewer UI (Frontend Task).
- [ ] **Rate Limiting:**
    - [ ] Configure Supabase Auth rate limits.
    - [ ] Implement custom rate limiting in Edge Functions if needed.

### 7.8 Documentation System Improvements
- [ ] Implement simple `documents.version` tracking.
- [ ] Implement `documents.is_approved` workflow.
- [ ] Define `document_templates` table schema (TBD).
- [ ] Support `type='kb_article'`.
- [ ] Implement Internal Linking (frontend editor/renderer).

### 7.9 Communication Enhancements
- [ ] Define `conversations` table schema (TBD).
- [ ] Define `messages` table schema (TBD).
- [ ] Implement Recording Storage (`meetings.recording_url`).
- [ ] Define Bot integration strategy (TBD).
- [ ] Implement @mentions parsing and notification logic.
- [ ] Implement `announcements` table and API.

### 7.10 Training System Enhancements
- [ ] Support Interactive Content (`lessons.quiz_data`).
- [ ] Implement Certification generation/storage.
- [ ] Implement Assignment Rules (TBD).
- [ ] Ensure Training Analytics Views are implemented.
- [ ] Implement Gamification (`badges`, `user_badges`, award logic).

### 7.11 Global Search
- [ ] Implement `search_index` table.
- [ ] Implement triggers to update `search_index`.
- [ ] Implement RPC function for querying `search_index` with RLS.
- [ ] Utilize Supabase FTS.

### 7.12 Time Tracking
- [ ] Implement `time_entries` table.
- [ ] Implement API endpoints/RPCs for time tracking actions.
- [ ] Ensure Reporting Views for time tracking are implemented.

### 7.13 Custom Fields
- [ ] Implement `custom_field_definitions` table.
- [ ] Implement `custom_field_values` table.
- [ ] Implement Staff UI for managing definitions (Frontend Task).
- [ ] Ensure custom fields are usable across specified entities.

### 7.14 Data Retention Policies
- [ ] Implement configuration storage (`companies` table or system table).
- [ ] Implement scheduled Edge Function for executing retention.
- [ ] Ensure logging for retention actions.

### 7.15 Error Handling Philosophy
- [ ] Implement standardized API error JSON responses (4xx/5xx).
- [ ] Implement standardized validation error response (422).
- [ ] Implement background job failure logging (`background_job_failures` table).
- [ ] Implement Sentry integration (SDK setup, context enrichment).

## 8. Backend Implementation Plan

### 8.1 Database Setup
- [ ] Implement all defined tables via SQL migrations.
- [ ] Define all PKs, FKs, Constraints.
- [ ] Enable required PostgreSQL extensions.
- [ ] Create all necessary indexes.
- [ ] Implement all required database functions/triggers.
- [ ] Define and implement initial seed data (roles, permissions).

### 8.2 Real-time Features
- [ ] Enable Supabase Realtime for specified tables.
- [ ] Verify RLS compatibility with Realtime.

### 8.3 Storage
- [ ] Create all specified storage buckets.
- [ ] Define and apply strict Storage Access Policies for each bucket.

### 8.4 Edge Functions
- [ ] Develop Webhook handler (Calendly).
- [ ] Develop Notification Sender function.
- [ ] Develop Third-Party API Integrations (PDFMonkey).
- [ ] Develop Scheduled Task functions (Recurrence, SLA, Health, Retention, etc.).
- [ ] Develop Business Logic functions (Template Instantiation, Certificate Gen, Invite Accept, JIT).
- [ ] Ensure JWT verification in functions.
- [ ] Store secrets securely (Supabase Vault).
- [ ] Implement robust input validation in all functions.
- [ ] Implement error handling/logging in all functions.

### 8.5 Security
- [ ] Implement comprehensive RLS policies.
- [ ] Leverage Supabase Auth features (MFA, rate limiting, etc.).
- [ ] Implement Role-Based Authorization checks.
- [ ] Implement Input Validation and Sanitization.
- [ ] Implement secure Storage Policies.
- [ ] Utilize Supabase Vault for Secrets Management.

### 8.6 Scalability & Performance
- [ ] Implement all necessary database indexes.
- [ ] Utilize Views (Standard/Materialized) appropriately.
- [ ] Optimize database queries.
- [ ] Ensure efficient connection pooling (Supavisor).
- [ ] Optimize Edge Function performance.

## 9. API Endpoints
- [ ] Define and implement RESTful/RPC endpoints for all required frontend interactions.
- [ ] Ensure endpoints handle CRUD operations and specific actions.
- [ ] Implement standardized success and error responses.
- [ ] Implement API Versioning (`/api/v1/...`).

## 10. Configuration & Administration
- [ ] Ensure backend supports required Admin UIs (Roles, Custom Fields, Templates, Retention, Audit Log).

## 11. Reporting & Analytics Views
- [ ] Implement `view_project_summary`.
- [ ] Implement `view_task_details`.
- [ ] Implement `view_overdue_tasks`.
- [ ] Implement `view_staff_workload`.
- [ ] Implement `view_time_tracking_summary`.
- [ ] Implement `view_effort_variance`.
- [ ] Implement `view_milestone_status`.
- [ ] Implement `view_company_training_compliance`.
- [ ] Implement `view_open_risks_issues`.
- [ ] Implement `view_template_performance`.
- [ ] Implement `view_client_engagement_summary`.
- [ ] Implement `view_onboarding_cycle_time`.
- [ ] Implement `view_document_usage`.
- [ ] Implement `view_custom_field_analysis`.
- [ ] Implement Materialized View refresh schedule (if used).
- [ ] Implement RPC functions for accessing views with filtering/pagination/RLS.
- [ ] Ensure underlying table indexing supports view performance.

## 12. General Requirements
- [ ] Define default sorting for API list endpoints.
- [ ] Ensure backend provides necessary data for frontend accessibility.
- [ ] Consider i18n/l10n in schema design.
- [ ] Collaborate with frontend on API design.
- [ ] Implement initial system seeding script/migration.

## 13. Conclusion (Informational - No Checklist Items)
