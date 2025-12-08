# AI Concierge

An AI-powered receptionist and secretary designed to help you research local service providers and book appointments effortlessly.

## About

The AI Concierge acts as your personal assistant for managing real-world tasks. Simply submit a request like:

> "I have a leaking toilet that I need fixed ASAP. I'm in Greenville SC, and I want a reputable licensed local plumber with at least 4.7 rating and can arrive in the next 2 days."

The application will:
1.  **Search** for qualified service providers in your area.
2.  **Call** providers one-by-one to verify rates, availability, and criteria.
3.  **Schedule** the appointment once a suitable provider is found.
4.  **Notify** you via text/email when the task is complete.

It also maintains a history of requests, detailed logs of AI analysis and interactions, and supports direct tasks where you provide specific contact info for the AI to call.

## Tech Stack

This project is a monorepo managed by **Turborepo**.

*   **Frontend**: Next.js (`apps/web`)
*   **Backend**: Fastify (`apps/api`)
*   **Database**: Supabase
*   **AI Integration**: Google Gemini (inferred from `apps/web` dependencies)
*   **Styling**: Tailwind CSS
*   **Package Manager**: pnpm

## Getting Started

### Prerequisites

*   Node.js (>=18)
*   pnpm

### Installation

Install dependencies from the root directory:

```bash
pnpm install
```

### Environment Variables

Ensure you have the necessary environment variables set up. Check `apps/api/.env.example` and `apps/web/.env.local.example` for required configurations (e.g., Supabase credentials, AI API keys).

### Database Setup

Run the Supabase migrations to create the required tables:

#### Option A: Supabase CLI (Recommended)

```bash
# Install Supabase CLI globally
npm install -g supabase

# Login to Supabase (opens browser for authentication)
supabase login

# Verify you're logged in and see your projects
supabase projects list

# Link to your project (from project root)
# Replace YOUR_PROJECT_REF with your project reference ID from the list above
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations to remote database
supabase db push
```

> **Note:** You must run `supabase login` before `supabase link`. The project ref can be found in your Supabase dashboard URL or by running `supabase projects list`.

#### Option B: Manual SQL Execution

1. Go to your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new)
2. Copy the contents of `supabase/migrations/20250101000000_initial_schema.sql`
3. Click **Run**

### Creating New Migrations

```bash
# Create a new migration file
supabase migration new add_new_feature

# This creates: supabase/migrations/YYYYMMDDHHMMSS_add_new_feature.sql
# Edit the file with your SQL, then push:
supabase db push
```

### Useful Supabase CLI Commands

```bash
# View migration status
supabase migration list

# Generate TypeScript types from your schema
supabase gen types typescript --linked > packages/types/database.ts

# Pull remote schema changes (if made via dashboard)
supabase db pull

# Diff local vs remote schema
supabase db diff

# Reset database and re-apply all migrations
supabase db reset --linked
```

## Running the Project

You can run the entire stack (Frontend + Backend) simultaneously from the root directory:

```bash
pnpm dev
```

This command executes `turbo run dev`, which starts:
*   **Web App**: [http://localhost:3000](http://localhost:3000)
*   **API**: [http://localhost:8000](http://localhost:8000)

### Running Individual Apps

To run specific parts of the application:

**Frontend (Web):**
```bash
pnpm --filter web dev
# or
cd apps/web && pnpm dev
```

**Backend (API):**
```bash
pnpm --filter api dev
# or
cd apps/api && pnpm dev
```

## Build

To build all applications:

```bash
pnpm build
