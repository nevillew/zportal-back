# ZPortal Backend Implementation Checklist (Based on Spec v3.3)

This checklist covers all items specified in `plan.md` version 3.3.

## 1. Overview (Informational - No Checklist Items)

## 2. Tenancy & User Management

### 2.1 Multi-Tenancy Model (Conceptual)
- [x] Define "Company" as the Tenant.
- [x] Define User Association via `company_users` table.
- [x] Define Staff Access via `user_profiles.is_staff = true`.
- [x] Define User Lifecycle (Invitation, Deactivation, SSO).

### 2.2 Data Model for Tenancy
- [x] **`companies` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `name` (text, required, length check).
    - [x] Define `logo_url` (text, nullable).
    - [x] Define `primary_color` (text, nullable).
    - [x] Define `secondary_color` (text, nullable).
    - [x] Define `client_portal_logo_url` (text, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Define `project_retention_days` (integer, nullable).
    - [x] Define `log_retention_days` (integer, nullable).
    - [x] Implement `updated_at` trigger for `companies`.
- [x] **`users` Table (auth.users):**
    - [x] Acknowledge reliance on Supabase Auth schema.
- [x] **`user_profiles` Table:**
    - [x] Define `user_id` (uuid, PK, FK -> auth.users.id ON DELETE CASCADE).
    - [x] Define `full_name` (text, nullable).
    - [x] Define `avatar_url` (text, nullable).
    - [x] Define `is_staff` (boolean, default false, not null).
    - [x] Define `is_active` (boolean, default true, not null).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Implement trigger to create profile on `auth.users` insert.
    - [x] Implement `updated_at` trigger for `user_profiles`.
    - [x] Ensure login checks/RLS consider `is_active = true`.
- [x] **`company_users` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, not null).
    - [x] Define `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, not null).
    - [x] Define `role` (text, FK -> roles.role_name ON DELETE RESTRICT, not null).
    - [x] Define `custom_permissions` (jsonb, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Add index on `company_id`.
    - [x] Add index on `user_id`.
    - [x] Add index on (`company_id`, `user_id`).
    - [x] Add UNIQUE constraint on (`company_id`, `user_id`).
- [x] **`invitations` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `email` (text, required).
    - [x] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, required).
    - [x] Define `role` (text, FK -> roles.role_name ON DELETE RESTRICT, required).
    - [x] Define `invited_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [x] Define `token` (text, required, UNIQUE).
    - [x] Define `status` (text, required, CHECK ('pending', 'accepted', 'expired', 'revoked'), default 'pending').
    - [x] Define `expires_at` (timestamptz, required).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `email`.
    - [x] Add index on `token`.
    - [x] Add index on `status`.
    - [x] Implement `updated_at` trigger for `invitations`.
- [x] **`roles` Table:**
    - [x] Define `role_name` (text, PK).
    - [x] Define `description` (text, nullable).
    - [x] Define `base_permissions` (jsonb, required).
    - [x] Define `is_system_role` (boolean, default false, not null).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Implement `updated_at` trigger for `roles`.
    - [x] Seed default roles (Staff Admin, Company Admin, Project Manager, Client Admin, Client Viewer).
