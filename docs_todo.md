# Backend Documentation To-Do List

This list outlines the essential documentation artifacts to create after completing the backend build (based on Spec v3.3).

**I. API Documentation:**

*   **API Endpoint Reference (OpenAPI/Swagger):**
    *   [ ] Generate or manually create an OpenAPI (Swagger) specification detailing all exposed PostgREST endpoints, RPC functions, and HTTP-triggered Edge Functions.
    *   [ ] For each endpoint: Document HTTP method, URL path, parameters (path, query, body), expected request body schema, possible response status codes (2xx, 4xx, 5xx), and response body schemas (including the standard validation error format - Spec Section 7.15).
    *   [ ] Include clear examples for requests and responses.
*   **Authentication & Authorization Guide:**
    *   [ ] Explain how clients should authenticate (obtain JWT via Supabase Auth methods).
    *   [ ] Detail how the JWT should be included in API requests (Authorization header).
    *   [ ] Reference the definitive list of Permission Keys (see point below) and explain that API access is controlled by user roles and permissions enforced via RLS and potentially API logic.
*   **Rate Limiting Information:**
    *   [ ] Document the configured rate limits for API endpoints (if customized beyond Supabase defaults).
*   **API Versioning Strategy:**
    *   [ ] State the current API version (e.g., `/functions/v1/`) and the approach for future versioning.
*   **Standard Error Codes:**
    *   [ ] List common HTTP error codes and their general meaning in the context of the API (e.g., 401, 403, 404, 422, 500). Include the specific format for 422 validation errors.

**II. Database Documentation:**

*   **Schema Diagram (ERD):**
    *   [ ] Create/generate a visual representation (Entity Relationship Diagram) of the database tables and their relationships (FKs).
*   **Table Definitions:**
    *   [ ] Document each table: Purpose, column names, data types, constraints (PK, FK, UNIQUE, CHECK, NOT NULL), defaults, and indexes.
*   **Row Level Security (RLS) Overview:**
    *   [ ] Explain the RLS strategy (default deny, policies based on user roles/permissions).
    *   [ ] Document the key RLS helper functions (e.g., `is_staff_user`, `is_member_of_company`, `has_permission`, `can_access_project`, `can_manage_document`, `can_manage_entity_for_custom_field`) and their purpose.
    *   [ ] Provide examples of typical RLS policies applied to major tables (e.g., `projects`, `tasks`, `custom_field_values`).
*   **Custom Database Functions & Triggers:**
    *   [ ] List significant custom PostgreSQL functions (beyond basic `updated_at`) and triggers.
    *   [ ] For each: Document purpose, trigger event (if applicable), brief logic description, and dependencies (e.g., `update_section_progress`, `clone_project`, `log_audit_changes`, `update_search_index`, `process_mentions_and_notify`, `approve_milestone_step`, `calculate_project_health`, `notify_overdue_tasks`, `apply_data_retention_policies`).
*   **Reporting Views Documentation:**
    *   [ ] List all created database views (Spec Section 11).
    *   [ ] For each view: Document purpose, target audience, key columns, brief logic description, and performance considerations (e.g., if Materialized).

**III. Supabase Edge Functions Documentation:**

*   **Function Inventory:**
    *   [ ] List all deployed Edge Functions (e.g., `companies`, `projects`, `tasks`, `send-notification`, `calendly-webhook-handler`, `generate-certificate`, `sso-jit-provisioning`, `assign-training`, `check-sla`, `submit-quiz`, etc.).
*   **Individual Function Details:**
    *   [ ] For each function:
        *   [ ] Document purpose.
        *   [ ] Document trigger mechanism (HTTP endpoint, DB Webhook, `pg_cron`).
        *   [ ] Document expected input/payload schema.
        *   [ ] Document key outputs/side effects.
        *   [ ] Document external services called (Resend, PDFMonkey, Slack, Sentry).
        *   [ ] Document required environment variables / secrets (reference names).
        *   [ ] Document error handling approach (Sentry, `background_job_failures`).

**IV. Authentication & Authorization Deep Dive:**

*   **Auth Flows Diagrams:**
    *   [ ] Create visual diagrams for Password login, OAuth, SSO, and Invitation Acceptance flows.
*   **Roles & Permissions Definition:**
    *   [ ] List all defined Roles (`roles` table seed data).
    *   [ ] Provide the **definitive list of all Permission Keys** (e.g., from `permissions.ts` or equivalent) and a brief description of the action each key controls.
    *   [ ] Explain how `base_permissions` and `custom_permissions` combine.

**V. Real-time Features:**

*   **List of Realtime Enabled Tables:**
    *   [ ] Explicitly list tables where Supabase Realtime is enabled (`task_comments`, `document_comments`, `tasks`, `announcements`, `messages`).
*   **Event Payload:**
    *   [ ] Confirm standard row data is broadcasted.

**VI. Storage:**

*   **Bucket List & Purpose:**
    *   [ ] List all Supabase Storage buckets (`company-logos`, `user-avatars`, `task-attachments`, etc.) and their purpose.
*   **Access Control Summary:**
    *   [ ] Briefly describe the access control strategy (e.g., "Public read for images, authenticated read based on RLS for attachments"). Reference `setup-storage-policies.js`.

**VII. Integrations Setup:**

*   [ ] For each external integration (Calendly, Resend, PDFMonkey, Slack, Sentry):
    *   [ ] Document purpose.
    *   [ ] Document required setup steps (API keys, webhook config).
    *   [ ] Document where secrets/keys are stored (Supabase Vault).
    *   [ ] Reference the relevant Edge Functions.

**VIII. Background Jobs & Scheduling:**

*   **Scheduled Job List (`pg_cron`):**
    *   [ ] List all jobs scheduled via `pg_cron`.
    *   [ ] For each job: Document schedule frequency, function executed, and purpose (e.g., "Generate Recurring Tasks", "Data Retention", "Project Health Update", "SLA Check", "Training Assignment").
*   **Failure Monitoring:**
    *   [ ] Explain how to monitor job failures (querying `background_job_failures` table, Sentry alerts).

**IX. Configuration & Environment:**

*   **Environment Variables List:**
    *   [ ] Create a complete list of required environment variables (Supabase URL/Keys, external service keys, etc.).
*   **Secrets Management:**
    *   [ ] Explain how secrets are managed (Supabase Vault, `.env` for local).

**X. Deployment & Operations:**

*   **Deployment Checklist:**
    *   [ ] Create high-level steps for deploying updates (migrations, Edge Functions).
*   **Monitoring Guide:**
    *   [ ] Provide basic guidance on monitoring (Supabase logs, Sentry, `background_job_failures`).
*   **Backup & Restore:**
    *   [ ] Briefly mention Supabase PITR and any custom strategies.

**XI. Code & Contribution (within README.md or separate files):**

*   **README.md:**
    *   [ ] Ensure setup instructions are complete and accurate.
    *   [ ] Add overview of key dependencies.
*   **Code Structure Overview:**
    *   [ ] Briefly explain backend code organization (migrations, functions, shared code).
*   **Contribution Guidelines:**
    *   [ ] Define branching strategy, PR process, coding conventions, testing requirements (if applicable).
