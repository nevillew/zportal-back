## Frontend Development Specification for Enterprise SaaS Client Onboarding Platform (Version 1.3)

**Based on Backend Spec:** Version 3.3
**Date:** 2023-10-27

---

## 1. Overview

**Purpose:** This document specifies the requirements for building the frontend user interface (UI) for the Client Onboarding Platform using **Next.js**. The frontend will provide a user-friendly, responsive, accessible, and performant interface for both internal staff and external client users to interact with all features defined in the backend specification (v3.3).

**Target Users:** Internal Staff (Admins, Project Managers, Implementers) and Client Users (various roles). The UI must adapt based on the user's role and permissions.

**Key Objectives:**
*   Implement all user-facing features detailed in the backend spec using Next.js and React.
*   Provide distinct views and capabilities based on user roles (Staff vs. Client, specific permissions).
*   Ensure a consistent, accessible, and professional user experience leveraging the Tailwind UI component library and **Storybook** for component documentation.
*   Handle various UI states gracefully (**loading, error, empty, success**).
*   Integrate seamlessly with the Supabase backend for data fetching (server-side and client-side), real-time updates, authentication, and storage.
*   Build a maintainable, scalable, and performant Next.js application adhering to defined **performance budgets** and **security best practices**.

---

## 2. Tech Stack

*   **Framework:** **Next.js** (v13+ using **App Router** preferred).
*   **UI Library:** **Tailwind UI** - Utilize pre-built components (Application UI, Marketing) built on **Headless UI** and styled with **Tailwind CSS** (v3+).
*   **State Management:**
    *   **Server State:** **RTK Query** integrated with Next.js for data fetching, caching, mutations (can be used in both Server and Client Components via providers). Consider Supabase client directly in Server Components for simple data fetching.
    *   **Global Client State:** **Zustand** or **Jotai** (recommended for simplicity with App Router) or **Redux Toolkit (RTK)** (if complex global state logic warrants it). Used for UI state like sidebar toggle, context switcher selection, potentially auth status client-side.
*   **Routing:** **Next.js App Router** (file-system based routing).
*   **API Client:** **Supabase Client Library (`@supabase/supabase-js`)**. Use server-side client for Server Components/Route Handlers, client-side client for Client Components. Utilize Supabase helper libraries for Next.js (`@supabase/auth-helpers-nextjs`).
*   **Forms:** **React Hook Form**. Integrate with Headless UI components.
*   **Charting/Visualization:** **Recharts** (preferred) or Chart.js (via react-chartjs-2).
*   **Rich Text Editor:** **TipTap**.
*   **Drag & Drop:** **dnd-kit**.
*   **Date/Time Handling:** **Day.js** or **date-fns**.
*   **Notifications/Toasts:** **react-hot-toast**.
*   **Animation:** **Framer Motion** (optional, for purposeful micro-interactions).
*   **Component Development/Documentation:** **Storybook**.
*   **Error Monitoring:** **Sentry SDK for Next.js (`@sentry/nextjs`)**.
*   **Styling:** **Tailwind CSS**.
*   **Linting/Formatting:** ESLint, Prettier (configured for Next.js/React/TypeScript).
*   **Language:** **TypeScript**.
*   **Utility Libraries:** Lodash (or specific function imports).
*   **Sanitization:** **DOMPurify**.

---

## 3. Frontend Architecture

*   **Component-Based:** React components within the Next.js App Router structure.
*   **Next.js App Router:** Utilize file-system routing (`app/` directory). Differentiate between **Server Components** (default, for data fetching, accessing backend resources directly) and **Client Components** (`'use client'` directive, for interactivity, hooks like `useState`, `useEffect`, browser APIs). Employ Server Components for static rendering and initial data loads where possible to improve performance. Use Client Components for interactive elements and components requiring browser APIs or hooks.
*   **Folder Structure (Example with App Router):**
    ```
    ├── app/                      # App Router directory
    │   ├── (auth)/               # Route group for auth pages (login, signup)
    │   │   └── login/page.tsx
    │   ├── (main)/               # Route group for main authenticated app layout
    │   │   ├── layout.tsx        # Main layout (Sidebar, Header - likely Client Components)
    │   │   ├── dashboard/page.tsx # Dashboard Server Component (fetches data)
    │   │   ├── projects/
    │   │   │   ├── page.tsx        # Project List (Server Component)
    │   │   │   └── [projectId]/
    │   │   │       ├── layout.tsx    # Project specific layout/tabs
    │   │   │       ├── tasks/page.tsx # Task Board/List (Client Component)
    │   │   │       └── ...           # Other project sub-routes (settings, milestones, etc.)
    │   │   └── admin/              # Admin section route group
    │   │       ├── layout.tsx      # Admin layout/auth check
    │   │       ├── roles/page.tsx    # Role Management (likely Client Component for forms)
    │   │       └── audit-log/page.tsx # Audit Log Viewer (Client Component)
    │   ├── api/                    # Next.js API Routes / Route Handlers (if needed beyond Supabase direct calls/RPC)
    │   └── layout.tsx            # Root layout (providers)
    ├── components/             # Shared UI components (mostly Client Components)
    ├── features/               # Shared logic/components for features (client/server agnostic utils)
    ├── hooks/                  # Shared custom Client Component hooks
    ├── lib/                    # Library integrations (supabase client setup, etc.)
    ├── services/               # API service definitions (RTK Query slices)
    ├── store/                  # Global client state store (Zustand/Jotai/RTK)
    ├── styles/                 # Global styles, Tailwind config
    ├── types/                  # Shared TypeScript types
    └── utils/                  # Shared utility functions (client/server agnostic)
    ```