- [x] **`sso_configurations` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, UNIQUE, required).
    - [x] Define `provider_type` (text, CHECK ('saml', 'oidc'), required).
    - [x] Define `is_active` (boolean, default false, not null).
    - [x] Define `domain` (text, nullable, indexed).
    - [x] Define `metadata_url` (text, nullable).
    - [x] Define `metadata_xml` (text, nullable).
    - [x] Define `oidc_client_id` (text, nullable).
    - [x] Define `oidc_client_secret` (text, nullable, store securely).
    - [x] Define `oidc_discovery_url` (text, nullable).
    - [x] Define `attribute_mapping` (jsonb, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `company_id`.
    - [x] Add index on `domain`.
    - [x] Add index on `is_active`.
    - [x] Implement `updated_at` trigger for `sso_configurations`.
    - [x] Ensure `oidc_client_secret` is stored securely (e.g., Supabase Vault).

### 2.3 Logic for Tenancy & Access Control
- [x] **Login & Access Logic:**
    - [x] Verify `user_profiles.is_active = true` post-login.
    - [x] Fetch user roles/permissions via `company_users` and `roles`.
    - [x] Implement logic to combine `base_permissions` and `custom_permissions`.
- [x] **Invitation Flow Logic:**
    - [x] API/UI creates `invitations` record.
    - [x] Edge Function generates unique `token`.
    - [x] Edge Function sets `expires_at`.
    - [x] Edge Function sends email via Resend with invitation link.
    - [ ] Frontend verifies token status/expiry via API.
    - [ ] Frontend prompts signup/login.
    - [ ] Frontend calls 'accept invite' API endpoint post-auth.
    - [x] Backend (Edge Function/RPC) verifies token again.
    - [x] Backend creates `company_users` record.
    - [x] Backend updates invitation `status` to 'accepted'.
- [x] **User Deactivation Logic:**
    - [x] API endpoint sets `user_profiles.is_active = false`.
- [ ] **Role & Permission Management UI:** (Frontend Task)
- [ ] **Tenant/Company Admin Dashboard:** (Frontend Task)
- [x] **Single Sign-On (SSO) Logic:**
    - [ ] Implement SSO Configuration UI (Frontend Task).
    - [ ] Enable Supabase Auth SAML/OIDC providers.
    - [ ] Implement Frontend SSO Login Flow (`signInWithSSO`).
    - [ ] Implement IdP discovery (domain matching, user selection, or URL param).
    - [x] Implement Supabase Auth Hook for JIT Provisioning.
    - [x] Implement JIT Provisioning Edge Function:
        - [x] Receive claims/user ID.
        - [x] Lookup `sso_configurations`.
        - [x] Parse claims based on `attribute_mapping`.
        - [x] Upsert `user_profiles` (create if needed, set `full_name`).
        - [x] Upsert `company_users` record.
        - [x] Map IdP groups/attributes to internal role (using `attribute_mapping`).
        - [x] Ensure `user_profiles.is_active = true`.
        - [x] Return custom claims for JWT.

### 2.4 Security Rules (RLS Policies in Supabase)
- [x] Enable RLS on all relevant tables.
- [x] Use default `DENY` policy where applicable.
- [x] Apply policies `TO authenticated` generally.
- [x] Implement `is_active_user` helper function.
- [x] Implement `is_staff_user` helper function.
- [x] Implement `is_member_of_company` helper function.
- [x] Implement `has_permission` helper function (combining base/custom perms).
- [x] Define centralized permission keys (e.g., in `permissions.ts`).
- [x] Ensure RLS policies consistently use defined permission keys.
- [x] Implement RLS policy for `companies`.
- [x] Implement RLS policy for `user_profiles`.
- [ ] Implement RLS policy for `company_users`.
- [ ] Implement RLS policy for `invitations`.
- [ ] Implement RLS policy for `roles`.
- [ ] Implement RLS policy for `sso_configurations`.
- [x] Verify RLS policies correctly filter data based on relationships (company -> project -> task etc.).

## 3. Projects Management

### 3.1 Projects (Conceptual)
- [x] Define Project concept.

### 3.2 Data Model for Projects
- [x] **`projects` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, required, indexed).
    - [x] Define `project_template_version_id` (uuid, FK -> project_template_versions.id ON DELETE SET NULL, nullable).
    - [x] Define `name` (text, required, length check).
    - [x] Define `status` (text, required, CHECK ('Planning', 'Active', 'On Hold', 'Completed', 'Cancelled')).
    - [x] Define `stage` (text, required, CHECK ('Kick-off', 'Discovery', 'Build', 'UAT', 'Go Live', 'Post Go Live')).
    - [x] Define `health_status` (text, CHECK ('On Track', 'At Risk', 'Off Track', 'Unknown'), default 'Unknown', nullable).
    - [x] Define `project_owner_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `company_id`.
    - [x] Add index on `status`.
    - [x] Add index on `stage`.
    - [x] Add index on `project_owner_id`.
    - [x] Implement `updated_at` trigger for `projects`.
- [x] **`milestones` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, required, indexed).
    - [x] Define `name` (text, required, length check).
    - [x] Define `description` (text, nullable).
    - [x] Define `due_date` (timestamptz, nullable).
    - [x] Define `status` (text, required, CHECK ('Pending', 'In Progress', 'Completed', 'Approved', 'Rejected'), default 'Pending').
    - [x] Define `order` (integer, default 0, not null).
    - [x] Define `sign_off_required` (boolean, default false, not null).
    - [x] Define `signed_off_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [x] Define `signed_off_at` (timestamptz, nullable).
    - [x] Define `approval_id` (uuid, FK -> approvals.id ON DELETE SET NULL, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `project_id`.
    - [x] Add index on `status`.
    - [x] Add index on `due_date`.
    - [x] Implement `updated_at` trigger for `milestones`.
- [x] **`risks` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, required, indexed).
    - [x] Define `description` (text, required).
    - [x] Define `reported_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [x] Define `assigned_to_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [x] Define `status` (text, required, CHECK ('Potential', 'Open', 'Mitigated', 'Closed'), default 'Potential').
    - [x] Define `probability` (text, CHECK ('Low', 'Medium', 'High'), nullable).
    - [x] Define `impact` (text, CHECK ('Low', 'Medium', 'High'), nullable).
    - [x] Define `mitigation_plan` (text, nullable).
    - [x] Define `contingency_plan` (text, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `project_id`.
    - [x] Add index on `status`.
    - [x] Add index on `assigned_to_user_id`.
    - [x] Implement `updated_at` trigger for `risks`.
- [x] **`issues` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, required, indexed).
    - [x] Define `description` (text, required).
    - [x] Define `reported_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [x] Define `assigned_to_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [x] Define `status` (text, required, CHECK ('Open', 'Investigating', 'Resolved', 'Closed'), default 'Open').
    - [x] Define `priority` (text, CHECK ('Low', 'Medium', 'High', 'Critical'), default 'Medium', indexed).
    - [x] Define `resolution` (text, nullable).
    - [x] Define `related_risk_id` (uuid, FK -> risks.id ON DELETE SET NULL, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `project_id`.
    - [x] Add index on `status`.
    - [x] Add index on `priority`.
    - [x] Add index on `assigned_to_user_id`.
    - [x] Implement `updated_at` trigger for `issues`.

### 3.3 Logic for Projects
- [ ] **Milestone Tracking Logic:**
    - [ ] UI visualizes milestones.
    - [x] Trigger notifications on status updates.
    - [ ] Implement sign-off workflow (if `sign_off_required`):
        - [x] On 'Completed' status set, check flag.
        - [ ] If true, create `approvals` record (if using formal table).
        - [x] Send approval request notification.
        - [x] On approval action, update status, `signed_off_by_user_id`, `signed_off_at`.
- [x] **Risk/Issue Management Logic:**
    - [ ] Implement UI CRUD operations.
    - [x] Trigger notifications on assignment.
    - [x] Trigger notifications on significant status changes.
- [ ] **Project Health Logic:**
    - [x] Allow manual setting via UI/API.
    - [ ] Implement scheduled background job for automated calculation (if defined).

### 3.4 Security Rules (RLS) for Projects
- [x] Implement RLS policy for `projects`.
- [x] Implement RLS policy for `milestones`.
- [x] Implement RLS policy for `risks`.
- [x] Implement RLS policy for `issues`.
- [x] Ensure policies check parent project access and specific action permissions.

### 3.5 Project Tasks & Sections (Conceptual)
- [x] Define Section/Task relationship.

### 3.6 Data Model for Sections
- [x] **`sections` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, required, indexed).
    - [x] Define `section_template_id` (uuid, FK -> section_templates.id ON DELETE SET NULL, nullable).
    - [x] Define `name` (text, required, length check).
    - [x] Define `type` (text, required, CHECK ('INFO', 'BUILD', 'UAT', 'GO_LIVE', 'PLANNING', 'OTHER')).
    - [x] Define `status` (text, required, CHECK ('Not Started', 'In Progress', 'Completed')).
    - [x] Define `is_public` (boolean, default false, not null).
    - [x] Define `order` (integer, default 0, not null, indexed).
    - [x] Define `percent_complete` (float, CHECK (>= 0 AND <= 100)).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `project_id`.
    - [x] Add index on `order`.
    - [x] Implement `updated_at` trigger for `sections`.
    - [x] Implement trigger on `tasks` to update `percent_complete`.

