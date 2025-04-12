# ZPortal Backend Scripts

This directory contains utility scripts for the ZPortal backend.

## Storage Bucket Creation Script

The `create-storage-buckets.js` script creates the necessary storage buckets in your Supabase project for file uploads.

### Prerequisites

- Node.js installed
- Supabase project URL and anon key (found in the Supabase dashboard under Project Settings > API)

### Usage

1. Go to the Supabase dashboard: https://app.supabase.com/
2. Select your project: `zportal`
3. Navigate to Project Settings > API
4. Copy the URL and anon key (public API key)
5. Run the script with the environment variables:

```bash
SUPABASE_URL=your_supabase_url SUPABASE_ANON_KEY=your_anon_key node scripts/create-storage-buckets.js
```

### Buckets Created

The script creates the following storage buckets with appropriate permissions and file size limits:

- `company_logos`: Public bucket for company logo images (5MB limit)
- `user_avatars`: Public bucket for user profile pictures (2MB limit)
- `task_attachments`: Private bucket for task file attachments (50MB limit)
- `meeting_recordings`: Private bucket for meeting recordings (500MB limit)
- `training_images`: Public bucket for training-related images (10MB limit)
- `training_content`: Private bucket for training materials (100MB limit)
- `certificates`: Public bucket for certificate PDFs and images (5MB limit)
- `badge_images`: Public bucket for achievement badge images (1MB limit)
- `generated_documents`: Private bucket for system-generated documents (20MB limit)

### Notes

- If a bucket already exists, the script will skip creating it
- Each bucket has specific allowed MIME types and file size limits
- Public buckets allow anonymous access to files, while private buckets require authentication

## Storage Policies Setup Script

The `setup-storage-policies.js` script configures Row Level Security (RLS) policies for the storage buckets to ensure proper access control.

### Prerequisites

- Node.js installed
- Supabase project URL and anon key (found in the Supabase dashboard under Project Settings > API)
- Storage buckets must be created first (run `create-storage-buckets.js` before this script)

### Usage

1. Go to the Supabase dashboard: https://app.supabase.com/
2. Select your project: `zportal`
3. Navigate to Project Settings > API
4. Copy the URL and anon key (public API key)
5. Run the script with the environment variables:

```bash
SUPABASE_URL=your_supabase_url SUPABASE_ANON_KEY=your_anon_key node scripts/setup-storage-policies.js
```

### Policies Configured

The script sets up the following types of policies for each bucket:

- **Public Buckets** (`company_logos`, `user_avatars`, `training_images`, `certificates`, `badge_images`):
  - Allow anonymous read access
  - Allow staff users to upload, update, and delete files
  - For `user_avatars`, allow users to manage their own avatars

- **Private Buckets** (`task_attachments`, `meeting_recordings`, `training_content`, `generated_documents`):
  - Restrict read access to authenticated users with appropriate permissions
  - Enforce company-based access control
  - Allow staff users to manage all files
  - Allow regular users to manage their own files where appropriate

### Notes

- The script will remove any existing policies before creating new ones
- Policies use SQL expressions to enforce access control based on user roles and relationships
- The policies integrate with the database schema to enforce complex access rules
