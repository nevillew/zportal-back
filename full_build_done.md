# ZPortal Backend Implementation Log - Full Build

## 2025-04-14 (Deferred Items Implementation)

-   **Milestone Approval Workflow:** Implemented multi-step approval process.
    -   Created `approvals` and `approval_steps` tables. (Migration: `20250414020100_create_approval_tables.sql`)
    -   Modified `milestones` Edge Function PUT handler to create `approvals` and initial `approval_steps` records when `sign_off_required` is true and status is set to 'Completed'. (`supabase/functions/milestones/index.ts`)
    -   Created RPC function `approve_milestone_step` to handle approving/rejecting individual steps and updating overall status. (Migration: `20250414020200_add_approve_milestone_step_rpc.sql`)
-   **Project Health Logic:** Implemented scheduled calculation based on example logic.
    -   Created SQL function `calculate_project_health` using example criteria (overdue tasks, milestones, open risks/issues). (Migration: `20250414020300_add_project_health_function.sql`)
    -   Created Edge Function `update-project-health` to iterate projects and call the RPC. (`supabase/functions/update-project-health/index.ts`)
    -   Scheduled the Edge Function trigger via `pg_cron` to run daily. (Migration: `20250414020400_schedule_project_health_update.sql`)
-   **Training Auto-Assignment:** Implemented role-based auto-assignment.
    -   Created `training_assignment_rules` table. (Migration: `20250414020500_create_training_assignment_rules_table.sql`)
    -   Created Edge Function `assign-training` to process rules and assign courses. (`supabase/functions/assign-training/index.ts`)
    -   Scheduled the Edge Function trigger via `pg_cron` to run daily. (Migration: `20250414020600_schedule_training_assignment.sql`)
-   **SLA Tracking:** Implemented task due date SLA check based on example logic.
    -   Added `sla_definition` (JSONB) and `sla_breached` (boolean) columns to `tasks` and `task_templates`. Updated `instantiate_template_rpc` to copy definition. (Migration: `20250414020700_add_sla_columns.sql`)
    -   Created Edge Function `check-sla` to identify and mark breached tasks. (`supabase/functions/check-sla/index.ts`)
    -   Scheduled the Edge Function trigger via `pg_cron` to run hourly. (Migration: `20250414020800_schedule_sla_check.sql`)
-   **Document Templates:** Implemented simple content templating.
    -   Created `document_templates` table. (Migration: `20250414020900_create_document_templates_table.sql`)
    -   Modified `documents` Edge Function POST handler to accept `template_id` and create initial page content. (`supabase/functions/documents/index.ts`)

---

*(Previous entries from original full_build_done.md)*

## 2025-04-14

-   **RLS Policies:** Implemented Row Level Security policies for:
    -   `company_users` (Migration: `20250414010100_add_rls_company_users.sql`)
    -   `invitations` (Migration: `20250414010200_add_rls_invitations.sql`)
    -   `roles` (Migration: `20250414010300_add_rls_roles.sql`)
    -   `sso_configurations` (Migration: `20250414010400_add_rls_sso_configurations.sql`)
    -   `document_comments` (Migration: `20250414010800_add_rls_document_comments.sql`)
-   **Task RLS Enhancements:** Updated the `tasks` table UPDATE RLS policy to enforce dependencies (prevent completion if dependency incomplete) and restrict editing of recurrence definition fields to authorized users. (Migration: `20250414010500_enhance_task_dependency_rls.sql`)
-   **Template Versioning:** Added trigger function `enforce_single_latest_template_version` and applied trigger to `project_template_versions` to ensure only one version is marked as latest. (Migration: `20250414010600_add_template_version_trigger.sql`)
-   **Placeholder Resolution:** Enhanced `instantiate_template_rpc` function to resolve placeholders based on `defined_placeholders` source information (company standard fields, company custom fields). (Migration: `20250416080100_add_instantiate_template_rpc.sql`)
-   **FTS for Pages:** Added GIN index to `pages.content` and updated `update_search_index` trigger function to include page content in the search vector. (Migration: `20250414010700_add_fts_pages_content.sql`)
-   **Document Approval:** Added `POST /documents/{id}/approve` endpoint logic to the `documents` Edge Function to handle document approval workflow. (`supabase/functions/documents/index.ts`)
-   **Meeting Completion Lock:** Added trigger function `prevent_completed_meeting_updates` and applied trigger to `meetings` table to prevent modifications (except notes/recording) after completion. (Migration: `20250414010900_add_meeting_completion_lock_trigger.sql`)
-   **Quiz Submission:** Created new Edge Function `submit-quiz` to handle quiz submissions, score calculation, and recording completion status/score in `lesson_completions`. (`supabase/functions/submit-quiz/index.ts`)
