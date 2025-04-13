# Backend Implementation Plan - Phase 2 (Addressing TODOs)

This document outlines the implementation plan for addressing the TODO items identified in `todo.md` (Generated 2025-04-16).

## Edge Function Enhancements

### 1. `accept-invite/index.ts`
    - [x] **Transaction Handling:** Create a new PostgreSQL RPC function `accept_invitation(p_token text)` that performs the `company_users` insert and `invitations` update within a single transaction block. Update the `accept-invite` Edge Function to call this new RPC function, passing the token. Handle potential errors returned by the RPC.

### 2. `calendly-webhook-handler/index.ts`
    - [x] **Vault Fetching:** Create a PostgreSQL RPC function `get_decrypted_secret(p_secret_name text)` that securely fetches a secret from `supabase_vault.secrets`. Grant necessary permissions (`USAGE` on schema `supabase_vault` to `postgres` role). Replace `Deno.env.get()` calls in the `getSecret` helper within the Edge Function with calls to this new RPC function.
    - [x] **Signature Verification:** Implement the HMAC-SHA256 signature verification logic within the `verifySignature` helper function using Deno's `crypto.subtle` API (`importKey`, `sign`). Compare the calculated signature hex string with the one from the header using a timing-safe comparison method.
    - [x] **ID Validation:** Add validation logic after extracting `projectIdAnswer` and `companyIdAnswer`. Use a regex like `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$` to check if they are valid UUIDs. Return a 400 Bad Request response if validation fails.
    - [x] **Error Logging:** Ensure the `logFailure` helper function (similar to the one in `generate-certificate`) is defined or imported. Uncomment the `await logFailure(...)` call within the final `catch` block.

### 3. `companies/index.ts`
    - [x] **Invitation Email:** After the successful insertion of the `invitations` record (around line 217), construct a payload object for the `send-notification` function. Include recipient email (`inviteData.email`), subject (e.g., "You're invited to join..."), message body containing the invitation link (`https://<your-app-url>/accept-invitation?token=${token}`), and type 'email'. Call the `/functions/v1/send-notification` endpoint using `fetch` with the `INTERNAL_FUNCTION_SECRET` bearer token. Handle potential errors from the fetch call gracefully (log warning).

### 4. `custom-field-definitions/index.ts`
    - [x] **Validation:** Enhance the validation logic within the POST and PUT handlers (around line 147).
        - Check `entity_type` against `['company', 'project', 'task', 'user', 'document']`.
        - Check `field_type` against `['text', 'textarea', 'number', 'date', 'boolean', 'select', 'multi_select', 'url']`.
        - If `field_type` is 'select' or 'multi_select', validate that `options` is a non-empty array of objects, each containing string `value` and string `label` keys.
        - If `validation_rules` is provided, parse the JSON and validate its structure (e.g., `required` is boolean, `minLength`/`maxLength`/`minValue`/`maxValue` are numbers, `pattern` is a string). Return 422 Validation Error if any checks fail.

### 5. `documents/index.ts`
    - [x] **Enum Validation:** In the POST handler (around line 180) and PUT handler (around line 219), add checks to validate the `type` field against `['solution', 'support', 'guide', 'project_plan', 'SOW', 'kb_article']` and the `status` field against `['Draft', 'In Review', 'Approved', 'Rejected', 'Archived']`. Use helper arrays and return 422 Validation Error if invalid.

### 6. `feedback/index.ts`
    - [x] **Recipient Validation:** (Action needed in `send-notification/index.ts`) Modify the loop processing recipients. Before the `fetch` call for email, validate `recipient.email` using a standard email regex pattern. If invalid, log a warning, increment `results.email.failed`, and `continue` to the next recipient.
    - [x] **Log Email Failure:** (Action needed in `send-notification/index.ts`) Add a `logFailure` helper function (similar to `generate-certificate`). In the `catch` block for the Resend API `fetch` call (around line 118), call `await logFailure(...)` with relevant details (job name 'send-notification-email', payload, error).
    - [x] **Log Slack Failure:** (Action needed in `send-notification/index.ts`) In the `catch` block for the Slack API `fetch` call (around line 155), call `await logFailure(...)` with relevant details (job name 'send-notification-slack', payload, error).

