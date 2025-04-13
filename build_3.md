# Backend Implementation Plan - Phase 3 (Final Review & Refinements)

This document lists the remaining TODO items and areas for refinement identified after the Phase 2 implementation (`build_2.md`).

## Edge Function Refinements

1.  **`custom-field-definitions/index.ts`**
    -   **Refinement:** Implement more robust validation checks beyond basic required/enum checks (e.g., specific JSON structures for `validation_rules`, detailed `options` format validation). (Original TODO comment around line 147).
2.  **`documents/index.ts`**
    -   **Refinement:** Although basic enum validation was added, the original TODO comments remain (lines 181, 220). Consider removing comments or adding more specific validation if needed (e.g., checking FKs).
3.  **`generate-recurring-tasks/index.ts`**
    -   **Refinement:** Implement more robust RRULE parsing and date calculation, handling potential edge cases beyond the basic `rrule-deno` implementation. (Original TODO comment around line 91).
4.  **`task-comments/index.ts`**
    -   **Feature:** Handle specific DB errors related to deleting parent comments with replies (e.g., decide on cascade behavior or prevent deletion). (Original TODO comment around line 283).

## Database Migration Refinements

5.  **`clone_project` Function (`20250413190000`)**
    -   **Refinement:** Implement mapping for `parent_comment_id` when cloning `document_comments` to maintain thread structure.
6.  **`mention_trigger` Function (`20250415230100`)**
    -   **Refinement:** Update the `notification_link` format to match the final frontend routing structure. (Original TODO comment around line 49).
7.  **`gamification_trigger` (`20250416050100`)**
    -   **Feature:** Implement trigger/logic for awarding badges based on project completion criteria. (Original TODO comment around line 54).

## Process & Definition Items (From `build_2.md` / `plan.md`)

These items require definition, planning, or external setup rather than direct code changes in the provided files.

8.  **Skipped Scheduled Functions:** Define the specific logic/rules for:
    -   Project Health calculation.
    -   Training Auto-Assignment rules.
    -   Time-based/aggregate Gamification Checks.
9.  **Sentry Integration:** Set up Sentry project, obtain DSN, store as Supabase secret, and integrate SDK into Edge Functions.
10. **Template Seeding:** Define the content for default project templates (sections, tasks, etc.) and create a seed script or migration.
11. **Permission Key Consistency:** Review all uses of permission keys in RLS policies and Edge Functions against a central definition (`permissions.ts` concept) to ensure consistency.
12. **RLS Testing:** Perform thorough manual and potentially automated testing of RLS policies.
13. **Reporting View Verification:** Review the SQL definitions of all `view_*` tables against final reporting requirements.
14. **Seed Data Definition:** Define precise seed data needed beyond default roles (e.g., initial badges, sample custom fields).
