# Project Progress Summary (zportal-back) - 2025-04-13

This document summarizes the development progress of the zportal backend, based on `plan.md` (v3.3), `build.md`, and the current state of the codebase (migrations, functions).

## 1. Project Goal

The project aims to build a comprehensive Enterprise SaaS Client Onboarding Platform using Supabase. Key features include project management (templates, milestones, tasks, risks, issues), documentation, meeting scheduling (Calendly), training modules, multi-tenancy, robust security (RLS), custom fields, audit logging, reporting, and various integrations (Resend, PDFMonkey, Slack, Sentry).

## 2. Core Architecture & Setup

*   **Platform:** Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime, pg_cron).
*   **Tenancy:** Multi-tenant model based on `companies`. Staff users (`is_staff=true`) have cross-tenant access. User association via `company_users`.
*   **Authentication:** Supabase Auth handles standard login. SSO (SAML/OIDC) is planned with JIT provisioning via an Edge Function (listed as TODO in `build.md`). Invitations are managed via the `invitations` table and email flow (partially implemented, needs refinement).
*   **Authorization (RLS):**
    *   RLS helper functions (`is_active_user`, `is_staff_user`, `is_member_of_company`, `has_permission`) are implemented via migration `20250412125115`.
    *   RLS policies have been applied to many core tables (`companies`, `projects`, `sections`, `tasks`, `documents`, `user_profiles`, `milestones`, `risks`, `issues`, `task_files`, `task_comments`) via migrations.
    *   **Status:** Core RLS structure is in place, but `build.md` highlights the need for thorough testing and potentially refining policies on existing/new tables.
*   **Error Handling:**
    *   `background_job_failures` table created (`20250412131604`). Logging from scheduled functions is a TODO.
    *   Sentry integration for Edge Functions is planned (`build.md`).
    *   Standardized API error responses (HTTP status, JSON body) are planned (`build.md`).

## 3. Database Schema Status

*   **Migrations:** A significant number of migrations exist in `supabase/migrations/`, indicating substantial progress in defining the database schema according to `plan.md`.
*   **Key Tables Implemented:** `companies`, `users` (Auth), `user_profiles`, `company_users`, `roles`, `invitations`, `sso_configurations`, `projects`, `milestones`, `risks`, `issues`, `sections`, `tasks`, `task_files`, `task_comments`, `documents`, `pages`, `document_comments`, `meetings`, `courses`, `lessons`, `course_assignments`, `lesson_completions`, `badges`, `user_badges`, `audit_log`, `background_job_failures`, `custom_field_definitions`, `custom_field_values`. Project/Section/Task template tables also likely exist based on migrations.
*   **Triggers & Functions:**
    *   `updated_at` triggers seem implemented (`moddatetime` enabled, specific triggers added).
    *   Section progress calculation trigger/function implemented (`20250412213500`). Verification needed (`build.md`).
    *   Audit logging table, function, and triggers for many tables are implemented.
    *   `pg_cron` enabled, cron trigger function created.
    *   **Remaining:** `clone_project` function, Full-Text Search index triggers (`build.md`).

## 4. Key Feature Implementation Status