### 3.7 Data Model for Tasks
- [x] **`tasks` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `section_id` (uuid, FK -> sections.id ON DELETE CASCADE, required, indexed).
    - [x] Define `milestone_id` (uuid, FK -> milestones.id ON DELETE SET NULL, nullable, indexed).
    - [x] Define `task_template_id` (uuid, FK -> task_templates.id ON DELETE SET NULL, nullable).
    - [x] Define `parent_task_id` (uuid, FK -> tasks.id ON DELETE CASCADE, nullable, indexed).
    - [x] Define `recurring_definition_task_id` (uuid, FK -> tasks.id ON DELETE SET NULL, nullable).
    - [x] Define `name` (text, required, length check).
    - [x] Define `description` (text, nullable).
    - [x] Define `status` (text, required, CHECK ('Open', 'In Progress', 'Complete', 'Blocked'), indexed).
    - [x] Define `priority` (text, CHECK ('Low', 'Medium', 'High', 'Critical'), default 'Medium', nullable).
    - [x] Define `actual_hours` (numeric, nullable).
    - [x] Define `order` (integer, default 0, not null).
    - [x] Define `due_date` (timestamptz, nullable, indexed).
    - [x] Define `assigned_to_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [x] Define `depends_on_task_id` (uuid, FK -> tasks.id ON DELETE SET NULL, nullable, indexed).
    - [x] Define `condition` (jsonb, nullable).
    - [x] Define `is_self_service` (boolean, default false, not null).
    - [x] Define `estimated_effort_hours` (numeric, nullable).
    - [x] Define `is_recurring_definition` (boolean, default false, not null, indexed).
    - [x] Define `recurrence_rule` (text, nullable).
    - [x] Define `recurrence_end_date` (timestamptz, nullable).
    - [x] Define `next_occurrence_date` (timestamptz, nullable, indexed).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `section_id`.
    - [x] Add index on `milestone_id`.
    - [x] Add index on `parent_task_id`.
    - [x] Add index on `assigned_to_id`.
    - [x] Add index on `depends_on_task_id`.
    - [x] Add index on `status`.
    - [x] Add index on `due_date`.
    - [x] Add index on `next_occurrence_date`.
    - [x] Add index on `is_recurring_definition`.
    - [x] Add CHECK constraint `id != parent_task_id`.
    - [x] Add CHECK constraint `id != recurring_definition_task_id`.
    - [x] Implement `updated_at` trigger for `tasks`.
- [x] **`task_files` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `task_id` (uuid, FK -> tasks.id ON DELETE CASCADE, required, indexed).
    - [x] Define `file_path` (text, required).
    - [x] Define `file_name` (text, required).
    - [x] Define `file_size` (bigint, nullable).
    - [x] Define `mime_type` (text, nullable).
    - [x] Define `uploaded_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Ensure Storage bucket `task_attachments` policies are defined.
