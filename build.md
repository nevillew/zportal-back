# Backend Build Steps & TODOs

This document outlines the remaining implementation steps and identified TODOs for the backend, based on `plan.md` (v3.3) and the current codebase. Items marked as complete were previously tracked in `done.md`.

## Core Mechanisms & Setup

- [ ] **RLS (Row Level Security):**
    - [x] Implement RLS helper functions (`is_active_user`, `is_staff_user`, `is_member_of_company`, `has_permission`) as `SECURITY DEFINER` functions.
    - [x] Define and apply RLS policies to core tables (`companies`, `projects`, `tasks`, `documents`, `milestones`, `risks`, `issues`, `task_files`, `task_comments`, `user_profiles`, `sections`).
    - [ ] Define and apply RLS policies to remaining relevant tables (`meetings`, `training` related tables, `custom_field_values`, etc.).
    - [ ] Thoroughly test RLS policies with different user roles and scenarios.
- [ ] **Database Triggers & Functions:**
    - [x] Implement `updated_at` triggers for all tables (via `moddatetime` extension).
    - [x] Implement trigger/function for `sections.percent_complete` calculation based on `tasks` status changes.
    - [x] Implement triggers for populating `audit_log` table on relevant data modifications (INSERT, UPDATE, DELETE).
    - [ ] Implement triggers for updating the Full-Text Search index (`search_index` table) when relevant data changes.
    - [ ] Implement database function `clone_project` for project duplication.
- [ ] **Error Handling & Logging:**
    - [x] Establish `background_job_failures` table.
    - [ ] Implement consistent logging to `background_job_failures` from all scheduled/background functions.
    - [ ] Integrate Sentry SDK (`@sentry/nextjs` or equivalent Deno SDK) into all Edge Functions for critical error reporting. Enrich logs with context.
    - [ ] Ensure all API endpoints/functions return standardized error responses (HTTP status codes, JSON body with `message`/`errors` for validation failures - see plan 7.15).
- [ ] **Seed Data:**
    - [ ] Finalize and implement seed scripts/migration for default `roles`, `permissions`, `project_templates`, etc. (See plan 8.1 note).
- [ ] **Storage Policies:**
    - [x] Define and apply Supabase Storage access policies for all buckets (`company_logos`, `user_avatars`, `task_attachments`, etc.).
    - [ ] Verify policies leverage RLS helper functions where possible and are sufficiently strict.

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

- [ ] Implement permission checks using `has_permission`.
- [ ] Handle specific DB errors.

### `supabase/functions/risks/index.ts`

- [ ] Implement permission checks using `has_permission`.
- [ ] Validate status, probability, impact enums against allowed values (POST, PUT).
- [ ] Handle specific DB errors (FK violations, restricted delete) (POST, PUT, DELETE).
- [ ] Trigger notification on assignment or status change (if required by plan).

### `supabase/functions/sections/index.ts`

- [ ] Implement permission checks using `has_permission`.
- [ ] Handle specific DB errors.
- [x] Ensure `percent_complete` is correctly updated by the trigger/function (verify trigger implementation).

### `supabase/functions/task-comments/index.ts`

- [ ] Implement permission checks using `has_permission` (consider `is_internal` flag vs staff status).
- [ ] Refine permission check for DELETE (allow self-delete, potentially admin override).
- [ ] Handle specific DB errors (FK violation, parent comment deletion rules) (POST, PUT, DELETE).

### `supabase/functions/task-files/index.ts`

- [ ] Implement permission checks based on parent task access.
- [ ] Ensure Storage interactions (upload/delete) respect defined Storage Policies.
- [ ] Handle specific DB errors (constraint violations) (POST, DELETE).
- [ ] Handle Storage API errors gracefully.

### `supabase/functions/tasks/index.ts`

- [ ] Implement permission checks using `has_permission` (consider `is_self_service` for client updates).
- [ ] Validate status, priority enums (POST, PUT).
- [ ] Implement full recurrence logic:
    - [ ] Calculate initial `next_occurrence_date` on creation if `is_recurring_definition` is true (POST).
    - [ ] Recalculate `next_occurrence_date` if `recurrence_rule` or `recurrence_end_date` changes (PUT).
- [ ] Implement dependency logic:
    - [ ] Add check for circular dependencies if required (PUT).
    - [ ] Ensure RLS/frontend prevents actions violating dependencies (e.g., completing task before dependency).
- [ ] Implement conditional task logic evaluation (if backend check needed beyond frontend rendering).
- [ ] Handle specific DB errors (FK violations, unique constraints, restricted delete) (POST, PUT, DELETE).

### `supabase/functions/generate-recurring-tasks/index.ts` (Scheduled Function)

- [ ] Implement robust RRULE parsing and date calculation (consider using a library like `rrule-js` if feasible in Deno). Handle timezones correctly.
- [ ] Implement logging to `background_job_failures` table on error.
- [ ] Ensure function correctly updates `next_occurrence_date` on the definition task after creating an instance.
- [ ] Add permission/security context if needed (though likely runs as superuser via `pg_cron`).

### `supabase/functions/instantiate-project-template/index.ts` (Edge Function or RPC)

- [ ] Implement robust placeholder resolution logic (API input -> `defined_placeholders.source` -> fallback) (See plan 3.12).
- [ ] Wrap all database operations (project, sections, tasks, custom fields creation) within a single database transaction (likely requires converting this to an RPC function). Implement rollback on any failure.
- [ ] Implement permission check (`has_permission('project:create')`).
- [ ] Handle errors during placeholder resolution or DB operations gracefully (rollback transaction, return error).