*   **Design Patterns:**
    *   **Server Components:** Fetch initial data directly using Supabase server client or RPC calls within the component's async function. Pass data down as props to Client Components.
    *   **Client Components:** Handle user interactions, use client-side hooks (`useState`, `useEffect`, `useContext`), manage forms, subscribe to Realtime events, use RTK Query hooks for client-side data fetching/mutation after initial load.
    *   **Custom Hooks:** Encapsulate reusable client-side logic (`useAuth`, `usePermissions`, `useCurrentContext`).
    *   **State Management:** Use chosen client state library (Zustand/Jotai/RTK) for global UI state. Use RTK Query for managing server state caching and synchronization across components.
    *   **Strongly Typed Props:** (*Requirement*) All component props must be strongly typed using TypeScript interfaces or types. Avoid `any` where possible.
*   **Developer Documentation:** (*Requirement*) Maintain `README.md`, JSDoc/TSDoc comments, `CONTRIBUTING.md`.
*   **Feature Flags:** (*Requirement*) Implement simple config-based feature flagging. Wrap new, non-critical features.

---

## 4. Core Features & Modules (Frontend Implementation)

### 4.1 Authentication & Authorization
*   **Views (App Router):** Auth pages in `(auth)` group, main app in `(main)` group. Use Next.js middleware or layout checks with `@supabase/auth-helpers-nextjs` for protecting routes.
*   **Components:** `AuthForm`, `OAuthButton`, `SSOButton` (Client Components).
*   **Logic:** Use `@supabase/auth-helpers-nextjs` for server-side session management and client-side hooks (`useSession`, `useSupabaseClient`). Store supplementary user profile/permissions in global client state (Zustand/Jotai/RTK) fetched after login. Conditional rendering based on permissions.
*   **Centralized Permission Keys:** *(Note)* A definitive list of permission keys is maintained (`permissions.ts`). Frontend conditional rendering MUST use these defined keys.

### 4.2 Application Layout & Navigation
*   **Components:**
    *   `RootLayout` (`app/layout.tsx`): Setup providers (Supabase, State Management, Theme).
    *   `MainLayout` (`app/(main)/layout.tsx`): Includes `Sidebar` and `Header` (Client Components). Fetches initial user/context data server-side if possible or client-side on load.
    *   `Sidebar`: Client Component for interactivity (collapse). Navigation links rendered based on permissions.
    *   `Header`: Client Component. Includes `GlobalSearchInput`, Notifications (Client), User Menu (Client), `ContextSwitcher` (Client).
    *   `ContextSwitcher`: Client Component dropdown. Updates global client state.

### 4.3 Dashboard
*   **Views (App Router):** `app/(main)/dashboard/page.tsx` (Server Component preferred for initial data load).
*   **Components:** Dashboard widgets (likely Client Components if interactive or using client-side hooks). Fetch data within Server Component and pass as props, or widgets fetch client-side via RTK Query. Examples:
    *   `ProjectSummaryWidget` (using `view_project_summary`)
    *   `MyOpenTasksWidget` (using `view_task_details` filtered for user)
    *   `UpcomingMilestonesWidget` (using `view_milestone_status`)
    *   `AnnouncementsWidget` (displaying active `announcements`)
    *   `RecentActivityFeed` (optional)
    *   `TrainingProgressWidget` (optional)