- [x] **`task_comments` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `task_id` (uuid, FK -> tasks.id ON DELETE CASCADE, required, indexed).
    - [x] Define `user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [x] Define `content` (text, required, length check).
    - [x] Define `parent_comment_id` (uuid, FK -> task_comments.id ON DELETE CASCADE, nullable, indexed).
    - [x] Define `is_internal` (boolean, default false, not null).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `task_id`.
    - [x] Add index on `user_id`.
    - [x] Add index on `parent_comment_id`.
    - [x] Implement `updated_at` trigger for `task_comments`.
    - [x] Enable Supabase Realtime for `task_comments`.

### 3.8 Logic for Tasks & Sections
- [x] Implement Section Progress Calculation trigger/function.
- [ ] Implement Frontend DND logic for `order` updates.
- [ ] Implement Conditional Task evaluation logic (frontend/backend).
- [ ] Implement Dependency enforcement logic (trigger/RLS/frontend).
- [ ] Implement Sub-Task UI hierarchy and completion logic.
- [ ] Implement Recurring Task definition UI.
- [x] Implement Scheduled Function for recurring task instance creation.
- [x] Implement failure logging for recurring task job.
- [x] Store Task Effort Estimation value.
- [x] Implement Internal Comment visibility logic (RLS/UI).
- [x] Enable Supabase Realtime for `tasks`.

### 3.9 Security Rules (RLS) for Tasks & Sections
- [x] Implement RLS policies for `sections`.
- [x] Implement RLS policies for `tasks`.
- [x] Implement RLS policies for `task_files`.
- [x] Implement RLS policies for `task_comments` (including `is_internal` check).
- [x] Ensure policies check parent project access.
- [x] Ensure `tasks` policy checks `is_self_service`.
- [ ] Ensure `tasks` policy enforces dependencies.
- [ ] Ensure `tasks` policy restricts recurrence definition edits.

### 3.10 Project Templates (Conceptual)
- [x] Define Template concept.

### 3.11 Data Model for Templates
- [x] **`project_templates` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `name` (text, required, UNIQUE).
    - [x] Define `description` (text, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
- [ ] **`project_template_versions` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `project_template_id` (uuid, FK -> project_templates.id ON DELETE CASCADE, required, indexed).
    - [x] Define `version_number` (integer, required, default 1).
    - [x] Define `is_latest_version` (boolean, default true, not null).
    - [x] Define `notes` (text, nullable).
    - [x] Define `defined_placeholders` (jsonb, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Add index on `project_template_id`.
    - [x] Add UNIQUE constraint on (`project_template_id`, `version_number`).
    - [ ] Implement logic to update `is_latest_version` flags.
- [x] **`section_templates` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `project_template_version_id` (uuid, FK -> project_template_versions.id ON DELETE CASCADE, required, indexed).
    - [x] Define `name` (text, required, placeholder support).
    - [x] Define `type` (text, required).
    - [x] Define `order` (integer, default 0, not null).
    - [x] Define `is_public` (boolean, default false, not null).
    - [x] Define `created_at` (timestamptz, default, not null).
- [x] **`task_templates` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `section_template_id` (uuid, FK -> section_templates.id ON DELETE CASCADE, required, indexed).
    - [x] Define `name` (text, required, placeholder support).
    - [x] Define `description` (text, nullable, placeholder support).
    - [x] Define `order` (integer, default 0, not null).
    - [x] Define `is_self_service` (boolean, default false, not null).
    - [x] Define `estimated_effort_hours` (numeric, nullable).
    - [x] Define `condition_template` (jsonb, nullable).
    - [x] Define `custom_field_template_values` (jsonb, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).

### 3.12 Logic for Templates
- [ ] **Creating from Template Logic:**
    - [ ] Implement UI for template selection and placeholder input.
    - [x] Implement Backend function/RPC for instantiation.
    - [ ] Implement Placeholder Resolution logic (API -> defined source -> company fields -> custom fields -> default empty).
    - [x] Implement Project creation logic.
    - [x] Implement Section iteration/creation logic (with placeholder substitution).
    - [x] Implement Task iteration/creation logic (with placeholder substitution).
    - [x] Implement Custom Field Value creation from template defaults.
- [ ] **Versioning Logic:**
    - [ ] Implement Admin UI for version management.
    - [ ] Implement logic to update `is_latest_version` flag.

### 3.13 Security Rules (RLS) for Templates
- [x] Implement RLS policies for `project_templates`.
- [x] Implement RLS policies for `project_template_versions`.
- [x] Implement RLS policies for `section_templates`.
- [x] Implement RLS policies for `task_templates`.
- [x] Ensure policies allow authenticated read and restrict write to staff with permission.

## 4. Documentation

### 4.1 Data Model for Documentation
- [x] **`documents` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, nullable, indexed).
    - [x] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, nullable, indexed).
    - [x] Define `name` (text, required, length check).
    - [x] Define `type` (text, required, CHECK ('solution', 'support', 'guide', 'project_plan', 'SOW', 'kb_article'), indexed).
    - [x] Define `order` (integer, default 0, not null).
    - [x] Define `version` (integer, default 1, not null).
    - [x] Define `is_approved` (boolean, default false, not null).
    - [x] Define `approved_by_user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable).
    - [x] Define `approved_at` (timestamptz, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `company_id`.
    - [x] Add index on `project_id`.
    - [x] Add index on `type`.
    - [x] Add CHECK constraint for valid scoping.
    - [x] Implement `updated_at` trigger for `documents`.
- [x] **`pages` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `document_id` (uuid, FK -> documents.id ON DELETE CASCADE, required, indexed).
    - [x] Define `name` (text, required, length check).
    - [x] Define `order` (integer, default 0, not null, indexed).
    - [x] Define `content` (text, required).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `document_id`.
    - [x] Add index on `order`.
    - [x] Implement `updated_at` trigger for `pages`.
    - [ ] Consider FTS index on `content`.
- [x] **`document_comments` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `page_id` (uuid, FK -> pages.id ON DELETE CASCADE, required, indexed).
    - [x] Define `user_id` (uuid, FK -> auth.users.id ON DELETE SET NULL, nullable, indexed).
    - [x] Define `content` (text, required, length check).
    - [x] Define `parent_comment_id` (uuid, FK -> document_comments.id ON DELETE CASCADE, nullable, indexed).
    - [x] Define `is_internal` (boolean, default false, not null).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `page_id`.
    - [x] Add index on `user_id`.
    - [x] Add index on `parent_comment_id`.
    - [x] Implement `updated_at` trigger for `document_comments`.
    - [x] Enable Supabase Realtime for `document_comments`.

### 4.2 Logic for Documentation
- [x] Implement Scope Filtering logic in queries.
- [x] Implement simple Version Control logic (increment `version`).
- [ ] Implement Approval Workflow logic (manage `is_approved` status).
- [ ] Implement Document/Page Linking logic (frontend editor/renderer).
- [ ] Implement Internal Comment visibility logic (RLS/UI).

### 4.3 Security Rules (RLS) for Documentation
- [x] Implement RLS policy for `documents`.
- [x] Implement RLS policy for `pages`.
- [ ] Implement RLS policy for `document_comments` (including `is_internal` check).
- [x] Ensure policies check scope and permissions correctly.

## 5. Meetings

### 5.1 Data Model for Meetings
- [x] **`meetings` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, nullable, indexed).
    - [x] Define `project_id` (uuid, FK -> projects.id ON DELETE CASCADE, nullable, indexed).
    - [x] Define `calendly_event_uri` (text, required, indexed).
    - [x] Define `calendly_invitee_uri` (text, required, indexed).
    - [x] Define `name` (text, required).
    - [x] Define `type` (text, required, CHECK ('adhoc', 'discovery', 'solution_walkthrough', 'build_walkthrough', 'uat_kickoff', 'uat_signoff', 'check_in')).
    - [x] Define `status` (text, required, CHECK ('scheduled', 'completed', 'cancelled'), indexed).
    - [x] Define `scheduled_at` (timestamptz, required, indexed).
    - [x] Define `duration_minutes` (integer, nullable).
    - [x] Define `attendees` (jsonb, nullable).
    - [x] Define `recording_url` (text, nullable).
    - [x] Define `notes` (text, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `company_id`.
    - [x] Add index on `project_id`.
    - [x] Add index on `calendly_event_uri`.
    - [x] Add index on `scheduled_at`.
    - [x] Add index on `status`.
    - [x] Add CHECK constraint `(company_id IS NOT NULL OR project_id IS NOT NULL)`.
    - [x] Implement `updated_at` trigger for `meetings`.

### 5.2 Logic for Meetings
- [x] **Calendly Integration Logic:**
    - [x] Implement Calendly Webhook Edge Function endpoint.
    - [x] Implement payload parsing (`invitee.created`, `invitee.canceled`).
    - [x] Implement context identification (company/project ID).
    - [x] Implement `meetings` record upsert logic.
    - [x] Implement error handling/logging for webhook.
- [x] Implement Reschedule/Cancellation logic (via webhook).
- [ ] Implement Completion Lock logic (RLS/trigger).

### 5.3 Security Rules (RLS) for Meetings
- [x] Implement RLS policy for `meetings`.
- [x] Ensure policies check company/project access or staff status.
- [x] Ensure policies restrict INSERT/UPDATE/DELETE based on role/status.

## 6. Training

### 6.1 Data Model for Training
- [x] **`courses` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `name` (text, required, length check).
    - [x] Define `description` (text, nullable).
    - [x] Define `image_url` (text, nullable).
    - [x] Define `is_active` (boolean, default true, not null, indexed).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `is_active`.
    - [x] Implement `updated_at` trigger for `courses`.
- [x] **`lessons` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `course_id` (uuid, FK -> courses.id ON DELETE CASCADE, required, indexed).
    - [x] Define `name` (text, required, length check).
    - [x] Define `type` (text, required, CHECK ('video', 'pdf', 'text', 'quiz', 'external_link')).
    - [x] Define `content_url` (text, nullable).
    - [x] Define `markdown_content` (text, nullable).
    - [x] Define `quiz_data` (jsonb, nullable).
    - [x] Define `order` (integer, default 0, not null, indexed).
    - [x] Define `estimated_duration_minutes` (integer, nullable).
    - [x] Define `created_at` (timestamptz, default, not null).
    - [x] Define `updated_at` (timestamptz, default, not null).
    - [x] Add index on `course_id`.
    - [x] Add index on `order`.
    - [x] Implement `updated_at` trigger for `lessons`.
    - [x] Ensure Storage bucket `training_content` policies are defined.
- [x] **`course_assignments` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `course_id` (uuid, FK -> courses.id ON DELETE CASCADE, not null, indexed).
    - [x] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, not null).
    - [x] Define `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, not null).
    - [x] Define `assigned_at` (timestamptz, default, not null).
    - [x] Define `due_date` (timestamptz, nullable).
    - [x] Add index on (`user_id`, `company_id`).
    - [x] Add index on `course_id`.
    - [x] Add UNIQUE constraint on (`course_id`, `company_id`, `user_id`).
- [x] **`lesson_completions` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `lesson_id` (uuid, FK -> lessons.id ON DELETE CASCADE, not null).
    - [x] Define `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, not null).
    - [x] Define `company_id` (uuid, FK -> companies.id ON DELETE CASCADE, not null).
    - [x] Define `completed_at` (timestamptz, default, not null).
    - [x] Define `quiz_score` (float, nullable, CHECK (>= 0 AND <= 100)).
    - [x] Add index on (`user_id`, `company_id`, `lesson_id`).
    - [x] Add UNIQUE constraint on (`lesson_id`, `user_id`, `company_id`).
