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
