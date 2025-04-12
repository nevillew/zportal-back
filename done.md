## 2025-04-15

-   **Tasks Function:** Implemented basic conditional task logic evaluation in the PUT handler. Before allowing a status update to 'Complete', it checks if the task's `condition` field specifies a `required_dependency_status` and verifies that the dependency task has the required status. (`supabase/functions/tasks/index.ts`)
-   **Tasks Function:** Added circular dependency check using a new PostgreSQL helper function (`check_task_circular_dependency`) called via RPC during task updates (PUT). Prevents setting a `depends_on_task_id` that would create a loop. (Migration: `20250415100000_add_circular_dependency_check.sql`, Function: `supabase/functions/tasks/index.ts`)
-   **Task Files Function:** Implemented specific error handling for database constraints (FK violation, NOT NULL) and Storage API errors during file upload (POST) and deletion (DELETE). (`supabase/functions/task-files/index.ts`)
-   **Task Comments Function:** Added permission check to allow staff users to delete any task comment, in addition to the original author. (`supabase/functions/task-comments/index.ts`)
-   **Tasks Function:** Refined permission check in PUT handler to allow assigned users to update tasks flagged as `is_self_service`, aligning function logic with RLS policy. (`supabase/functions/tasks/index.ts`)
-   **Instantiate Project Template Function:** Added graceful error handling using a main try-catch block and more specific error messages for failures during template fetching, placeholder resolution, or database insertions. (`supabase/functions/instantiate-project-template/index.ts`)

## 2025-04-14

-   **Risks Function:** Enhanced `supabase/functions/risks/index.ts`:
    -   Added validation for `status`, `probability`, and `impact` fields against allowed enum values in POST/PUT requests.
    -   Implemented specific error handling for database constraints (foreign key, check, not null) and missing records (PGRST204) during POST, PUT, and DELETE operations, returning appropriate 4xx HTTP status codes.
    -   Verified existing permission checks using `has_permission` and staff status.
-   **Seed Data:** Create `supabase/seed.sql` file and populate it with default system roles ('Staff Admin', 'Project Manager', 'Implementation Specialist', 'Company Admin', 'Client Viewer') and their corresponding `base_permissions` JSONB definitions based on `plan.md`. Marked roles as `is_system_role = true`.

## 2025-04-13

-   **RLS:** Define and apply RLS policies for `meetings` table (SELECT, INSERT, UPDATE, DELETE) using helper functions and respecting status lock logic. (Migration: `20250413120000_add_rls_meetings.sql`)
-   **RLS:** Define and apply RLS policies for training tables (`courses`, `lessons`, `course_assignments`, `lesson_completions`) covering user access, staff management, and assignment/completion logic. (Migration: `20250413130000_add_rls_training.sql`)
-   **RLS:** Define and apply RLS policies for gamification tables (`badges`, `user_badges`) allowing public read for definitions, user read for earned, and restricting modifications. (Migration: `20250413140000_add_rls_gamification.sql`)
-   **RLS:** Define and apply RLS policies for `custom_field_values` based on access to the parent entity (company, project, task, etc.), using a helper function `can_manage_entity_for_custom_field`. (Migration: `20250413150000_add_rls_custom_field_values.sql`)
-   **RLS:** Define and apply RLS policies for `audit_log` table, restricting SELECT to staff and disallowing direct modifications. (Migration: `20250413160000_add_rls_audit_logs.sql`)
-   **RLS:** Define and apply RLS policies for `notifications` (user/staff SELECT, staff DELETE) and `notification_settings` (user CRUD, staff SELECT). (Migration: `20250413170000_add_rls_notifications.sql`)
-   **FTS:** Implement Full-Text Search mechanism: Create `search_index` table, `update_search_index` trigger function, apply triggers to relevant tables, and add RLS policies to `search_index`. (Migration: `20250413180000_add_fts.sql`)
-   **DB Function:** Implement `clone_project` PostgreSQL function to duplicate projects, sections, tasks (preserving hierarchy), risks, issues, and custom fields. (Migration: `20250413190000_add_clone_project_function.sql`)
-   **Logging:** Implement logging to `background_job_failures` table within the `generate-recurring-tasks` Edge Function.
-   **Error Handling:** Refactor `companies` Edge Function to use standardized error response helpers (`createNotFoundResponse`, `createForbiddenResponse`, etc.) from `_shared/validation.ts`. Added new helper functions to `validation.ts`.
-   **Error Handling:** Refactor `projects` Edge Function to use standardized error response helpers (`createNotFoundResponse`, `createForbiddenResponse`, `createUnauthorizedResponse`, etc.) from `_shared/validation.ts`.
-   **Error Handling:** Refactor `milestones` Edge Function to use standardized error response helpers (`createNotFoundResponse`, `createForbiddenResponse`, `createUnauthorizedResponse`, `createConflictResponse`, etc.) from `_shared/validation.ts`.
-   **Error Handling:** Refactor `risks` Edge Function to use standardized error response helpers (`createNotFoundResponse`, `createForbiddenResponse`, `createUnauthorizedResponse`, etc.) from `_shared/validation.ts`.
-   **Error Handling:** Refactor `issues` Edge Function to use standardized error response helpers (`createNotFoundResponse`, `createForbiddenResponse`, `createUnauthorizedResponse`, `createConflictResponse`, `createBadRequestResponse`, etc.) from `_shared/validation.ts`.
-   **Error Handling:** Refactor `sections` Edge Function to use standardized error response helpers from `_shared/validation.ts`.
-   **Error Handling:** Refactor `tasks` Edge Function to use standardized error response helpers from `_shared/validation.ts`.
-   **Error Handling:** Refactor `task-comments` Edge Function to use standardized error response helpers from `_shared/validation.ts`.
-   **Error Handling:** Refactor `task-files` Edge Function to use standardized error response helpers from `_shared/validation.ts`.
-   **Error Handling:** Refactor `custom-field-definitions` Edge Function to use standardized error response helpers from `_shared/validation.ts`.
-   **Error Handling:** Refactor `instantiate-project-template` Edge Function to use standardized error response helpers from `_shared/validation.ts`.
-   **Error Handling:** Refactor `generate-recurring-tasks` Edge Function to use standardized error response helpers from `_shared/validation.ts`.
