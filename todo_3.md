# Backend TODO List - Phase 3 Action Items (AI Implementable)

This list contains actionable code changes derived from `build_3.md` that can be implemented by the AI assistant.

1.  **`custom-field-definitions/index.ts` - Robust Validation:**
    -   Enhance validation in POST/PUT handlers.
    -   Add checks for `validation_rules` JSON structure (e.g., `required` is boolean, `minLength` is number).
    -   Add detailed validation for `options` array elements (ensure `value` and `label` are non-empty strings).

2.  **`documents/index.ts` - Cleanup TODOs:**
    -   Remove the `// TODO: Validate enum` and `// TODO: Add validation for fields like type, status enums` comments, as basic validation was added.

3.  **`task-comments/index.ts` - Parent Comment Deletion:**
    -   Modify the DELETE `/comments/{commentId}` handler.
    -   Before deleting, query `task_comments` to check if any other comment has `parent_comment_id` equal to the `commentId` being deleted.
    -   If replies exist, return a 409 Conflict error instead of deleting.

4.  **`clone_project` Function (`20250413190000`) - Comment Mapping:**
    -   Modify the `clone_project` SQL function.
    -   After cloning `document_comments`, add an `UPDATE` statement.
    -   Use the `page_id_map` (or a newly created `comment_id_map`) to correctly set the `parent_comment_id` on the newly created comments, mapping old parent IDs to new parent IDs.

5.  **`mention_trigger` Function (`20250415230100`) - Link Format:**
    -   Modify the `process_mentions_and_notify` SQL function.
    -   Update the assignment of the `notification_link` variable to match the desired final frontend routing structure (e.g., `/app/projects/...` or similar).

6.  **`gamification_trigger` (`20250416050100`) - Project Completion:**
    -   Modify the `20250416050100_add_gamification_trigger.sql` migration file.
    -   Create a new trigger function `award_badges_on_project_completion`.
    -   Inside the function, check if `NEW.status = 'Completed'` and `OLD.status <> 'Completed'`.
    -   Query `badges` where `criteria->>'type' = 'project_completion'` and potentially match `criteria->>'project_id'` or other criteria.
    -   Insert into `user_badges` for the relevant user (e.g., `project_owner_id`) `ON CONFLICT DO NOTHING`.
    -   Add notification logic similar to other badge awards.
    -   Apply this new trigger function to the `projects` table (`AFTER UPDATE OF status`).

7.  **`generate-recurring-tasks/index.ts` - RRULE Refinement (Lower Priority):**
    -   Review the RRULE parsing logic around line 110.
    -   Add more specific error handling within the `catch (parseError)` block if possible based on `rrule-deno` error types.
    -   Consider adding checks for edge cases if specific scenarios are known (e.g., rules spanning year boundaries, complex BYSETPOS rules).
