# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
VAPI_ADVANCED_SCREENING=false     # Toggle advanced provider screening (see below)
VAPI_USE_REALTIME=false           # Toggle OpenAI Realtime mode (see below)
VAPI_REALTIME_VOICE=marin         # Voice selection for Realtime mode
```

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

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
