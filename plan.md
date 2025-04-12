## Backend Development Specification for Enterprise SaaS Client Onboarding Platform (Version 3.3)

**Document Version:** 3.3
**Date:** 2023-10-27

**(Based on Frontend Spec Version 1.3)**

---

## 1. Overview

**Purpose:** To streamline and standardize the implementation process for enterprise SaaS clients by providing a collaborative, transparent, and efficient platform for project management, documentation, meeting coordination, training, communication, risk mitigation, reporting, and tracking custom data points.

**Target Users:**

- **Internal Staff:** Project Managers, Implementation Specialists, Support Staff, Admins (with varying permission levels, including 'staff' for global access and managing custom field definitions).
- **Client Users:** Client-side stakeholders involved in the onboarding process (with roles defined via Role-Based Access Control).

**Key Objectives:**

- Manage client onboarding projects effectively using milestones, sections, tasks (including sub-tasks, recurring tasks, effort estimation), risks, and issues within a structured workflow, potentially derived from enhanced project templates. Manage and utilize custom fields defined per entity type.
- Provide a robust multi-tenant architecture with user invitations, deactivation, SSO support, and company-level administration capabilities.
- Enable detailed tracking of project progress, health, milestones, training, client interactions, time entries, document approvals, and facilitate communication via announcements and internal/external comments.
- Support advanced features like dashboards, analytics (via detailed reporting views), workflow automation, integrations (Slack), global search, training gamification, structured custom fields with admin UI, and data retention policies. Define and implement a clear error handling strategy.
- Ensure the platform is scalable, secure, provides granular permission controls via a manageable UI, and supports API versioning.

**Tech Stack:**

- **Backend & Database:** Supabase (PostgreSQL database, Auth w/ SSO support, Realtime, Storage, Edge Functions, Full-Text Search, pg_cron).
- **Frontend:** **Next.js** (See Frontend Spec v1.3).
- **Integrations:**
  - Calendly (meeting scheduling).
  - **Resend** (email service, via Supabase integrations).
  - **PDFMonkey** (PDF generation service).
  - Slack (notifications, potentially actions).
  - **Sentry** (Error monitoring service).
  - Potential third-party AI/Chatbots.

---

## 2. Tenancy & User Management

### 2.1 Multi-Tenancy Model

- **Tenant:** A "Company."
- **User Association:** Via `company_users` table, populated through invitations or potentially SSO Just-In-Time (JIT) provisioning.
- **Staff Access:** `user_profiles.is_staff = true` grants cross-tenant access.
- **User Lifecycle:** Invitation-based onboarding, deactivation (soft delete), optional SSO integration.

### 2.2 Data Model for Tenancy

- **`companies` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`)
  - `logo_url`: `text` (Optional, URL to logo image in Supabase Storage, bucket: `company_logos`)
  - `primary_color`: `text` (Optional, Hex color code, e.g., '#FF5733')
  - `secondary_color`: `text` (Optional, Hex color code)
  - `client_portal_logo_url`: `text` (Optional, URL to client-specific logo in Supabase Storage)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `project_retention_days`: `integer` (Nullable. For data retention policy - days after completion)
  - `log_retention_days`: `integer` (Nullable. For data retention policy - audit log days)
  - _Indexes:_ None explicitly needed beyond PK.
  - _Implementation Note:_ Add database trigger to automatically update `updated_at` on changes.

- **`users` Table (Managed via Supabase Auth - `auth.users`)**

  - Leverages standard Supabase Auth fields: `id` (uuid), `email`, `encrypted_password`, `role`, `created_at`, `updated_at`, `last_sign_in_at`, etc.

- **`user_profiles` Table**

  - `user_id`: `uuid` (Primary Key, Foreign Key referencing `auth.users.id` ON DELETE CASCADE)
  - `full_name`: `text` (Optional)
  - `avatar_url`: `text` (Optional, URL to avatar image in Supabase Storage, bucket: `user_avatars`)
  - `is_staff`: `boolean` (default: `false`, Not Null. Determines if user has global cross-tenant access)
  - `is_active`: `boolean` (default: `true`, Not Null. Used for user deactivation/soft delete)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ None explicitly needed beyond PK/FK.
  - _Implementation Note:_ Create this table in the `public` schema. Create a trigger or function to automatically create a profile when a new user signs up in Supabase Auth. Add database trigger to update `updated_at`. Login checks and RLS should consider `is_active = true`.

- **`company_users` Table (Junction Table for Company-User Mapping)**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `company_id`: `uuid` (Foreign Key referencing `companies.id` ON DELETE CASCADE, Not Null)
  - `user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE CASCADE, Not Null)
  - `role`: `text` (Foreign Key referencing `roles.role_name` ON DELETE RESTRICT, Not Null. Defines permissions within the company context via the assigned role)
  - `custom_permissions`: `jsonb` (Optional. Overrides/adds specific permissions for this user in this company, e.g., `{"can_approve_milestones": true}`)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`company_id`), (`user_id`), (`company_id`, `user_id`).
  - _Constraint:_ Add a UNIQUE constraint on (`company_id`, `user_id`) to prevent duplicate associations.

- **`invitations` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `email`: `text` (Required. Email address of the invitee)
  - `company_id`: `uuid` (Foreign Key referencing `companies.id` ON DELETE CASCADE, Required)
  - `role`: `text` (Foreign Key referencing `roles.role_name` ON DELETE RESTRICT, Required. Role to be assigned upon acceptance)
  - `invited_by_user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable. Who sent the invite)
  - `token`: `text` (Required, UNIQUE. Secure, random token for the invitation link)
  - `status`: `text` (Required, Enum or check constraint: 'pending', 'accepted', 'expired', 'revoked'. Default: 'pending')
  - `expires_at`: `timestamp with time zone` (Required. E.g., 7 days from creation)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`email`), (`token`), (`status`).
  - _Implementation Note:_ Add database trigger to update `updated_at`.

- **`roles` Table**

  - `role_name`: `text` (Primary Key. e.g., 'Project Manager', 'Client Viewer', 'Company Admin', 'Staff Admin')
  - `description`: `text` (Optional)
  - `base_permissions`: `jsonb` (Required. Defines default permissions for this role, e.g., `{"view_tasks": true, "edit_own_comments": true, "is_client_role": true, "can_manage_company_users": false}`)
  - `is_system_role`: `boolean` (default: `false`. If true, prevents deletion via UI/API)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ None explicitly needed beyond PK.
  - _Implementation Note:_ Managed via Role Management UI (See Frontend Spec Section 10). Seeded with essential default roles. `company_users.role` references this table. Permissions keys defined within the application code/logic (see Section 2.4 Note).

- **`sso_configurations` Table**
  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `company_id`: `uuid` (Foreign Key referencing `companies.id` ON DELETE CASCADE, UNIQUE, Required)
  - `provider_type`: `text` (Enum: 'saml', 'oidc'. Required)
  - `is_active`: `boolean` (default: `false`, Not Null)
  - `domain`: `text` (Optional, Indexed. Email domain linked to this IdP, e.g., 'client-company.com'. Used for IdP discovery)
  - `metadata_url`: `text` (Optional. For SAML configuration)
  - `metadata_xml`: `text` (Optional. For SAML configuration, if URL not used)
  - `oidc_client_id`: `text` (Optional. For OIDC configuration)
  - `oidc_client_secret`: `text` (Optional. Store securely, e.g., using Supabase Vault)
  - `oidc_discovery_url`: `text` (Optional. For OIDC configuration)
  - `attribute_mapping`: `jsonb` (Optional. Maps IdP attributes to user profile fields/roles, e.g., `{"email": "email", "firstName": "full_name", "groups": "role"}`)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`company_id`), (`domain`), (`is_active`).
  - _Implementation Note:_ Add database trigger to update `updated_at`. Securely store secrets like `oidc_client_secret`. Managed via Company Admin Dashboard.

### 2.3 Logic for Tenancy & Access Control

- **Login & Access:** Standard login via Supabase Auth (`signInWithPassword`, `signInWithOAuth`, `signInWithSSO`). Post-login, verify `user_profiles.is_active = true`. Fetch user's roles and permissions by joining `company_users` with `roles` for the relevant company context. Effective permissions are a combination of `roles.base_permissions` potentially overridden or augmented by `company_users.custom_permissions`.
- **Invitation Flow:**
  - Authorized users (Staff or Company Admins with permission) create an `invitations` record via API/UI.
  - Supabase Edge Function generates a unique `token`, sets `expires_at`, and uses Resend to email the invitee with a link: `https://<your-app-url>/accept-invitation?token={token}`.
  - On link visit, frontend verifies the token (status='pending', not expired) via API.
  - If valid, prompts user to sign up (if email not in `auth.users`) or log in.
  - Post-auth, frontend calls an 'accept invite' API endpoint with the token.
  - Backend logic (Edge Function or RPC) verifies token again, creates the `company_users` record using details from the invitation, updates invitation `status` to 'accepted', and redirects the user.
