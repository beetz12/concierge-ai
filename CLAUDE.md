# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Concierge - An AI receptionist/secretary that researches local service providers and books appointments. Users submit requests (e.g., "find a plumber in Greenville SC"), the AI searches providers via Google Maps grounding, makes real phone calls (VAPI.ai) to verify availability/rates, recommends the **top 3 providers** with AI reasoning, and lets the user select which provider to book.

**Two Request Types:**
- **Research & Book** (`/new`) - Full flow: research → call → recommend top 3 → user selects → book
- **Direct Task** (`/direct`) - Single call with dynamic prompts (negotiate, complain, inquire, etc.)

## Commands

```bash
# Development (starts both web:3000 and api:8000)
pnpm dev

# Run individual apps
pnpm --filter web dev      # Next.js frontend
pnpm --filter api dev      # Fastify backend

# Build & Type Check
pnpm build                 # Build all apps
pnpm check-types           # TypeScript checking
pnpm lint                  # ESLint
pnpm format                # Prettier formatting

# Database
supabase db push           # Push migrations to remote
supabase db reset          # Reset local database
supabase gen types typescript --linked > packages/types/database.ts
```

## Architecture

### Monorepo Structure (Turborepo + pnpm)

```
apps/
├── web/          # Next.js 16 (React 19) - Port 3000
│   ├── app/      # App Router pages
│   └── lib/      # Services, hooks, providers, types
└── api/          # Fastify 5 - Port 8000
    ├── routes/   # API endpoints
    └── services/ # Business logic (Gemini AI)

packages/
├── ui/                  # Shared React components
├── types/               # Shared TypeScript types
├── eslint-config/       # Shared ESLint configs
└── typescript-config/   # Shared tsconfig bases
```

### API Flow

Frontend → Next.js rewrites `/api/*` → Backend (localhost:8000)

Key endpoints:

- `POST /api/v1/gemini/search-providers` - Google Maps grounded search
- `POST /api/v1/gemini/simulate-call` - AI phone call simulation
- `POST /api/v1/gemini/select-best-provider` - AI analysis
- `POST /api/v1/gemini/schedule-appointment` - Booking
- `POST /api/v1/gemini/analyze-direct-task` - AI task analysis for dynamic VAPI prompts

### State Management

- **AppProvider** (React Context + localStorage): Client-side request state
- **Supabase**: Server-side persistence with RLS and real-time subscriptions
- **Server Actions**: Database mutations with cache revalidation

### Address Capture

- **Google Places Autocomplete**: `/new` page captures full structured address (street, city, state, zip)
- **VAPI Integration**: `clientAddress` field flows through to AI prompts, enabling agents to provide real addresses when providers ask
- **Component**: `packages/ui/src/address-autocomplete.tsx` - reusable autocomplete with Google Places API

### Database (Supabase/PostgreSQL)

Tables: `users`, `service_requests`, `providers`, `interaction_logs`

Schema: `supabase/migrations/20250101000000_initial_schema.sql`

### Key Files

| Path                                             | Purpose                                        |
| ------------------------------------------------ | ---------------------------------------------- |
| `apps/web/lib/services/geminiService.ts`         | Frontend API client for AI operations          |
| `apps/api/src/services/gemini.ts`                | Backend Gemini AI integration                  |
| `apps/api/src/routes/gemini.ts`                  | API endpoints with Zod validation              |
| `apps/api/src/services/direct-task/types.ts`     | Direct Task type definitions                   |
| `apps/api/src/services/direct-task/analyzer.ts`  | Gemini-powered task analyzer                   |
| `apps/api/src/services/direct-task/prompt-generator.ts` | Dynamic VAPI prompt generation        |
| `apps/web/lib/providers/AppProvider.tsx`         | Global state management                        |
| `apps/web/lib/supabase/server.ts`                | Server-side Supabase client                    |
| `apps/api/src/services/vapi/direct-vapi.client.ts` | DirectVapiClient with hybrid webhook support |
| `apps/api/src/services/vapi/webhook-cache.service.ts` | In-memory cache for webhook results       |
| `apps/web/lib/actions/service-requests.ts`       | Server actions including `addProviders()`      |
| `packages/ui/src/address-autocomplete.tsx`       | Google Places autocomplete component           |

### Provider Persistence Pattern (Critical)

Providers are persisted to the database **immediately after research**, before VAPI calls:

```
Research → Provider[] with Place IDs → addProviders() → Database UUIDs → VAPI calls
```

**Why this matters:**
- Google Place IDs (e.g., `ChIJRURMfy-gVogRtM_hIBmcucM`) fail UUID validation
- Without database UUIDs, call results cannot be saved to provider records
- Real-time subscriptions only trigger on actual database changes

