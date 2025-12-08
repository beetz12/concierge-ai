# Supabase Integration Guide

This guide explains how to set up and use Supabase in the Fastify backend.

## Overview

The API integrates with Supabase using the `@supabase/supabase-js` client library. The integration provides:

- **Admin client** with service role key (bypasses RLS)
- **Fastify plugin** for dependency injection
- **Type-safe** database access
- **Request decorators** for easy access in routes
- **Example routes** demonstrating CRUD operations

## Setup Instructions

### 1. Install Dependencies

Dependencies are already installed via pnpm:
```bash
pnpm add @supabase/supabase-js fastify-plugin
```

### 2. Configure Environment Variables

Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```

Update the following variables with your Supabase project credentials:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Finding your credentials:**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to Settings > API
4. Copy the `URL` and `service_role` key (not the anon key!)

**Security Warning:** The service role key bypasses Row Level Security. Never expose it in client-side code!

### 3. Create Database Tables

Create a `users` table in your Supabase database (example):

```sql
-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies (optional, bypassed by service role key)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Example policy: Allow service role full access
CREATE POLICY "Service role has full access"
  ON users
  FOR ALL
  USING (auth.role() = 'service_role');
```

## Architecture

### File Structure

```
apps/api/src/
├── lib/
│   └── supabase.ts          # Supabase client factory
├── plugins/
│   └── supabase.ts          # Fastify plugin
├── routes/
│   └── users.ts             # Example CRUD routes
└── index.ts                 # Main server file
```

### Supabase Client (`src/lib/supabase.ts`)

The client is created with:
- **Singleton pattern** - single instance reused across requests
- **Service role key** - bypasses RLS for backend operations
- **Type definitions** - Database type for TypeScript support
- **Auto-refresh disabled** - optimized for backend usage

```typescript
import { getSupabaseAdmin, getTypedSupabaseAdmin } from './lib/supabase.js';

// Untyped client
const supabase = getSupabaseAdmin();

// Typed client (recommended)
const supabase = getTypedSupabaseAdmin();
```

### Fastify Plugin (`src/plugins/supabase.ts`)

Registers the Supabase client as:
- **Instance decorator** - `fastify.supabase`
- **Request decorator** - `request.supabase`

The plugin also validates the connection on startup.

### Type Definitions

Update `src/lib/supabase.ts` to add your database schema types:

```typescript
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      // Add more tables here...
    };
  };
};
```

**Pro tip:** Generate types automatically from your Supabase schema:
```bash
npx supabase gen types typescript --project-id your-project-ref > src/types/database.ts
```

## Usage Examples

### Basic Query in Route Handler

```typescript
import { FastifyPluginAsync } from 'fastify';

const myRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/my-data', async (request, reply) => {
    const { data, error } = await request.supabase
      .from('users')
      .select('*')
      .limit(10);

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return { data };
  });
};

export default myRoutes;
```

### Insert Data

```typescript
const { data, error } = await request.supabase
  .from('users')
  .insert([
    { email: 'user@example.com', name: 'John Doe' }
  ])
  .select()
  .single();
```

### Update Data

```typescript
const { data, error } = await request.supabase
  .from('users')
  .update({ name: 'Jane Doe' })
  .eq('id', userId)
  .select()
  .single();
```

### Delete Data

```typescript
const { error } = await request.supabase
  .from('users')
  .delete()
  .eq('id', userId);
```

### Complex Queries

```typescript
// With filters, ordering, and pagination
const { data, error, count } = await request.supabase
  .from('users')
  .select('*', { count: 'exact' })
  .ilike('email', '%@example.com')
  .order('created_at', { ascending: false })
  .range(0, 9);

// With relationships (joins)
const { data, error } = await request.supabase
  .from('users')
  .select(`
    *,
    posts (
      id,
      title,
      created_at
    )
  `)
  .eq('id', userId);
```

### Error Handling

```typescript
const { data, error } = await request.supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .single();

if (error) {
  // Handle specific error codes
  if (error.code === 'PGRST116') {
    return reply.status(404).send({ error: 'Not found' });
  }

  if (error.code === '23505') {
    return reply.status(409).send({ error: 'Duplicate entry' });
  }

  // Generic error
  fastify.log.error({ error }, 'Database error');
  return reply.status(500).send({ error: 'Database error' });
}
```

## API Endpoints

The example user routes demonstrate full CRUD operations:

### GET /api/v1/users
Get all users with pagination
```bash
curl http://localhost:8000/api/v1/users?limit=10&offset=0
```

### GET /api/v1/users/:id
Get a single user by ID
```bash
curl http://localhost:8000/api/v1/users/123e4567-e89b-12d3-a456-426614174000
```

### POST /api/v1/users
Create a new user
```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","name":"John Doe"}'
```

### PATCH /api/v1/users/:id
Update a user
```bash
curl -X PATCH http://localhost:8000/api/v1/users/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe"}'
```

### DELETE /api/v1/users/:id
Delete a user
```bash
curl -X DELETE http://localhost:8000/api/v1/users/123e4567-e89b-12d3-a456-426614174000
```

## Testing

### Manual Testing

1. Start the server:
```bash
pnpm dev
```

2. Test the health endpoint:
```bash
curl http://localhost:8000/health
```

3. Test user endpoints (after setting up database):
```bash
# Create a user
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'

# Get all users
curl http://localhost:8000/api/v1/users
```

### Automated Testing

Add test files using Vitest or Jest (future enhancement):

```typescript
import { test } from '@jest/globals';
import { buildApp } from './app';

test('GET /api/v1/users returns users', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/users'
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toHaveProperty('data');
});
```

## Security Best Practices

1. **Never expose service role key in client-side code**
2. **Use environment variables** for all secrets
3. **Implement proper authorization** checks in routes
4. **Validate all input** using Zod or similar
5. **Use RLS policies** for additional security layer
6. **Log sensitive operations** for audit trails
7. **Implement rate limiting** for public endpoints

## Common Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| PGRST116 | No rows found | 404 |
| 23505 | Unique constraint violation | 409 |
| 23503 | Foreign key constraint violation | 400 |
| 42P01 | Table does not exist | 500 |

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env` file exists with correct variables
- Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

### "relation 'users' does not exist"
- Create the users table in your Supabase database
- Check table name matches exactly (case-sensitive)

### Connection timeout
- Verify your Supabase project is not paused
- Check network connectivity
- Verify URL and key are correct

### Plugin initialization failed
- Check server logs for detailed error messages
- Verify credentials are correct
- Test connection directly in Supabase SQL editor

## Resources

- [Supabase JavaScript Client Docs](https://supabase.com/docs/reference/javascript/introduction)
- [Fastify Documentation](https://fastify.dev/)
- [Supabase Dashboard](https://app.supabase.com)
- [TypeScript Support](https://supabase.com/docs/reference/javascript/typescript-support)

## Next Steps

1. Generate TypeScript types from your database schema
2. Add authentication middleware
3. Implement rate limiting
4. Add request validation
5. Set up automated testing
6. Add database migrations
7. Implement real-time subscriptions (if needed)
