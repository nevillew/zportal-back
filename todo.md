# Backend TODO List (Generated 2025-04-16)

This list aggregates TODO comments and unimplemented logic identified in the backend codebase.

## Edge Functions

**`supabase/functions/accept-invite/index.ts`**

-   **Line 91:** `// TODO(transaction): Convert these steps into a single RPC function for atomicity.`
    -   The creation of `company_users` and updating `invitations` status should be wrapped in a database transaction (preferably via an RPC function) to prevent partial updates if one step fails.

**`supabase/functions/calendly-webhook-handler/index.ts`**

-   **Line 31:** `// TODO: Implement actual Vault fetching logic here using RPC or other secure method`
    -   The `getSecret` helper currently uses environment variables as a placeholder. Implement secure fetching from Supabase Vault.
-   **Line 59:** `// --- TODO: Implement actual HMAC-SHA256 verification ---`
    -   The `verifySignature` function currently has placeholder logic. Implement the actual HMAC-SHA256 signature verification using the `CALENDLY_WEBHOOK_SECRET`.
-   **Line 120:** `// TODO: Add validation/parsing for these IDs if needed`
    -   Add validation to ensure `projectIdAnswer` and `companyIdAnswer` extracted from Calendly custom questions are valid UUIDs or match expected formats.
-   **Line 200:** `// await logFailure(supabaseAdminClient, 'calendly-webhook-handler', payload, error);`
    -   Uncomment and ensure the `logFailure` helper is available and correctly logs errors to `background_job_failures`.

**`supabase/functions/companies/index.ts`**

-   **Line 218:** `// TODO(email): Send invitation email with the token/link (using Resend or similar).`
    -   After successfully creating an invitation record, call the `send-notification` function (or directly use Resend API) to email the invitation link to the user.

**`supabase/functions/custom-field-definitions/index.ts`**

-   **Line 148:** `// TODO(validation): Add more robust validation: check entity_type/field_type against enums, validate options format for 'select' type, validate validation_rules JSON structure.`
    -   Implement detailed validation for the request body when creating/updating custom field definitions.

**`supabase/functions/documents/index.ts`**

-   **Line 181:** `// TODO: Validate enum` (for `type` field in POST)
    -   Add validation to ensure the provided document `type` matches the allowed values defined in the database schema.
-   **Line 220:** `// TODO: Add validation for fields like type, status enums` (in PUT)
    -   Add validation for `type` and `status` fields if they are present in the update payload.

**`supabase/functions/feedback/index.ts`**

-   **Line 70:** `// TODO: Add validation for recipient details (e.g., valid email format)` (within `send-notification` function, but relevant if feedback triggers notifications)
    -   Although this is in `send-notification`, if feedback submissions trigger notifications, ensure recipient validation is handled there.
-   **Line 118:** `// TODO: Log detailed failure to background_job_failures or similar` (within `send-notification` email sending block)
    -   Implement logging of email sending failures.
-   **Line 155:** `// TODO: Log detailed failure` (within `send-notification` Slack sending block)
    -   Implement logging of Slack sending failures.

**`supabase/functions/generate-certificate/index.ts`**

-   **Line 31:** `// TODO: Implement actual Vault fetching logic here using RPC or other secure method`
    -   The `getSecret` helper uses environment variables. Implement secure fetching from Supabase Vault.

**`supabase/functions/generate-recurring-tasks/index.ts`**

-   **Line 91:** `// TODO(rrule): Implement robust RRULE parsing and date calculation, potentially handling edge cases.`
    -   The current RRULE parsing is basic. Enhance it to handle more complex rules and potential edge cases robustly.
-   **Line 180:** `// TODO(custom_fields): Add handling for custom_field_values if defaults should be copied from definition.`
    -   Implement logic to copy default custom field values from the recurring task definition to the new task instance.

**`supabase/functions/instantiate-project-template/index.ts`**

