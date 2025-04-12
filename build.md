# Backend Build Steps & TODOs

This document outlines the remaining implementation steps and identified TODOs for the backend, based on `plan.md` (v3.3) and the current codebase. Items marked as complete were previously tracked in `done.md`.

## Core Mechanisms & Setup

- [ ] **RLS (Row Level Security):**
    - [x] Implement RLS helper functions (`is_active_user`, `is_staff_user`, `is_member_of_company`, `has_permission`) as `SECURITY DEFINER` functions.
    - [x] Define and apply RLS policies to core tables (`companies`, `projects`, `tasks`, `documents`, `milestones`, `risks`, `issues`, `task_files`, `task_comments`, `user_profiles`, `sections`).
    - [x] Define and apply RLS policies for `meetings`.
    - [ ] Define and apply RLS policies for `training_modules`, `training_enrollments`, `training_completions`.
    - [ ] Define and apply RLS policies for `badges` and `user_badges`.
    - [ ] Define and apply RLS policies for `custom_field_values` (Requires careful consideration of entity context).
    - [ ] Define and apply RLS policies for `reports` and `report_schedules`.
    - [ ] Define and apply RLS policies for `integrations` and `integration_configs`.
    - [ ] Define and apply RLS policies for `audit_logs` (e.g., staff only).
    - [ ] Define and apply RLS policies for `notifications` and `notification_settings`.
    - [ ] _Note: Thorough RLS testing is a separate QA activity._
- [ ] **Database Triggers & Functions:**
    - [x] Implement `updated_at` triggers for all tables (via `moddatetime` extension).
    - [x] Implement trigger/function for `sections.percent_complete` calculation based on `tasks` status changes.
    - [x] Implement triggers for populating `audit_log` table on relevant data modifications (INSERT, UPDATE, DELETE).
    - [ ] **Full-Text Search:**
        - [ ] Define `search_index` table schema (migration).
        - [ ] Create trigger function to update `search_index`.
        - [ ] Apply FTS trigger to relevant tables (e.g., `projects`, `tasks`, `documents`, `issues`, `risks`).
    - [ ] Implement database function `clone_project` for project duplication (Note: Complex SQL).
- [ ] **Error Handling & Logging:**
    - [x] Establish `background_job_failures` table.
    - [ ] Implement logging to `background_job_failures` in `generate-recurring-tasks` function.
    - [ ] Implement logging to `background_job_failures` in future scheduled functions (Data Retention, SLA Check, etc.).
    - [ ] Add Sentry SDK initialization and error capturing to all Edge Functions (Requires Sentry DSN setup externally).
    - [ ] Refactor `companies` function to return standardized error responses.
    - [ ] Refactor `projects` function to return standardized error responses.
    - [ ] Refactor `milestones` function to return standardized error responses.
    - [ ] Refactor `risks` function to return standardized error responses.
    - [ ] Refactor `issues` function to return standardized error responses.
    - [ ] Refactor `sections` function to return standardized error responses.
    - [ ] Refactor `tasks` function to return standardized error responses.
    - [ ] Refactor `task-comments` function to return standardized error responses.
    - [ ] Refactor `task-files` function to return standardized error responses.
    - [ ] Refactor `custom-field-definitions` function to return standardized error responses.
    - [ ] Refactor `instantiate-project-template` function to return standardized error responses.
    - [ ] Refactor `generate-recurring-tasks` function to return standardized error responses (via HTTP response).
- [ ] **Seed Data:**
    - [ ] Create/Update `seed.sql` with default `roles` and `permissions` based on `plan.md`.
    - [ ] _Note: Seeding default `project_templates` requires defining template content first._
- [ ] **Storage Policies:**
    - [x] Define and apply Supabase Storage access policies for all buckets (`company_logos`, `user_avatars`, `task_attachments`, etc.).
    - [ ] Refine Storage Policies to use RLS helper functions where applicable (e.g., `task-attachments` policy).
    - [ ] _Note: Verifying policy strictness is a separate QA/security review activity._

