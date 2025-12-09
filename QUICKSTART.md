# Supabase Integration - Quick Start Guide

## 5-Minute Setup

### 1. Install Dependencies (Already Done!)

```bash
pnpm add @supabase/supabase-js @supabase/ssr --filter web
```

### 2. Set Up Supabase Project

**Option A: Cloud (Recommended)**

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose name, password, and region
4. Wait for project to be ready (~2 minutes)
5. Go to Settings > API
6. Copy `Project URL` and `anon public` key

**Option B: Local Development**

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start
```

### 3. Configure Environment Variables

**Backend** (`/apps/api/.env`):

```bash
# Supabase (get from dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Gemini API (backend only - never expose to frontend)
GEMINI_API_KEY=your_gemini_api_key_here
```

**Frontend** (`/apps/web/.env.local`):

```bash
# Supabase (public keys only)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

> **Note:** The Gemini API key should ONLY be in the backend `.env` file. The frontend calls the backend API which handles all Gemini interactions securely.

### 4. Run Database Migration

**For Cloud:**

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Go to SQL Editor
3. Copy contents of `/supabase/migrations/20250101000000_initial_schema.sql`
4. Paste and click "Run"

**For Local:**

```bash
supabase db reset
```

### 5. Test the Integration

Create a test file or use the examples:

```tsx
// app/test/page.tsx
import { createClient } from "@/lib/supabase/server";

export default async function TestPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_requests")
    .select("*")
    .limit(10);

  return (
    <div>
      <h1>Test Supabase Connection</h1>
      {error ? (
        <p>Error: {error.message}</p>
      ) : (
        <p>Success! Found {data?.length || 0} requests</p>
      )}
    </div>
  );
}
```

## Common Operations

### Fetch Data (Server Component)

```tsx
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
const { data } = await supabase.from("service_requests").select("*");
```

### Fetch Data (Client Component)

```tsx
"use client";
import { useServiceRequests } from "@/lib/hooks/useServiceRequests";

const { requests, loading, error } = useServiceRequests();
```

### Create Record (Server Action)

```tsx
"use server";
import { createServiceRequest } from "@/lib/actions/service-requests";

await createServiceRequest({
  title: "Test Request",
  description: "Test description",
  criteria: "Test criteria",
  type: "RESEARCH_AND_BOOK",
  status: "PENDING",
});
```

### Update Record

```tsx
import { updateServiceRequest } from "@/lib/actions/service-requests";

await updateServiceRequest("request-id", {
  status: "COMPLETED",
});
```

## File Reference

### Core Files

- `/apps/web/lib/supabase/client.ts` - Browser client
- `/apps/web/lib/supabase/server.ts` - Server client
- `/apps/web/lib/supabase/queries.ts` - Pre-built queries
- `/apps/web/lib/actions/service-requests.ts` - Server Actions
- `/apps/web/lib/hooks/useServiceRequests.ts` - React hook
- `/apps/web/lib/types/database.ts` - TypeScript types

### Migration & Config

- `/supabase/migrations/20250101000000_initial_schema.sql` - Database schema
- `/supabase/config.toml` - Local config
- `/apps/web/.env.local.example` - Environment variables template

### Documentation

- `/supabase/README.md` - Detailed setup guide
- `/apps/web/lib/supabase/README.md` - Usage examples
- `/SUPABASE_INTEGRATION.md` - Complete integration overview

## Next Steps

1. Set up authentication (optional)
2. Enable real-time subscriptions
3. Migrate existing localStorage data
4. Add Row Level Security policies
5. Set up backup and monitoring

## Troubleshooting

**"Missing Supabase environment variables"**

- Check `.env.local` exists and has correct values
- Restart dev server after adding env vars

**"Failed to connect to database"**

- Verify project URL and anon key are correct
- Check Supabase project is running
- For local: run `supabase status`

**"Permission denied" errors**

- Check Row Level Security policies
- Verify user authentication (if required)
- Check user_id matches authenticated user

**Type errors**

- Run: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID`
- Update `/apps/web/lib/types/database.ts`

## Resources

- [Supabase Docs](https://supabase.com/docs)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

## Kestra Workflows

If you're using Kestra workflows that make VAPI calls, you must build the API first:

```bash
# Required before running Kestra scripts
pnpm build

# Or build just the API
pnpm --filter api build
```

Why? Kestra scripts import the shared VAPI assistant configuration from compiled TypeScript:

- Source: `apps/api/src/services/vapi/assistant-config.ts`
- Import: `apps/api/dist/services/vapi/assistant-config.js`
- This ensures DRY principle - no configuration duplication

## Support

For issues or questions:

1. Check the documentation files listed above
2. Review Supabase dashboard logs
3. Check browser console for errors
4. Review server logs

---

You're all set! The integration is complete and ready to use.