-   **Lines 100, 110, 122, 136:** `// TODO(transaction): Rollback needed here if transaction is implemented.` (These comments are within the old logic block, now superseded by the RPC call, but indicate the original intent).
    -   The logic has been moved to `instantiate_template_rpc`, which handles transactions implicitly. These specific TODOs are resolved by the refactor.

**`supabase/functions/messaging/index.ts`**

-   **Line 100:** `// TODO: Validate participant IDs exist?`
    -   When creating a conversation, validate that the provided `participant_ids` correspond to actual users.
-   **Line 101:** `// TODO: Validate project/task IDs exist if provided?`
    -   Validate optional `project_id` or `task_id` when creating a conversation.
-   **Line 105:** `// TODO(transaction): Wrap in RPC for atomicity`
    -   Wrap the creation of the `conversations` record and the insertion of `conversation_participants` records into a single atomic transaction using a PostgreSQL RPC function.
-   **Line 156:** `// TODO(realtime): Consider sending a Realtime event for the new message`
    -   Implement sending a Supabase Realtime event after a message is successfully inserted so clients can update live.
-   **Line 161:** `// TODO: Implement PUT/DELETE for messages if needed (edit/delete own message)`
    -   Add PUT and DELETE handlers for messages if required by the application features.

**`supabase/functions/milestones/index.ts`**

-   **Line 31:** `// TODO: Implement actual Vault fetching logic here using RPC or other secure method`
    -   The `getSecret` helper uses environment variables. Implement secure fetching from Supabase Vault.
-   **Line 308:** `// TODO(notification): Trigger notification/approval process if status was being changed *to* something needing approval later (e.g., 'Pending Approval').`
    -   If a workflow requires explicit approval steps before the 'Approved' status, implement the logic to trigger that process here when a milestone requiring sign-off is marked 'Completed'.

**`supabase/functions/pages/index.ts`**

-   No specific TODOs found, but relies on DB functions `can_access_document` and `can_manage_document`.

**`supabase/functions/projects/index.ts`**

-   **Line 208:** `// TODO(validation): Add validation for status, stage enums against allowed values.` (in POST)
    -   Validate `status` and `stage` fields against the allowed values defined in the database schema.
-   **Line 260:** `// TODO(template): If project_template_version_id is provided, call the instantiate-project-template function instead/after creating the basic project record.`
    -   The current POST logic only creates a basic project. If a template ID is provided, it should likely call the `instantiate_template_rpc` instead of performing a simple insert.
-   **Line 288:** `// TODO(validation): Add validation for status, stage enums if present in updateData against allowed values.` (in PUT)
    -   Validate `status` and `stage` fields if present in the update payload.
-   **Line 400:** `// TODO(db-error): Handle other specific DB errors with appropriate 4xx status codes.` (in PUT)
    -   Add more specific error handling for database errors during project updates.
-   **Line 458:** `// TODO(db-error): Handle specific DB errors (e.g., restricted delete due to FK dependencies from sections, milestones, etc.) with appropriate 4xx status codes (e.g., 409 Conflict).` (in DELETE)
    -   Add specific error handling for foreign key constraint violations when deleting projects.
-   **Line 466:** `// TODO(routing): Route to nested resource handlers (milestones, risks, issues) based on pathParts[4] in the default case.`
    -   Implement routing logic to handle requests for nested resources under a project (e.g., `/projects/{id}/milestones`).

**`supabase/functions/risks/index.ts`**

-   No specific TODOs found.

**`supabase/functions/sections/index.ts`**

-   **Line 140:** `// TODO(validation): Validate type enum against allowed values.` (in POST)
    -   Validate the `type` field against the allowed values in the schema.
-   **Line 171:** `// TODO(db-error): Handle specific DB errors (e.g., FK violation on project_id) with appropriate 4xx status codes.` (in POST)
    -   Add specific error handling for database errors during section creation.
-   **Line 218:** `// TODO(validation): Validate type enum if present in updateData against allowed values.` (in PUT)
    -   Validate the `type` field if present in the update payload.