### 7. `generate-certificate/index.ts`
    - [x] **Vault Fetching:** Implement the same RPC-based `getSecret` logic as planned for `calendly-webhook-handler`.

### 8. `generate-recurring-tasks/index.ts`
    - [x] **RRULE Parsing:** Enhance the `try...catch` block around `RRule.fromString` (around line 110). Add more specific logging for different parsing errors if the library provides them. Consider adding a check if `rule.after()` returns null unexpectedly even if the rule seems valid.
    - [x] **Custom Fields:** Before the bulk insert of `tasksToInsert` (around line 178), iterate through `tasksToInsert`. For each task, query `custom_field_values` where `entity_id` matches the corresponding `definition.id`. If values are found, add corresponding entries to a separate `customFieldValuesToInsert` array, mapping the `definition_id`, new task `id` (will require inserting tasks one by one or fetching IDs after bulk insert), and the `value`. Perform a bulk insert for `customFieldValuesToInsert` after inserting tasks. *Alternative:* Modify the task insert loop to insert one task at a time, get its ID, then query/insert custom fields before processing the next task (simpler but less performant).

### 9. `messaging/index.ts`
    - [ ] **Participant/Context Validation:** In the POST `/conversations` handler, before creating the conversation:
        - Query `user_profiles` WHERE `user_id` IN `participant_ids`. Check if the count matches and all are active. Return 400 if validation fails.
        - If `project_id` is provided, query `projects` WHERE `id = project_id`. Check if found and user has access via `can_access_project`. Return 400/404 if validation fails.
        - Query `user_profiles` WHERE `user_id` IN `participant_ids`. Check if the count matches and all are active. Return 400 if validation fails.
        - If `project_id` is provided, query `projects` WHERE `id = project_id`. Check if found and user has access via `can_access_project`. Return 400/404 if validation fails.
        - If `task_id` is provided, query `tasks` WHERE `id = task_id`. Check if found and user has access via task RLS. Return 400/404 if validation fails.
    - [x] **Transaction Handling:** Create a PostgreSQL RPC function `create_conversation(p_topic text, p_project_id uuid, p_task_id uuid, p_participant_ids uuid[], p_creator_id uuid)` that performs the `INSERT INTO conversations` and `INSERT INTO conversation_participants` within a single transaction. Update the POST `/conversations` handler in the Edge Function to call this RPC.
    - [ ] **Realtime Event:** After successfully inserting a message in POST `/conversations/{conversationId}/messages` (around line 155), use `supabaseClient.channel(...).send(...)` to broadcast the new message event on a channel related to the `conversationId`. (Requires frontend subscription setup).
    - [ ] **Message Edit/Delete:** Implement `PUT /messages/{messageId}` and `DELETE /messages/{messageId}` handlers. Fetch the message, verify ownership (`sender_user_id === user.id`) or staff status. Perform the update (only `content`) or delete operation.

### 10. `milestones/index.ts`
    - [x] **Vault Fetching:** Implement the same RPC-based `getSecret` logic as planned for `calendly-webhook-handler`.
    - [ ] **Approval Workflow Trigger:** (Requires definition of formal approval process/schema) If a multi-step approval flow using the `approvals` table is implemented, modify the PUT handler. When `status` is updated to a state requiring approval (e.g., 'Review'), check `sign_off_required`. If true, create an `approvals` record, link it to the milestone, and potentially trigger the first step notification.