*   **Reporting Scope Clarification:** V1 surfaces reports only via dashboard widgets/specific components. No dedicated `/app/reports` section.

### 4.4 Project Management
*   **Views (App Router):** `app/(main)/projects/page.tsx` (List - Server Component), `app/(main)/projects/[projectId]/...` (Detail - use layouts, potentially Server Components for static parts, Client Components for interactive sections).
*   **Components:**
    *   `ProjectTable`/`Card` (Server/Client). `ProjectCreateForm` (Client Component, handles template selection, placeholder input).
    *   `TaskBoard`/`List` (Client Component due to DND, filtering, interactions). `SectionColumn`, `TaskCard`/`ListItem` (Client).
    *   `TaskDetailModal`: Client Component (state, forms, comments, files, time tracking).
        *   **File Upload UX:** *(Detail)* `FileUpload` component uses `supabase.storage...upload()`, shows progress, handles errors, triggers backend API call on success, updates `FileList`.
    *   `TaskForm`: Client Component (React Hook Form, handles parent task, dependencies, recurrence rules, effort estimate, custom fields).
    *   `MilestoneList`/`Timeline`: Client Component (interactivity, sign-off). `MilestoneDetail` (Client).
    *   `RiskList`/`IssueList`: Client Component (sorting, filtering). `RiskIssueForm` (Client).
    *   **Feedback UI:** `FeedbackForm` modal (Client Component) triggered from Project Detail view (`/app/(main)/projects/[projectId]/feedback/` or similar).
    *   **Integrations UI:** `IntegrationSettingsForm` component within Project Settings (`app/(main)/projects/[projectId]/settings/page.tsx`) for settings like Slack Channel ID.
    *   **Custom Field Rendering:** *(Detail)* Implement `CustomFieldRenderer` (Client Component) mapping `definition.field_type` to Tailwind UI inputs (`Input`, `Textarea`, `Select`, Date Picker, `Toggle`, etc.) using React Hook Form for state and validation based on `definition.validation_rules`.

### 4.5 Documentation
*   **Views (App Router):** `app/(main)/documents/...` Use dynamic routes for `[documentId]` and `[pageId]`. Viewer page can be Server Component if content is static, Editor is Client Component. Browser might be mixed.
*   **Components:** `DocumentTree`/`List` (Client for interaction), `PageContentRenderer` (Server or Client, handles Markdown/HTML, sanitizes if needed), `PageList` (Client), `RichTextEditor` (Client, handles linking), `CommentThread` (Client, handles internal flag), `DocumentForm`/`PageForm` (Client).

### 4.6 Meetings
*   **Views (App Router):** `app/(main)/meetings/page.tsx` or embed list in project/company views.
*   **Components:** `MeetingList`/`ListItem` (Client for filtering/interaction), `MeetingDetailModal` (Client - allows adding notes/recording).

### 4.7 Training
*   **Views (App Router):** `app/(main)/training/courses/page.tsx`, `app/(main)/training/courses/[courseId]/page.tsx`, `app/(main)/training/courses/[courseId]/lessons/[lessonId]/page.tsx`, `app/(main)/profile/certificates/page.tsx` (*Added View*).
*   **Components:** `CourseCard` (Server/Client), `LessonListItem` (Client), `VideoPlayer`/`PdfViewer` (Client), `QuizComponent` (Client), `ProgressBar` (Client), `BadgeDisplay` (Client), `CertificateList`/`ListItem` (*Added*, Client - provides download links).

### 4.8 Time Tracking
*   **Components:** `TimerComponent` (Client), `TimeEntryForm` (Client), `TimeLogList` (Client). Integrated into Task Detail.

### 4.9 Announcements
*   **Components:** `AnnouncementsWidget` (Client for dismiss), `AnnouncementForm` (Admin UI - Client).

### 4.10 Search
*   **Components:** `GlobalSearchInput` (Client), `SearchResultsPage` (`app/(main)/search/page.tsx` - likely Client to handle dynamic query).

### 4.11 User Profile & Settings
*   **Views (App Router):** `app/(main)/profile/...`, `app/(main)/settings/page.tsx`.
*   **Components:** `ProfileForm` (Client), `NotificationPreferences` (Client), `MyBadges` (Client), `AccountSettings` (Client). Link to `/app/profile/certificates`.

### 4.12 Admin Settings (Staff Only)
*   **Views (App Router):** Route group `app/(main)/admin/...` protected by layout/middleware checking for Staff role/permissions. Pages for Role Management, Custom Field Management, Template Management, Data Retention Settings (mostly Client Components due to forms/interactions).