-   **Line 221:** `// TODO(cleanup): percent_complete should be removed from allowedUpdates once the trigger (Step 1.5 in build.md) is confirmed working reliably.`
    -   Remove `percent_complete` from the `allowedUpdates` object once the database trigger is verified.
-   **Line 251:** `// TODO(db-error): Handle other specific DB errors with appropriate 4xx status codes.` (in PUT)
    -   Add specific error handling for database errors during section updates.
-   **Line 304:** `// TODO(db-error): Handle specific DB errors (e.g., restricted delete due to FK dependencies from tasks) with appropriate 4xx status codes (e.g., 409 Conflict).` (in DELETE)
    -   Add specific error handling for foreign key constraint violations when deleting sections.

**`supabase/functions/send-notification/index.ts`**

-   **Line 31:** `// TODO: Implement actual Vault fetching logic here using RPC or other secure method`
    -   The `getSecret` helper uses environment variables. Implement secure fetching from Supabase Vault.
-   **Line 70:** `// TODO: Add validation for recipient details (e.g., valid email format)`
    -   Add validation for email format within the recipient objects.
-   **Line 118:** `// TODO: Log detailed failure to background_job_failures or similar` (Email block)
    -   Implement logging of email sending failures to the `background_job_failures` table.
-   **Line 155:** `// TODO: Log detailed failure` (Slack block)
    -   Implement logging of Slack sending failures to the `background_job_failures` table.

**`supabase/functions/sso-jit-provisioning/index.ts`**

-   **Line 206:** `// TODO: Consider logging to background_job_failures table`
    -   Implement logging of JIT processing errors to the `background_job_failures` table.

**`supabase/functions/task-comments/index.ts`**

-   **Line 181:** `// TODO(db-error): Handle specific DB errors (e.g., FK violation on task_id or parent_comment_id) with appropriate 4xx status codes.` (in POST)
    -   Add specific error handling for database errors during comment creation.
-   **Line 240:** `// TODO(db-error): Handle specific DB errors with appropriate 4xx status codes.` (in PUT)
    -   Add specific error handling for database errors during comment updates.
-   **Line 261:** `// TODO(permissions): Add check for admin/staff override permission if needed, allowing deletion of others' comments.` (in DELETE)
    -   Implement logic to allow staff/admins to delete comments made by other users.
-   **Line 283:** `// TODO(db-error): Handle specific DB errors (e.g., if deleting a parent comment with replies needs special handling) with appropriate 4xx status codes.` (in DELETE)
    -   Add specific error handling for database errors during comment deletion, especially regarding parent comments.

**`supabase/functions/task-files/index.ts`**

-   No specific TODOs found.

**`supabase/functions/tasks/index.ts`**

-   **Line 261:** `// TODO: Add validation for status, priority enums` (in POST)
    -   Validation was added later, this comment can be removed.
-   **Line 318:** `// TODO(db-error): Check for specific DB errors (e.g., FK violation, unique constraint) and return appropriate 4xx status codes.` (in POST)
    -   Add specific error handling for database errors during task creation.
-   **Line 430:** `// TODO(db-error): Handle other specific DB errors (e.g., FK violation, unique constraint) with appropriate 4xx status codes.` (in PUT)
    -   Add specific error handling for database errors during task updates.
-   **Line 540:** `// TODO(db-error): Handle specific DB errors (e.g., restricted delete due to FK dependency) with appropriate 4xx status codes (e.g., 409 Conflict).` (in DELETE)
    -   Add specific error handling for foreign key constraint violations when deleting tasks.

## Database Migrations

**`supabase/migrations/20250412125717_add_updated_at_triggers.sql`**

-   **Lines 43, 47, 51, 55, 59:** Comments indicate triggers for `pages`, `document_comments`, `meetings`, `courses`, `lessons` might need to be added/uncommented once tables are confirmed. (Tables `pages`, `meetings`, `courses`, `lessons` exist now).
-   **Line 63:** Note mentions `task_files`, `course_assignments`, `lesson_completions`, `user_badges` might need triggers added later. (Tables exist now).