### 11. `projects/index.ts`
    - [x] **Enum Validation:** Add validation checks for `status` and `stage` fields in POST and PUT handlers against allowed enum values defined in the schema. Return 422 if invalid.
    - [x] **Template Instantiation Call:** Modify the POST handler. Add an `if (newProjectData.project_template_version_id)` check. If true, call `supabaseClient.rpc('instantiate_template_rpc', {...})` instead of the direct `insert`. Ensure all necessary parameters (`template_version_id`, `target_company_id`, `new_project_name`, `placeholder_values`, `project_owner_id`, `requesting_user_id`) are passed correctly. Handle the response (new project ID).
    - [x] **DB Error Handling (PUT/DELETE):** Enhance the `catch` block or add specific checks after failed operations. Check `error.code` for `23503` (FK violation) and return 409 Conflict with a specific message. Check for `PGRST204` (Not Found) after updates/deletes.
    - [x] **Nested Routing:** In the `default` case of the main `switch` statement (around line 465), add checks for `pathParts[4]` (e.g., `if (projectId && pathParts[4] === 'milestones') { /* handle milestones */ }`). Implement basic proxying or logic for nested resources as needed for V1.

### 12. `sections/index.ts`
    - [x] **Enum Validation:** Add validation checks for the `type` field in POST and PUT handlers against allowed enum values. Return 422 if invalid.
    - [x] **DB Error Handling (POST/PUT/DELETE):** Enhance `catch` blocks or add specific checks for error codes like `23503` (FK violation), `PGRST204` (Not Found). Return appropriate 4xx responses.
    - [x] **Cleanup `percent_complete`:** After verifying the `calculate_section_progress` trigger works correctly, remove `percent_complete` from the `allowedUpdates` object in the PUT handler (around line 221).

### 13. `send-notification/index.ts`
    - [x] **Vault Fetching:** Implement the same RPC-based `getSecret` logic as planned for `calendly-webhook-handler`.
    - [x] **Recipient Validation:** Add email format validation (using regex) for `recipient.email` within the loop before the `fetch` call. Log a warning or add to `results.failed` if invalid.
    - [x] **Log Email/Slack Failure:** Add a `logFailure` helper function. Call `await logFailure(...)` within the `catch` blocks for Resend and Slack API calls.

### 14. `sso-jit-provisioning/index.ts`
    - [x] **Error Logging:** Add a `logFailure` helper function. Call `await logFailure(...)` within the final `catch` block.

### 15. `task-comments/index.ts`
    - [x] **DB Error Handling (POST/PUT/DELETE):** Enhance `catch` blocks or add specific checks for error codes like `23503` (FK violation), `PGRST204` (Not Found). Return appropriate 4xx responses.
    - [x] **Admin Delete:** Modify the DELETE handler (around line 260). Fetch the user's profile (`is_staff`). Change the ownership check to `if (existingComment.user_id !== user.id && !isStaffUser)`.

### 16. `tasks/index.ts`
    - [x] **Remove TODO Comment:** Delete the comment `// TODO: Add validation for status, priority enums` around line 261 as validation was added later.
    - [x] **DB Error Handling (POST/PUT/DELETE):** Enhance `catch` blocks or add specific checks for error codes like `23503` (FK violation), `23505` (Unique violation), `PGRST204` (Not Found). Return appropriate 4xx responses.

## Database Migration Enhancements

### 17. `updated_at` Triggers (`20250412125717`)
    - [x] Create a new migration file. Add `CREATE TRIGGER handle_updated_at...` statements for tables: `pages`, `meetings`, `courses`, `lessons`, `task_files`, `course_assignments`, `lesson_completions`, `user_badges`. Ensure `extensions.moddatetime` is used.

### 18. `custom_field_values` RLS (`20250412204800`)
    - [x] Create a new migration file. `DROP POLICY "Allow access if definition is readable" ON public.custom_field_values;`. Recreate the policy using the `can_manage_entity_for_custom_field` helper function (created in `20250413150000`) to check permissions on the specific `entity_id`. Ensure both SELECT and ALL policies are updated.