## Existing Edge Function TODOs & Enhancements

### `supabase/functions/_shared/validation.ts`

- [x] Enhance validation helpers to support all required validation types from `plan.md` (enums, lengths, formats, custom rules).

### `supabase/functions/companies/index.ts`

- [x] Refine permission checks using `has_permission` helper.
- [x] Handle specific DB errors (e.g., unique name constraint, FK violations).

### `supabase/functions/custom-field-definitions/index.ts`

- [x] Refine permission checks (Staff only, using `has_permission`).
- [x] Handle specific DB errors (unique constraints, FK violations, check constraints, not null).

### `supabase/functions/issues/index.ts`

- [x] Implement permission checks using `has_permission`.
- [x] Validate status, priority enums against allowed values (POST, PUT).
- [x] Handle specific DB errors (FK violations, check constraints, not null, deletion conflicts) (POST, PUT, DELETE).
- [ ] Trigger notification on assignment or status change (if required by plan).

### `supabase/functions/milestones/index.ts`

- [x] Implement permission checks using `has_permission` (CRUD: `milestone:manage`, approve: `milestone:approve`).
- [x] Validate status enum against allowed values (POST, PUT).
- [x] Implement full approval workflow logic:
    - [x] Check `sign_off_required` flag.
    - [x] Update status, `signed_off_by_user_id`, `signed_off_at` on approval (POST /approve).
    - [ ] Potentially create/update `approvals` table record if formal flow needed.
    - [ ] Trigger notification upon successful milestone approval (POST /approve).
- [x] Handle specific DB errors (unique constraints, FK violations, restricted delete, check constraints) (POST, PUT, DELETE).

### `supabase/functions/projects/index.ts`

- [x] Implement permission checks using `has_permission` (POST, PUT, DELETE).
- [x] Handle specific DB errors (unique constraints, FK violations, not found).
- [x] Implement Custom Field handling (GET, POST, PUT).

### `supabase/functions/risks/index.ts`

- [ ] Implement permission checks using `has_permission` (POST, PUT, DELETE).
- [ ] Validate status, probability, impact enums against allowed values (POST, PUT).
- [ ] Handle specific DB errors (FK violations, restricted delete, check constraints, not null) (POST, PUT, DELETE).
- [ ] Trigger notification on assignment or status change (Requires Notification Sender).

### `supabase/functions/sections/index.ts`

- [x] Implement permission checks using `has_permission` (POST, PUT, DELETE).
- [x] Handle specific DB errors (FK violations, check constraints, not null).
- [x] Ensure `percent_complete` is correctly updated by the trigger/function (verified).

### `supabase/functions/task-comments/index.ts`

- [x] Implement permission checks (view task, comment ownership, internal flag).
- [x] Refine permission check for DELETE (allow self-delete).
- [x] Handle specific DB errors (FK violation, parent comment deletion rules) (POST, PUT, DELETE).
- [ ] Add permission check for staff/admin DELETE override.

### `supabase/functions/task-files/index.ts`

- [x] Implement permission checks based on parent task access (`task:manage` or staff).
- [x] Ensure Storage interactions (upload/delete) respect defined Storage Policies (via Supabase client).
- [x] Handle specific DB errors (constraint violations) (POST, DELETE).
- [x] Handle Storage API errors gracefully.

### `supabase/functions/tasks/index.ts`

- [x] Implement permission checks using `has_permission` (`task:manage` or staff).
- [x] Validate status, priority enums (POST, PUT).
- [ ] **Recurrence Logic:**
    - [ ] Calculate initial `next_occurrence_date` on creation if `is_recurring_definition` is true (POST).
    - [ ] Recalculate `next_occurrence_date` if `recurrence_rule` or `recurrence_end_date` changes (PUT).
- [ ] **Dependency Logic:**
    - [ ] Add check for circular dependencies if required (PUT).
    - [x] Add check in PUT to prevent completing task if dependency incomplete.
