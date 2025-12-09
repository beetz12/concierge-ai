# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Concierge - An AI receptionist/secretary that researches local service providers and books appointments. Users submit requests (e.g., "find a plumber in Greenville SC"), the AI searches providers via Google Maps grounding, simulates phone calls to verify availability/rates, selects the best match, and schedules appointments.

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

### State Management

- **AppProvider** (React Context + localStorage): Client-side request state
- **Supabase**: Server-side persistence with RLS and real-time subscriptions
- **Server Actions**: Database mutations with cache revalidation

### Database (Supabase/PostgreSQL)

Tables: `users`, `service_requests`, `providers`, `interaction_logs`

Schema: `supabase/migrations/20250101000000_initial_schema.sql`

### Key Files

| Path                                     | Purpose                               |
| ---------------------------------------- | ------------------------------------- |
| `apps/web/lib/services/geminiService.ts` | Frontend API client for AI operations |
| `apps/api/src/services/gemini.ts`        | Backend Gemini AI integration         |
| `apps/api/src/routes/gemini.ts`          | API endpoints with Zod validation     |
| `apps/web/lib/providers/AppProvider.tsx` | Global state management               |
| `apps/web/lib/supabase/server.ts`        | Server-side Supabase client           |

## Environment Variables

**Backend (`apps/api/.env`):**

```
PORT=8000
CORS_ORIGIN=http://localhost:3000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

**Frontend (`apps/web/.env.local`):**

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Note: Gemini API key is backend-only (not exposed to client).

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, TypeScript 5.9
- **Backend**: Fastify 5, Google GenAI SDK, Zod validation
- **Database**: Supabase (PostgreSQL with RLS, real-time)
- **AI**: Google Gemini 2.5 Flash with Google Maps grounding
- **Voice AI**: VAPI.ai for automated provider calling

## VAPI Assistant Configuration

The VAPI calling system uses a single source of truth pattern to maintain DRY principles:

**Source of Truth**: `apps/api/src/services/vapi/assistant-config.ts`

- Contains the canonical assistant configuration
- Defines conversation flow, prompts, and analysis schema
- Used by both direct VAPI API calls and Kestra orchestration

**Kestra Scripts**: `kestra/scripts/call-provider.js`

- Imports configuration from compiled TypeScript: `apps/api/dist/services/vapi/assistant-config.js`
- No configuration duplication
- Ensures identical behavior across all execution paths

**Build Requirement**: Run `pnpm build` before using Kestra scripts

- The Kestra scripts require the TypeScript to be compiled
- Build compiles `apps/api/src` to `apps/api/dist`
- Without build, the script will fail with import error

**Key Features**:

- **Disqualification Detection**: Politely exits calls when provider cannot meet requirements
- **Conditional Closing**: Uses callback script ("I'll call you back to schedule") only if ALL criteria met
- **Earliest Availability**: Captures specific date/time when provider can start work
- **Structured Data**: Returns typed results including `disqualified`, `disqualification_reason`, `earliest_availability`
- **Single Person Tracking**: Ensures all requirements met by ONE person, not different technicians
