# AI Concierge API

Node.js Fastify backend with Supabase integration.

## Quick Start

### 1. Install Dependencies

From the project root:

```bash
pnpm install
```

### 2. Configure Environment

```bash
cd apps/api
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Set Up Database

You have two options for running migrations:

#### Option A: Supabase CLI (Recommended)

```bash
# Install Supabase CLI globally
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project (from project root)
cd /path/to/concierge-ai
supabase link --project-ref dsxuwpluafxyjwrhepsw

# Push migrations to remote database
supabase db push

# Or reset database and re-apply all migrations
supabase db reset --linked
```

#### Option B: Manual SQL Execution

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/dsxuwpluafxyjwrhepsw/sql/new)
2. Copy the contents of `supabase/migrations/20250101000000_initial_schema.sql`
3. Click **Run**

### 4. Start Development Server

```bash
pnpm dev
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Health Check

```bash
curl http://localhost:8000/health
```

### Users API

**Get all users:**

```bash
curl http://localhost:8000/api/v1/users
```

**Get user by ID:**

```bash
curl http://localhost:8000/api/v1/users/{uuid}
```

**Create user:**

```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'
```

**Update user:**

```bash
curl -X PATCH http://localhost:8000/api/v1/users/{uuid} \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}'
```

**Delete user:**

```bash
curl -X DELETE http://localhost:8000/api/v1/users/{uuid}
```

## Project Structure

```
apps/api/
├── migrations/           # Database migrations
├── scripts/             # Utility scripts
├── src/
│   ├── index.ts        # Main server entry point
│   ├── lib/            # Shared libraries
│   │   └── supabase.ts # Supabase client factory
│   ├── plugins/        # Fastify plugins
│   │   └── supabase.ts # Supabase plugin
│   └── routes/         # API route handlers
│       └── users.ts    # User CRUD endpoints
└── SUPABASE_SETUP.md   # Detailed Supabase guide
```

## Features

- **Fastify** - High-performance web framework
- **Supabase** - PostgreSQL database with real-time capabilities
- **TypeScript** - Type-safe development
- **Zod** - Runtime validation
- **CORS & Helmet** - Security middleware
- **Pino** - Structured logging

## Database Migrations

### Creating New Migrations

Using Supabase CLI (recommended):

```bash
# Create a new migration file
supabase migration new add_appointments_table

# This creates: supabase/migrations/YYYYMMDDHHMMSS_add_appointments_table.sql
# Edit the file with your SQL changes, then push:
supabase db push
```

### Migration File Naming Convention

```
supabase/migrations/
├── 20250101000000_initial_schema.sql
├── 20250115120000_add_appointments_table.sql
└── 20250201090000_add_user_preferences.sql
```

Format: `YYYYMMDDHHMMSS_description.sql`

### Useful Commands

```bash
# View migration status
supabase migration list

# Generate TypeScript types from your schema
supabase gen types typescript --linked > src/lib/database.types.ts

# Pull remote schema changes (if made via dashboard)
supabase db pull

# Diff local vs remote schema
supabase db diff
```

## Development

### Type Checking

```bash
pnpm check-types
```

### Linting

```bash
pnpm lint
```

### Build

```bash
pnpm build
```

### Production

```bash
pnpm start
```

## Documentation

- [Supabase Setup Guide](./SUPABASE_SETUP.md) - Complete Supabase integration guide
- [Fastify Documentation](https://fastify.dev/)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)

## Environment Variables

| Variable                    | Description               | Required                            |
| --------------------------- | ------------------------- | ----------------------------------- |
| `PORT`                      | Server port               | No (default: 8000)                  |
| `NODE_ENV`                  | Environment               | No (default: development)           |
| `CORS_ORIGIN`               | Allowed CORS origin       | No (default: http://localhost:3000) |
| `SUPABASE_URL`              | Supabase project URL      | Yes                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes                                 |

## Security

- Service role key bypasses Row Level Security (RLS)
- Never expose service role key in client-side code
- Implement authorization checks in route handlers
- Use environment variables for all secrets
- Enable RLS policies for additional security

## Next Steps

1. Generate TypeScript types from your database schema (see SUPABASE_SETUP.md)
2. Add authentication middleware
3. Implement rate limiting
4. Add automated tests
5. Set up CI/CD pipeline

## Support

For issues and questions:

- Check [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed setup instructions
- Review [Fastify documentation](https://fastify.dev/)
- Consult [Supabase documentation](https://supabase.com/docs)
