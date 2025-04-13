# Backend Implementation Log - Phase 2

## 2025-04-16

-   **Accept Invite Transaction:** Created PostgreSQL RPC function `accept_invitation` to handle invitation acceptance atomically. Updated `accept-invite` Edge Function to call this RPC. (Migration: `20250416110100_add_accept_invitation_rpc.sql`, Function: `supabase/functions/accept-invite/index.ts`)
-   **Messaging Transaction:** Created PostgreSQL RPC function `create_conversation` to handle conversation and participant creation atomically. Updated `messaging` Edge Function (POST `/conversations`) to call this RPC. (Migration: `20250416110200_add_create_conversation_rpc.sql`, Function: `supabase/functions/messaging/index.ts`)
-   **Custom Field Values RLS Fix:** Updated RLS policy on `custom_field_values` to correctly use the `can_manage_entity_for_custom_field` helper function for checking parent entity permissions. (Migration: `20250416100400_fix_custom_field_values_rls.sql`)
-   **Calendly Webhook Handler:** Updated `getSecret` to use RPC, implemented signature verification, added UUID validation for context IDs, added `logFailure` helper and call. (Function: `supabase/functions/calendly-webhook-handler/index.ts`)
-   **Companies Function (Invite Email):** Added logic to call `send-notification` function via fetch after creating an invitation record. Added placeholder `getSecret` helper. (Function: `supabase/functions/companies/index.ts`)
-   **Custom Field Definitions Function (Validation):** Enhanced validation in POST/PUT handlers for `entity_type`, `field_type`, `options` format, and `validation_rules` structure. (Function: `supabase/functions/custom-field-definitions/index.ts`)
-   **Documents Function (Enum Validation):** Added validation for `type` and `status` enums in POST/PUT handlers. (Function: `supabase/functions/documents/index.ts`)
-   **Send Notification Function:** Updated `getSecret` to use RPC, added email format validation, added `logFailure` helper and calls in `catch` blocks for Resend/Slack API calls. (Function: `supabase/functions/send-notification/index.ts`)
-   **Generate Certificate Function (Vault Fetching):** Updated `getSecret` helper to use `get_decrypted_secret` RPC. (Function: `supabase/functions/generate-certificate/index.ts`)
-   **Generate Recurring Tasks Function (Custom Fields):** Implemented logic to copy custom field values from definition task to new instances by fetching new task IDs after bulk insert. (Function: `supabase/functions/generate-recurring-tasks/index.ts`)
-   **Milestones Function (Vault Fetching):** Updated `getSecret` helper to use `get_decrypted_secret` RPC. (Function: `supabase/functions/milestones/index.ts`)
-   **Projects Function:** Added enum validation for status/stage, modified POST to call `instantiate_template_rpc` if template ID provided, added specific DB error handling (FK, Not Found) for PUT/DELETE, added basic nested routing handling. (Function: `supabase/functions/projects/index.ts`)
-   **Sections Function:** Added enum validation for type, added specific DB error handling (FK, Not Found), removed `percent_complete` from PUT allowed updates. (Function: `supabase/functions/sections/index.ts`)
-   **SSO JIT Provisioning Function (Logging):** Added `logFailure` helper and call in final `catch` block. (Function: `supabase/functions/sso-jit-provisioning/index.ts`)
-   **Task Comments Function:** Added specific DB error handling (FK, Not Found), modified DELETE to allow staff override. (Function: `supabase/functions/task-comments/index.ts`)
-   **Tasks Function:** Removed obsolete validation TODO comment, added specific DB error handling (FK, Unique, Not Found). (Function: `supabase/functions/tasks/index.ts`)
-   **DB Migration (Updated At Triggers):** Created migration `20250416120000_add_remaining_updated_at_triggers.sql` to add missing `moddatetime` triggers to relevant tables.
-   **DB Migration (Clone Project Documents):** Modified `20250413190000_add_clone_project_function.sql` to include cloning of project-scoped documents, pages, and basic comments (parent mapping TBD). Also added cloning of document custom fields.
-   **DB Migration (Mention Trigger):** Enhanced `process_mentions_and_notify` function in `20250415230100_add_mention_trigger.sql` to handle Slack IDs, call `logFailure`, and applied trigger to `document_comments`.
-   **DB Migration (Gamification Trigger):** Enhanced `award_badges_on_lesson_completion` function in `20250416050100_add_gamification_trigger.sql` to send notifications and check for course completion badges.
-   **DB Migration (Notification Trigger Logging):** Added calls to `logFailure` in `notify_issue_change` (`20250416060100`) and `notify_risk_change` (`20250416070100`) functions.
-   **DB Migration (Data Retention Audit Logs):** Expanded audit log deletion logic in `apply_data_retention_policies` function (`20250416090100`) to include logs for projects, tasks, and company users associated with the company.
