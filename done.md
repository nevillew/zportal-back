## 2025-04-13

-   **RLS:** Define and apply RLS policies for `meetings` table (SELECT, INSERT, UPDATE, DELETE) using helper functions and respecting status lock logic. (Migration: `20250413120000_add_rls_meetings.sql`)
-   **RLS:** Define and apply RLS policies for training tables (`courses`, `lessons`, `course_assignments`, `lesson_completions`) covering user access, staff management, and assignment/completion logic. (Migration: `20250413130000_add_rls_training.sql`)
