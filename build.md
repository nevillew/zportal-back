# Backend Build Steps & TODOs

This document outlines the remaining implementation steps and identified TODOs for the backend, based on `plan.md` (v3.3) and the current codebase. Items marked as complete were previously tracked in `done.md`.

## Core Mechanisms & Setup

## 1. Foundational Setup
- [ ] **Seed Data:**
    - [ ] Create/Update `seed.sql` with default `roles` and `permissions` based on `plan.md`.
    - [ ] _Note: Seeding default `project_templates` requires defining template content first._

## 2. Existing Function Enhancements (Core Logic & Permissions)
- [ ] **`risks` Function:**
    - [ ] Implement permission checks using `has_permission` (POST, PUT, DELETE).
    - [ ] Validate status, probability, impact enums against allowed values (POST, PUT).
    - [ ] Handle specific DB errors (FK violations, restricted delete, check constraints, not null) (POST, PUT, DELETE).
- [ ] **`task-comments` Function:**
    - [ ] Add permission check for staff/admin DELETE override.
- [ ] **`task-files` Function:**
    - [ ] Handle specific DB errors (constraint violations) (POST, DELETE).
    - [ ] Handle Storage API errors gracefully.
- [ ] **`tasks` Function:**
    - [ ] **Dependency Logic:** Add check for circular dependencies if required (PUT).
    - [ ] Implement conditional task logic evaluation (if backend check needed beyond frontend rendering).
    - [ ] Add permission check refinement for self-service updates (`is_self_service` flag).
- [ ] **`instantiate-project-template` Function:**
    - [ ] Handle errors during placeholder resolution or DB operations gracefully (initial step before full transaction refactor).

## 3. RLS & Storage Policy Refinement
- [ ] **Storage Policies:**
    - [ ] Refine Storage Policies to use RLS helper functions where applicable (e.g., `task-attachments` policy).
- [ ] **RLS Notes:**
    - [ ] _Note: Thorough RLS testing is a separate QA activity._
    - [ ] _Note: Verifying policy strictness is a separate QA/security review activity._

## 4. New Core Functions & Features (Build Dependencies First)
- [ ] **Notification Sender Function:** (Dependency for others)
    - [ ] Define input structure (recipient(s), message, type, context).
    - [ ] Implement email sending via Resend API (Requires Resend API key).
    - [ ] Implement Slack message sending via Slack API (Requires Slack Bot Token/Webhook URL).
    - [ ] Implement basic template rendering if needed.
- [ ] **Accept Invite API Endpoint:**
    - [ ] Create Edge Function endpoint `/accept-invite`.
    - [ ] Implement logic to verify invitation token (check status, expiry).
    - [ ] Implement logic to create `company_users` record.
    - [ ] Implement logic to update invitation status.
- [ ] **SSO JIT Provisioning Handler:** (Requires Supabase Auth Hook setup)
    - [ ] Create Edge Function triggered by Auth Hook.
    - [ ] Implement logic to receive claims, lookup `sso_configurations`, parse attributes, create/update `user_profiles`/`company_users`, handle role mapping.
- [ ] **Global Search RPC:** (Requires FTS setup)
    - [ ] Create RPC function `global_search(query text, filters jsonb, page int, page_size int)`.
    - [ ] Implement query against `search_index` table.
    - [ ] Implement RLS checks on results.
    - [ ] Implement pagination and return formatted results.
- [ ] **Reporting View RPCs:** (Requires Views to be defined/stable)
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
    - [ ] Implement logic to create records in `notifications` table (calls Notification Sender).
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
- [ ] **Calendly Webhook Handler:** (Requires Calendly setup)
    - [ ] Create Edge Function endpoint for Calendly webhooks.
    - [ ] Implement logic to parse payload, identify context, create/update `meetings` record.
    - [ ] Implement error handling/logging.
- [ ] **Certificate Generator Function:** (Requires PDFMonkey setup)
    - [ ] Create Edge Function triggered on course completion (e.g., via DB trigger/webhook).
    - [ ] Implement PDF generation using PDFMonkey API and template ID.
    - [ ] Implement upload to `certificates` storage bucket.
    - [ ] Implement creation of `course_certificates` record (if schema exists).
- [ ] **Gamification/Badge Awarder Trigger:**
    - [ ] Create trigger function to evaluate `badges.criteria` based on event (e.g., `lesson_completions` insert).
    - [ ] Implement logic to insert into `user_badges` if criteria met.
    - [ ] Apply trigger to relevant tables.
- [ ] **Existing Function Notifications:**
    - [ ] `issues`: Trigger notification on assignment or status change.
    - [ ] `milestones`: Trigger notification upon successful milestone approval (POST /approve).
    - [ ] `risks`: Trigger notification on assignment or status change.

## 5. Advanced Function Refactors
- [ ] **`instantiate-project-template` Function:**
    - [ ] **Transaction Handling:**
        - [ ] Convert function logic into a PostgreSQL RPC function (`instantiate_template_rpc`).
        - [ ] Implement transaction block (BEGIN/COMMIT/ROLLBACK) within the RPC function.
        - [ ] Update Edge Function to call the RPC function.
- [ ] **`tasks` Function:**
    - [ ] **Recurrence Logic:**
        - [ ] Calculate initial `next_occurrence_date` on creation if `is_recurring_definition` is true (POST).
        - [ ] Recalculate `next_occurrence_date` if `recurrence_rule` or `recurrence_end_date` changes (PUT).

## 6. New Scheduled Functions (`pg_cron`)
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
- [ ] **`generate-recurring-tasks` Function:**
    - [ ] Implement logging to `background_job_failures` table on error.
    - [ ] Clarify and implement permission/security context if needed (currently runs as service_role).

## 7. Cross-Cutting Concerns & Finalization
- [ ] **Error Handling & Logging:**
    - [ ] Add Sentry SDK initialization and error capturing to all Edge Functions (Requires Sentry DSN setup externally).
    - [ ] Implement logging to `background_job_failures` in *new* scheduled functions (as they are built).
- [ ] **Seed Data (Templates):**
    - [ ] _Note: Seeding default `project_templates` requires defining template content first._
- [ ] **Backend API Support for Frontend Verification:**
    - [ ] Verify `projects` endpoint provides necessary data for Project List/Detail views.
    - [ ] Verify `tasks` endpoint provides necessary data/filtering for Task Board/List/Detail views.
    - [ ] Verify `documents`/`pages` endpoints provide necessary data for Document Browser/Viewer/Editor.
    - [ ] Verify `notifications` endpoint provides necessary data for Notification dropdown/list.
    - [ ] Verify Realtime setup enables live updates for specified tables (`task_comments`, `tasks`, etc.).