## New Edge Functions / RPC Functions

- [ ] **SSO JIT Provisioning Handler:**
    - [ ] Triggered by Supabase Auth hook (e.g., `auth.hook_set_custom_claims`).
    - [ ] Receives IdP claims.
    - [ ] Looks up `sso_configurations`.
    - [ ] Parses claims based on `attribute_mapping`.
    - [ ] Creates/updates `user_profiles` and `company_users` records.
    - [ ] Handles role mapping.
- [ ] **Calendly Webhook Handler:**
    - [ ] Receives `invitee.created` / `invitee.canceled` webhooks.
    - [ ] Parses payload, identifies context (`company_id`/`project_id`).
    - [ ] Creates/updates `meetings` record using `calendly_event_uri`.
    - [ ] Handles errors, logs failures.
- [ ] **Notification Sender:** (May be integrated into other functions or a dedicated one)
    - [ ] Takes recipient(s), message, type (email/Slack) as input.
    - [ ] Uses Resend API for email.
    - [ ] Uses Slack API for Slack messages.
    - [ ] Handles template rendering if needed.
- [ ] **Certificate Generator:**
    - [ ] Triggered on course completion.
    - [ ] Generates PDF using PDFMonkey API and template.
    - [ ] Uploads PDF to `certificates` storage bucket.
    - [ ] Creates record in `course_certificates` table (if implemented).
- [ ] **Gamification/Badge Awarder:** (Could be Trigger/DB Function or Edge Function)
    - [ ] Evaluates `badges.criteria` based on trigger event (e.g., `lesson_completions` insert) or scheduled check.
    - [ ] Inserts record into `user_badges` if criteria met.
- [ ] **Global Search RPC:**
    - [ ] Takes search query, filters, pagination params.
    - [ ] Queries the `search_index` table (FTS).
    - [ ] Applies RLS/permission checks to results.
    - [ ] Returns formatted search results.
- [ ] **Time Tracking Endpoints:** (If needed beyond simple CRUD via PostgREST)
    - [ ] Start Timer endpoint.
    - [ ] Stop Timer endpoint (calculates duration, creates `time_entries` record).
    - [ ] Manual Log Time endpoint.
- [ ] **Announcement Endpoints:**
    - [ ] Create/Update/Delete announcements (check permissions).
- [ ] **@mention Processor:** (If backend processing needed)
    - [ ] Parses comment/message content for mentions.
    - [ ] Identifies users.
    - [ ] Creates records in `notifications` table.
- [ ] **Reporting View RPCs:**
    - [ ] Create RPC functions for each reporting view (`view_project_summary`, etc.).
    - [ ] Accept filter/pagination parameters.
    - [ ] Query the corresponding view.
    - [ ] Apply necessary RLS checks.
    - [ ] Return data.
- [ ] **Accept Invite API Endpoint:**
    - [ ] Verifies invitation token.
    - [ ] Creates `company_users` record.
    - [ ] Updates invitation status.
- [ ] **Document Management API (Versioning, Approvals):** (If needed beyond PostgREST)
    - [ ] Handle CRUD for documents.
    - [ ] Implement versioning logic.
    - [ ] Implement approval workflow logic.
- [ ] **Page Management API (CRUD):** (If needed beyond PostgREST)
    - [ ] Handle CRUD for document pages.
- [ ] **Feedback Submission API:**
    - [ ] Endpoint to receive and store user feedback.
- [ ] **Welcome Sequence Trigger/Function:**
    - [ ] Triggered on user creation or first company join.
    - [ ] Sends welcome notification/email.
- [ ] **In-app Messaging API (CRUD):** (If implementing custom messaging)
    - [ ] Endpoints for conversations and messages.
- [ ] **@mention Processing & Notification:**
    - [ ] Parses content for mentions.
    - [ ] Creates records in `notifications` table.

## New Scheduled Functions (`pg_cron`)

- [ ] **Data Retention Cleanup:**
    - [ ] Reads retention policies (`companies` table or system config).
    - [ ] Performs soft/hard deletes on relevant tables (`projects`, `audit_log`, etc.) based on age and status.
    - [ ] Logs actions and failures.
- [ ] **SLA Check / Overdue Task Notifier:**
    - [ ] Queries `tasks` for upcoming/overdue items based on `due_date`.
    - [ ] Triggers notifications via Notification Sender function.
- [ ] **Project Health Calculator:** (If automated)
    - [ ] Analyzes project metrics (task status, overdue items, risks, issues).
    - [ ] Updates `projects.health_status`.
- [ ] **Training Auto-Assignment Processor:** (If rules-based)
    - [ ] Evaluates assignment rules against users/roles.
    - [ ] Creates `course_assignments` records.
- [ ] **Materialized View Refresher:**
    - [ ] Schedules `REFRESH MATERIALIZED VIEW CONCURRENTLY ...` for all materialized reporting views.
- [ ] **Gamification Check:** (If not purely trigger-based)
    - [ ] Periodically evaluates badge criteria that might depend on aggregated data or time-based conditions.

## Frontend Support

- [ ] Ensure all backend endpoints provide the necessary data structures and filtering/sorting capabilities required by the frontend spec (`plan.md` Section 4 onwards).
- [ ] Verify Realtime setup for tables requiring live updates on the frontend.
