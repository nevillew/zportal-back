# ZPortal Backend

This repository contains the backend implementation for ZPortal, an Enterprise SaaS Client Onboarding Platform. It leverages the Supabase platform for database, authentication, storage, and serverless edge functions.

## Overview

ZPortal aims to streamline and standardize the client onboarding process by providing a collaborative platform for managing projects, tasks, milestones, risks, issues, documentation, meetings, and training. This backend provides the necessary APIs, data persistence, and business logic to support the ZPortal frontend application (specified separately in `plan.md`).

## Key Features (Based on Specification v3.3)

*   **Multi-Tenancy:** Manages data isolation between different client companies.
*   **User Management:** Handles user authentication (including SSO via Supabase Auth), profiles, roles, permissions, and invitations.
*   **Project Management:** Core functionality for creating and managing onboarding projects.
    *   **Projects:** Tracks overall implementation status, stage, health, and owner.
    *   **Milestones:** Defines key project phases with status tracking and optional sign-off.
    *   **Sections:** Organizes tasks within a project.
    *   **Tasks:** Detailed tracking of individual work items, including sub-tasks, dependencies, recurrence, effort estimation, assignments, status, and priority.
    *   **Risks & Issues:** Manages potential project risks and reported issues.
*   **Project Templates:** Allows creating new projects from predefined structures.
*   **Custom Fields:** Supports defining and using custom data fields across various entities (Companies, Projects, Tasks, etc.).
*   **Documentation:** Manages knowledge base articles and project-specific documents.
*   **Meetings:** Tracks scheduled meetings (potentially integrated with external services like Calendly).
*   **Training:** Manages training courses, lessons, assignments, and completion tracking.
*   **Time Tracking:** Allows logging time against tasks.
*   **Notifications & Announcements:** In-app and potentially email notifications.
*   **Audit Logging:** Tracks significant changes to data.
*   **Storage:** Securely stores files like logos, avatars, task attachments, and documents using Supabase Storage with defined access policies.
*   **API Endpoints:** Provides RESTful-like endpoints via Supabase Edge Functions for frontend interaction.

## Tech Stack

