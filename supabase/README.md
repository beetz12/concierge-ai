# Supabase Setup for Concierge AI

This directory contains the Supabase configuration and database migrations for the Concierge AI application.

## Quick Start

### Option 1: Supabase Cloud (Recommended for Production)

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Click "New Project"
   - Choose a name, database password, and region

2. **Get Your Credentials**
   - Go to Project Settings > API
   - Copy your `Project URL` and `anon/public` key
   - Add them to `/apps/web/.env.local`:
     ```bash
     NEXT_PUBLIC_SUPABASE_URL=your_project_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
     ```

3. **Run the Migration**
   - Go to SQL Editor in your Supabase dashboard
   - Copy the contents of `/supabase/migrations/20250101000000_initial_schema.sql`
   - Paste and run it in the SQL Editor

4. **Enable Realtime** (Optional)
   - Go to Database > Replication
   - Enable replication for tables you want to use with real-time subscriptions

### Option 2: Local Development with Supabase CLI

1. **Install Supabase CLI**

   ```bash
   npm install -g supabase
   ```

2. **Initialize Supabase**

   ```bash
   # From project root
   supabase init
   ```

3. **Start Supabase Locally**

   ```bash
   supabase start
   ```

   This will output your local credentials. Add them to `/apps/web/.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
   ```

4. **Run Migrations**

   ```bash
   supabase db reset
   ```

5. **Access Local Services**
   - Studio: http://localhost:54323
   - API: http://localhost:54321
   - DB: postgresql://postgres:postgres@localhost:54322/postgres

## Database Schema

The database consists of four main tables:

### users

Stores user profile information (extends Supabase auth.users)

- `id` (UUID, PK) - References auth.users
- `email` (TEXT) - User email
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### service_requests

Main table for service requests

- `id` (UUID, PK)
- `user_id` (UUID, FK) - References users
- `type` (ENUM) - RESEARCH_AND_BOOK | DIRECT_TASK
- `title` (TEXT)
- `description` (TEXT)
- `criteria` (TEXT)
- `location` (TEXT, nullable)
- `status` (ENUM) - PENDING | SEARCHING | CALLING | ANALYZING | COMPLETED | FAILED
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)
- `selected_provider_id` (UUID, FK, nullable) - References providers
- `final_outcome` (TEXT, nullable)
- `direct_contact_info` (JSONB, nullable)

### providers

Stores service providers found for each request

- `id` (UUID, PK)
- `request_id` (UUID, FK) - References service_requests
- `name` (TEXT)
- `phone` (TEXT, nullable)
- `rating` (DECIMAL, nullable)
- `address` (TEXT, nullable)
- `source` (ENUM, nullable) - 'Google Maps' | 'User Input'
- `created_at` (TIMESTAMPTZ)

### interaction_logs

Logs of AI interactions and processing steps

- `id` (UUID, PK)
- `request_id` (UUID, FK) - References service_requests
- `timestamp` (TIMESTAMPTZ)
- `step_name` (TEXT)
- `detail` (TEXT)
- `transcript` (JSONB, nullable)
- `status` (ENUM) - success | warning | error | info
- `created_at` (TIMESTAMPTZ)

## Row Level Security (RLS)

The schema includes RLS policies that:

- Allow users to only view/modify their own data
- Support anonymous requests (user_id can be NULL)
- Cascade permissions through foreign key relationships

## Realtime Subscriptions

All tables are enabled for Realtime, allowing you to:

- Listen for INSERT, UPDATE, DELETE operations
- Build real-time UIs that update automatically
- Track request status changes in real-time

Example:

```tsx
const channel = supabase
  .channel("request_changes")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "service_requests" },
    (payload) => console.log(payload),
  )
  .subscribe();
```

## Useful Commands

```bash
# Generate TypeScript types from your schema
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > apps/web/lib/types/database.ts

# Create a new migration
supabase migration new migration_name

# Apply migrations
supabase db push

# Reset local database
supabase db reset

# Stop local Supabase
supabase stop
```

## Authentication Setup

The schema includes a trigger that automatically creates a user profile when someone signs up. To enable authentication in your app:

1. **Configure Auth Providers** in Supabase Dashboard
   - Email/Password (enabled by default)
   - OAuth providers (Google, GitHub, etc.)

2. **Update Site URL** in Authentication > URL Configuration
   - Production: your production URL
   - Development: http://localhost:3000

3. **Use the SupabaseProvider** in your app

   ```tsx
   // In your root layout
   import { SupabaseProvider } from "@/lib/providers/SupabaseProvider";

   export default function RootLayout({ children }) {
     return <SupabaseProvider>{children}</SupabaseProvider>;
   }
   ```

## Migrating from LocalStorage

If you have existing data in localStorage, you can migrate it to Supabase:

1. **Export localStorage data**
2. **Create a migration script** to insert data
3. **Run the script** using a Server Action or API route

Example migration script:

```tsx
"use server";

import { createClient } from "@/lib/supabase/server";

export async function migrateLocalStorageData(requests: any[]) {
  const supabase = await createClient();

  for (const request of requests) {
    await supabase.from("service_requests").insert({
      title: request.title,
      description: request.description,
      criteria: request.criteria,
      type: request.type,
      status: request.status,
      // ... other fields
    });
  }
}
```

## Troubleshooting

**Cannot connect to Supabase**

- Check your environment variables are set correctly
- Verify your Supabase project is running (for cloud)
- Make sure `supabase start` is running (for local)

**RLS Policy Errors**

- Check if you're authenticated (for protected routes)
- Verify the user_id matches the authenticated user
- Consider allowing NULL user_id for anonymous access

**Type Errors**

- Regenerate types: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID`
- Make sure database.ts is up to date with your schema

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [Next.js Integration Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