- **User Deactivation:** Admin action (API call) sets `user_profiles.is_active = false`. Deactivated users cannot log in. Historical data remains associated with their `user_id`.
- **Role & Permission Management UI:** (See Frontend Spec Section 10.1)
- **Tenant/Company Admin Dashboard:** (See Frontend Spec Section 10.2)
- **Single Sign-On (SSO):**
  - **Configuration:** Staff configure providers via Admin UI, populating `sso_configurations`. Corresponding Supabase Auth settings (SAML/OIDC providers) must be enabled at the project level.
  - **Login Flow:** Frontend invokes `supabase.auth.signInWithSSO()` specifying the provider. IdP discovery can happen via:
    - Domain matching (`sso_configurations.domain`) based on user's email input.
    - User selection from a list of active providers.
    - Company-specific login URL parameter.
  - **User Provisioning (JIT):** Supabase Auth handles the IdP interaction. On successful callback, an `auth.hook_set_custom_claims` (or similar mechanism like a trigger on `auth.users`) invokes a Supabase Edge Function:
    - Receives IdP token/claims and user ID.
    - Looks up `sso_configurations` for the relevant company (identified via domain or state parameter).
    - Parses claims based on `sso_configurations.attribute_mapping`.
    - Ensures user exists in `user_profiles` (creates if necessary, potentially populating `full_name`).
    - Creates or updates the `company_users` record, mapping IdP groups/attributes to a role defined in `roles` or using a default SSO role.
    - Ensures `user_profiles.is_active = true`.

### 2.4 Security Rules (RLS Policies in Supabase)

- **Enable RLS:** Enable Row Level Security on ALL tables containing tenant-specific or user-specific data.
- **Default Deny:** Use a default `DENY` policy where applicable.
- **Authenticated Access:** Most policies apply `TO authenticated`. Specific cases (e.g., invitation acceptance) might allow limited unauthenticated access based on tokens.
- **Permission Checking:** Policies must verify user identity (`auth.uid()`) and permissions. Use helper functions (`SECURITY DEFINER` recommended) for complex checks:
  - `is_active_user(user_id uuid)`: Checks `user_profiles.is_active`.
  - `is_staff_user(user_id uuid)`: Checks `user_profiles.is_staff`.
  - `is_member_of_company(user_id uuid, company_id uuid)`: Checks existence in `company_users`.
  - `has_permission(user_id uuid, company_id uuid, permission_key text)`: Checks effective permissions by combining `roles.base_permissions` and `company_users.custom_permissions`.
- **Centralized Permission Keys:** _(Added Note)_ A definitive list of granular permission keys (e.g., `'project:view'`, `'task:edit'`, `'admin:manage_roles'`) is maintained in `permissions.ts` (or equivalent configuration). Backend RLS policies, API logic, and Frontend conditional rendering MUST use these defined keys for consistency.
- **Specific Table Policies (Examples):**
  - **`companies`**: `SELECT` allowed if `is_member_of_company` or `is_staff_user`. `INSERT/UPDATE/DELETE` restricted to staff or users with specific company admin permissions (checked via `has_permission`).
  - **`user_profiles`**: Users can `SELECT`/`UPDATE` their own profile (`user_id = auth.uid()`). Staff may have broader read access. Deactivation (`UPDATE is_active`) restricted by `has_permission`.
  - **`company_users`**: Users can `SELECT` their own associations. Management (`INSERT/UPDATE/DELETE`) restricted by company admin roles (`has_permission`) or staff status.
  - **`invitations`**: `INSERT` restricted by permissions (`has_permission`). `SELECT` by staff/admins for their company, or unauthenticated based on valid token. `UPDATE` (status) restricted to backend processes/inviter.
  - **`roles`**: `SELECT` to authenticated. `INSERT/UPDATE/DELETE` restricted to staff (`has_permission('admin:manage_roles')`), excluding system roles.
  - **`sso_configurations`**: Restricted to staff, potentially read access for company admins (`has_permission`).
- **Data Visibility:** RLS ensures users only see data related to companies they belong to (unless staff), projects within those companies, tasks within those projects, etc. Policies must correctly traverse relationships (e.g., checking `project_id` -> `company_id` -> user association).

---

## 3. Projects Management

### 3.1 Projects

- Represents a distinct client onboarding implementation for one Company.
- Includes associated Milestones, Risks, and Issues.

### 3.2 Data Model for Projects

- **`projects` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `company_id`: `uuid` (Foreign Key referencing `companies.id` ON DELETE CASCADE, Required, Indexed)
  - `project_template_version_id`: `uuid` (Foreign Key referencing `project_template_versions.id` ON DELETE SET NULL, Nullable. Tracks origin template)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`)
  - `status`: `text` (Required, Enum or check constraint: "Planning", "Active", "On Hold", "Completed", "Cancelled")
  - `stage`: `text` (Required, Enum or check constraint: "Kick-off", "Discovery", "Build", "UAT", "Go Live", "Post Go Live")
  - `health_status`: `text` (Enum or check constraint: 'On Track', 'At Risk', 'Off Track', 'Unknown'. Default: 'Unknown', Nullable)
  - `project_owner_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable. Internal staff member leading)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`company_id`), (`status`), (`stage`), (`project_owner_id`).
  - _Implementation Note:_ Add trigger for `updated_at`. Default sort for lists: `created_at DESC`.

- **`milestones` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `project_id`: `uuid` (Foreign Key referencing `projects.id` ON DELETE CASCADE, Required, Indexed)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`)
  - `description`: `text` (Optional)
  - `due_date`: `timestamp with time zone` (Nullable)
  - `status`: `text` (Required, Enum or check constraint: 'Pending', 'In Progress', 'Completed', 'Approved', 'Rejected'. Default: 'Pending')
  - `order`: `integer` (default: 0, Not Null. For display sequence)
  - `sign_off_required`: `boolean` (default: `false`, Not Null)
  - `signed_off_by_user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable)
  - `signed_off_at`: `timestamp with time zone` (Nullable)
  - `approval_id`: `uuid` (Foreign Key referencing `approvals.id` ON DELETE SET NULL, Nullable. Link if using formal approval flow table - Schema TBD if needed)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`project_id`), (`status`), (`due_date`).
  - _Implementation Note:_ Trigger for `updated_at`. Default sort for lists: `order ASC`.

- **`risks` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `project_id`: `uuid` (Foreign Key referencing `projects.id` ON DELETE CASCADE, Required, Indexed)
  - `description`: `text` (Required)
  - `reported_by_user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable)
  - `assigned_to_user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable)
  - `status`: `text` (Required, Enum or check constraint: 'Potential', 'Open', 'Mitigated', 'Closed'. Default: 'Potential')
  - `probability`: `text` (Enum or check constraint: 'Low', 'Medium', 'High'. Nullable)
  - `impact`: `text` (Enum or check constraint: 'Low', 'Medium', 'High'. Nullable)
  - `mitigation_plan`: `text` (Optional)
  - `contingency_plan`: `text` (Optional)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`project_id`), (`status`), (`assigned_to_user_id`).
  - _Implementation Note:_ Trigger for `updated_at`.

- **`issues` Table**
  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `project_id`: `uuid` (Foreign Key referencing `projects.id` ON DELETE CASCADE, Required, Indexed)
  - `description`: `text` (Required)
  - `reported_by_user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable)
  - `assigned_to_user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable)
  - `status`: `text` (Required, Enum or check constraint: 'Open', 'Investigating', 'Resolved', 'Closed'. Default: 'Open')
  - `priority`: `text` (Enum or check constraint: 'Low', 'Medium', 'High', 'Critical'. Default: 'Medium')
  - `resolution`: `text` (Optional)
  - `related_risk_id`: `uuid` (Foreign Key referencing `risks.id` ON DELETE SET NULL, Nullable)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`project_id`), (`status`), (`priority`), (`assigned_to_user_id`).
  - _Implementation Note:_ Trigger for `updated_at`.

### 3.3 Logic for Projects

- **Milestone Tracking:** UI visualizes milestones. Status updates trigger notifications. If `sign_off_required = true`, completing the milestone may initiate an approval workflow (creating record in `approvals` table, sending notification). Successful approval updates status to 'Approved', `signed_off_by_user_id`, `signed_off_at`.
- **Risk/Issue Management:** Dedicated UI sections allow CRUD operations based on permissions. Notifications sent on assignment or significant status changes (e.g., new issue reported, risk moved to 'Open').
- **Project Health:** Manually set or updated via scheduled background job analyzing metrics.

### 3.4 Security Rules (RLS) for Projects

- **`projects`**: `SELECT` policy checks `is_member_of_company(auth.uid(), company_id)` or `is_staff_user(auth.uid())`. `INSERT/UPDATE/DELETE` require specific project management permissions (e.g., `has_permission(..., 'project:edit_settings')`).
- **`milestones`, `risks`, `issues`**: Policies check access to the parent `project_id`. Specific actions like updating status to 'Approved' (Milestones) or 'Closed' (Risks/Issues) require specific permissions (e.g., `has_permission(..., 'milestone:approve')`).

---

### 3.5 Project Tasks & Sections

- Projects consist of Sections grouping Tasks. Tasks support sub-tasks, recurrence, effort estimation, internal comments, and custom fields.

