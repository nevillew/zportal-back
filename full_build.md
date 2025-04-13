# ZPortal Backend Implementation - Full Build Plan

This document outlines the remaining backend implementation tasks based on `full_list.md` (derived from Spec v3.3), providing suggested solutions and action points.

## 2. Tenancy & User Management

### 2.3 Logic for Tenancy & Access Control

-   **Invitation Flow Logic (Frontend):**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed to verify token, prompt user, and call accept API.
-   **Role & Permission Management UI:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed. Backend support via `roles` table RLS and potentially API endpoints (if PostgREST is insufficient).
-   **Tenant/Company Admin Dashboard:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Single Sign-On (SSO) Logic (Frontend/Config):**
    -   _Status:_ Frontend Task / Supabase Config.
    -   _Action Points:_ Frontend implementation for UI/Flow. Enable SAML/OIDC providers in Supabase Auth settings.

### 2.4 Security Rules (RLS Policies in Supabase)

-   **Implement RLS policy for `company_users`:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Define policies allowing users to see their own association, and staff/managers (with `company:manage_users` perm) to see/manage users within a company.
    -   _Action Points:_ Create new migration file `YYYYMMDDHHMMSS_add_rls_company_users.sql` with `CREATE POLICY` statements for SELECT, INSERT, UPDATE, DELETE on `company_users`.
-   **Implement RLS policy for `invitations`:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Define policies allowing staff/managers (with `company:manage_users` perm) to SELECT/DELETE. Allow unauthenticated SELECT based on token (for frontend verification). Disallow direct UPDATE/INSERT by users.
    -   _Action Points:_ Create new migration file `YYYYMMDDHHMMSS_add_rls_invitations.sql` with `CREATE POLICY` statements.
-   **Implement RLS policy for `roles`:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Define policies allowing authenticated users to SELECT. Restrict INSERT/UPDATE/DELETE to staff with `admin:manage_roles` permission. Prevent modification of system roles.
    -   _Action Points:_ Create new migration file `YYYYMMDDHHMMSS_add_rls_roles.sql` with `CREATE POLICY` statements.
-   **Implement RLS policy for `sso_configurations`:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Define policies restricting all access (SELECT, INSERT, UPDATE, DELETE) to staff users, potentially allowing Company Admins read access based on `company_id`.
    -   _Action Points:_ Create new migration file `YYYYMMDDHHMMSS_add_rls_sso_configurations.sql` with `CREATE POLICY` statements.

## 3. Projects Management

### 3.3 Logic for Projects

-   **Milestone Tracking Logic (UI):**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Milestone Sign-off Workflow (`approvals` table):**
    -   _Status:_ Deferred (Schema TBD).
    -   _Solution:_ Define `approvals` and `approval_steps` table schemas if a formal multi-step workflow is required beyond the current basic sign-off fields. Implement logic in `milestones` function PUT handler to create `approvals` record.
    -   _Action Points:_ (Deferred) Create migration for `approvals` schema. Modify `milestones` Edge Function.
-   **Risk/Issue Management Logic (UI):**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Project Health Logic (Scheduled Job):**
    -   _Status:_ Deferred (Logic TBD).
    -   _Solution:_ Define calculation logic (e.g., based on overdue tasks, milestone status). Create a SQL function for the calculation. Create a scheduled job (pg_cron calling an Edge Function or SQL function) to run periodically and update `projects.health_status`.
    -   _Action Points:_ (Deferred) Define calculation logic. Create migration for SQL function. Create migration for `cron.schedule`.

### 3.8 Logic for Tasks & Sections

-   **Frontend DND logic for `order` updates:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed. Backend PUT endpoints for `tasks` and `sections` already support updating `order`.
-   **Conditional Task evaluation logic (Frontend):**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed to evaluate `tasks.condition` JSONB and conditionally render/enable tasks.
-   **Dependency enforcement logic (Backend):**
    -   _Status:_ Partially Implemented (Basic check in PUT). Requires enhancement.
    -   _Solution:_ Enhance the RLS `WITH CHECK` clause on the `tasks` table UPDATE policy to prevent status updates to 'Complete' if `depends_on_task_id` points to an incomplete task. Alternatively, create a `BEFORE UPDATE` trigger.
    -   _Action Points:_ Create migration `YYYYMMDDHHMMSS_enhance_task_dependency_rls.sql` to `DROP` and `CREATE` the existing UPDATE policy on `tasks` with the added dependency check in the `WITH CHECK` clause.
-   **Sub-Task UI hierarchy:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Recurring Task definition UI:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.

### 3.9 Security Rules (RLS) for Tasks & Sections

-   **Ensure `tasks` policy enforces dependencies:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Enhance the `tasks` UPDATE RLS policy `WITH CHECK` clause.
    -   _Action Points:_ Included in action points for item 3.8 (Dependency enforcement logic).