*   **Project Management (Projects, Milestones, Risks, Issues):** Core tables exist. RLS applied. Edge functions exist (`projects`, `milestones`, `risks`, `issues`) but require refinement (permissions, error handling, specific logic like milestone approval) per `build.md`.
*   **Tasks & Sections:** Core tables exist. RLS applied. Section progress calculation trigger exists. Task hierarchy (`parent_task_id`) and dependencies (`depends_on_task_id`) are in the schema. Edge functions (`sections`, `tasks`) exist but need refinement (permissions, recurrence logic, dependency checks).
*   **Task Files & Comments:** Core tables exist. RLS applied. Edge functions (`task-files`, `task-comments`) exist but need refinement (permissions, storage policy checks, error handling). Realtime likely enabled for comments.
*   **Project Templates:** Schema likely exists. Edge function (`instantiate-project-template`) exists but needs significant work (placeholder resolution, transaction management, permissions) per `build.md`.
*   **Documentation:** Core tables (`documents`, `pages`, `document_comments`) exist. RLS applied. Logic for scoping, versioning, approvals, linking needs implementation/verification. Realtime likely enabled for comments.
*   **Meetings (Calendly):** `meetings` table exists. Webhook handler function is listed as a new requirement in `build.md`, suggesting it's not yet implemented.
*   **Training:** Core tables (`courses`, `lessons`, `assignments`, `completions`, `badges`, `user_badges`) exist. Logic for progress tracking, auto-assignment, certification (PDFMonkey), and gamification needs implementation (mostly listed as new functions/logic in `build.md`).
*   **Custom Fields:** Tables (`custom_field_definitions`, `custom_field_values`) exist. Edge function exists but needs refinement. Admin UI for management is a frontend task.
*   **Audit Logging:** Implemented via triggers populating `audit_log`. Viewer UI is a frontend task.
*   **Global Search:** FTS index trigger and RPC function are TODOs (`build.md`).
*   **Time Tracking:** Schema (`time_entries`) likely exists (implied by reporting views). Specific API endpoints (Start/Stop Timer) are listed as new requirements in `build.md`.
*   **Announcements:** Schema (`announcements`) likely exists. API endpoints are listed as new requirements in `build.md`.
*   **Reporting Views:** Detailed views specified in `plan.md`. Implementation (SQL Views/Materialized Views, RPC functions) is largely pending (`build.md`).

## 5. Edge Functions & Scheduled Tasks

*   **Existing Functions:** Many core functions exist (`companies`, `projects`, `tasks`, etc.) but require refinement as noted in `build.md`. `generate-recurring-tasks` and `instantiate-project-template` also exist but need work.
*   **New Functions/RPCs (Mostly TODO):** SSO JIT Provisioning, Calendly Webhook, Notification Sender, Certificate Generator, Gamification Logic, Global Search RPC, Time Tracking Endpoints, Announcement Endpoints, @mention Processor, Reporting View RPCs.
*   **Scheduled Functions (Mostly TODO):** Data Retention Cleanup, SLA Check/Notifier, Project Health Calculator, Training Auto-Assignment, Materialized View Refresher, Gamification Check.

## 6. Integrations Status

*   **Calendly:** Schema exists, webhook handler is TODO.
*   **Resend:** Planned for notifications (email), likely via a TODO Notification Sender function.
*   **PDFMonkey:** Planned for certificate generation, via a TODO Certificate Generator function.
*   **Slack:** Planned for notifications, likely via a TODO Notification Sender function.
*   **Sentry:** Planned for error monitoring, integration is TODO.

## 7. Storage

*   Scripts for bucket creation and policy setup exist.
*   Defining and applying strict, RLS-aware policies is an ongoing task (`build.md`).

## 8. Frontend Readiness

*   The backend provides many core tables and initial RLS.
*   However, many Edge Functions require refinement, and several key functions/RPCs (Search, Reporting, Notifications, SSO JIT, etc.) are not yet implemented.
*   APIs need to be verified against the frontend spec (`plan.md` v1.3) for data structures, filtering, sorting, and standardized error handling.
*   Realtime setup needs verification for relevant tables.

## 9. Overall Summary

The project has a well-defined specification (`plan.md`) and a substantial database schema implemented through numerous migrations. Core concepts like multi-tenancy and RLS are established. Many foundational Edge Functions exist but require significant refinement and implementation of specific business logic, error handling, and permission checks as detailed in `build.md`. Several key features involving new functions (SSO JIT, webhooks, notifications, reporting RPCs) and scheduled tasks are largely pending implementation. The backend is partially ready to support the frontend, but significant work remains to complete and stabilize the APIs and background processes.