*   **Platform:** [Supabase](https://supabase.com/)
    *   **Database:** PostgreSQL (v15)
    *   **Authentication:** Supabase Auth (JWT-based, includes email/password, OAuth, SSO support)
    *   **Storage:** Supabase Storage
    *   **Edge Functions:** Deno/TypeScript runtime
    *   **Realtime:** Supabase Realtime for live updates
    *   **Scheduling:** pg_cron
    *   **Secrets:** Supabase Vault (pgsodium)
*   **Database Migrations:** SQL (`supabase/migrations/`)
*   **Edge Functions Language:** TypeScript (using Deno)
*   **Utility Scripts:** Node.js (`scripts/`)

## Project Structure

```
.
├── README.md                 # This file
├── build.md                  # Remaining implementation steps and TODOs
├── deno.lock                 # Deno lock file for functions
├── package.json              # Node.js dependencies (for scripts)
├── package-lock.json         # Node.js lock file
├── plan.md                   # Detailed Backend & Frontend Specifications (v3.3)
├── scripts/                  # Utility scripts (Node.js)
│   ├── README.md             # Scripts documentation
│   ├── create-storage-buckets.js # Script to create Supabase Storage buckets
│   └── setup-storage-policies.js # Script to configure Storage RLS policies
├── supabase/                 # Supabase project configuration and assets
│   ├── .gitignore            # Supabase specific gitignore
│   ├── config.toml           # Supabase CLI configuration file
│   ├── functions/            # Supabase Edge Functions (Deno/TypeScript)
│   │   ├── _shared/          # Shared code for functions (CORS, validation)
│   │   ├── companies/        # Function for /companies endpoint
│   │   ├── custom-field-definitions/ # Function for /custom-field-definitions
│   │   ├── generate-recurring-tasks/ # Scheduled function for recurring tasks
│   │   ├── hello-world/      # Example function
│   │   ├── import_map.json   # Deno import map for functions
│   │   ├── instantiate-project-template/ # Function to create project from template
│   │   ├── issues/           # Function for /issues endpoint
│   │   ├── milestones/       # Function for /milestones endpoint
│   │   ├── projects/         # Function for /projects endpoint
│   │   ├── risks/            # Function for /risks endpoint
│   │   ├── sections/         # Function for /sections endpoint
│   │   ├── task-comments/    # Function for /comments (task comments)
│   │   ├── task-files/       # Function for /files (task attachments)
│   │   ├── tasks/            # Function for /tasks endpoint
│   │   └── deno.jsonc        # Deno configuration for functions
│   ├── migrations/           # Database schema migrations (SQL)
│   └── seed.sql              # (Optional) Database seed data
└── .gitignore                # Main project gitignore
```

## Getting Started

### Prerequisites

*   [Supabase CLI](https://supabase.com/docs/guides/cli)
*   [Deno](https://deno.land/) (for Edge Functions development/runtime)
*   [Node.js](https://nodejs.org/) and npm (for running utility scripts)
*   Docker (required by Supabase CLI for local development)

### Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd zportal-back
    ```

2.  **Install Node.js dependencies (for scripts):**
    ```bash
    npm install
    ```

3.  **Link Supabase project (if using an existing remote project):**
    ```bash
    supabase link --project-ref <your-project-ref>
    # Follow prompts to log in if needed
    ```
    Alternatively, initialize a new project if desired.

4.  **Start Supabase services locally:**
    ```bash
    supabase start
    ```
    This will start the Supabase stack (Postgres, Kong, Auth, etc.) in Docker containers. Note the local API URL and keys provided in the output.

5.  **Set up Environment Variables:**
    *   The utility scripts (`scripts/`) require `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables. You can set them directly when running the script or use a `.env` file (ensure it's gitignored). For local development, use the URLs/keys output by `supabase start`.
    *   Edge Functions access Supabase secrets (URL, keys) automatically when deployed or run locally via the CLI.
    *   The `generate-recurring-tasks` function requires the `SUPABASE_SERVICE_ROLE_KEY` to be set in Supabase Vault secrets (see `supabase/migrations/20250412213900_create_cron_trigger_function.sql`).

6.  **Apply Database Migrations:**
    *   To apply all migrations to your local database:
        ```bash
        supabase db reset
        ```
    *   This command drops the existing local database, recreates it, and applies all migrations found in `supabase/migrations/`. It will also run the seed script (`supabase/seed.sql`) if present and enabled in `config.toml`.

7.  **Create Storage Buckets:**
    *   Run the script to create the necessary Supabase Storage buckets (ensure Supabase services are running).
    ```bash
    # Replace with your actual local URL/key from 'supabase start' output
    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=your_local_anon_key node scripts/create-storage-buckets.js
    ```
    *   See `scripts/README.md` for details on buckets created.

8.  **Set up Storage Policies:**
    *   Run the script to apply Row Level Security (RLS) policies to the storage buckets.
    ```bash
    # Replace with your actual local URL/key from 'supabase start' output
    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=your_local_anon_key node scripts/setup-storage-policies.js
    ```
    *   See `scripts/README.md` for details on policies applied.

9.  **Deploy Edge Functions (Locally):**
    *   The `supabase start` command typically serves local functions automatically. You can test them using the local Supabase URL.
    *   To manually deploy/update local functions:
        ```bash
        supabase functions deploy --no-verify-jwt
        # Use --no-verify-jwt for local testing if you don't want to pass valid JWTs
        ```

## Running Locally

*   **Start all Supabase services:**
    ```bash
    supabase start
    ```
*   **Stop all Supabase services:**
    ```bash
    supabase stop
    ```
*   **Access Supabase Studio:** The local URL for Studio is usually output by `supabase start` (default: `http://127.0.0.1:54323`).
*   **Access API:** The local API Gateway URL is output by `supabase start` (default: `http://127.0.0.1:54321`).

## Database

*   **Schema:** Defined and versioned using SQL migration files in `supabase/migrations/`. Covers tenancy, users, projects, tasks, documents, training, custom fields, audit logs, etc.
*   **Management:** Use `supabase migration` commands to create new migrations and `supabase db reset` to apply them locally.
*   **Seeding:** Initial data (e.g., default roles) can be added to `supabase/seed.sql`.
*   **RLS:** Row Level Security policies are heavily used to enforce data access rules based on user roles and company membership. Policies are defined within the migration files, often using helper functions like `is_staff_user`, `is_member_of_company`, `has_permission`.
*   **Triggers:** Used for `updated_at` timestamps (via `moddatetime`), audit logging (`log_audit_changes`), and section progress calculation (`calculate_section_progress`).

## Edge Functions

Edge Functions provide the backend API endpoints and scheduled logic. They are located in `supabase/functions/`.

*   **Technology:** Deno / TypeScript
*   **Shared Code:** Common utilities like CORS headers (`_shared/cors.ts`) and validation helpers (`_shared/validation.ts`) are used.
*   **Authentication:** Functions typically verify the JWT token passed in the `Authorization: Bearer <token>` header to authenticate the user and apply Row Level Security.
*   **Available Functions (as of 2025-04-13):**
    *   `companies`: CRUD for companies, user management within companies (invite, remove).
    *   `projects`: CRUD for projects.
    *   `milestones`: CRUD for milestones, including approval workflow.
    *   `sections`: CRUD for project sections.
    *   `tasks`: CRUD for tasks.
    *   `risks`: CRUD for risks.
    *   `issues`: CRUD for issues.
    *   `task-comments`: CRUD for task comments.
    *   `task-files`: CRUD for task file attachments (metadata + storage interaction).
    *   `custom-field-definitions`: CRUD for managing custom field definitions (staff only).
    *   `instantiate-project-template`: Creates a new project from a template (placeholder resolution logic included).
    *   `generate-recurring-tasks`: Scheduled function (via pg_cron) to create task instances from definitions.
    *   `hello-world`: A simple example function.
*   **Testing:** Functions can be invoked locally using tools like `curl` or Postman against the local Supabase API URL (`http://127.0.0.1:54321/functions/v1/<function-name>`). Remember to include the `Authorization` header with a valid JWT (obtainable after logging in via the frontend or Supabase Studio) and the `apikey` header (local anon key).

## Storage

*   **Buckets:** Defined and created via `scripts/create-storage-buckets.js`. Includes buckets for logos, avatars, task attachments, meeting recordings, training content, certificates, badges, generated documents.
*   **Policies:** Access control is managed via Storage RLS policies applied by `scripts/setup-storage-policies.js`. These policies often reference database tables and RLS helper functions to determine access rights based on user roles and context.

## Scripts

Utility scripts are located in the `scripts/` directory. See `scripts/README.md` for detailed usage instructions.

*   `create-storage-buckets.js`: Creates required Supabase Storage buckets.
*   `setup-storage-policies.js`: Applies RLS policies to the storage buckets.

## Configuration

*   **`supabase/config.toml`:** Main configuration file for the Supabase CLI, defining project settings, local port mappings, auth settings, function configurations, etc.
*   **`supabase/functions/deno.jsonc`:** Deno configuration for Edge Functions (linting, formatting).
*   **`supabase/functions/import_map.json`:** Manages Deno dependencies for Edge Functions.

## Project Status & Next Steps

*   **Current Status:** The project has a well-defined specification (`plan.md`) and a substantial database schema implemented through numerous migrations. Core concepts like multi-tenancy and RLS are established. Many foundational Edge Functions exist but require refinement and implementation of specific business logic, error handling, and permission checks.
*   **Remaining Work:** Outstanding tasks and the planned implementation order are detailed in `build.md`. This includes refining existing functions, implementing new functions (SSO JIT, webhooks, notifications, reporting RPCs), scheduled tasks, and thorough testing.

## Contributing

(Placeholder: Add contribution guidelines if applicable).

## License

ISC (as per `package.json`)