### 3.6 Data Model for Sections

- **`sections` Table**
  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `project_id`: `uuid` (Foreign Key referencing `projects.id` ON DELETE CASCADE, Required, Indexed)
  - `section_template_id`: `uuid` (Foreign Key referencing `section_templates.id` ON DELETE SET NULL, Nullable. Tracks origin template)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`)
  - `type`: `text` (Required, Enum or check constraint: "INFO", "BUILD", "UAT", "GO_LIVE", "PLANNING", "OTHER")
  - `status`: `text` (Required, Enum or check constraint: "Not Started", "In Progress", "Completed". Potentially calculated)
  - `is_public`: `boolean` (default: `false`, Not Null. Visible to clients if true)
  - `order`: `integer` (default: 0, Not Null. For sorting sections within a project)
  - `percent_complete`: `float` (Range 0-100. Calculated based on task completion)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`project_id`), (`order`).
  - _Implementation Note:_ Trigger for `updated_at`. Default sort: `order ASC`. Trigger on `tasks` updates `percent_complete` here (considering sub-tasks if needed).

### 3.7 Data Model for Tasks

- **`tasks` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `section_id`: `uuid` (Foreign Key referencing `sections.id` ON DELETE CASCADE, Required, Indexed)
  - `milestone_id`: `uuid` (Foreign Key referencing `milestones.id` ON DELETE SET NULL, Nullable, Indexed)
  - `task_template_id`: `uuid` (Foreign Key referencing `task_templates.id` ON DELETE SET NULL, Nullable. Tracks origin template)
  - `parent_task_id`: `uuid` (Foreign Key referencing `tasks.id` ON DELETE CASCADE, Nullable, Indexed. For sub-tasks)
  - `recurring_definition_task_id`: `uuid` (Foreign Key referencing `tasks.id` ON DELETE SET NULL, Nullable. Links instance task back to its recurring definition)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`)
  - `description`: `text` (Optional)
  - `status`: `text` (Required, Enum or check constraint: "Open", "In Progress", "Complete", "Blocked")
  - `order`: `integer` (default: 0, Not Null. For sorting tasks within a section/parent)
  - `due_date`: `timestamp with time zone` (Optional)
  - `assigned_to_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable, Indexed)
  - `depends_on_task_id`: `uuid` (Foreign Key referencing `tasks.id` ON DELETE SET NULL, Nullable, Indexed. For dependencies)
  - `condition`: `jsonb` (Optional. Stores rules for conditional task visibility, e.g., `{"custom_field:client_tier": "enterprise"}`)
  - `is_self_service`: `boolean` (default: `false`, Not Null. If true, allows client roles to mark this task as complete)
  - `estimated_effort_hours`: `numeric` (Nullable. Effort estimate)
  - `is_recurring_definition`: `boolean` (default: `false`, Not Null. Marks this task as the definition for recurrence)
  - `recurrence_rule`: `text` (Nullable. iCal RRULE string, e.g., 'FREQ=WEEKLY;BYDAY=MO')
  - `recurrence_end_date`: `timestamp with time zone` (Nullable. End date for recurrence)
  - `next_occurrence_date`: `timestamp with time zone` (Nullable, Indexed. Used by scheduler)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`section_id`), (`milestone_id`), (`parent_task_id`), (`assigned_to_id`), (`depends_on_task_id`), (`status`), (`due_date`), (`next_occurrence_date`), (`is_recurring_definition`).
  - _Constraints:_ Add CHECK constraint `id != parent_task_id`. Add CHECK constraint `id != recurring_definition_task_id`.
  - _Implementation Note:_ Trigger for `updated_at`. Default sort: `order ASC`.

- **`task_files` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `task_id`: `uuid` (Foreign Key referencing `tasks.id` ON DELETE CASCADE, Required, Indexed)
  - `file_path`: `text` (Path to file within Supabase Storage bucket `task_attachments`. Required)
  - `file_name`: `text` (Original name of the uploaded file. Required)
  - `file_size`: `bigint` (Size in bytes. Optional but useful)
  - `mime_type`: `text` (e.g., 'application/pdf'. Optional but useful)
  - `uploaded_by_user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Implementation Note:_ Ensure Storage bucket `task_attachments` has appropriate access policies linked to RLS on `tasks`.

- **`task_comments` Table**
  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `task_id`: `uuid` (Foreign Key referencing `tasks.id` ON DELETE CASCADE, Required, Indexed)
  - `user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable. Author)
  - `content`: `text` (Required, constraint: `length > 0`)
  - `parent_comment_id`: `uuid` (Foreign Key referencing `task_comments.id` ON DELETE CASCADE, Nullable. For threading)
  - `is_internal`: `boolean` (default: `false`, Not Null. Visible only to staff if true)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`task_id`), (`user_id`), (`parent_comment_id`).
  - _Implementation Note:_ Trigger for `updated_at`. Enable Supabase Realtime for this table.

### 3.8 Logic for Tasks & Sections

- **Section Progress Calculation:** Implement PostgreSQL function/trigger on `tasks` table. Updates `sections.percent_complete` based on status changes of non-sub-tasks (or define contribution logic).
- **Ordering:** Frontend drag-and-drop updates `order` fields via API calls.
- **Conditional Tasks:** Frontend/backend evaluates `tasks.condition` against context.
- **Dependencies:** Trigger/RLS/Frontend logic enforces `depends_on_task_id`.
- **Sub-Tasks:** UI supports hierarchy. Parent completion logic may depend on sub-tasks.
- **Recurring Tasks:** UI sets definition fields. Scheduled Edge Function (`pg_cron`) creates instances based on `recurrence_rule` and `next_occurrence_date`. Log failures to `background_job_failures`.
- **Task Effort Estimation:** Value stored in `estimated_effort_hours`.
- **Internal Comments:** `is_internal` flag controls visibility via RLS and UI.
- **Real-time Updates:** Enable Supabase Realtime for `tasks` and `task_comments`.

### 3.9 Security Rules (RLS) for Tasks & Sections

- Access granted based on access to the parent `project_id`.
- `task_comments`: `SELECT` policy checks `is_internal` against `is_staff_user(auth.uid())`.
- `tasks`: Policy checks `is_self_service` for client updates. Enforces dependencies. Restricts recurring definition edits based on permissions.

---

### 3.10 Project Templates

- Defines reusable project structures including sections, tasks, placeholders, custom field defaults, and versioning.

### 3.11 Data Model for Templates

- **`project_templates` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `name`: `text` (Required, UNIQUE)
  - `description`: `text` (Optional)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Implementation Note:_ Represents the overall template concept.

- **`project_template_versions` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `project_template_id`: `uuid` (Foreign Key referencing `project_templates.id` ON DELETE CASCADE, Required, Indexed)
  - `version_number`: `integer` (Required, default: 1)
  - `is_latest_version`: `boolean` (default: `true`, Not Null)
  - `notes`: `text` (Optional. Description of changes in this version)
  - `defined_placeholders`: `jsonb` (Optional. Describes expected placeholders and potential data sources, e.g., `[{"key": "client_contact", "label": "Client Main Contact", "source": "company.custom_field:main_contact_name"}]`)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`project_template_id`).
  - _Constraint:_ UNIQUE(`project_template_id`, `version_number`).
  - _Implementation Note:_ Creating a new version updates `is_latest_version` flags.

- **`section_templates` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `project_template_version_id`: `uuid` (Foreign Key referencing `project_template_versions.id` ON DELETE CASCADE, Required, Indexed)
  - `name`: `text` (Required. May contain placeholders like `{{placeholder}}`)
  - `type`: `text` (Required)
  - `order`: `integer` (default: 0, Not Null)
  - `is_public`: `boolean` (default: `false`, Not Null)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)

- **`task_templates` Table**
  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `section_template_id`: `uuid` (Foreign Key referencing `section_templates.id` ON DELETE CASCADE, Required, Indexed)
  - `name`: `text` (Required. May contain placeholders)
  - `description`: `text` (Optional. May contain placeholders)
  - `order`: `integer` (default: 0, Not Null)
  - `is_self_service`: `boolean` (default: `false`, Not Null)
  - `estimated_effort_hours`: `numeric` (Optional)
  - `condition_template`: `jsonb` (Optional. Placeholder logic for `tasks.condition`)
  - `custom_field_template_values`: `jsonb` (Optional. Default values for custom fields, keyed by `custom_field_definition.id`)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)

### 3.12 Logic for Templates

- **Creating from Template:**
  - UI allows selecting template/version and inputting placeholder values.
  - Backend function/RPC receives template ID, company ID, name, placeholder values.
  - **Placeholder Resolution:** _(Added Detail)_ Placeholders (e.g., `{{key}}`) resolved using this order:
    1.  Check `placeholder_values` JSONB from API call.
    2.  Resolve based on `defined_placeholders[key].source`:
        - `company.field_name`: Lookup standard field on target `companies`.
        - `company.custom_field:field_name`: Lookup company custom field value via `custom_field_values`.
    3.  Unresolved placeholders replaced with empty string (`''`). Log warnings for failures.
  - Creates `projects` record linking template version.
  - Iterates through `section_templates`, substitutes placeholders, creates `sections` record linking template ID.
  - Iterates through `task_templates`, substitutes placeholders, creates `tasks` record linking template ID. Creates `custom_field_values` based on definitions and defaults from `custom_field_template_values`.
- **Versioning:** Admin UI manages versions and `is_latest_version` flag.

### 3.13 Security Rules (RLS) for Templates

- Template tables readable (`SELECT`) by authenticated users.
- `INSERT/UPDATE/DELETE` restricted to Staff with `has_permission(..., 'admin:manage_templates')`.

---

## 4. Documentation

- Manages knowledge articles, guides, project/company-specific documentation. Supports internal linking and internal comments.

### 4.1 Data Model for Documentation

- **`documents` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `company_id`: `uuid` (Foreign Key referencing `companies.id` ON DELETE CASCADE, Nullable. Scoped to company if set)
  - `project_id`: `uuid` (Foreign Key referencing `projects.id` ON DELETE CASCADE, Nullable. Scoped to project if set)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`)
  - `type`: `text` (Required, Enum or check constraint: "solution", "support", "guide", "project_plan", "SOW", "kb_article")
  - `order`: `integer` (default: 0, Not Null. For sorting)
  - `version`: `integer` (default: 1, Not Null. Simple version tracking)
  - `is_approved`: `boolean` (default: `false`, Not Null. Used in approval workflow)
  - `approved_by_user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable)
  - `approved_at`: `timestamp with time zone` (Nullable)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`company_id`), (`project_id`), (`type`).
  - _Constraint:_ CHECK constraint to ensure valid scoping (e.g., `(company_id IS NULL AND project_id IS NULL) OR (company_id IS NOT NULL AND project_id IS NULL) OR (project_id IS NOT NULL)`).
  - _Implementation Note:_ Trigger for `updated_at`. Default sort: `order ASC`, then `name ASC`.

- **`pages` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `document_id`: `uuid` (Foreign Key referencing `documents.id` ON DELETE CASCADE, Required, Indexed)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`. Name of the page within the document)
  - `order`: `integer` (default: 0, Not Null. For sorting pages within a document)
  - `content`: `text` (Required. Stores main page content, e.g., Markdown or HTML based on editor choice)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`document_id`), (`order`).
  - _Implementation Note:_ Trigger for `updated_at`. Default sort: `order ASC`. Consider full-text search index on `content`.