-   **Ensure `tasks` policy restricts recurrence definition edits:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Enhance the `tasks` UPDATE RLS policy `WITH CHECK` clause to prevent non-staff from modifying `is_recurring_definition`, `recurrence_rule`, `recurrence_end_date` if `is_recurring_definition` is true.
    -   _Action Points:_ Create migration `YYYYMMDDHHMMSS_enhance_task_recurrence_rls.sql` to `DROP` and `CREATE` the existing UPDATE policy on `tasks` with added checks for recurrence fields.

### 3.11 Data Model for Templates

-   **Implement logic to update `is_latest_version` flags:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Create a trigger function that runs after INSERT or UPDATE on `project_template_versions`. The function should set `is_latest_version = false` for all other versions of the same `project_template_id` if the inserted/updated row has `is_latest_version = true`. Handle potential race conditions if necessary (though unlikely for template management).
    -   _Action Points:_ Create migration `YYYYMMDDHHMMSS_add_template_version_trigger.sql` with the trigger function and `CREATE TRIGGER` statement.

### 3.12 Logic for Templates

-   **Implement UI for template selection:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Implement Placeholder Resolution logic (Advanced):**
    -   _Status:_ Partially Implemented (Basic SQL version). Requires enhancement for complex sources.
    -   _Solution:_ Enhance the `instantiate_template_rpc` function or the calling Edge Function (`instantiate-project-template`) to fetch necessary context (e.g., company custom fields) and perform placeholder substitution based on the `defined_placeholders` source information before creating entities.
    -   _Action Points:_ Modify `supabase/migrations/20250416080100_add_instantiate_template_rpc.sql` OR `supabase/functions/instantiate-project-template/index.ts`.
-   **Implement Admin UI for version management:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.

## 4. Documentation

### 4.1 Data Model for Documentation

-   **Consider FTS index on `content`:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Add a GIN index to the `pages.content` column to enable full-text search within page content. Update the `update_search_index` trigger function to include `pages.content` in the `search_vector` for `document` entity types.
    -   _Action Points:_ Create migration `YYYYMMDDHHMMSS_add_fts_pages_content.sql` to add the GIN index and update the `update_search_index` function definition.

### 4.2 Logic for Documentation

-   **Implement Approval Workflow logic:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Add a new API endpoint (e.g., `POST /documents/{documentId}/approve`) or modify the existing PUT endpoint in the `documents` Edge Function. This endpoint should check for `document:approve` permission, then update the document's `status` to 'Approved', set `is_approved = true`, `approved_by_user_id = auth.uid()`, and `approved_at = now()`.
    -   _Action Points:_ Modify `supabase/functions/documents/index.ts` to add the approval logic/endpoint.
-   **Implement Document/Page Linking logic:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed (editor support, rendering).
-   **Implement Internal Comment visibility logic:**
    -   _Status:_ Outstanding (RLS policy needed).
    -   _Solution:_ Implement RLS policy for `document_comments`.
    -   _Action Points:_ Covered by item 4.3.

### 4.3 Security Rules (RLS) for Documentation