- [x] **`badges` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `name` (text, required, UNIQUE).
    - [x] Define `description` (text, required).
    - [x] Define `image_url` (text, required).
    - [x] Define `criteria` (jsonb, required).
    - [x] Define `created_at` (timestamptz, default, not null).
- [x] **`user_badges` Table:**
    - [x] Define `id` (uuid, PK, default).
    - [x] Define `user_id` (uuid, FK -> auth.users.id ON DELETE CASCADE, not null, indexed).
    - [x] Define `badge_id` (uuid, FK -> badges.id ON DELETE CASCADE, not null, indexed).
    - [x] Define `earned_at` (timestamptz, default, not null).
    - [x] Define `context` (jsonb, nullable).
    - [x] Add index on `user_id`.
    - [x] Add index on `badge_id`.
    - [x] Add UNIQUE constraint on (`user_id`, `badge_id`).

### 6.2 Logic for Training
- [x] Implement Course Progress calculation (via Reporting Views).
- [x] Implement Course Access filtering based on `course_assignments`.
- [ ] Implement Auto-Assignment logic (Edge Function/trigger, rules table TBD).
- [x] Implement Certification logic:
    - [x] Trigger on course completion.
    - [x] Edge Function for PDF generation (PDFMonkey).
    - [x] Upload PDF to `certificates` bucket.
    - [x] Create `course_certificates` record (Schema TBD).