**`supabase/migrations/20250412204800_create_custom_fields_tables.sql`**

-   **Line 100:** `// NOTE: This simplified RLS for values is likely too permissive... A proper implementation needs a function like can_access_entity_for_custom_field...`
    -   The RLS policy for `custom_field_values` needs refinement to check permissions on the specific parent entity (`entity_id`) based on its type. The helper function `can_manage_entity_for_custom_field` was added later in `20250413150000_add_rls_custom_field_values.sql`, but the policy here wasn't updated to use it.

**`supabase/migrations/20250413190000_add_clone_project_function.sql`**

-   **Line 168:** `// 6. Clone Project-Scoped Documents (Optional - depends on requirements)`
    -   Implement cloning of project-scoped documents and their related pages/comments if required.

**`supabase/migrations/20250415230100_add_mention_trigger.sql`**

-   **Line 49:** `// TODO: Refine message and link structure based on frontend routing`
    -   Update the notification message and link format to match the actual frontend application structure.
-   **Line 54:** `// Attempt Slack notification if possible (requires slack_user_id in user_profiles or lookup)`
    -   Add logic to check for `slack_user_id` and include Slack recipient in the notification payload if available.
-   **Line 76:** `// Optionally log to background_job_failures here` (Notification failure block)
    -   Implement logging to `background_job_failures` if the notification function call fails.
-   **Line 96:** `// TODO: Apply the same trigger to 'document_comments' table when it's implemented.`
    -   Create and apply a similar mention trigger for the `document_comments` table.

**`supabase/migrations/20250416050100_add_gamification_trigger.sql`**

-   **Line 30:** `// TODO(notification): Optionally trigger a notification about the awarded badge here?`
    -   Implement logic to call the `send-notification` function when a badge is awarded.
-   **Line 35:** `// TODO: Add logic here or in a separate trigger/function to check for COURSE completion badges`
    -   Implement the logic to check for course completion within this trigger (or a new one) and award relevant badges.
-   **Line 54:** `// TODO: Apply similar triggers to other relevant tables (e.g., tasks, projects)`
    -   Create and apply triggers to other tables (like `tasks` for task completion badges) based on defined badge criteria.

**`supabase/migrations/20250416060100_add_issue_notification_trigger.sql`**

-   **Line 91:** `// Optionally log to background_job_failures here`
    -   Implement logging to `background_job_failures` if the notification function call fails.

**`supabase/migrations/20250416070100_add_risk_notification_trigger.sql`**

-   **Line 91:** `// Optionally log to background_job_failures here`
    -   Implement logging to `background_job_failures` if the notification function call fails.

**`supabase/migrations/20250416090100_add_data_retention_function.sql`**

-   **Line 41:** `// TODO: Expand log deletion logic to cover related entities (projects, tasks, users etc.) based on company_id linkage.`
    -   Implement more comprehensive logic to delete audit logs related to all entities within a company undergoing retention.

## Build/Plan Files

**`build.md`**

-   **Section 3:** RLS testing and verification noted as separate activities.
-   **Section 6:** Skipped scheduled functions (Project Health, Training Auto-Assignment, Gamification Check) require logic definition.
-   **Section 7:** Sentry integration and Template Seeding skipped due to external dependencies/missing content.

**`plan.md`**

-   Contains various notes indicating areas for future schema definition (e.g., `approvals` table, `training_assignment_rules`, `document_templates`, `conversations`/`messages`).
-   Mentions specific permission keys (e.g., `admin:manage_roles`) - ensure these are consistently defined and used.
-   Section 11 (Reporting Views) assumes specific column names and calculation logic which might need verification against final requirements.
-   Section 12.8 (Initial System Seeding) notes that precise seed data needs definition.
