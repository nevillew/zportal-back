# Backend Implementation Review & Next Steps (vs. Spec v3.3)

**Date:** 2025-04-12

## 1. Overview of Assessment

This document summarizes the current state of the backend implementation based on a review of the following Edge Functions against the Backend Specification v3.3 (`plan.md`):

*   `supabase/functions/tasks/index.ts`
*   `supabase/functions/projects/index.ts`
*   `supabase/functions/sections/index.ts`
*   `supabase/functions/milestones/index.ts`

The review focused on comparing the implemented API endpoints and logic within these functions to the requirements outlined in the specification.

## 2. General Implementation Status

The reviewed Edge Functions generally provide the **foundational CRUD (Create, Read, Update, Delete) operations** for their respective core entities (Tasks, Projects, Sections, Milestones).

Key strengths observed:

*   Basic API endpoints (GET list/single, POST, PUT, DELETE) are mostly implemented.
*   Permission checks (using `has_permission` RPC or staff status) are consistently included for modification endpoints (POST, PUT, DELETE).
*   Read operations appear to rely correctly on underlying RLS policies.
*   Basic handling of custom fields (reading values, upserting on create/update) is present in `tasks` and `projects`.
*   Standard structure (Deno, Supabase client, CORS, basic routing, logging) is used.

However, there's a consistent pattern of **missing implementation for more complex business logic, workflows, and handling of related data** specified in `plan.md`.

## 3. Key Missing Features / Incomplete Logic (Based on Reviewed Functions)

*   **Project Template Instantiation:** Logic to automatically create sections and tasks based on a selected template (`project_template_version_id`) is missing (marked TODO in `projects/index.ts`).
*   **Task Recurrence:** Handling of recurring task definitions (`is_recurring_definition`, `recurrence_rule`) and the scheduled job (`pg_cron`) to create instances is missing (`tasks/index.ts`).
*   **Task Sub-tasks:** Logic to manage hierarchy, enforce constraints, or factor into parent completion is missing (`tasks/index.ts`).
*   **Task Dependencies:** Enforcement logic (blocking status changes) is missing (`tasks/index.ts`).
*   **Task Files & Comments:** Functionality related to `task_files` (attachments) and `task_comments` (creation, reading, threading, internal flag) is missing (`tasks/index.ts`).
*   **Milestone Sign-off/Approval Workflow:** Logic to initiate/manage approvals (potentially using `approvals` table) based on `sign_off_required` flag is missing (`milestones/index.ts`).
*   **Section Progress Calculation:** Automatic calculation of `sections.percent_complete` based on task status is missing; currently allows manual update (`sections/index.ts`).
*   **Conditional Tasks:** Evaluation logic for the `tasks.condition` field is missing (`tasks/index.ts`).
*   **Self-service Tasks:** Check for `is_self_service` flag allowing client updates is missing (`tasks/index.ts`).
*   **Notifications:** Logic for triggering notifications (Email/Slack) on events like status changes, assignments, approvals is generally missing from these functions.
*   **Standardized Error Handling:** The specific `422` validation error response format (Section 7.15 in `plan.md`) is not implemented.
*   **Input Validation:** Enum validation (e.g., status, type fields) is often marked as TODO.
*   **Nested Resource Routing:** Anticipated but not implemented in `projects/index.ts` for milestones, risks, issues.
*   **Real-time:** Setup for Supabase Realtime subscriptions is not present in these functions.

## 4. Noted Discrepancies

*   **Field Names:** Some differences exist between `plan.md` and the code (e.g., `tasks` function uses `estimated_hours`, `priority`, `actual_hours` while spec mentions `estimated_effort_hours`).

## 5. Recommended Next Steps (Prioritized)

Based on the assessment, the following areas should be prioritized to align the implementation with the specification and enable core workflows:

1.  **Implement Project Template Instantiation:** Develop the logic within the `POST /projects` endpoint (or a dedicated RPC/function) to create sections and tasks based on the selected `project_template_version_id`, including placeholder resolution as defined in `plan.md` (Section 3.12). This is fundamental to the onboarding workflow.
2.  **Implement Task Comments & Files:** Add endpoints and logic to handle `task_comments` (CRUD, threading, internal flag) and `task_files` (upload via Storage, linking, listing, deletion). This is crucial for collaboration.
3.  **Implement Milestone Sign-off Workflow:** Develop the logic triggered when a milestone status changes, checking `sign_off_required` and potentially interacting with an `approvals` table or updating status directly based on permissions (`milestone:approve`).
4.  **Implement Task Recurrence:** Create the scheduled `pg_cron` job and associated Edge Function/RPC to generate recurring task instances based on `recurrence_rule` and `next_occurrence_date`.
5.  **Implement Automatic Section Progress (`percent_complete`):** Create the database trigger or function to automatically calculate and update `sections.percent_complete` based on changes in `tasks.status`. Remove the ability to manually set this via the `PUT /sections` endpoint.
6.  **Standardize Error Handling:** Refactor existing error responses in all functions to conform to the specified `422` validation error format (Section 7.15). Implement input validation (e.g., enums).
7.  **Address Discrepancies:** Review field name differences and decide whether to update the code or the specification for consistency.
8.  **Continue Feature Implementation:** Proceed with other missing features like sub-tasks, dependencies, conditional tasks, notifications, Realtime setup, etc.
9.  **Review Remaining Functions:** Assess other existing functions (`risks`, `issues`, `companies`, `custom-field-definitions`, etc.) against `plan.md`.
10. **Implement Testing:** Begin writing unit and integration tests for the implemented backend logic.