- [x] Implement Gamification logic:
    - [x] Backend logic/trigger evaluates `badges.criteria`.
    - [x] Insert into `user_badges` if criteria met.
    - [ ] Implement UI display for earned badges.
- [ ] Implement Quiz logic:
    - [ ] Frontend renders quiz from `lessons.quiz_data`.
    - [ ] Backend endpoint validates submission.
    - [ ] Backend calculates `quiz_score`.
    - [ ] Backend records completion in `lesson_completions`.

### 6.3 Security Rules (RLS) for Training
- [x] Implement RLS policy for `courses`.
- [x] Implement RLS policy for `lessons`.
- [x] Implement RLS policy for `course_assignments`.
- [x] Implement RLS policy for `lesson_completions`.
- [x] Implement RLS policy for `badges`.
- [x] Implement RLS policy for `user_badges`.
- [x] Define Storage policies for `training_images`.
- [x] Define Storage policies for `training_content`.
- [x] Define Storage policies for `certificates`.
- [x] Define Storage policies for `badge_images`.

## 7. Additional Features

### 7.1 Dashboard and Analytics
- [x] Ensure Reporting Views (Section 11) support dashboard requirements.

### 7.2 Advanced Workflow Features
- [ ] Ensure `tasks.condition` is evaluated correctly.
- [ ] Ensure `tasks.depends_on_task_id` is enforced.
- [ ] Implement Training Auto-Assignment (if rules defined).
- [ ] Implement SLA Tracking (scheduled function).