-   **Implement RLS policy for `document_comments`:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Define policies similar to `task_comments`, checking access to the parent page (via `can_access_document` helper on the page's document) and respecting the `is_internal` flag based on `is_staff_user`.
    -   _Action Points:_ Create migration `YYYYMMDDHHMMSS_add_rls_document_comments.sql` with `CREATE POLICY` statements.

## 5. Meetings

### 5.2 Logic for Meetings

-   **Implement Completion Lock logic:**
    -   _Status:_ Outstanding.
    -   _Solution:_ Create a `BEFORE UPDATE` trigger function on the `meetings` table. If `OLD.status = 'completed'`, check if any fields other than `notes` or `recording_url` are being changed in `NEW`. If so, raise an exception to prevent the update.
    -   _Action Points:_ Create migration `YYYYMMDDHHMMSS_add_meeting_completion_lock_trigger.sql` with the trigger function and `CREATE TRIGGER` statement.

## 6. Training

### 6.2 Logic for Training

-   **Implement Auto-Assignment logic:**
    -   _Status:_ Deferred (Rules TBD).
    -   _Solution:_ Define schema for `training_assignment_rules` table. Create a scheduled function (SQL or Edge) to evaluate rules against users/companies and insert into `course_assignments`.
    -   _Action Points:_ (Deferred) Define rules logic. Create migration for rules table. Create migration for scheduled function/trigger.
-   **Implement UI display for earned badges:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Implement Quiz logic:**
    -   _Status:_ Partially Outstanding (Backend endpoint needed).
    -   _Solution:_ Create a new Edge Function (e.g., `submit-quiz`) that accepts `lesson_id` and user answers. Fetch `lessons.quiz_data`, validate answers, calculate score, and insert/update `lesson_completions` record with the score.
    -   _Action Points:_ Create new Edge Function `supabase/functions/submit-quiz/index.ts` and associated files (`.npmrc`). Implement validation and scoring logic.

## 7. Additional Features

### 7.2 Advanced Workflow Features

-   **Ensure `tasks.condition` is evaluated correctly:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Ensure `tasks.depends_on_task_id` is enforced:**
    -   _Status:_ Covered by item 3.9.
-   **Implement Training Auto-Assignment:**
    -   _Status:_ Covered by item 6.2 (Deferred).
-   **Implement SLA Tracking:**
    -   _Status:_ Deferred (Rules TBD).
    -   _Solution:_ Define SLA rules/fields. Create scheduled function to check tasks against rules and potentially trigger notifications.
    -   _Action Points:_ (Deferred) Define SLA logic. Create migration for schema changes. Create migration for scheduled function.

### 7.3 Client Experience Enhancements

-   **Ensure Role-based UI rendering:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Implement Client Portal Customization:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed (reading CSS vars from `companies` API).

### 7.5 Advanced Permission System

-   **Implement Role Management UI:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.

### 7.6 Implementation Features

-   **Implement Bulk Operations:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed (using Supabase client library batching).

### 7.7 Technical Enhancements

-   **Implement Audit Log Viewer UI:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.
-   **Implement custom rate limiting:**
    -   _Status:_ Deferred (Low Priority).
    -   _Solution:_ Configure Supabase Auth limits. If more granular control is needed per-function, investigate using external services (Redis, Upstash) or database tables for tracking requests within Edge Functions.
    -   _Action Points:_ (Deferred) Modify `supabase/config.toml` for basic limits. Implement custom logic in specific Edge Functions if required later.

### 7.8 Documentation System Improvements

-   **Implement `documents.is_approved` workflow:**
    -   _Status:_ Covered by item 4.2.
-   **Define `document_templates` table schema:**
    -   _Status:_ Deferred (Schema TBD).
    -   _Solution:_ Define schema for `document_templates` similar to `project_templates`.
    -   _Action Points:_ (Deferred) Create migration for `document_templates` schema.
-   **Implement Internal Linking:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.

### 7.9 Communication Enhancements

-   **Define Bot integration strategy:**
    -   _Status:_ Deferred (Strategy TBD).
    -   _Action Points:_ (Deferred) Define requirements and choose integration method.

### 7.10 Training System Enhancements

-   **Implement Assignment Rules:**
    -   _Status:_ Covered by item 6.2 (Deferred).

### 7.13 Custom Fields

-   **Implement Staff UI for managing definitions:**
    -   _Status:_ Frontend Task.
    -   _Action Points:_ Frontend implementation needed.

### 7.15 Error Handling Philosophy

-   **Implement Sentry integration:**
    -   _Status:_ Deferred (External Setup Required).
    -   _Solution:_ Obtain Sentry DSN, store in Supabase Vault. Add Sentry SDK (`@sentry/deno` or equivalent) to Edge Functions. Initialize Sentry and wrap function handlers or use explicit error capturing.
    -   _Action Points:_ (Deferred) Add Sentry DSN to Vault. Modify all Edge Functions to include Sentry SDK and error reporting.

## 8. Backend Implementation Plan

### 8.4 Edge Functions

-   **Develop Scheduled Task functions (SLA, Health):**
    -   _Status:_ Covered by items 7.2 and 3.3 (Deferred).

### 8.6 Scalability & Performance

-   **Optimize database queries:**
    -   _Status:_ Ongoing / Deferred.
    -   _Solution:_ Analyze slow queries using `EXPLAIN ANALYZE`. Add/optimize indexes based on query plans. Refactor complex queries or views.
    -   _Action Points:_ (Deferred) Requires performance analysis and specific query identification.
-   **Optimize Edge Function performance:**
    -   _Status:_ Ongoing / Deferred.
    -   _Solution:_ Review function execution times and memory usage. Optimize data fetching, reduce cold starts if possible, optimize algorithms.
    -   _Action Points:_ (Deferred) Requires performance analysis and specific function identification.

## 10. Configuration & Administration

-   **Ensure backend supports required Admin UIs:**
    -   _Status:_ Covered by specific feature implementations (Roles, Custom Fields, Templates, etc.).
    -   _Action Points:_ Verify necessary API endpoints and RLS policies exist as part of implementing the corresponding frontend admin UIs.

## 12. General Requirements

-   **Ensure backend provides necessary data for frontend accessibility:**
    -   _Status:_ Addressed (Ongoing).
    -   _Action Points:_ Continuously review API responses during frontend development to ensure necessary data (e.g., IDs for `aria-labelledby`) is included.