**Implementation** (`apps/web/app/new/page.tsx`):
1. Call `searchProvidersWorkflow()` → returns providers with Place IDs
2. Call `addProviders(providerInserts)` → returns records with generated UUIDs
3. Use `provider.id` (UUID) for all VAPI calls, not the original Place ID
4. Store original Place ID in `place_id` column for reference

This pattern covers **both** Kestra and Direct Gemini research paths.

## Environment Variables

**Backend (`apps/api/.env`):**

```
PORT=8000
CORS_ORIGIN=http://localhost:3000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
VAPI_API_KEY=...
VAPI_PHONE_NUMBER_ID=...
VAPI_WEBHOOK_URL=...              # Optional: enables hybrid webhook mode
BACKEND_URL=http://localhost:8000  # Internal URL for webhook cache polling
```

**Frontend (`apps/web/.env.local`):**

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=...       # Google Places API for address autocomplete
NEXT_PUBLIC_LIVE_CALL_ENABLED=true          # Enable real VAPI calls
NEXT_PUBLIC_ADMIN_TEST_PHONES=+1234,+5678   # Comma-separated test phones (recommended)
NEXT_PUBLIC_ADMIN_TEST_NUMBER=+1234         # Legacy single test phone (deprecated)
```

**Admin Test Phone Array** (`NEXT_PUBLIC_ADMIN_TEST_PHONES`):
- Comma-separated E.164 phone numbers for concurrent testing
- Limits providers called to the number of test phones
- Maps phones 1:1 to providers (Provider 1 → Phone 1, Provider 2 → Phone 2)
- Backward compatible: `ADMIN_TEST_NUMBER` still works if `ADMIN_TEST_PHONES` is not set

Note: Gemini API key is backend-only (not exposed to client).

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, TypeScript 5.9
- **Backend**: Fastify 5, Google GenAI SDK, Zod validation
- **Database**: Supabase (PostgreSQL with RLS, real-time)
- **AI**: Google Gemini 2.5 Flash with Google Maps grounding
- **Voice AI**: VAPI.ai for automated provider calling (concurrent calls supported)
- **Address Services**: Google Places API for autocomplete and geocoding
- **Workflow**: Kestra for orchestration (optional, with direct API fallback)

## VAPI Assistant Configuration

The VAPI calling system uses a single source of truth pattern to maintain DRY principles:

**Source of Truth**: `apps/api/src/services/vapi/assistant-config.ts`

- Contains the canonical assistant configuration
- Defines conversation flow, prompts, and analysis schema
- Used by both direct VAPI API calls and Kestra orchestration

**Hybrid Webhook Mode**: `apps/api/src/services/vapi/direct-vapi.client.ts`

DirectVapiClient supports a hybrid approach for optimal performance:

| Mode | When Active | Behavior |
|------|-------------|----------|
| **Hybrid (Webhook)** | `VAPI_WEBHOOK_URL` set | Uses webhooks as primary, polls backend cache every 2s |
| **Polling-only** | `VAPI_WEBHOOK_URL` not set | Uses direct VAPI API polling every 5s (original behavior) |

Benefits of hybrid mode:
- 31x fewer VAPI API calls when webhook works
- <500ms latency vs 2.5s average with polling
- Automatic database persistence via webhook infrastructure
- Graceful fallback to polling if webhook unavailable

**Kestra Scripts**: `kestra/scripts/call-provider.js`

- Imports configuration from compiled TypeScript: `apps/api/dist/services/vapi/assistant-config.js`
- No configuration duplication
- Ensures identical behavior across all execution paths

**Build Requirement**: Run `pnpm build` before using Kestra scripts

- The Kestra scripts require the TypeScript to be compiled
- Build compiles `apps/api/src` to `apps/api/dist`
- Without build, the script will fail with import error

**Key Features**:

- **Concurrent Calling**: Call up to 5 providers simultaneously via `VAPI_MAX_CONCURRENT_CALLS`
- **Disqualification Detection**: Politely exits calls when provider cannot meet requirements
- **Conditional Closing**: Uses callback script ("I'll call you back to schedule") only if ALL criteria met
- **Earliest Availability**: Captures specific date/time when provider can start work
- **Structured Data**: Returns typed results including `disqualified`, `disqualification_reason`, `earliest_availability`
- **Single Person Tracking**: Ensures all requirements met by ONE person, not different technicians
- **Top 3 Recommendations**: After calls complete, AI analyzes results and recommends top 3 providers with scores and reasoning
