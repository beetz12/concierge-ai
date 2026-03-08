# AI Concierge API

Node.js Fastify backend with Supabase integration and a LiveKit-first call control plane.

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

Edit `.env` and add your Supabase credentials plus the call runtime settings:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
CALL_RUNTIME_PROVIDER=livekit
LIVEKIT_ENABLED=true
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
VOICE_AGENT_SHARED_SECRET=choose-a-shared-secret
VOICE_AGENT_SERVICE_URL=http://127.0.0.1:8787

# Optional fallback only
VAPI_ENABLED=false
# VAPI_API_KEY=your-vapi-api-key
# VAPI_PHONE_NUMBER_ID=your-vapi-phone-number-id
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

**Provider Call (LiveKit dispatch by default, VAPI fallback optional):**

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

**Contractor Call Preview:**

```bash
curl -X POST http://localhost:8000/api/v1/voice/preview-call \
  -H "Content-Type: application/json" \
  -d '{"mode":"qualification","contractorName":"Acme Lawn Care","contractorPhone":"+18035550123","serviceNeeded":"lawn service","location":"Greenville, SC","problemDescription":"The client wants recurring mowing and edging.","mustAskQuestions":["Do you offer weekly mowing and edging?","Are you insured?"],"dealBreakers":["No proof of insurance"]}'
```

**Contractor Call Dispatch:**

```bash
curl -X POST http://localhost:8000/api/v1/voice/call-contractor \
  -H "Content-Type: application/json" \
  -d '{"mode":"qualification","contractorName":"Acme Lawn Care","contractorPhone":"+18035550123","serviceNeeded":"lawn service","location":"Greenville, SC","problemDescription":"The client wants recurring mowing and edging.","mustAskQuestions":["Do you offer weekly mowing and edging?","Are you insured?"],"dealBreakers":["No proof of insurance"]}'
```

**Contractor Call Session Status:**

```bash
curl http://localhost:8000/api/v1/voice/calls/<sessionId>
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
│   │   ├── voice-calls.ts    # Public contractor-call preview/dispatch/status routes
│   │   ├── voice-tools.ts    # Internal tool routes for the voice-agent service
│   │   ├── vapi-webhook.ts   # VAPI webhook handler
│   │   └── users.ts          # User CRUD endpoints
│   ├── services/             # Business logic
│   │   ├── calls/            # Runtime routing and booking dispatch
│   │   ├── vapi/             # VAPI fallback services
│   │   │   ├── assistant-config.ts    # VAPI assistant configuration (single source of truth)
│   │   │   ├── direct-vapi.client.ts  # Direct VAPI SDK integration
│   │   │   ├── concurrent-call.service.ts  # Batch concurrent calls
│   │   │   └── call-result.service.ts # Database persistence
│   │   ├── direct-task/      # Direct task analysis
│   │   │   ├── analyzer.ts   # Task type classification
│   │   │   └── prompt-generator.ts  # Dynamic prompt generation
│   │   ├── research/         # Provider research
│   │   ├── voice/            # Contractor-call orchestration service
│   │   └── places/           # Google Places integration
│   ├── lib/                  # Shared libraries
│   └── plugins/              # Fastify plugins
└── SUPABASE_SETUP.md         # Detailed Supabase guide
```

## Features

- **Fastify 5** - High-performance web framework
- **Supabase** - PostgreSQL database with real-time capabilities
- **Google Gemini** - AI-powered research with Google Maps grounding
- **LiveKit-first runtime** - Default voice orchestration path
- **VAPI.ai** - Optional fallback runtime behind env flags
- **Kestra** - Workflow orchestration (optional)
- **TypeScript** - Type-safe development
- **Zod** - Runtime validation
- **Swagger** - API documentation at `/docs`

## Call Runtime

The API now treats `livekit` as the default call runtime and `vapi` as an opt-in fallback.

- `CALL_RUNTIME_PROVIDER=livekit` routes provider calls to the `apps/voice-agent` service
- `VAPI_ENABLED=false` is the intended default posture
- startup logs print the selected runtime, LiveKit readiness, and whether VAPI fallback is enabled
- booking and provider routes no longer instantiate VAPI clients directly; runtime-specific execution lives in `src/services/calls/*`

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

### Verification

Repeatable verification commands for the LiveKit-first runtime and the VAPI fallback:

```bash
# Unit and integration-style verification
pnpm --filter api test
pnpm --filter voice-agent test

# Type safety across both services
pnpm --filter api check-types
pnpm --filter voice-agent check-types
```

Manual runtime verification:

```bash
# 1. Start the API in demo mode with LiveKit selected
PORT=8031 \
DEMO_MODE=true \
CALL_RUNTIME_PROVIDER=livekit \
LIVEKIT_ENABLED=true \
LIVEKIT_URL=wss://example.livekit.invalid \
LIVEKIT_API_KEY=test-livekit-key \
LIVEKIT_API_SECRET=test-livekit-secret \
VOICE_AGENT_SHARED_SECRET=obs-secret \
pnpm --filter api exec tsx src/index.ts

# 2. Start the voice-agent against the internal tool API
VOICE_AGENT_PORT=8791 \
CALL_RUNTIME_PROVIDER=livekit \
VOICE_AGENT_API_BASE_URL=http://127.0.0.1:8031/api/v1/voice-tools \
VOICE_AGENT_SHARED_SECRET=obs-secret \
pnpm --filter voice-agent exec tsx src/index.ts

# 3. Confirm voice-agent health and diagnostics
curl http://127.0.0.1:8791/health
curl -H 'x-voice-agent-key: obs-secret' http://127.0.0.1:8791/diagnostics
curl -H 'x-voice-agent-key: obs-secret' http://127.0.0.1:8791/diagnostics/failures

# 4. Confirm persisted recent events from the API side
curl -H 'x-voice-agent-key: obs-secret' \
  'http://127.0.0.1:8031/api/v1/voice-tools/diagnostics/recent-events?limit=5'

# 5. Verify the VAPI fallback path via tests or by setting:
CALL_RUNTIME_PROVIDER=vapi
VAPI_ENABLED=true
VAPI_API_KEY=your-vapi-api-key
VAPI_PHONE_NUMBER_ID=your-vapi-phone-number-id
```

### Production

```bash
pnpm start
```

## Documentation

- [Supabase Setup Guide](./SUPABASE_SETUP.md) - Complete Supabase integration guide
- [LiveKit Rollout and Rollback](/Users/dave/Work/concierge-ai/docs/LIVEKIT_ROLLOUT_AND_ROLLBACK.md) - staged rollout plus env-only rollback procedure
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
| `CALL_RUNTIME_PROVIDER`     | `livekit` or `vapi`                  | Yes      |
| `LIVEKIT_ENABLED`           | Enable LiveKit runtime               | Yes      |
| `LIVEKIT_URL`               | LiveKit server URL                   | Yes for `livekit` |
| `LIVEKIT_API_KEY`           | LiveKit API key                      | Yes for `livekit` |
| `LIVEKIT_API_SECRET`        | LiveKit API secret                   | Yes for `livekit` |
| `VOICE_AGENT_SHARED_SECRET` | Shared secret for API ↔ voice-agent  | Yes for `livekit` |
| `VOICE_AGENT_SERVICE_URL`   | Voice-agent base URL                 | No       |
| `VAPI_ENABLED`              | Enable VAPI fallback                 | No       |
| `VAPI_API_KEY`              | VAPI.ai API key                      | Yes for `vapi` |
| `VAPI_PHONE_NUMBER_ID`      | VAPI outbound phone number ID        | Yes for `vapi` |
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