### 4.13 Audit Log Viewer (Admin Only - V1 Scope) (*Added Section*)
*   **View:** `/app/admin/audit-log` (Protected route accessible via `Permission.VIEW_AUDIT_LOG`).
*   **Functionality:** Client Component displaying `audit_log` records (reverse chronological).
*   **Display:** Key columns (Timestamp, User, Action, Target).
*   **Filtering:** Client-side or server-side filtering (via API/RPC) by Date Range, User, Action, Target Type.
*   **Pagination:** Implement pagination (client or server-side).
*   **Scope:** Provides a raw log view for administrative/troubleshooting purposes in V1.

### 4.14 Background Job Monitoring (Admin Only - V1 Scope) (*Added Section*)
*   **View:** `/app/admin/job-failures` (Protected route accessible via appropriate admin permission).
*   **Functionality:** Client Component displaying `background_job_failures` records. Fetches data via PostgREST.
*   **Display:** Key columns (Timestamp, Job Name, Status, Error Message). Allow viewing payload/stack trace details.
*   **Filtering/Sorting:** Allow filtering by Job Name, Status, Date Range. Sort by Timestamp.
*   **Actions:** Potentially allow marking failures as 'resolved' or 'ignored'. (Requires backend UPDATE permission/logic).

---

## 5. UI Components & Design System

*   **Foundation:** Utilize Tailwind CSS utility classes. Adhere to `tailwind.config.js`.
*   **Component Library:** Primarily use **Tailwind UI** components (React version). Adapt and style them as needed. Use **Headless UI** primitives for custom elements.
*   **Custom Components:** Develop accessible and consistent custom components for specific needs (e.g., `KanbanBoard`, `GanttChart` wrapper, `RichTextEditor` wrapper, `ContextSwitcher`, widgets).
*   **Storybook:** (*Requirement*)
    *   Set up Storybook for the project.
    *   Create stories for shared/common components (`src/components/`).
    *   Create stories for key reusable feature components.
    *   Configure controls for interactive testing.
*   **UI States:** (*Requirement*)
    *   **Loading States:** Implement skeleton loaders, Next.js `loading.tsx`, spinners appropriately.
    *   **Error States:** Display user-friendly messages, use `error.tsx` boundaries.
    *   **Empty States:** Design and implement clear empty states with call-to-action.
    *   **Success States:** Use toasts or subtle UI cues for confirmation.
*   **Micro-interactions & Animations:** (*Recommendation*)
    *   Employ subtle animations/transitions using Tailwind CSS or Framer Motion for specified UI elements. Respect `prefers-reduced-motion`.
*   **Theming & Customization:** (*Detail*)
    *   Implement dynamic theming based on company colors using CSS Custom Properties updated via JavaScript. Configure Tailwind to use these variables. Apply theme-aware classes to relevant elements.
*   **Responsiveness:** All views and components must be fully responsive.
*   **Consistency:** Maintain visual and interactive consistency.

---

## 6. State Management Strategy

*   **RTK Query:** Use for server state management (fetching, caching, mutations). Define API slices. Utilize hooks in Client Components. Configure provider in root layout.
*   **Global Client State:** Use **Zustand** or **Jotai** (preferred) or RTK for minimal global client state (Auth status, User profile snippets, Context selection, UI preferences). Create stores/atoms accessible via hooks in Client Components. Use Providers in root layout.
*   **Local Component State:** Use `useState`/`useReducer` in Client Components.
*   **Server Components:** No client-side state hooks. Fetch data directly or receive via props.

---

## 7. Routing Strategy

*   **Library:** **Next.js App Router**. File-system based routing (`app/` directory).
*   **Structure:** Use route groups `(groupName)`. Use dynamic segments `[segmentName]`.
*   **Protected Routes:** Implement protection using Next.js Middleware or layout checks (`@supabase/auth-helpers-nextjs`). Redirect unauthenticated.
*   **Role-Based Rendering:** Fetch/use permissions data to conditionally render elements in Server and Client Components.
*   **Not Found Route:** Implement `not-found.tsx`.
*   **Loading UI:** Implement `loading.tsx` files for route transitions.

---

## 8. API Integration Strategy

*   **Client:** Use `@supabase/auth-helpers-nextjs` for Supabase clients (Server, Client, Route Handlers).
*   **Data Fetching/Mutations:**
    *   **Server Components:** Direct Supabase client calls/RPC.
    *   **Client Components:** RTK Query hooks using client Supabase client.
    *   **Route Handlers (`app/api/`):** Optional, use server Supabase client.