- **`document_comments` Table**
  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `page_id`: `uuid` (Foreign Key referencing `pages.id` ON DELETE CASCADE, Required, Indexed)
  - `user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE SET NULL, Nullable. Author)
  - `content`: `text` (Required, constraint: `length > 0`)
  - `parent_comment_id`: `uuid` (Foreign Key referencing `document_comments.id` ON DELETE CASCADE, Nullable. For threading)
  - `is_internal`: `boolean` (default: `false`, Not Null. Visible only to staff if true)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`page_id`), (`user_id`), (`parent_comment_id`).
  - _Implementation Note:_ Trigger for `updated_at`. Enable Supabase Realtime.

### 4.2 Logic for Documentation

- **Scope Filtering:** Queries filter documents based on `company_id`, `project_id`, or global scope (`NULL` for both) based on user context and permissions.
- **Version Control:** Simple incrementing `version` field on `documents`. Edits update content in `pages`.
- **Approval Workflow:** Manage `is_approved` status via API/UI actions requiring specific permissions. Link to `approvals` table if formal multi-step approval is needed.
- **Document/Page Linking:** Frontend editor supports syntax resolved to stable links. Backend rendering converts IDs to links.
- **Internal Comments:** Controlled by `is_internal` flag via RLS and UI.

### 4.3 Security Rules (RLS) for Documentation

- **`documents`**: `SELECT` policy checks scope against user permissions/staff status. Global docs readable by authenticated. Modifications restricted by permissions.
- **`pages`**: Inherit access based on parent `document_id`.
- **`document_comments`**: Inherit access based on parent `page_id`. `SELECT` policy checks `is_internal` against `is_staff_user(auth.uid())`.

---

## 5. Meetings

- Integrates with Calendly for scheduling and tracking meetings related to companies or projects.

### 5.1 Data Model for Meetings

- **`meetings` Table**
  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `company_id`: `uuid` (Foreign Key referencing `companies.id` ON DELETE CASCADE, Nullable. Link if company-wide)
  - `project_id`: `uuid` (Foreign Key referencing `projects.id` ON DELETE CASCADE, Nullable. Link if project-specific)
  - `calendly_event_uri`: `text` (Unique event identifier from Calendly. Required for updates/cancellations. Indexed.)
  - `calendly_invitee_uri`: `text` (Unique invitee identifier from Calendly. Indexed.)
  - `name`: `text` (Required. Meeting title, e.g., from Calendly event name)
  - `type`: `text` (Required, Enum or check constraint: "adhoc", "discovery", "solution_walkthrough", "build_walkthrough", "uat_kickoff", "uat_signoff", "check_in")
  - `status`: `text` (Required, Enum or check constraint: "scheduled", "completed", "cancelled")
  - `scheduled_at`: `timestamp with time zone` (Required. Start time of the meeting)
  - `duration_minutes`: `integer` (Optional. Duration from Calendly)
  - `attendees`: `jsonb` (Optional. Store list of attendees/emails from Calendly payload)
  - `recording_url`: `text` (Optional. URL to video recording in Supabase Storage, bucket: `meeting_recordings`)
  - `notes`: `text` (Optional. Meeting notes entered post-event)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`company_id`), (`project_id`), (`calendly_event_uri`), (`scheduled_at`), (`status`).
  - _Constraint:_ CHECK constraint `(company_id IS NOT NULL OR project_id IS NOT NULL)`.
  - _Implementation Note:_ Trigger for `updated_at`. Default sort: `scheduled_at DESC`.

### 5.2 Logic for Meetings

- **Calendly Integration:**
  - Supabase Edge Function acts as webhook endpoint for Calendly (`invitee.created`, `invitee.canceled`).
  - Function parses payload, identifies `company_id`/`project_id` (e.g., via custom questions in Calendly form passed as parameters, or user context if booked within the app), and creates/updates `meetings` record using `calendly_event_uri` as the key. Handle errors via logging/Sentry.
- **Reschedule/Cancellation:** Updates via Calendly webhook update status. Manual updates might be needed.
- **Completion Lock:** RLS policy prevents updates (except `notes`, `recording_url`) if `status = 'completed'`.

### 5.3 Security Rules (RLS) for Meetings

- **`meetings`**: `SELECT` based on user access to associated `company_id`/`project_id` or staff status. `INSERT` primarily by webhook function. `UPDATE` restricted by roles and status lock. `DELETE` restricted.

---

## 6. Training

- Provides courses, lessons, progress tracking, certifications, and gamification.

### 6.1 Data Model for Training

- **`courses` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`)
  - `description`: `text` (Optional)
  - `image_url`: `text` (Optional. URL to cover image in Supabase Storage, bucket: `training_images`)
  - `is_active`: `boolean` (default: `true`, Not Null. Allows retiring courses)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`is_active`).
  - _Implementation Note:_ Trigger for `updated_at`. Default sort: `name ASC`.

- **`lessons` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `course_id`: `uuid` (Foreign Key referencing `courses.id` ON DELETE CASCADE, Required, Indexed)
  - `name`: `text` (Required, constraint: `length > 0 AND length <= 100`)
  - `type`: `text` (Required, Enum or check constraint: "video", "pdf", "text", "quiz", "external_link")
  - `content_url`: `text` (Optional. URL to video/PDF in Supabase Storage, bucket: `training_content`, or external URL)
  - `markdown_content`: `text` (Optional. For `type = 'text'`)
  - `quiz_data`: `jsonb` (Optional. For `type = 'quiz'`. Stores questions/answers structure)
  - `order`: `integer` (default: 0, Not Null. For sorting lessons within a course)
  - `estimated_duration_minutes`: `integer` (Optional)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `updated_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Indexes:_ (`course_id`), (`order`).
  - _Implementation Note:_ Trigger for `updated_at`. Default sort: `order ASC`. Storage bucket `training_content` needs access policies.

- **`course_assignments` Table (Junction: User assigned Course in Company context)**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `course_id`: `uuid` (Foreign Key referencing `courses.id` ON DELETE CASCADE, Not Null)
  - `company_id`: `uuid` (Foreign Key referencing `companies.id` ON DELETE CASCADE, Not Null)
  - `user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE CASCADE, Not Null)
  - `assigned_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `due_date`: `timestamp with time zone` (Optional)
  - _Indexes:_ (`user_id`, `company_id`), (`course_id`).
  - _Constraint:_ Add a UNIQUE constraint on (`course_id`, `company_id`, `user_id`).

- **`lesson_completions` Table (Junction: Tracks individual lesson completion)**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `lesson_id`: `uuid` (Foreign Key referencing `lessons.id` ON DELETE CASCADE, Not Null)
  - `user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE CASCADE, Not Null)
  - `company_id`: `uuid` (Foreign Key referencing `companies.id` ON DELETE CASCADE, Not Null)
  - `completed_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `quiz_score`: `float` (Optional, for `lessons.type = 'quiz'`. Range 0-100)
  - _Indexes:_ (`user_id`, `company_id`, `lesson_id`).
  - _Constraint:_ Add a UNIQUE constraint on (`lesson_id`, `user_id`, `company_id`).

- **`badges` Table**

  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `name`: `text` (Required, UNIQUE)
  - `description`: `text` (Required)
  - `image_url`: `text` (Required. URL to badge image in Supabase Storage, bucket: `badge_images`)
  - `criteria`: `jsonb` (Required. Defines how the badge is earned, e.g., `{"type": "course_completion", "course_id": "uuid"}`)
  - `created_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - _Implementation Note:_ Requires backend logic to evaluate criteria.