- [ ] Implement conditional task logic evaluation (if backend check needed beyond frontend rendering).
- [x] Handle specific DB errors (FK violations, unique constraints, restricted delete, check constraints, not null) (POST, PUT, DELETE).
- [x] Implement Custom Field handling (GET, POST, PUT).
- [ ] Add permission check refinement for self-service updates (`is_self_service` flag).

### `supabase/functions/generate-recurring-tasks/index.ts` (Scheduled Function)

- [x] Implement RRULE parsing and date calculation using `rrule-deno`. Handle timezones.
- [ ] Implement logging to `background_job_failures` table on error.
- [x] Ensure function correctly updates `next_occurrence_date` on the definition task after creating an instance.
- [ ] Clarify and implement permission/security context if needed (currently runs as service_role).

### `supabase/functions/instantiate-project-template/index.ts` (Edge Function or RPC)

- [x] Implement placeholder resolution logic (API input -> `defined_placeholders.source` -> fallback).
- [ ] **Transaction Handling:**
    - [ ] Convert function logic into a PostgreSQL RPC function (`instantiate_template_rpc`).
    - [ ] Implement transaction block (BEGIN/COMMIT/ROLLBACK) within the RPC function.
    - [ ] Update Edge Function to call the RPC function.
- [x] Implement permission check (`has_permission('project:create')`).
- [x] Handle errors during placeholder resolution or DB operations gracefully (rollback transaction, return error).
- [x] Implement Task Custom Field value creation from `task_templates.custom_field_template_values`.

## New Edge Functions / RPC Functions

- [ ] **SSO JIT Provisioning Handler:** (Requires Supabase Auth Hook setup)
    - [ ] Create Edge Function triggered by Auth Hook.
    - [ ] Implement logic to receive claims, lookup `sso_configurations`, parse attributes, create/update `user_profiles`/`company_users`, handle role mapping.
- [ ] **Calendly Webhook Handler:** (Requires Calendly setup)
    - [ ] Create Edge Function endpoint for Calendly webhooks.
    - [ ] Implement logic to parse payload, identify context, create/update `meetings` record.
    - [ ] Implement error handling/logging.
- [ ] **Notification Sender Function:**
    - [ ] Define input structure (recipient(s), message, type, context).
    - [ ] Implement email sending via Resend API (Requires Resend API key).
    - [ ] Implement Slack message sending via Slack API (Requires Slack Bot Token/Webhook URL).
    - [ ] Implement basic template rendering if needed.
- [ ] **Certificate Generator Function:** (Requires PDFMonkey setup)
    - [ ] Create Edge Function triggered on course completion (e.g., via DB trigger/webhook).
    - [ ] Implement PDF generation using PDFMonkey API and template ID.
    - [ ] Implement upload to `certificates` storage bucket.
    - [ ] Implement creation of `course_certificates` record (if schema exists).
- [ ] **Gamification/Badge Awarder Trigger:**
    - [ ] Create trigger function to evaluate `badges.criteria` based on event (e.g., `lesson_completions` insert).
    - [ ] Implement logic to insert into `user_badges` if criteria met.
    - [ ] Apply trigger to relevant tables.
- [ ] **Global Search RPC:** (Requires FTS setup)
    - [ ] Create RPC function `global_search(query text, filters jsonb, page int, page_size int)`.
    - [ ] Implement query against `search_index` table.
    - [ ] Implement RLS checks on results.
    - [ ] Implement pagination and return formatted results.
- [ ] **Time Tracking Endpoints:** (If needed beyond PostgREST)
    - [ ] Create Edge Function/RPC for Start Timer.
    - [ ] Create Edge Function/RPC for Stop Timer (calculates duration, creates `time_entries`).
    - [ ] Create Edge Function/RPC for Manual Log Time.
- [ ] **Announcement Endpoints:**
    - [ ] Create Edge Function for CRUD operations on `announcements` table.
    - [ ] Implement permission checks.