*   **Loading/Error States:** Handled by Next.js `loading.tsx`/`error.tsx` and RTK Query hooks.

---

## 9. Authentication Flow (Frontend Detail with Next.js)

*   **Server-Side Check:** Middleware/Layouts check session (`createServerComponentClient`). Redirect if needed.
*   **Client-Side Hydration/Sync:** Client components access session/user via hooks or props. Global client state stores supplementary data.
*   **Auth Listener:** Use `supabase.auth.onAuthStateChange` client-side to react to auth events.
*   **Login/Logout/OAuth/SSO:** Client components trigger `supabase.auth` methods. Redirects via Next.js router.
*   **Invitation:** Accept page (Client Component) verifies token -> directs to signup/login -> triggers accept API call.

---

## 10. Error Handling (Frontend Detail)

*   **API Errors:** Handled via RTK Query hooks or `error.tsx`. Display user-friendly messages.
*   **Form Validation:** Client-side via React Hook Form. Display inline errors. Handle backend 422 validation errors.
*   **Rendering Errors:** Use Next.js Error Boundaries (`error.tsx`). Log errors to Sentry.
*   **Sentry Integration:** Use `@sentry/nextjs` for comprehensive error capturing. Enrich with context.

---

## 11. Real-time Features Implementation

*   **Subscriptions:** Use Supabase client's Realtime capabilities within **Client Components** using `useEffect`. Scope subscriptions.
*   **Update Strategy:** (*Refined*)
    *   **Manual Cache Update:** Prefer `dispatch(api.util.updateQueryData(...))` for simple list updates.
    *   **Cache Invalidation:** Use `dispatch(api.util.invalidateTags([...]))` for complex changes or easier implementation.
*   Manage subscription lifecycle efficiently.

---

## 12. Accessibility (A11y)

*   **Standards:** Adhere to WCAG 2.1 Level AA.
*   **Implementation:** Semantic HTML, ARIA attributes, keyboard navigation, focus management, color contrast, form labels.
*   **Process:** (*Requirement*) Automated checks (Axe in CI), manual keyboard/screen reader testing, design reviews include A11y checks.

---

## 13. Performance

*   **Optimization Techniques:** Leverage Next.js features (Server Components, `next/image`, etc.). Apply React memoization. Implement List Virtualization. Monitor Bundle Size. Optimize Data Fetching.
*   **Performance Budgets:** (*Requirement*) Target Lighthouse scores (>80 Performance, >95 Accessibility, >95 Best Practices) and Core Web Vitals ('Good' thresholds: LCP < 2.5s, CLS < 0.1). Monitor regularly.

---

## 14. Build, Deployment & PWA

*   **Build Tool:** Use `next build`.
*   **Environment Variables:** Use Next.js built-in support (`.env.local`). Use `NEXT_PUBLIC_` prefix for client-side vars.
*   **Deployment Platform:** **Vercel** (recommended). Configure platform for Next.js App Router.
*   **Progressive Web App (PWA):**
    *   **Offline Support:** Not required for V1.
    *   **PWA Capabilities:** Use `next-pwa` package to configure: Web App Manifest, Service Worker for caching static assets (`cache-first`).

---

## 15. Frontend Security

*   **XSS Prevention:**
    *   **Sanitize User Content:** Use `DOMPurify` before rendering user-generated HTML. Avoid `dangerouslySetInnerHTML`.
*   **Content Security Policy (CSP):**
    *   Implement appropriate `Content-Security-Policy` headers (via `next.config.js` or deployment platform). Restrict sources.
*   **Dependency Security:** Regularly audit dependencies (`npm audit`).

---

## 16. Testing Strategy

*   **Unit Tests:** Use **Vitest** (or Jest) with **React Testing Library (RTL)**. Test components, hooks, utils. Aim for > 70% coverage.
*   **Integration Tests:** Use RTL to test component interactions. Mock API calls using **Mock Service Worker (MSW)**.
*   **End-to-End (E2E) Tests:** Use **Cypress** or **Playwright**. Cover critical user journeys. Run against staging in CI/CD.

---

## 17. Conclusion

This frontend specification (Version 1.3) provides a detailed plan for building the **Next.js** application for the Enterprise SaaS Client Onboarding Platform, incorporating enhanced UI/UX considerations, development practices, performance budgets, security requirements, and specific UI elements for all backend features. Used alongside Backend Spec v3.3 and detailed UI/UX designs, this document guides the development of a modern, performant, accessible, and maintainable user interface.

---
