# Supabase Integration

This directory contains the Supabase client configuration for the Concierge AI application.

## Files

- **client.ts** - Supabase client for Client Components (browser-side)
- **server.ts** - Supabase client for Server Components, Server Actions, and Route Handlers
- **middleware.ts** - Middleware helper for refreshing user sessions

## Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)

2. Copy `.env.local.example` to `.env.local` and add your Supabase credentials:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

3. Run the database migrations (see `/supabase/migrations` directory in the project root)

## Usage Examples

### Client Components

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/lib/types/database';

export function RequestsList() {
  const [requests, setRequests] = useState<Tables<'service_requests'>[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const fetchRequests = async () => {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setRequests(data);
    };

    fetchRequests();
  }, []);

  return (
    <div>
      {requests.map(request => (
        <div key={request.id}>{request.title}</div>
      ))}
    </div>
  );
}
```

### Server Components

```tsx
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/types/database';

export async function RequestsPage() {
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from('service_requests')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div>
      {requests?.map(request => (
        <div key={request.id}>{request.title}</div>
      ))}
    </div>
  );
}
```

### Server Actions

```tsx
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createRequest(formData: FormData) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('service_requests')
    .insert({
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      criteria: formData.get('criteria') as string,
      type: 'RESEARCH_AND_BOOK',
      status: 'PENDING',
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/requests');
  return data;
}
```

### Real-time Subscriptions

```tsx
'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function RealtimeRequests() {
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel('service_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_requests',
        },
        (payload) => {
          console.log('Change received!', payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return <div>Listening for changes...</div>;
}
```

## Database Schema

The database types are defined in `/lib/types/database.ts`. These types are based on the application's data models and should be kept in sync with your Supabase schema.

To auto-generate types from your Supabase schema:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/types/database.ts
```

## Middleware Setup (Optional)

If you want to protect routes or refresh user sessions automatically, create a `middleware.ts` file in the app root:

```tsx
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

## Authentication

Supabase provides built-in authentication. Here's a simple example:

```tsx
'use client';

import { createClient } from '@/lib/supabase/client';

export function AuthForm() {
  const supabase = createClient();

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    // Your auth form UI
    <div>Auth form goes here</div>
  );
}
```

## Best Practices

1. **Use Server Components by default** - Fetch data in Server Components when possible for better performance
2. **Client Components for interactivity** - Use Client Components only when you need interactivity or browser APIs
3. **Server Actions for mutations** - Use Server Actions for creating, updating, and deleting data
4. **Real-time subscriptions in Client Components** - Set up real-time listeners in Client Components
5. **Type safety** - Always use the generated database types for type safety
6. **Error handling** - Always check for errors in Supabase responses
7. **RLS Policies** - Set up Row Level Security policies in Supabase for data protection

## Resources

- [Supabase Docs](https://supabase.com/docs)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