### 7.3 Client Experience Enhancements
- [ ] Ensure Role-based UI rendering is supported by backend permissions.
- [x] Ensure `tasks.is_self_service` flag is respected.
- [x] Implement Feedback Collection (`feedback` table/API).
- [x] Implement Welcome Sequence (trigger/function).
- [ ] Implement Client Portal Customization (CSS Vars from `companies` table).

### 7.4 Integration Capabilities
- [x] Implement Document Generation (Edge Function + PDFMonkey).
- [x] Implement Email Sending (Edge Function + Resend).
- [x] Implement Slack Integration (Edge Function + Slack API).

### 7.5 Advanced Permission System
- [x] Ensure `roles`, `company_users.role`, `company_users.custom_permissions` are used correctly.
- [ ] Implement Role Management UI (Frontend Task).

### 7.6 Implementation Features
- [x] Ensure Project Templates logic is implemented (Section 3.12).
- [ ] Implement Bulk Operations where feasible (client library).
- [x] Implement Project Duplication Function (`clone_project`).

### 7.7 Technical Enhancements
- [x] **Audit Logging:**
    - [x] Define `audit_log` table.
    - [x] Implement triggers to populate `audit_log`.
    - [ ] Implement Audit Log Viewer UI (Frontend Task).
- [ ] **Rate Limiting:**
    - [x] Configure Supabase Auth rate limits.
    - [ ] Implement custom rate limiting in Edge Functions if needed.

### 7.8 Documentation System Improvements
- [x] Implement simple `documents.version` tracking.
- [ ] Implement `documents.is_approved` workflow.
- [ ] Define `document_templates` table schema (TBD).
- [x] Support `type='kb_article'`.
- [ ] Implement Internal Linking (frontend editor/renderer).

### 7.9 Communication Enhancements
- [x] Define `conversations` table schema (TBD).
- [x] Define `messages` table schema (TBD).
- [x] Implement Recording Storage (`meetings.recording_url`).
- [ ] Define Bot integration strategy (TBD).
- [x] Implement @mentions parsing and notification logic.
- [x] Implement `announcements` table and API.

### 7.10 Training System Enhancements
- [x] Support Interactive Content (`lessons.quiz_data`).
- [x] Implement Certification generation/storage.
- [ ] Implement Assignment Rules (TBD).
- [x] Ensure Training Analytics Views are implemented.
- [x] Implement Gamification (`badges`, `user_badges`, award logic).