- **`user_badges` Table**
  - `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
  - `user_id`: `uuid` (Foreign Key referencing `auth.users.id` ON DELETE CASCADE, Not Null)
  - `badge_id`: `uuid` (Foreign Key referencing `badges.id` ON DELETE CASCADE, Not Null)
  - `earned_at`: `timestamp with time zone` (default: `now()`, Not Null)
  - `context`: `jsonb` (Optional. Store context like course/lesson ID)
  - _Indexes:_ (`user_id`), (`badge_id`).
  - _Constraint:_ Add a UNIQUE constraint on (`user_id`, `badge_id`).
  - _Implementation Note:_ Records added by backend logic evaluating badge criteria.

### 6.2 Logic for Training

- **Course Progress:** Calculated via Reporting Views (e.g., `view_company_training_compliance`).
- **Access:** Users see courses assigned via `course_assignments` for their active company context.
- **Auto-Assignment:** Edge Function/trigger creates `course_assignments` based on rules (e.g., role, company type). Rules stored in a dedicated `training_assignment_rules` table (Schema TBD if needed).
- **Certification:** On 100% course completion (detected via view/function), trigger Edge Function to generate PDF certificate (via PDFMonkey using templates), store in `certificates` bucket, potentially link in a `course_certificates` table.
- **Gamification:** Backend logic (triggers on `lesson_completions`/progress updates, or scheduled function) evaluates `badges.criteria` against user activity/state. If criteria met, insert record into `user_badges`. UI displays earned badges.
- **Quizzes:** Frontend renders quiz from `lessons.quiz_data`. Backend endpoint validates submission, calculates `quiz_score`, records completion in `lesson_completions`.

### 6.3 Security Rules (RLS) for Training

- **`courses`, `lessons`**: `SELECT` allowed for authenticated users. Modifications restricted to staff/admins.
- **`course_assignments`**: Users can `SELECT` their own (`user_id = auth.uid()`). Management restricted by roles.
- **`lesson_completions`**: Users can `SELECT`/`INSERT` their own for assigned courses.
- **`badges`**: `SELECT` allowed for authenticated. Modifications restricted.
- **`user_badges`**: Users can `SELECT` their own. `INSERT` restricted to backend processes (`SECURITY DEFINER` function/trigger).
- **Storage Buckets:** (`training_images`, `training_content`, `certificates`, `badge_images`) policies grant read access based on assignments/completions/authentication.

---

## 7. Additional Features (Incorporated & Elaborated)

### 7.1 Dashboard and Analytics

- Utilizes Reporting Views defined in Section 11.

### 7.2 Advanced Workflow Features

- Conditional Tasks (`tasks.condition`), Dependencies (`tasks.depends_on_task_id`), Auto-Assignment (Edge Function), SLA Tracking (`tasks.due_date`, scheduled function).

### 7.3 Client Experience Enhancements

- Client Portal View (Role-based UI rendering), Self-service Steps (`tasks.is_self_service`), Feedback Collection (`feedback` table/UI), Welcome Sequence (Edge Function + Resend), Client Portal Customization (CSS Vars from `companies` table).

### 7.4 Integration Capabilities

- Document Generation (Edge Function + PDFMonkey), Email (Edge Function + Resend), Slack Integration (Edge Function + Slack API).

### 7.5 Advanced Permission System

- Implemented via `roles`, `company_users.role`, `company_users.custom_permissions`. Managed via UI (Section 10.1).

### 7.6 Implementation Features

- Project Templates (Enhanced - Section 3.10), Bulk Operations (Client library batching), Duplication Function (Stored procedure `clone_project`).

### 7.7 Technical Enhancements

- **Audit Logging:** `audit_log` table (`id`, `user_id`, `action`, `table_name`, `record_id`, `timestamp`, `old_value` (jsonb), `new_value` (jsonb)) populated by triggers. Requires dedicated UI viewer (Section 10.5 / Frontend Spec 4.13).
- **Rate Limiting:** Supabase project settings. Custom in Edge Functions if needed.

### 7.8 Documentation System Improvements

- Version Control (`documents.version`), Approval Workflow (`documents.is_approved`), Templates (`document_templates` table - Schema TBD), KB (`type='kb_article'`), Internal Linking (Editor/Renderer logic).

### 7.9 Communication Enhancements

- In-app Messaging (`conversations`, `messages` tables - Schemas TBD), Recording Storage (`meetings.recording_url`), Bots (Third-party API via Edge Function), @mentions (Parsing + `notifications` table - Schema TBD), Announcements (`announcements` table).

### 7.10 Training System Enhancements

- Interactive Content (`lessons.quiz_data`), Certification (PDF generation), Assignment Rules, Analytics (Views), Gamification (`badges`).

### 7.11 Global Search

- Implemented via `search_index` table populated by triggers, queried via RPC function respecting RLS. Uses Supabase FTS.

### 7.12 Time Tracking

- Implemented via `time_entries` table and API endpoints. Reporting via views (Section 11.5, 11.6).

### 7.13 Custom Fields

- Implemented via `custom_field_definitions` and `custom_field_values` tables, managed via Staff UI (Section 10.3). Used across entities.

### 7.14 Data Retention Policies

- Configuration via `companies` settings or system table. Executed by scheduled Edge Function performing soft/hard deletes based on policy. Requires careful implementation and logging.

### 7.15 Error Handling Philosophy

- **API Errors:** Standardized JSON responses with HTTP status codes (4xx/5xx), internal `code`, `message`. Use `422` for validation errors.
- **Backend Validation Error Response:** _(Added Detail)_ For mutations (POST/PUT/PATCH), validation failures return HTTP `422` with body: `{"message": "Validation failed.", "errors": {"field_name": ["Error message."]}}`.
- **Background Jobs:** Robust error handling (try/catch). Failures logged to `background_job_failures` table (`id`, `job_name`, `timestamp`, `payload`, `error_message`, `stack_trace`, `status`). Implement retries where appropriate. Configure alerting.
- **External Monitoring:** Log critical backend errors to **Sentry** via SDK in Edge Functions/backend. Include context.

---

## 8. Backend Implementation Plan with Supabase

### 8.1 Database Setup

- Implement all defined tables using SQL migrations (Supabase CLI or Dashboard).
- Define PKs, FKs (with `ON DELETE` actions), UNIQUE/CHECK constraints, NOT NULL, defaults.
- Enable required PostgreSQL extensions (`pg_cron`, potentially `uuid-ossp` if not default, `pg_trgm` for FTS).
- Create indexes as specified per table.
- Implement database functions/triggers for `updated_at`, section progress calculation, audit logging, history tracking (if used for cycle time), FTS index updates, potentially gamification checks.
- **Initial Seed Data Specification:** _(Added Note)_ Precise content for default data (roles, permissions, templates) MUST be defined in separate configuration files (`seed-data/`) or migration scripts for clarity and version control.

### 8.2 Real-time Features

- Enable Supabase Realtime (via Publication in Replication settings) for specified tables (`task_comments`, `document_comments`, `tasks`, `announcements`, `messages`).
- Ensure RLS policies are compatible with Realtime.

### 8.3 Storage

- Create specified buckets (`company_logos`, `user_avatars`, `task_attachments`, `meeting_recordings`, `training_images`, `training_content`, `certificates`, `badge_images`, `generated_documents`).
- Define strict Storage Access Policies for each bucket, ideally leveraging user authentication context and RLS checks via security definer functions for fine-grained access control (e.g., user can only access task attachments for tasks they have RLS permission to view).

### 8.4 Edge Functions

- Develop serverless Edge Functions (TypeScript/Deno) for:
  - Handling Webhooks (Calendly).
  - Sending Notifications (Email via Resend, Slack).
  - Third-Party API Integrations (PDFMonkey, AI/Bots).
  - Scheduled Tasks (`pg_cron` triggers function): Recurrence generation, SLA checks, health score updates, data retention cleanup, notification reminders, materialized view refreshes (if applicable).
  - Complex Business Logic: Template instantiation (placeholder resolution), certificate generation, invitation processing, gamification award logic, SSO JIT provisioning callback logic.
- Security: Use JWT verification. Store API keys/secrets (Resend, PDFMonkey, Slack, Sentry DSN) in Supabase Secrets (`supabase secrets set ...`). Implement robust input validation and error handling (logging to `background_job_failures`, Sentry).

### 8.5 Security

- **RLS:** Implement comprehensive RLS policies on all relevant tables using helper functions. Test thoroughly.
- **Auth:** Leverage Supabase Auth (including MFA, rate limiting, breach detection). Configure SSO securely.
- **Authorization:** Combine RLS with role-based checks (`roles`, `company_users`) in API endpoints/functions.
- **Input Validation:** Validate all API/Function inputs. Sanitize content (e.g., HTML from rich text editors).
- **Storage Security:** Use strict policies and signed URLs where appropriate for temporary access.
- **Secrets Management:** Use Supabase Vault for sensitive credentials used by Edge Functions.

### 8.6 Scalability & Performance

- **Indexing:** Crucial for performance. Index FKs, columns in WHERE/ORDER BY clauses, specific JSONB keys if queried often, FTS vectors.
- **Views:** Use standard Views for simplifying queries. Use Materialized Views for expensive, frequently read aggregations (reporting), refreshed periodically via `pg_cron`.
- **Query Optimization:** Use `EXPLAIN ANALYZE`. Paginate list endpoints (`range()`). Avoid `SELECT *` where specific columns suffice. Optimize function/trigger logic.
- **Connection Pooling:** Handled by Supavisor. Ensure efficient connection use from clients/functions.
- **Edge Functions:** Optimize for performance and resource limits. Offload heavy computation if unsuitable for serverless environment.

---

## 9. API Endpoints (High-Level Examples)

- Define RESTful endpoints (via PostgREST for direct table/view access where suitable) or RPC functions for frontend interaction. Use Supabase client libraries.
- Includes CRUD for all major entities (Companies, Projects, Tasks, Docs, etc.), scoped appropriately.
- Includes endpoints for specific actions (Invite Accept, Time Start/Stop, Template Instantiation, Search RPC, Report View RPCs).
- Mutation endpoints return standard success responses or standardized validation error responses (Section 7.15).
- **API Versioning:** Use URL path prefix (`/api/v1/...`) for all custom endpoints (RPC, Edge Functions).

---

## 10. Configuration & Administration

- **10.1 Role & Permission Management UI:** (See Frontend Spec)
- **10.2 Tenant/Company Admin Dashboard:** (See Frontend Spec)
- **10.3 Custom Field Management UI:** (See Frontend Spec)
- **10.4 Data Retention Policy Configuration:** (See Frontend Spec)
- **10.5 Audit Log Viewer:** (See Frontend Spec Section 4.13)

---

## 11. Reporting & Analytics Views

_(Includes detailed specifications for views 11.1 through 11.14 as defined previously)_

### 11.1 `view_project_summary`

### 11.2 `view_task_details`

### 11.3 `view_overdue_tasks`

### 11.4 `view_staff_workload`

### 11.5 `view_time_tracking_summary`

### 11.6 `view_effort_variance`

### 11.7 `view_milestone_status`

### 11.8 `view_company_training_compliance`

### 11.9 `view_open_risks_issues`

### 11.10 `view_template_performance`

### 11.11 `view_client_engagement_summary`

### 11.12 `view_onboarding_cycle_time`

### 11.13 `view_document_usage`

### 11.14 `view_custom_field_analysis` (Example)

---

### Implementation Guidance for Views

1.  **Creation:** Use standard `CREATE VIEW view_name AS SELECT ...` SQL statements. For potentially slow views, use `CREATE MATERIALIZED VIEW ...`.
2.  **Materialized View Refresh:** If using materialized views, schedule periodic refreshes using `pg_cron`:
    ```sql
    -- Example: Refresh view_project_summary every hour
    SELECT cron.schedule('refresh_project_summary', '0 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY view_project_summary');
    -- Note: Requires unique index on the materialized view for CONCURRENTLY refresh.
    ```
3.  **API Access:** Expose these views via Supabase RPC functions rather than directly via PostgREST if filtering/pagination/permission logic is complex. The RPC function can take parameters (e.g., `company_id_filter`, `status_filter`, `page`, `page_size`), query the view with appropriate WHERE clauses and LIMIT/OFFSET, and enforce permissions before returning data.
4.  **RLS Enforcement:** Ensure underlying table RLS policies correctly restrict data. Test view access thoroughly with different user roles. If a view needs to bypass some RLS for aggregation but enforce it at the end (e.g., staff workload view), the RPC function calling it might need `SECURITY DEFINER` privileges _carefully_ scoped, or the view itself might use security definer functions.
5.  **Indexing:** Ensure the base tables (`projects`, `tasks`, `time_entries`, etc.) are well-indexed on foreign keys and columns used frequently in WHERE clauses or JOIN conditions within the view definitions. Consider indexes on JSONB columns if querying specific keys within custom fields or values frequently.

---

## 12. General Requirements

- **Default Sorting:** Defined per entity type (order, name, date). API parameters allow overriding sort.
- **Accessibility (a11y):** Backend supports frontend requirements (e.g., providing necessary data/states).
- **Internationalization (i18n) / Localization (l10n):** Database schema supports potential future localization (e.g., use `text` over `varchar`, consider JSONB for translatable strings if needed).
- **UI/UX Collaboration:** Backend APIs designed to efficiently support required frontend views and interactions defined in Frontend Spec and UI designs.
- **Initial System Seeding:** Database migrations MUST include scripts to seed default roles, permissions, templates as specified elsewhere (See Section 8.1 note).

---

## 13. Conclusion

This specification (Version 3.3) provides a highly detailed and comprehensive blueprint for the backend of the Enterprise SaaS Client Onboarding Platform. It integrates advanced project management capabilities, sophisticated administration features, collaboration enhancements, structured custom fields, a defined error handling strategy, detailed reporting views, and clear implementation guidance for Supabase. This document, used alongside Frontend Spec v1.3 and detailed UI/UX designs, guides the development of a powerful, secure, scalable, and insightful platform tailored to enterprise onboarding needs.

---

---

## Frontend Development Specification for Enterprise SaaS Client Onboarding Platform (Version 1.3)

**Based on Backend Spec:** Version 3.3
**Date:** 2023-10-27

---

## 1. Overview

**Purpose:** This document specifies the requirements for building the frontend user interface (UI) for the Client Onboarding Platform using **Next.js**. The frontend will provide a user-friendly, responsive, accessible, and performant interface for both internal staff and external client users to interact with all features defined in the backend specification (v3.3).

**Target Users:** Internal Staff (Admins, Project Managers, Implementers) and Client Users (various roles). The UI must adapt based on the user's role and permissions.

**Key Objectives:**

- Implement all user-facing features detailed in the backend spec using Next.js and React.
- Provide distinct views and capabilities based on user roles (Staff vs. Client, specific permissions).
- Ensure a consistent, accessible, and professional user experience leveraging the Tailwind UI component library and **Storybook** for component documentation.
- Handle various UI states gracefully (**loading, error, empty, success**).
- Integrate seamlessly with the Supabase backend for data fetching (server-side and client-side), real-time updates, authentication, and storage.
- Build a maintainable, scalable, and performant Next.js application adhering to defined **performance budgets** and **security best practices**.

---

## 2. Tech Stack

- **Framework:** **Next.js** (v13+ using **App Router** preferred).
- **UI Library:** **Tailwind UI** - Utilize pre-built components (Application UI, Marketing) built on **Headless UI** and styled with **Tailwind CSS** (v3+).
- **State Management:**
  - **Server State:** **RTK Query** integrated with Next.js for data fetching, caching, mutations (can be used in both Server and Client Components via providers). Consider Supabase client directly in Server Components for simple data fetching.
  - **Global Client State:** **Zustand** or **Jotai** (recommended for simplicity with App Router) or **Redux Toolkit (RTK)** (if complex global state logic warrants it). Used for UI state like sidebar toggle, context switcher selection, potentially auth status client-side.
- **Routing:** **Next.js App Router** (file-system based routing).
- **API Client:** **Supabase Client Library (`@supabase/supabase-js`)**. Use server-side client for Server Components/Route Handlers, client-side client for Client Components. Utilize Supabase helper libraries for Next.js (`@supabase/auth-helpers-nextjs`).
- **Forms:** **React Hook Form**. Integrate with Headless UI components.
- **Charting/Visualization:** **Recharts** (preferred) or Chart.js (via react-chartjs-2).
- **Rich Text Editor:** **TipTap**.
- **Drag & Drop:** **dnd-kit**.
- **Date/Time Handling:** **Day.js** or **date-fns**.
- **Notifications/Toasts:** **react-hot-toast**.
- **Animation:** **Framer Motion** (optional).
- **Component Development/Documentation:** **Storybook**.
- **Error Monitoring:** **Sentry SDK for Next.js (`@sentry/nextjs`)**.
- **Styling:** **Tailwind CSS**.
- **Linting/Formatting:** ESLint, Prettier (configured for Next.js/React/TypeScript).
- **Language:** **TypeScript**.
- **Utility Libraries:** Lodash (or specific function imports).
- **Sanitization:** **DOMPurify**.

---

## 3. Frontend Architecture

- **Component-Based:** React components within the Next.js App Router structure.
- **Next.js App Router:** Utilize file-system routing (`app/` directory). Differentiate between **Server Components** (default, for data fetching, accessing backend resources directly) and **Client Components** (`'use client'` directive, for interactivity, hooks like `useState`, `useEffect`, browser APIs). Employ Server Components for static rendering and initial data loads where possible to improve performance. Use Client Components for interactive elements and components requiring browser APIs or hooks.
- **Folder Structure (Example with App Router):**
  ```
  ├── app/                      # App Router directory
  │   ├── (auth)/               # Route group for auth pages (login, signup)
  │   │   └── login/page.tsx
  │   ├── (main)/               # Route group for main authenticated app layout
  │   │   ├── layout.tsx        # Main layout (Sidebar, Header - likely Client Components)
  │   │   ├── dashboard/page.tsx # Dashboard Server Component (fetches data)
  │   │   ├── projects/
  │   │   │   ├── page.tsx        # Project List (Server Component)
  │   │   │   └── [projectId]/
  │   │   │       ├── layout.tsx    # Project specific layout/tabs
  │   │   │       ├── tasks/page.tsx # Task Board/List (Client Component)
  │   │   │       └── ...           # Other project sub-routes
  │   │   └── admin/              # Admin section route group
  │   │       ├── layout.tsx      # Admin layout/auth check
  │   │       ├── roles/page.tsx    # Role Management (likely Client Component for forms)
  │   │       └── audit-log/page.tsx # Audit Log Viewer (Client Component)
  │   ├── api/                    # Next.js API Routes / Route Handlers (if needed beyond Supabase direct calls/RPC)
  │   └── layout.tsx            # Root layout (providers)
  ├── components/             # Shared UI components (mostly Client Components)
  ├── features/               # Shared logic/components for features (client/server agnostic utils)
  ├── hooks/                  # Shared custom Client Component hooks
  ├── lib/                    # Library integrations (supabase client setup, etc.)
  ├── services/               # API service definitions (RTK Query slices)
  ├── store/                  # Global client state store (Zustand/Jotai/RTK)
  ├── styles/                 # Global styles, Tailwind config
  ├── types/                  # Shared TypeScript types
  └── utils/                  # Shared utility functions (client/server agnostic)
  ```
- **Design Patterns:**
  - **Server Components:** Fetch initial data directly using Supabase server client or RPC calls within the component's async function. Pass data down as props to Client Components.
  - **Client Components:** Handle user interactions, use client-side hooks (`useState`, `useEffect`, `useContext`), manage forms, subscribe to Realtime events, use RTK Query hooks for client-side data fetching/mutation after initial load.
  - **Custom Hooks:** Encapsulate reusable client-side logic (`useAuth`, `usePermissions`, `useCurrentContext`).
  - **State Management:** Use chosen client state library (Zustand/Jotai/RTK) for global UI state. Use RTK Query for managing server state caching and synchronization across components.
  - **Strongly Typed Props:** All component props typed with TypeScript.
- **Developer Documentation:** (_Requirement_) Maintain `README.md`, JSDoc/TSDoc comments, `CONTRIBUTING.md`.
- **Feature Flags:** (_Requirement_) Implement simple config-based feature flagging. Wrap new, non-critical features.

---

## 4. Core Features & Modules (Frontend Implementation)

### 4.1 Authentication & Authorization

- **Views (App Router):** Auth pages in `(auth)` group, main app in `(main)` group. Use Next.js middleware or layout checks with `@supabase/auth-helpers-nextjs` for protecting routes.
- **Components:** `AuthForm`, `OAuthButton`, `SSOButton` (Client Components).
- **Logic:** Use `@supabase/auth-helpers-nextjs` for server-side session management and client-side hooks (`useSession`, `useSupabaseClient`). Store supplementary user profile/permissions in global client state (Zustand/Jotai/RTK) fetched after login. Conditional rendering based on permissions.
- **Centralized Permission Keys:** _(Added Note)_ A definitive list of permission keys is maintained (`permissions.ts`). Frontend conditional rendering MUST use these defined keys.

### 4.2 Application Layout & Navigation

- **Components:**
  - `RootLayout` (`app/layout.tsx`): Setup providers (Supabase, State Management, Theme).
  - `MainLayout` (`app/(main)/layout.tsx`): Includes `Sidebar` and `Header` (Client Components). Fetches initial user/context data server-side if possible or client-side on load.
  - `Sidebar`: Client Component for interactivity (collapse). Navigation links rendered based on permissions.
  - `Header`: Client Component. Includes `GlobalSearchInput`, Notifications (Client), User Menu (Client), `ContextSwitcher` (Client).
  - `ContextSwitcher`: Client Component dropdown. Updates global client state.

### 4.3 Dashboard

- **Views (App Router):** `app/(main)/dashboard/page.tsx` (Server Component preferred for initial data load).
- **Components:** Dashboard widgets (likely Client Components if interactive or using client-side hooks). Fetch data within Server Component and pass as props, or widgets fetch client-side via RTK Query.
- **Reporting Scope Clarification:** V1 surfaces reports only via dashboard widgets/specific components. No dedicated `/app/reports` section.

### 4.4 Project Management

- **Views (App Router):** `app/(main)/projects/page.tsx` (List - Server Component), `app/(main)/projects/[projectId]/...` (Detail - use layouts, potentially Server Components for static parts, Client Components for interactive sections).
- **Components:**
  - `ProjectTable`/`Card` (Can be Server Component if just displaying data). `ProjectCreateForm` (Client Component).
  - `TaskBoard`/`List` (Client Component due to DND, filtering, task interactions). `SectionColumn`, `TaskCard`/`ListItem` (Client).
  - `TaskDetailModal`: Client Component (state, forms, comments, files, time tracking).
    - **File Upload UX:** _(Added Detail)_ `FileUpload` component uses `supabase.storage...upload()`, shows progress, handles errors, triggers backend API call on success, updates `FileList`.
  - `TaskForm`: Client Component (React Hook Form, handles recurrence, effort, custom fields).
  - `MilestoneList`/`Timeline`: Client Component (interactivity, sign-off). `MilestoneDetail` (Client).
  - `RiskList`/`IssueList`: Client Component (sorting, filtering). `RiskIssueForm` (Client).
  - **Feedback UI:** _(Added)_ `FeedbackForm` modal (Client Component) triggered from Project Detail view (`/app/(main)/projects/[projectId]/feedback/` or similar).
  - **Integrations UI:** _(Added)_ `IntegrationSettingsForm` component within Project Settings (`app/(main)/projects/[projectId]/settings/page.tsx`) for settings like Slack Channel ID.
  - **Custom Field Rendering:** _(Added Detail)_ Implement `CustomFieldRenderer` (Client Component) mapping `definition.field_type` to Tailwind UI inputs (`Input`, `Textarea`, `Select`, Date Picker, `Toggle`, etc.) using React Hook Form for state and validation based on `definition.validation_rules`.

### 4.5 Documentation

- **Views (App Router):** `app/(main)/documents/...` Use dynamic routes for `[documentId]` and `[pageId]`. Viewer page can be Server Component if content is static, Editor is Client Component. Browser might be mixed.
- **Components:** `DocumentTree`/`List` (Client for interaction), `PageContentRenderer` (Server or Client, handles Markdown/HTML, sanitizes if needed), `PageList` (Client), `RichTextEditor` (Client), `CommentThread` (Client, handles internal flag), `DocumentForm`/`PageForm` (Client).

### 4.6 Meetings

- **Views (App Router):** `app/(main)/meetings/page.tsx` or embed list in project/company views.
- **Components:** `MeetingList`/`ListItem` (Client for filtering/interaction), `MeetingDetailModal` (Client).

### 4.7 Training

- **Views (App Router):** `app/(main)/training/courses/page.tsx`, `app/(main)/training/courses/[courseId]/page.tsx`, `app/(main)/training/courses/[courseId]/lessons/[lessonId]/page.tsx`, `app/(main)/profile/certificates/page.tsx` (_Added View_).
- **Components:** `CourseCard` (Server/Client), `LessonListItem` (Client), `VideoPlayer`/`PdfViewer` (Client), `QuizComponent` (Client), `ProgressBar` (Client), `BadgeDisplay` (Client), `CertificateList`/`ListItem` (_Added_, Client). Certificate download links provided.

### 4.8 Time Tracking

- **Components:** `TimerComponent` (Client), `TimeEntryForm` (Client), `TimeLogList` (Client). Integrated into Task Detail.

### 4.9 Announcements

- **Components:** `AnnouncementsWidget` (Client for dismiss), `AnnouncementForm` (Admin UI - Client).

### 4.10 Search

- **Components:** `GlobalSearchInput` (Client), `SearchResultsPage` (`app/(main)/search/page.tsx` - likely Client to handle dynamic query).

### 4.11 User Profile & Settings

- **Views (App Router):** `app/(main)/profile/...`, `app/(main)/settings/page.tsx`.
- **Components:** `ProfileForm` (Client), `NotificationPreferences` (Client), `MyBadges` (Client), `AccountSettings` (Client). Link to `/app/profile/certificates`.

### 4.12 Admin Settings (Staff Only)

- **Views (App Router):** Route group `app/(main)/admin/...` protected by layout/middleware checking for Staff role/permissions. Pages for Role Management, Custom Field Management, Template Management, Data Retention Settings (mostly Client Components due to forms/interactions).

### 4.13 Audit Log Viewer (Admin Only - V1 Scope) (_Added Section_)

- **View:** `/app/admin/audit-log` (Protected route accessible via `Permission.VIEW_AUDIT_LOG`).
- **Functionality:** Client Component displaying `audit_log` records (reverse chronological).
- **Display:** Key columns (Timestamp, User, Action, Target).
- **Filtering:** Client-side or server-side filtering (via API/RPC) by Date Range, User, Action, Target Type.
- **Pagination:** Implement pagination (client or server-side).
- **Scope:** Provides a raw log view for administrative/troubleshooting purposes in V1.

---

## 5. UI Components & Design System

- **Foundation:** Utilize Tailwind CSS utility classes. Adhere to `tailwind.config.js`.
- **Component Library:** Primarily use **Tailwind UI** components (React version). Adapt and style them as needed. Use **Headless UI** primitives for custom elements.
- **Custom Components:** Develop accessible and consistent custom components for specific needs (e.g., `KanbanBoard`, `GanttChart` wrapper, `RichTextEditor` wrapper, `ContextSwitcher`, widgets).
- **Storybook:** (_Added Requirement_)
  - Set up Storybook for the project.
  - Create stories for all shared/common components (`src/components/`).
  - Create stories for key reusable feature components (e.g., `TaskCard`, `ProjectCard`, `CourseCard`).
  - Configure controls to allow interactive testing of component props and states.
- **UI States:** (_Added Requirement_)
  - **Loading States:** Implement skeleton loaders (matching content structure) for initial page/section loads and complex data fetching within components. Use Next.js `loading.tsx` for route transitions. Use spinners for simpler loading indicators.
  - **Error States:** Display user-friendly error messages within components or sections where data fetching fails (using RTK Query `isError` or `error.tsx` boundaries). Provide options to retry where applicable.
  - **Empty States:** Design and implement clear empty states for all lists (projects, tasks, documents, etc.) with informative text and a relevant call-to-action button.
  - **Success States:** Use toasts (`react-hot-toast`) or subtle UI cues to confirm successful mutations/actions.
- **Micro-interactions & Animations:** (_Added Recommendation_)
  - Employ subtle, non-distracting animations/transitions using Tailwind CSS utilities or Framer Motion for specified UI elements. Respect `prefers-reduced-motion`.
- **Theming & Customization:** (_Added Detail_)
  - Implement dynamic theming based on `companies.primary_color` / `secondary_color`. Use CSS Custom Properties updated via JavaScript based on context. Configure Tailwind to use these variables. Apply theme-aware classes to relevant elements.
- **Responsiveness:** All views and components must be fully responsive.
- **Consistency:** Maintain visual and interactive consistency.

---

## 6. State Management Strategy

- **RTK Query:** Use RTK Query for server state management (fetching, caching, mutations). Define API slices. Utilize hooks (`useQuery`, `useMutation`) in Client Components. Configure provider in root layout.
- **Global Client State:** Use **Zustand** or **Jotai** (preferred) or RTK for minimal global client state (Auth status, User profile snippets, Context selection, UI preferences). Create stores/atoms accessible via hooks in Client Components. Use Providers in root layout.
- **Local Component State:** Use `useState`/`useReducer` in Client Components.
- **Server Components:** Do not use client-side state hooks. Fetch data directly or pass state down.

---

## 7. Routing Strategy

- **Library:** **Next.js App Router**. File-system based routing within the `app/` directory.
- **Structure:** Use route groups `(groupName)`. Use dynamic segments `[segmentName]`.
- **Protected Routes:** Implement protection using Next.js Middleware or checks within root/group layouts using `@supabase/auth-helpers-nextjs` server-side session checks. Redirect unauthenticated users.
- **Role-Based Rendering:** Fetch permissions server-side or client-side. Use permissions data to conditionally render elements in Server and Client Components.
- **Not Found Route:** Implement `not-found.tsx`.
- **Loading UI:** Implement `loading.tsx` files for automatic loading UI during Server Component data fetching and navigation.

---

## 8. API Integration Strategy

- **Client:** Use `@supabase/auth-helpers-nextjs` to create Supabase clients for Server Components, Client Components, and Route Handlers.
- **Data Fetching/Mutations:**
  - **Server Components:** Fetch data directly using the server Supabase client or RPC calls.
  - **Client Components:** Use RTK Query hooks which internally use the client Supabase client.
  - **Route Handlers (`app/api/`):** Optional, use server Supabase client.
- **Loading/Error States:** Handled by Next.js `loading.tsx` / `error.tsx` and by RTK Query hooks.

---

## 9. Authentication Flow (Frontend Detail with Next.js)

- **Server-Side Check:** Middleware/Layouts use `@supabase/auth-helpers-nextjs` (`createServerComponentClient`) to check session. Redirect if needed.
- **Client-Side Hydration/Sync:** Client components access session/user via `@supabase/auth-helpers-nextjs` hooks or data passed from Server Components. Global client state stores supplementary data.
- **Auth Listener:** Use `supabase.auth.onAuthStateChange` client-side to react to auth events.
- **Login/Logout/OAuth/SSO:** Client components trigger `supabase.auth` methods. Redirects handled by Next.js router.
- **Invitation:** Accept page (Client Component) verifies token -> directs to signup/login -> triggers accept API call.

---

## 10. Error Handling (Frontend Detail)

- **API Errors:** Handled via RTK Query hooks in Client Components. Server Component errors handled via `error.tsx`. Display user-friendly messages.
- **Form Validation:** Client-side via React Hook Form. Display inline errors. Handle backend validation errors (422 response).
- **Rendering Errors:** Use Next.js Error Boundaries (`error.tsx`). Log errors to Sentry.
- **Sentry Integration:** Use `@sentry/nextjs` for comprehensive error capturing. Enrich with context.

---

## 11. Real-time Features Implementation

- **Subscriptions:** Use Supabase client's Realtime capabilities within **Client Components** using `useEffect`. Scope subscriptions.
- **Update Strategy:** (_Refined_)
  - **Manual Cache Update:** Prefer `dispatch(api.util.updateQueryData(...))` for simple list updates.
  - **Cache Invalidation:** Use `dispatch(api.util.invalidateTags([...]))` for complex changes or easier implementation.
- Manage subscription lifecycle efficiently.

---

## 12. Accessibility (A11y)

- **Standards:** Adhere to WCAG 2.1 Level AA.
- **Implementation:** Semantic HTML, ARIA attributes, keyboard navigation, focus management, color contrast, form labels.
- **Process:** (_Requirement_) Automated checks (Axe in CI), manual keyboard/screen reader testing, design reviews include A11y checks.

---

## 13. Performance

- **Optimization Techniques:** Leverage Next.js features (Server Components, `next/image`, etc.). Apply React memoization. Implement List Virtualization. Monitor Bundle Size. Optimize Data Fetching.
- **Performance Budgets:** (_Requirement_) Target Lighthouse scores (>80 Performance, >95 Accessibility, >95 Best Practices) and Core Web Vitals ('Good' thresholds: LCP < 2.5s, CLS < 0.1). Monitor regularly.

---

## 14. Build, Deployment & PWA

- **Build Tool:** Use `next build`.
- **Environment Variables:** Use Next.js built-in support (`.env.local`). Use `NEXT_PUBLIC_` prefix for client-side vars.
- **Deployment Platform:** **Vercel** (recommended). Configure platform for Next.js App Router.
- **Progressive Web App (PWA):**
  - **Offline Support:** Not required for V1.
  - **PWA Capabilities:** Use `next-pwa` package to configure: Web App Manifest, Service Worker for caching static assets (`cache-first`).

---

## 15. Frontend Security

- **XSS Prevention:**
  - **Sanitize User Content:** Use `DOMPurify` before rendering user-generated HTML. Avoid `dangerouslySetInnerHTML`.
- **Content Security Policy (CSP):**
  - Implement appropriate `Content-Security-Policy` headers (via `next.config.js` or deployment platform). Restrict sources.
- **Dependency Security:** Regularly audit dependencies (`npm audit`).

---

## 16. Testing Strategy

- **Unit Tests:** Use **Vitest** (or Jest) with **React Testing Library (RTL)**. Test components, hooks, utils. Aim for > 70% coverage.
- **Integration Tests:** Use RTL to test component interactions. Mock API calls using **Mock Service Worker (MSW)**.
- **End-to-End (E2E) Tests:** Use **Cypress** or **Playwright**. Cover critical user journeys. Run against staging in CI/CD.

---

## 17. Conclusion

This frontend specification (Version 1.3) provides a detailed plan for building the **Next.js** application for the Enterprise SaaS Client Onboarding Platform, incorporating enhanced UI/UX considerations, development practices, performance budgets, security requirements, and specific UI elements for all backend features. Used alongside Backend Spec v3.3 and detailed UI/UX designs, this document guides the development of a modern, performant, accessible, and maintainable user interface.

---

```

```