### 19. `clone_project` Documents (`20250413190000`)
    - [x] If cloning project-scoped documents is required: Modify the `clone_project` function. After cloning sections/tasks, add steps to:
        - `INSERT INTO documents ... SELECT ... WHERE project_id = source_project_id RETURNING id as new_doc_id, id as old_doc_id` (similar workaround as sections/tasks to build a `doc_id_map`).
        - `INSERT INTO pages ... SELECT ... WHERE document_id IN (SELECT old_doc_id FROM map) RETURNING id as new_page_id, id as old_page_id` (build `page_id_map`).
        - `INSERT INTO document_comments ... SELECT ... WHERE page_id IN (SELECT old_page_id FROM map)`. Update `parent_comment_id` using the map.

### 20. `mention_trigger` Enhancements (`20250415230100`)
    - [x] Modify the `process_mentions_and_notify` function:
        - Add `slack_user_id` to the `SELECT` from `user_profiles`.
        - In the payload construction, add `jsonb_build_object('slackUserId', mentioned_user_record.slack_user_id)` to the `recipients` array if `mentioned_user_record.slack_user_id` is not null. Adjust `type` to 'both' if both email and Slack are present.
        - Implement calls to `logFailure` (requires creating the helper or ensuring it's available) within the `EXCEPTION WHEN others` block for the `net.http_post` call.
        - Add `CREATE TRIGGER mention_trigger ON public.document_comments ...` statement (ensure `document_comments` table exists first).

### 21. `gamification_trigger` Enhancements (`20250416050100`)
    - [x] Modify the `award_badges_on_lesson_completion` function:
        - Inside the `IF FOUND THEN ... END IF;` block (after awarding), add logic to construct payload and call `send-notification` via `net.http_post` to notify the user.
        - Add logic after the loop: Query `lessons` count for the course (`NEW.lesson_id` -> `course_id`). Query `lesson_completions` count for that user/course/company. If counts match, query `badges` for `criteria->>'type' = 'course_completion'` and `criteria->>'course_id' = course_id`. Award matching badges via `INSERT ... ON CONFLICT DO NOTHING`.
    - [ ] Create new trigger functions (e.g., `award_badges_on_task_completion`) and apply them to relevant tables (`tasks` status update) to handle other criteria types.

### 22. Notification Trigger Logging (`20250416060100`, `20250416070100`)
    - [x] Modify functions `notify_issue_change` and `notify_risk_change`. Implement calls to `logFailure` within the `EXCEPTION WHEN others` block for the `net.http_post` call.

### 23. Data Retention Audit Logs (`20250416090100`)
    - [x] Modify the `apply_data_retention_policies` function. Expand the audit log deletion logic. Instead of just deleting logs where `table_name = 'companies'`, add logic to delete logs where `table_name = 'projects'` and `record_id` is in `(SELECT id::text FROM projects WHERE company_id = v_company.id)`, and similarly for tasks, users (via `company_users`), etc., based on the company context. This requires careful joining or subqueries.

## Documentation & Planning Items

-   [ ] **RLS Testing:** Perform thorough manual and potentially automated testing of RLS policies for various user roles and scenarios.
-   [ ] **Skipped Scheduled Functions:** Define the specific logic/rules for Project Health calculation, Training Auto-Assignment, and time-based/aggregate Gamification Checks before implementation can proceed.
-   [ ] **Sentry Integration:** Set up Sentry project, obtain DSN, store as Supabase secret, and integrate `@sentry/nextjs` (or equivalent Deno SDK) into Edge Functions.
-   [ ] **Template Seeding:** Define the content for default project templates (sections, tasks, etc.) and create a seed script or migration to populate `project_templates`, `project_template_versions`, `section_templates`, `task_templates`.
-   [ ] **Permission Key Consistency:** Review all uses of permission keys in RLS policies and Edge Functions against a central definition (e.g., `permissions.ts` concept mentioned in `plan.md`) to ensure consistency.
-   [ ] **Reporting View Verification:** Review the SQL definitions of all `view_*` tables against final reporting requirements to ensure correct calculations and included columns.
-   [ ] **Seed Data Definition:** Define precise seed data needed beyond default roles (e.g., initial badges, sample custom fields).