### 7.11 Global Search
- [x] Implement `search_index` table.
- [x] Implement triggers to update `search_index`.
- [x] Implement RPC function for querying `search_index` with RLS.
- [x] Utilize Supabase FTS.

### 7.12 Time Tracking
- [x] Implement `time_entries` table.
- [x] Implement API endpoints/RPCs for time tracking actions.
- [x] Ensure Reporting Views for time tracking are implemented.

### 7.13 Custom Fields
- [x] Implement `custom_field_definitions` table.
- [x] Implement `custom_field_values` table.
- [ ] Implement Staff UI for managing definitions (Frontend Task).
- [x] Ensure custom fields are usable across specified entities.

### 7.14 Data Retention Policies
- [x] Implement configuration storage (`companies` table or system table).
- [x] Implement scheduled Edge Function for executing retention.
- [x] Ensure logging for retention actions.

### 7.15 Error Handling Philosophy
- [x] Implement standardized API error JSON responses (4xx/5xx).
- [x] Implement standardized validation error response (422).
- [x] Implement background job failure logging (`background_job_failures` table).
- [ ] Implement Sentry integration (SDK setup, context enrichment).

## 8. Backend Implementation Plan

### 8.1 Database Setup
- [x] Implement all defined tables via SQL migrations.
- [x] Define all PKs, FKs, Constraints.
- [x] Enable required PostgreSQL extensions.
- [x] Create all necessary indexes.
- [x] Implement all required database functions/triggers.
- [x] Define and implement initial seed data (roles, permissions).

### 8.2 Real-time Features
- [x] Enable Supabase Realtime for specified tables.
- [x] Verify RLS compatibility with Realtime.

### 8.3 Storage
- [x] Create all specified storage buckets.
- [x] Define and apply strict Storage Access Policies for each bucket.

### 8.4 Edge Functions
- [x] Develop Webhook handler (Calendly).
- [x] Develop Notification Sender function.
- [x] Develop Third-Party API Integrations (PDFMonkey).
- [ ] Develop Scheduled Task functions (Recurrence, SLA, Health, Retention, etc.).
- [x] Develop Business Logic functions (Template Instantiation, Certificate Gen, Invite Accept, JIT).
- [x] Ensure JWT verification in functions.
- [x] Store secrets securely (Supabase Vault).
- [x] Implement robust input validation in all functions.
- [x] Implement error handling/logging in all functions.

### 8.5 Security
- [x] Implement comprehensive RLS policies.
- [x] Leverage Supabase Auth features (MFA, rate limiting, etc.).
- [x] Implement Role-Based Authorization checks.
- [x] Implement Input Validation and Sanitization.
- [x] Implement secure Storage Policies.
- [x] Utilize Supabase Vault for Secrets Management.

### 8.6 Scalability & Performance
- [x] Implement all necessary database indexes.
- [x] Utilize Views (Standard/Materialized) appropriately.
- [ ] Optimize database queries.
- [x] Ensure efficient connection pooling (Supavisor).
- [ ] Optimize Edge Function performance.

## 9. API Endpoints
- [x] Define and implement RESTful/RPC endpoints for all required frontend interactions.
- [x] Ensure endpoints handle CRUD operations and specific actions.
- [x] Implement standardized success and error responses.
- [x] Implement API Versioning (`/api/v1/...`).

## 10. Configuration & Administration
- [ ] Ensure backend supports required Admin UIs (Roles, Custom Fields, Templates, Retention, Audit Log).

## 11. Reporting & Analytics Views
- [x] Implement `view_project_summary`.
- [x] Implement `view_task_details`.
- [x] Implement `view_overdue_tasks`.
- [x] Implement `view_staff_workload`.
- [x] Implement `view_time_tracking_summary`.
- [x] Implement `view_effort_variance`.
- [x] Implement `view_milestone_status`.
- [x] Implement `view_company_training_compliance`.
- [x] Implement `view_open_risks_issues`.
- [x] Implement `view_template_performance`.
- [x] Implement `view_client_engagement_summary`.
- [x] Implement `view_onboarding_cycle_time`.
- [x] Implement `view_document_usage`.
- [x] Implement `view_custom_field_analysis`.
- [x] Implement Materialized View refresh schedule (if used).
- [x] Implement RPC functions for accessing views with filtering/pagination/RLS.
- [x] Ensure underlying table indexing supports view performance.

## 12. General Requirements
- [x] Define default sorting for API list endpoints.
- [ ] Ensure backend provides necessary data for frontend accessibility.
- [x] Consider i18n/l10n in schema design.
- [x] Collaborate with frontend on API design.
- [x] Implement initial system seeding script/migration.

## 13. Conclusion (Informational - No Checklist Items)
