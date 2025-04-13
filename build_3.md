# Backend Implementation Checklist - Phase 3

This checklist tracks the implementation of actionable items from `todo_3.md`.

- [ ] **1. `custom-field-definitions/index.ts` - Robust Validation:**
    - [ ] Enhance validation in POST/PUT handlers.
    - [ ] Validate `validation_rules` structure and basic types (e.g., `required` is boolean, `minLength` is number, `pattern` is string).
    - [ ] Validate `options` array for select/multi_select types (must be array of objects with non-empty string `value` and `label`).
    - [ ] Ensure backend does *not* validate regex pattern strings themselves.

- [ ] **2. `documents/index.ts` - Cleanup TODOs:**
    - [ ] Remove the `// TODO: Validate enum` and `// TODO: Add validation for fields like type, status enums` comments.

- [ ] **3. `task-comments/index.ts` - Parent Comment Deletion:**
    - [ ] Modify the DELETE `/comments/{commentId}` handler.
    - [ ] Before deleting, query `task_comments` to check if any other comment has `parent_comment_id` equal to the `commentId` being deleted (`SELECT 1 FROM task_comments WHERE parent_comment_id = {comment_id_to_delete} LIMIT 1`).
    - [ ] If replies exist (query returns a row), return a 409 Conflict error with an appropriate message.

- [ ] **4. `clone_project` Function (`20250413190000`) - Comment Mapping:**
    - [ ] Modify the `clone_project` SQL function.
    - [ ] Use a CTE with `RETURNING id as new_comment_id, <original_id_column> as old_comment_id` when inserting `document_comments` to build a reliable `comment_id_map` (old ID -> new ID). This might require inserting top-level comments first, then replies iteratively or using a recursive CTE.
    - [ ] After inserting all comments, run an `UPDATE` statement on `document_comments` (for the cloned comments) to set the `parent_comment_id` correctly using the `comment_id_map`.

- [ ] **5. `mention_trigger` Function (`20250415230100`) - Link Format:**
    - [ ] Modify the `process_mentions_and_notify` SQL function.
    - [ ] Update the assignment of the `notification_link` variable to use hash fragments:
        - [ ] Tasks: `'/app/projects/' || v_project_id::text || '/tasks?taskId=' || v_entity_id::text || '#comment-' || NEW.id::text`
        - [ ] Documents: `'/app/documents/' || v_entity_id::text || '/pages/' || NEW.page_id::text || '#comment-' || NEW.id::text`

- [ ] **6. `gamification_trigger` (`20250416050100`) - Project Completion:**
    - [ ] Modify the `20250416050100_add_gamification_trigger.sql` migration file.
    - [ ] Create a new trigger function `award_badges_on_project_completion`.
    - [ ] Inside the function, check if `NEW.status = 'Completed'` and `OLD.status <> 'Completed'`.
    - [ ] Query `badges` where `criteria->>'type' = 'project_completion'` (no specific project ID check in criteria needed for V1).
    - [ ] Get the `project_owner_id` from the `NEW` project record.
    - [ ] If `project_owner_id` is not null, insert into `user_badges` for the `project_owner_id` `ON CONFLICT DO NOTHING`.
    - [ ] Add notification logic for the `project_owner_id`.
    - [ ] Apply this new trigger function to the `projects` table (`AFTER UPDATE OF status`).

- [ ] **7. `generate-recurring-tasks/index.ts` - RRULE Refinement (Lower Priority):**
    - [ ] Review the RRULE parsing logic (around line 110).
    - [ ] Wrap parsing/calculation in `try...catch`.
    - [ ] On error, log the failure to `background_job_failures` (include definition ID and rule string) and **skip** processing that definition for the current run (do not halt the entire job).
    - [ ] Ensure consistent timezone handling (likely UTC).
