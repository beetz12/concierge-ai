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
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations to remote database
supabase db push

# Or reset database and re-apply all migrations
supabase db reset --linked
```

#### Option B: Manual SQL Execution

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new)
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

### Core AI Endpoints

**Provider Research (Gemini + Google Maps grounding):**

```bash
curl -X POST http://localhost:8000/api/v1/gemini/search-providers \
  -H "Content-Type: application/json" \
  -d '{"query":"plumber in Greenville SC","criteria":"licensed, 4.5+ rating"}'
```

**Provider Call (VAPI.ai voice AI):**

```bash
curl -X POST http://localhost:8000/api/v1/providers/call \
  -H "Content-Type: application/json" \
  -d '{"providerName":"ABC Plumbing","providerPhone":"+15551234567","serviceNeeded":"plumbing","userCriteria":"licensed","location":"Greenville SC","urgency":"within_2_days"}'
```

**Batch Concurrent Calls:**

```bash
curl -X POST http://localhost:8000/api/v1/providers/batch-call \
  -H "Content-Type: application/json" \
  -d '{"providers":[{"name":"ABC Plumbing","phone":"+15551234567"}],"serviceNeeded":"plumbing","maxConcurrent":5}'
```

**Direct Task Analysis (Dynamic Prompts):**

```bash
curl -X POST http://localhost:8000/api/v1/gemini/analyze-direct-task \
  -H "Content-Type: application/json" \
  -d '{"taskDescription":"negotiate my cable bill","contactName":"Comcast","contactPhone":"+18005551234"}'
```

**Call Status:**

```bash
curl http://localhost:8000/api/v1/providers/call/status
```

### API Documentation

Full interactive API docs are available at:
- **Local:** http://localhost:8000/docs
- **Production:** https://api-production-8fe4.up.railway.app/docs

## Project Structure

```
apps/api/
├── src/
│   ├── index.ts              # Main server entry point
│   ├── routes/               # API route handlers
│   │   ├── gemini.ts         # AI research endpoints
│   │   ├── providers.ts      # Provider calling endpoints
│   │   ├── vapi-webhook.ts   # VAPI webhook handler
│   │   └── users.ts          # User CRUD endpoints
│   ├── services/             # Business logic
│   │   ├── vapi/             # VAPI calling services
│   │   │   ├── assistant-config.ts    # VAPI assistant configuration (single source of truth)
│   │   │   ├── direct-vapi.client.ts  # Direct VAPI SDK integration
│   │   │   ├── concurrent-call.service.ts  # Batch concurrent calls
│   │   │   └── call-result.service.ts # Database persistence
│   │   ├── direct-task/      # Direct task analysis
│   │   │   ├── analyzer.ts   # Task type classification
│   │   │   └── prompt-generator.ts  # Dynamic prompt generation
│   │   ├── research/         # Provider research
│   │   └── places/           # Google Places integration
│   ├── lib/                  # Shared libraries
│   └── plugins/              # Fastify plugins
└── SUPABASE_SETUP.md         # Detailed Supabase guide
```

## Features

- **Fastify 5** - High-performance web framework
- **Supabase** - PostgreSQL database with real-time capabilities
- **Google Gemini** - AI-powered research with Google Maps grounding
- **VAPI.ai** - Automated voice calls to service providers
- **Kestra** - Workflow orchestration (optional)
- **TypeScript** - Type-safe development
- **Zod** - Runtime validation
- **Swagger** - API documentation at `/docs`

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

| Variable                    | Description                          | Required |
| --------------------------- | ------------------------------------ | -------- |
| `PORT`                      | Server port (default: 8000)          | No       |
| `NODE_ENV`                  | Environment (default: development)   | No       |
| `CORS_ORIGIN`               | Allowed CORS origin                  | No       |
| `SUPABASE_URL`              | Supabase project URL                 | Yes      |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key            | Yes      |
| `GEMINI_API_KEY`            | Google Gemini API key                | Yes      |
| `VAPI_API_KEY`              | VAPI.ai API key                      | Yes      |
| `VAPI_PHONE_NUMBER_ID`      | VAPI outbound phone number ID        | Yes      |
| `VAPI_WEBHOOK_URL`          | Webhook URL for call results         | No       |
| `VAPI_MAX_CONCURRENT_CALLS` | Max concurrent calls (default: 5)    | No       |
| `KESTRA_ENABLED`            | Enable Kestra orchestration          | No       |
| `KESTRA_URL`                | Kestra server URL                    | No       |
| `BACKEND_URL`               | Backend URL for internal calls       | No       |

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
