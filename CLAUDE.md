# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Concierge - An AI receptionist/secretary that researches local service providers and books appointments. Users submit requests (e.g., "find a plumber in Greenville SC"), the AI searches providers via Google Maps grounding, makes real phone calls (VAPI.ai) to verify availability/rates, recommends the **top 3 providers** with AI reasoning, and lets the user select which provider to book.

**Two Request Types:**
- **Research & Book** (`/new`) - Full flow: research → call → recommend top 3 → user selects → book
- **Direct Task** (`/direct`) - Single call with dynamic prompts (negotiate, complain, inquire, etc.)

## Agent Directives

You are working on a project that uses Beads (`bd`) for persistent memory and issue tracking.

At the start of every session:
1. Run `bd ready --json` to see the highest-priority tasks that have no open blockers.
2. If there are tasks in progress from a previous session, retrieve their full details using `bd show <id>`.
3. Give me a brief summary of what we were working on and ask me which task we should tackle next.

When writing code:
- Always check if there is an existing Bead issue before making architectural changes.
- If you discover a new bug or edge case, use `bd create` to log it instead of keeping it in context.

When ending a session:
- Use `/session-to-beads` to capture remaining work, bugs, and decisions as structured Beads issues.
- Run `bd sync` to persist changes.

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

### Provider Intel Pipeline

The research and recommendation path now has an explicit staged architecture:

1. `Google Places API` for primary candidate discovery
2. `Google Places details` for phone, website, hours, and identity anchors
3. `Brave Search` for off-platform reputation discovery
4. `Gemini` for review-theme extraction, contradiction detection, and risk analysis
5. `RecommendationService` for final scoring that combines call results with provider-intel evidence

Important rules:
- Do not replace Places with generic web search for initial local candidate discovery
- Treat review contradictions as ranking penalties, not trivia
- Penalize low identity confidence, trade mismatch, thin review volume, and serious complaint patterns
- Persist provider-intel evidence so the web app can render strengths, risks, and confidence instead of only raw scores

## Environment Variables

**Backend (`apps/api/.env`):**

```
PORT=8000
CORS_ORIGIN=http://localhost:3000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GOOGLE_PLACES_API_KEY=...
BRAVE_SEARCH_API_KEY=...
VAPI_API_KEY=...
VAPI_PHONE_NUMBER_ID=...
VAPI_WEBHOOK_URL=...              # Optional: enables hybrid webhook mode
BACKEND_URL=http://localhost:8000  # Internal URL for webhook cache polling
VAPI_ADVANCED_SCREENING=false     # Toggle advanced provider screening (see below)
VAPI_USE_REALTIME=false           # Toggle OpenAI Realtime mode (see below)
VAPI_REALTIME_VOICE=marin         # Voice selection for Realtime mode
```

`GOOGLE_PLACES_API_KEY` is required for the Places-first provider discovery path.
`BRAVE_SEARCH_API_KEY` is optional for demos but required for full web-reputation enrichment in production.

**VAPI Voice Modes** (`VAPI_USE_REALTIME`):
- `false` (default): **Traditional Mode** - Uses Gemini + Deepgram STT + ElevenLabs TTS pipeline. 800-1200ms latency.
- `true`: **Realtime Mode** - Uses OpenAI GPT-4o Realtime for native speech-to-speech. 300-700ms latency, natural voice with emotional intelligence.

**VAPI Realtime Voices** (`VAPI_REALTIME_VOICE`):
- `alloy` - Neutral, versatile
- `echo` - Warm, engaging
- `shimmer` - Energetic, expressive
- `marin` (default) - Professional, clear (recommended for business)
- `cedar` - Natural, conversational

**VAPI Screening Modes** (`VAPI_ADVANCED_SCREENING`):
- `false` (default): **Demo/Simple Mode** - Agent only asks availability + rate, then ends call with proper closing. Ideal for quick demos.
- `true`: **Advanced Mode** - Agent asks all user criteria questions for thorough provider vetting. Use for production.

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

### Demo Mode

Demo mode allows the app to run with only a Gemini API key — no Supabase, no VAPI, no Twilio needed.

**Activation:**
1. Backend: Set `DEMO_MODE=true` in `apps/api/.env` (or copy `apps/api/.env.demo`)
2. Frontend: Set `NEXT_PUBLIC_DEMO_MODE=true` in `apps/web/.env.local` (or copy `apps/web/.env.demo`)

**What happens in demo mode:**
- **Database**: Skipped entirely. Server actions return mock responses with generated UUIDs. AppProvider localStorage handles all state.
- **Auth**: Bypassed. A demo user is auto-authenticated. Middleware allows all routes.
- **VAPI Calls**: Replaced with Gemini `simulateCall()`. Realistic AI-generated transcripts with 3-8 second delays.
- **Provider Search**: Still uses real Gemini API (the core demo value).
- **Real-time**: Supabase subscriptions disabled. Recommendations auto-generated from local state.
- **UI**: Amber "Demo Mode" banner at top. "Simulated" badges on call transcripts.

**Minimum requirements for demo:** Just `GEMINI_API_KEY` in `apps/api/.env`.

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
- Supports two voice modes: Traditional (Gemini + ElevenLabs) and Realtime (OpenAI GPT-4o)

**Voice Mode Architecture**:

| Mode | Pipeline | Latency | Voice Quality |
|------|----------|---------|---------------|
| **Traditional** | Deepgram STT → Gemini → ElevenLabs TTS | 800-1200ms | Robotic |
| **Realtime** | OpenAI GPT-4o native audio-to-audio | 300-700ms | Natural, emotionally intelligent |

Toggle with `VAPI_USE_REALTIME=true`. No infrastructure changes needed - just config.

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