- [ ] **@mention Processor & Notification:**
    - [ ] Create trigger function on `task_comments`/`document_comments` (or other relevant tables).
    - [ ] Implement logic to parse `content` for mentions (e.g., `@username` or `@userid`).
    - [ ] Implement logic to identify mentioned users.
    - [ ] Implement logic to create records in `notifications` table.
- [ ] **Reporting View RPCs:**
    - [ ] Create RPC function for `view_project_summary` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_task_details` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_overdue_tasks` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_staff_workload` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_time_tracking_summary` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_effort_variance` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_milestone_status` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_company_training_compliance` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_open_risks_issues` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_template_performance` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_client_engagement_summary` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_onboarding_cycle_time` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_document_usage` (accept filters, query view, apply RLS, return data).
    - [ ] Create RPC function for `view_custom_field_analysis` (accept filters, query view, apply RLS, return data).
- [ ] **Accept Invite API Endpoint:**
    - [ ] Create Edge Function endpoint `/accept-invite`.
    - [ ] Implement logic to verify invitation token (check status, expiry).
    - [ ] Implement logic to create `company_users` record.
    - [ ] Implement logic to update invitation status.
- [ ] **Document Management API:** (If needed beyond PostgREST)
    - [ ] Create Edge Function for CRUD operations on `documents`.
    - [ ] _Note: Versioning/Approval logic requires schema definition first._
- [ ] **Page Management API:** (If needed beyond PostgREST)
    - [ ] Create Edge Function for CRUD operations on `pages`.
- [ ] **Feedback Submission API:**
    - [ ] Create Edge Function endpoint to receive and store user feedback (requires `feedback` table schema).
- [ ] **Welcome Sequence Trigger/Function:**
    - [ ] Create trigger function on `company_users` insert (or `user_profiles` if applicable).
    - [ ] Implement logic to send welcome notification/email via Notification Sender function.
- [ ] **In-app Messaging API (CRUD):** (Requires `conversations`/`messages` schema)
    - [ ] Create Edge Function endpoints for managing conversations and messages.

## New Scheduled Functions (`pg_cron`)

- [ ] **Data Retention Cleanup Function:**
    - [ ] Create SQL function to read retention policies and perform deletes.
    - [ ] Implement logging to `background_job_failures`.
    - [ ] Schedule function using `cron.schedule`.
- [ ] **SLA Check / Overdue Task Notifier Function:**
    - [ ] Create SQL function to query overdue tasks.
    - [ ] Implement calls to Notification Sender function.
    - [ ] Schedule function using `cron.schedule`.
- [ ] **Project Health Calculator Function:** (If automated)
    - [ ] Create SQL function to analyze metrics and update `projects.health_status`.
    - [ ] Schedule function using `cron.schedule`.
- [ ] **Training Auto-Assignment Processor Function:** (If rules-based)
    - [ ] Create SQL function to evaluate rules and create `course_assignments`.
    - [ ] Schedule function using `cron.schedule`.
- [ ] **Materialized View Refresher Job:**
    - [ ] Schedule `REFRESH MATERIALIZED VIEW CONCURRENTLY ...` using `cron.schedule` for each materialized view.
- [ ] **Gamification Check Function:** (If not purely trigger-based)
    - [ ] Create SQL function to evaluate time-based/aggregate badge criteria.
    - [ ] Schedule function using `cron.schedule`.

## Backend API Support for Frontend

- [ ] Verify `projects` endpoint provides necessary data for Project List/Detail views.
- [ ] Verify `tasks` endpoint provides necessary data/filtering for Task Board/List/Detail views.
- [ ] Verify `documents`/`pages` endpoints provide necessary data for Document Browser/Viewer/Editor.
- [ ] Verify `notifications` endpoint provides necessary data for Notification dropdown/list.
- [ ] Verify Realtime setup enables live updates for specified tables (`task_comments`, `tasks`, etc.).
