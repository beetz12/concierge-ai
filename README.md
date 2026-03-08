# AI Concierge

An AI-powered receptionist and secretary designed to help you research local service providers and book appointments effortlessly.

## Built With

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/NexAiAdvisors/concierge-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/NexAiAdvisors/concierge-ai/actions/workflows/ci.yml)
[![Kestra](https://img.shields.io/badge/Orchestrated%20by-Kestra-4F46E5?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K)](https://kestra.io)
[![LiveKit](https://img.shields.io/badge/Voice%20Runtime-LiveKit-0F172A?style=for-the-badge&logo=livekit&logoColor=white)](https://livekit.io)
[![Gemini](https://img.shields.io/badge/AI%20by-Google%20Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![CodeRabbit](https://img.shields.io/badge/Code%20Quality-CodeRabbit-FF6B6B?style=for-the-badge&logo=rabbit&logoColor=white)](https://coderabbit.ai)

## Team NexAI

Built with passion for the **AI Agents Assemble Hackathon** by:

| Contributor | GitHub | Role |
|-------------|--------|------|
| **David** | [@beetz12](https://github.com/beetz12) | Full-Stack Development, AI Integration |
| **Hasan** | [@R-Mohammed-Hasan](https://github.com/R-Mohammed-Hasan) | Backend Development, Workflow Design |

## Demo Video

> **[Watch the 3-minute demo](https://youtube.com/watch?v=COMING_SOON)** - See AI Concierge research providers, make real phone calls, and recommend the top 3 matches!

*Demo video showcases: Form submission → AI research → LiveKit-first provider calling → Top 3 recommendations → Booking confirmation*

## Runtime Status

The repository now uses a **LiveKit-first voice runtime**:

- `apps/api` remains the business and orchestration API
- `apps/voice-agent` owns live call session state, handoffs, and internal tool calls
- `CALL_RUNTIME_PROVIDER=livekit` is the default runtime
- `VAPI` stays available as an env-gated fallback path for compatibility
- real outbound calling now requires both the `apps/voice-agent` HTTP service and the LiveKit worker plus a configured `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`

## Hackathon Highlights

This project was built for the **AI Agents Assemble Hackathon** and showcases integration with multiple sponsor technologies:

| Achievement | Technology | Impact |
|------------|------------|---------|
| **AI Agent Orchestration** | Kestra | AI Agent summarizes provider data (10+ sources), makes decisions, recommends top 3 |
| **Voice AI Integration** | LiveKit + voice-agent | Backend-controlled calling, session persistence, handoffs, and diagnostics |
| **AI Research & Analysis** | Google Gemini | Maps grounding for provider search + Top 3 recommendations |
| **Production Deployment** | Vercel | Live demo with real-time updates |
| **Code Quality Automation** | CodeRabbit | AI-powered PR reviews with security scanning (clearly visible) |
| **CLI Automation Tools** | Cline CLI | 5 automation scripts built ON TOP of CLI (Infinity Build Award) |

**Special Note**: CodeRabbit activity is clearly visible on all pull requests with inline comments, security scans, and comprehensive reviews. See any PR in this repository for examples.

## Table of Contents

- [Built With](#built-with)
- [Demo Video](#demo-video)
- [Sponsors & Technologies](#sponsors--technologies)
- [Live Deployment](#live-deployment)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Screenshots](#screenshots)
- [Two Request Types](#two-request-types)
- [Tech Stack](#tech-stack)
- [Voice Runtime Architecture](#voice-runtime-architecture)
- [CodeRabbit AI Code Review](#coderabbit-ai-code-review)
- [Getting Started](#getting-started)
- [Kestra Workflow Setup](#kestra-workflow-setup-local)
- [Contributing](#contributing)
- [Resources](#resources)

## Key Features

### Intelligent Provider Discovery
- Google Maps grounded search via Gemini AI
- Automatic filtering by rating, distance, and criteria
- Real-time availability verification through phone calls

### Concurrent AI Calling System
- Call up to 5 providers simultaneously (80%+ time savings)
- LiveKit-first conversation handling through the dedicated voice-agent service
- Automatic disqualification detection (politely exits unqualified providers)
- Captures pricing, availability, and service details

### AI-Powered Recommendations
- Gemini analyzes all call results and provider data
- Recommends top 3 providers with scoring and reasoning
- Explains why each provider matches your needs
- Shows trade-offs between price, availability, and quality

### Orchestrated Workflows
- Kestra manages complex multi-step processes
- Automatic error handling and retry logic
- Real-time progress updates via Supabase subscriptions
- Fallback to direct API calls if Kestra unavailable

### Security & Quality Assurance
- CodeRabbit automated code reviews on every PR
- Gitleaks prevents secret commits
- Row Level Security (RLS) on all database tables
- Input validation with Zod schemas

## Sponsors & Technologies

This project was built for a hackathon using these sponsor technologies:

| Sponsor | Technology | Usage |
|---------|------------|-------|
| **Kestra** | Workflow Orchestration | Orchestrates multi-step AI workflows (research, call, recommend, book) |
| **LiveKit + Voice Agent** | Voice runtime | Default provider-calling and booking dispatch path |
| **Google Gemini** | LLM | Powers research (Maps grounding), analysis, and dynamic prompt generation |
| **Vercel** | Deployment | Hosts the production web application |
| **CodeRabbit** | AI Code Review | Automated PR reviews for code quality, security, and best practices |

### Kestra AI Agent Integration (Wakanda Data Award)

This project leverages **Kestra's built-in AI Agent** (`io.kestra.plugin.ai.agent.AIAgent`) with Google Gemini provider to:

1. **Summarize data from external systems**:
   - Aggregates Google Maps provider search results (10+ candidates with ratings, reviews, contact info)
   - Consolidates voice runtime transcripts and structured extraction data
   - Compiles provider availability, pricing, and qualification details

2. **Make autonomous decisions** based on summarized data:
   - Filters providers that don't meet user criteria (rating, availability, requirements)
   - Scores remaining candidates using weighted criteria (availability 30%, rate 20%, criteria match 25%, call quality 15%, professionalism 10%)
   - **Recommends top 3 providers** with AI-generated reasoning explaining each selection

**Workflow Implementation**:
- `kestra/flows/research_agent.yaml` - AI Agent summarizes Google Maps data, filters and ranks providers
- `kestra/flows/recommend_providers.yaml` - AI Agent analyzes call results, generates top 3 recommendations
- `kestra/flows/contact_providers.yaml` - Legacy orchestration path for concurrent provider calling

This directly satisfies the **Wakanda Data Award** requirement: *"Use Kestra's built-in AI Agent to summarise data from other systems, with bonus credit if your agent can make decisions based on the summarised data."*

## Live Deployment

- **Production Web App**: [https://concierge-ai-web.vercel.app/](https://concierge-ai-web.vercel.app/) - Deployed on Vercel
- **Production API**: [https://api-production-8fe4.up.railway.app](https://api-production-8fe4.up.railway.app)
- **API Documentation**: [https://api-production-8fe4.up.railway.app/docs](https://api-production-8fe4.up.railway.app/docs) - Interactive Swagger UI

> **Try it live**: Submit a request to see Kestra orchestration, LiveKit-first calling, and Gemini-powered recommendations in action!

## Hackathon Prize Alignment

This project is built to qualify for multiple sponsor awards:

| Award | Prize | Requirement | Our Implementation | Evidence |
|-------|-------|-------------|-------------------|----------|
| **Wakanda Data** | $4,000 | Kestra AI Agent summarizes data + makes decisions | AI Agent aggregates 10+ providers, analyzes calls, recommends top 3 | `kestra/flows/research_agent.yaml` |
| **Stormbreaker** | $2,000 | Live Vercel deployment | Production app deployed and accessible | [concierge-ai-web.vercel.app](https://concierge-ai-web.vercel.app/) |
| **Captain Code** | $1,000 | CodeRabbit PR reviews clearly visible | Comprehensive AI reviews on all PRs with inline comments | [View PR Reviews](https://github.com/beetz12/concierge-ai/pulls) |
| **Infinity Build** | $5,000 | Cline CLI automation tools built ON TOP of CLI | 5 production tools (600+ lines) with git hooks integration | `scripts/cline/README.md` |

Each integration demonstrates the specific prize requirement language and is production-ready.

## API Documentation

Interactive API documentation is available via Swagger UI:

- **Production**: [https://api-production-8fe4.up.railway.app/docs](https://api-production-8fe4.up.railway.app/docs)
- **Local Development**: [http://localhost:8000/docs](http://localhost:8000/docs)

The documentation includes all available endpoints with request/response schemas, allowing you to test API calls directly from the browser.

## About

The AI Concierge acts as your personal assistant for managing real-world tasks. Simply submit a request like:

> "I have a leaking toilet that I need fixed ASAP. I'm in Greenville SC, and I want a reputable licensed local plumber with at least 4.7 rating and can arrive in the next 2 days."

The application will:

1.  **Search** for qualified service providers in your area.
2.  **Call** providers one-by-one to verify rates, availability, and criteria.
3.  **Schedule** the appointment once a suitable provider is found.
4.  **Notify** you via text/email when the task is complete.

It also maintains a history of requests, detailed logs of AI analysis and interactions, and supports direct tasks where you provide specific contact info for the AI to call.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                            │
│                  (Next.js 16 + React 19)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Kestra Orchestration                           │
│              (Multi-step workflow engine)                        │
└─┬───────────────────┬──────────────────┬────────────────────────┘
  │                   │                  │
  ▼                   ▼                  ▼
┌──────────┐   ┌─────────────┐   ┌──────────────┐
│ Gemini   │   │ Voice Agent │   │  Supabase    │
│ Research │   │ + LiveKit   │   │  Database    │
│ (Maps)   │   │   Calling   │   │  & RLS       │
└──────────┘   └─────────────┘   └──────────────┘
     │                │                  │
     │                │                  │
     └────────────────┴──────────────────┘
                      │
                      ▼
           ┌─────────────────────┐
           │   AI Analysis &     │
           │   Top 3 Provider    │
           │   Recommendations   │
           └─────────────────────┘
```

**Flow**: User Request → Kestra/API orchestration → Gemini research → LiveKit-first voice-agent dispatch → Gemini analysis → Top 3 recommendations → User selection → booking dispatch

## Screenshots

| New Request | Live Calling | Recommendations |
|-------------|--------------|-----------------|
| ![New Request](docs/screenshots/new-request.png) | ![Calling](docs/screenshots/calling.png) | ![Results](docs/screenshots/results.png) |

> Note: Screenshots placeholder - will be added before final submission

## Two Request Types

The application supports two ways to use the AI assistant:

### Research & Book (`/new` page)

Full automated workflow for finding and booking service providers:

1. **User submits request** - Describe service needed, location, and criteria
2. **AI researches** - Finds 10+ providers via Gemini + Google Places API
3. **AI calls providers** - Makes real phone calls through the LiveKit-first voice runtime to verify availability/rates
4. **AI recommends** - Analyzes call results, presents **top 3 providers** with scores and reasoning
5. **User selects** - Choose preferred provider from recommendations
6. **AI books** - Calls provider back to schedule appointment
7. **Confirmation** - Notified when booking is complete

### Direct Task (`/direct` page)

Single-call tasks where you provide contact information:

- User provides: contact name, phone number, task description
- AI analyzes task type (negotiate, complain, inquire, schedule, etc.)
- Generates task-specific prompts dynamically
- Makes the call and reports results with full transcript

**Supported task types:** `negotiate_price`, `request_refund`, `complain_issue`, `schedule_appointment`, `cancel_service`, `make_inquiry`, `general_task`

## Tech Stack

This project is a monorepo managed by **Turborepo**.

- **Frontend**: Next.js (`apps/web`)
- **Backend**: Fastify (`apps/api`)
- **Database**: Supabase
- **AI Integration**: Google Gemini 2.5 Flash (`@google/generative-ai` v1.0.1)
- **Voice Runtime**: `apps/voice-agent` + LiveKit by default, with VAPI fallback still available
- **Styling**: Tailwind CSS
- **Package Manager**: pnpm

## Voice Runtime Architecture

The current runtime is **LiveKit-first**, with `apps/api` and `apps/voice-agent` separated on purpose:

- `apps/api` owns business workflows, provider research, recommendation generation, booking orchestration, and persistence
- `apps/voice-agent` owns live session state, diagnostics, handoffs, and the internal voice-tools contract
- `CALL_RUNTIME_PROVIDER=livekit` is the default runtime switch
- `VAPI` remains implemented as a fallback runtime behind env flags and the runtime router

Key files:

- `apps/api/src/config/call-runtime.ts`
- `apps/api/src/services/calls/runtime-router.service.ts`
- `apps/api/src/services/calls/booking-call.service.ts`
- `apps/api/src/routes/voice-tools.ts`
- `apps/voice-agent/src/server.ts`
- `apps/voice-agent/src/session-manager.ts`

For the legacy VAPI-oriented design notes, see `docs/VAPI_FALLBACK_ARCHITECTURE.md`.

### Concurrent Provider Calling

The system supports calling multiple providers simultaneously to reduce total wait time by 80%+. Instead of sequential calls (5 providers × 5 min = 25 min), concurrent calling processes them in parallel batches.

**Configuration:**
```bash
# In apps/api/.env
CALL_RUNTIME_PROVIDER=livekit
LIVEKIT_ENABLED=true
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
VOICE_AGENT_SHARED_SECRET=choose_a_shared_secret
VOICE_AGENT_SERVICE_URL=http://127.0.0.1:8787
```

**API Endpoint:** `POST /api/v1/providers/batch-call`
```json
{
  "providers": [{"name": "ABC Plumbing", "phone": "+1234567890"}],
  "serviceNeeded": "plumbing",
  "userCriteria": "Licensed and insured",
  "location": "Greenville, SC",
  "urgency": "within_2_days",
  "maxConcurrent": 5
}
```

**Kestra Workflow:** `contact_providers_concurrent.yaml` remains available as an orchestration layer, while the runtime router decides whether calls execute through LiveKit or VAPI.

### Live Call Configuration

The `/new` page supports both simulated (Gemini-based) calls and real provider-calling flows. Configure via environment variables in `apps/web/.env.local`:

| Variable | Values | Description |
|----------|--------|-------------|
| `NEXT_PUBLIC_LIVE_CALL_ENABLED` | `true` / `false` | Enable real provider calling (`false` = simulated) |
| `NEXT_PUBLIC_ADMIN_TEST_PHONES` | Comma-separated E.164 phones | **Recommended**: Array of test phones for concurrent testing |
| `NEXT_PUBLIC_ADMIN_TEST_NUMBER` | Single E.164 phone | **Deprecated**: Legacy single test number (still supported) |

#### Configuration Modes

**Development (Default)** - Simulated calls via Gemini:
```bash
NEXT_PUBLIC_LIVE_CALL_ENABLED=false
# No test phones set
```

**Testing Concurrent Calls (Recommended)** - Real calls to multiple test phones:
```bash
NEXT_PUBLIC_LIVE_CALL_ENABLED=true
NEXT_PUBLIC_ADMIN_TEST_PHONES=+15551234567,+15559876543,+15555551234
```
In this mode:
- **Only N providers are called** (where N = number of test phones)
- Each provider is mapped 1:1 to a test phone (Provider 1 → Phone 1, Provider 2 → Phone 2, etc.)
- Perfect for testing **concurrent calling** with multiple real phones
- If research returns 10 providers but you have 3 test phones, only 3 calls are made

**Testing Single Call (Legacy)** - Real calls to one test phone:
```bash
NEXT_PUBLIC_LIVE_CALL_ENABLED=true
NEXT_PUBLIC_ADMIN_TEST_NUMBER=+15551234567  # Deprecated, use ADMIN_TEST_PHONES instead
```
In this mode:
- Only the **first provider** is called
- Call goes to **your single test number**
- Backward compatible with existing setups

**Production** - Real calls to actual providers:
```bash
NEXT_PUBLIC_LIVE_CALL_ENABLED=true
# No test phones set - calls go to real provider numbers
```

#### Simulation Mode (Development without voice runtime costs)

For development and testing without real phone calls, the system includes a **Gemini-powered simulation service** that generates realistic provider conversations:

```bash
# Enable simulation mode (default for development)
NEXT_PUBLIC_LIVE_CALL_ENABLED=false
```

The simulation service (`apps/api/src/services/simulation/`) uses Gemini to:
- Generate realistic provider responses based on service type
- Simulate availability, pricing, and qualification discussions
- Return structured data matching the real provider-calling format

This allows full end-to-end testing without consuming live call runtime credits.

#### Backend Configuration

The backend defaults to LiveKit and only needs VAPI credentials when fallback is enabled:
```bash
CALL_RUNTIME_PROVIDER=livekit
LIVEKIT_ENABLED=true
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
VOICE_AGENT_SHARED_SECRET=choose_a_shared_secret
VOICE_AGENT_SERVICE_URL=http://127.0.0.1:8787

# Optional VAPI fallback only
VAPI_ENABLED=false
VAPI_API_KEY=your_vapi_api_key
VAPI_PHONE_NUMBER_ID=your_vapi_phone_number_id
```

## CodeRabbit AI Code Review

This project leverages [CodeRabbit](https://coderabbit.ai) as a critical quality assurance tool, providing **automated AI-powered code reviews** on every pull request. As a hackathon project with rapid development cycles, CodeRabbit acts as our fourth team member, ensuring code quality and security don't suffer under tight deadlines.

### Why CodeRabbit for This Project

During this hackathon, we needed to:
- Move fast without breaking things
- Maintain security across voice AI and payment integrations
- Ensure consistent patterns across a monorepo (Next.js + Fastify + Supabase)
- Catch issues before they reach production

**CodeRabbit delivers all of this automatically on every PR.**

### Key Features Enabled

#### 1. Security Scanning (Critical for Production)
- **Gitleaks Integration**: Prevents accidental API key commits (VAPI, Gemini, Supabase)
- **SQL Injection Detection**: Reviews all Supabase queries and migrations
- **XSS Prevention**: Scans React components for unsafe rendering
- **CORS Validation**: Ensures proper origin configuration in Fastify routes

#### 2. Framework-Specific Intelligence
CodeRabbit understands our entire tech stack via custom path instructions:

```yaml
# Next.js App Router (apps/web/app/**/*.tsx)
- Server Component best practices
- Proper use of "use client" directive
- Async/await patterns in Server Components
- Metadata exports for SEO

# Fastify Backend (apps/api/src/**/*.ts)
- Zod schema validation on all endpoints
- Proper HTTP status codes (201, 204, etc.)
- CORS configuration reviews
- Error handling patterns

# Supabase Migrations (supabase/migrations/**/*.sql)
- Row Level Security (RLS) policy validation
- Index optimization suggestions
- Foreign key CASCADE behavior checks
- Migration idempotency verification
```

#### 3. Code Quality Checks
- **ESLint Integration**: Catches linting issues before CI runs
- **TypeScript Patterns**: Ensures proper typing across the monorepo
- **Performance Issues**: Identifies React re-render problems, inefficient queries
- **Accessibility**: ARIA attributes and semantic HTML validation

#### 4. Automated Review Process

**Every PR triggers:**
1. Full codebase context analysis (understands related files)
2. Security vulnerability scan
3. Framework-specific best practice review
4. Code quality suggestions with explanations
5. Inline comments on specific issues
6. Summary report with severity levels

**Review Profile: "Chill"** - Focused feedback without noise, perfect for hackathon pace.

### Configuration Highlights

Our `.coderabbit.yaml` is configured for a **Turborepo monorepo** with comprehensive rules:

```yaml
reviews:
  profile: "chill"              # Focused, actionable feedback
  high_level_summary: true      # Executive summary of changes
  sequence_diagrams: true       # Visual workflow diagrams
  review_status: true           # ✅/❌ status checks

path_filters:
  # Include source code
  - "apps/**/*.{ts,tsx,js,jsx}"
  - "packages/**/*.{ts,tsx,js,jsx}"
  - "supabase/**/*.sql"

  # Exclude build artifacts
  - "!**/node_modules/**"
  - "!**/.next/**"
  - "!pnpm-lock.yaml"

tools:
  eslint: true                  # JavaScript/TypeScript linting
  gitleaks: true                # Secret leak prevention
  markdownlint: true            # Documentation quality
  shellcheck: true              # Bash script validation
  yamllint: true                # Kestra workflow validation
```

### Real-World Impact

#### Example Review Catches:

**Security Issue Prevented:**
```typescript
// CodeRabbit flagged this in a PR:
const apiKey = "sk-live-abc123"; // ❌ Hardcoded secret detected

// Recommended fix:
const apiKey = process.env.VAPI_API_KEY; // ✅
```

**Performance Optimization:**
```typescript
// CodeRabbit suggested:
// "Consider memoizing this expensive calculation with useMemo"
const providers = data.filter(p => p.rating > 4.5); // In render loop

// After fix:
const providers = useMemo(() =>
  data.filter(p => p.rating > 4.5), [data]
);
```

**Type Safety Enhancement:**
```typescript
// CodeRabbit caught:
const response = await fetch(url); // ❌ Untyped response

// Recommended:
const response: ProviderSearchResponse = await fetch(url).then(r => r.json());
```

### PR Review Visibility

CodeRabbit reviews are **clearly visible** on all pull requests:

- **Inline comments** on specific code changes
- **Summary comment** with high-level findings
- **Status checks** that can block merges if critical issues found
- **Conversation mode** for clarifying questions

**See CodeRabbit in action**: Check any PR in this repository for detailed AI review comments.

### Hackathon Value Proposition

**For a 3-person team building a production-ready AI voice assistant in days, CodeRabbit provides:**
- 24/7 code review coverage (no waiting for teammate availability)
- Consistent security checks across all PRs
- Framework expertise (Next.js 16 + Fastify 5 + Supabase patterns)
- Knowledge transfer (learns and teaches team patterns)
- Faster PR cycles (immediate feedback vs. async human review)

**Result**: We shipped a secure, high-quality application in record time without sacrificing code standards.

### Integration Points

CodeRabbit integrates seamlessly with our workflow:

1. **GitHub PRs**: Automatic review on PR creation/updates
2. **Auto-incremental Reviews**: Only reviews changed code
3. **Draft PR Exclusion**: Respects work-in-progress
4. **Base Branch Awareness**: Reviews against `main` and feature branches
5. **Bot Filtering**: Skips dependabot/renovate PRs

### Configuration Documentation

Full configuration: `.coderabbit.yaml` (281 lines)
- Path-specific instructions for 15+ file types
- Framework rules for Next.js, Fastify, Supabase
- Security scanning with gitleaks
- Custom prompts for docstring generation
- Knowledge base with web search enabled

**This comprehensive setup ensures CodeRabbit acts as a domain expert for our entire stack.**

## Getting Started

### Prerequisites

- Node.js (>=18)
- pnpm

### Installation

Install dependencies from the root directory:

```bash
pnpm install
```

### Third-Party Services

You will need accounts and API keys for the following services:

| Service | Purpose | Get Started |
|---------|---------|-------------|
| [Supabase](https://supabase.com) | Database & Auth | Free tier available |
| [VAPI](https://vapi.ai) | Voice AI calls | Pay-per-minute |
| [Google AI](https://ai.google.dev) | Gemini API | Free tier |
| [Google Places](https://developers.google.com/maps) | Address autocomplete | Pay-per-request |
| [Twilio](https://twilio.com) | SMS (optional) | Pay-per-message |


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

- **Web App**: [http://localhost:3000](http://localhost:3000)
- **API**: [http://localhost:8000](http://localhost:8000)

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
```

## Cline CLI Automation Tools

> **AI Agents Assemble Hackathon** - Infinity Build Award ($5,000)
>
> **Prize Requirement**: "Build capabilities ON TOP of the CLI that improve the software development experience"
>
> **Our Submission**: 5 production-ready automation tools built on Cline CLI with git hooks and GitHub Actions integration

### Why This Matters for Hackathon Judging

We built **actual automation tools** that use the **real Cline CLI** (not mocks or wrappers). Every tool uses the authentic `cline -y` command with piped input, demonstrating how Cline CLI can be the foundation for powerful development workflows.

**Key Innovation**: These tools prove Cline CLI can be the backbone of automated code quality, security scanning, and code generation pipelines.

### The 5 Automation Tools

| Tool | Purpose | Hackathon Value | Command |
|------|---------|-----------------|---------|
| **Security Review** | AI vulnerability scanning | Blocks commits with hardcoded secrets, SQL injection, XSS | `pnpm cline:security` |
| **Workflow Guardian** | Kestra YAML validation | Validates workflow syntax, AI prompts, security | `pnpm cline:workflow` |
| **Code Review** | Comprehensive quality review | Framework-specific feedback (Next.js, Fastify, Supabase) | `pnpm cline:review` |
| **Adapter Generator** | Auto-generate service integrations | Creates full TypeScript clients from API docs in 60s | `pnpm cline:adapter <Name>` |
| **Test Generator** | Auto-generate tests | Generates unit tests for new/changed code | `pnpm cline:test` |

### Automation Tools - Proof of Implementation

These are **production-ready scripts**, not theoretical descriptions. Here's the proof:

**Script Inventory** (`scripts/cline/`):
| Script | Lines | Purpose |
|--------|-------|---------|
| `security-review.sh` | 147 | AI vulnerability scanning with commit blocking |
| `workflow-guardian.sh` | 89 | Kestra YAML validation |
| `code-review.sh` | 102 | Comprehensive quality analysis |
| `generate-adapter.sh` | 156 | Auto-generate TypeScript service integrations |
| `generate-tests.sh` | 134 | Auto-generate unit tests |
| **Total** | **628+** | Lines of automation built ON TOP of Cline CLI |

**Example: Security Review in Action**
```bash
$ pnpm cline:security
Analyzing staged changes with Cline CLI...
Scanning for: hardcoded secrets, SQL injection, XSS, auth bypass...

✅ SECURITY_PASSED - No critical vulnerabilities detected
```

**Git Hooks Integration**: Pre-commit hooks automatically run security and workflow validation on every commit. See `.husky/pre-commit` for configuration.

### Actual Cline CLI Implementation

**This is the critical differentiator**: We use the **real Cline CLI**, not a mock or simulation. Here's the actual pattern used in all 5 tools:

```bash
# Example: security-review.sh (actual code from our repo)
#!/bin/bash

# 1. Get code to analyze
DIFF=$(git diff --cached)

# 2. Pipe directly to Cline CLI with YOLO mode
echo "$DIFF" | cline -y "
You are a security expert for AI Concierge.
Tech stack: Next.js 16, Fastify 5, Supabase, Gemini, VAPI.ai

ANALYZE FOR:
- Hardcoded API keys (VAPI, Gemini, Supabase)
- SQL injection vulnerabilities
- XSS attack vectors
- Missing webhook signature verification
- Insecure CORS configuration

OUTPUT: End with ✅ SECURITY_PASSED or ❌ SECURITY_FAILED
"

# 3. Parse Cline's output and take action
if grep -q "SECURITY_FAILED"; then
    echo "❌ Security issues detected - commit blocked!"
    exit 1
fi
```

**Why this matters**: This is not a wrapper or abstraction. We're using `cline -y` (YOLO mode) with piped input - the exact CLI interface Cline provides. This demonstrates that **Cline CLI is production-ready** for automation pipelines.

#### Installation & Setup

```bash
# Install Cline CLI
npm install -g @cline/cli

# Setup Husky hooks (runs automatically on pnpm install)
pnpm cline:setup

# Test the security review
pnpm cline:security
```

#### Git Hooks Integration

The pre-commit hook automatically runs:

1. **Security Review** - Blocks commit on critical issues
2. **Workflow Guardian** - Validates Kestra YAML changes
3. **Code Review** - Optional informational review

**Bypass options:**

```bash
CLINE_YOLO=true git commit -m "message"    # Skip all checks
CLINE_ENABLED=false git commit -m "message" # Disable Cline
```

#### GitHub Actions

PRs automatically get:

- AI security review with PR comments
- Workflow validation for Kestra changes
- Code quality analysis

**Required setup:**

1. Go to your repo: Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `CLINE_API_KEY`
4. Value: Your Cline API key

See `.github/workflows/cline-security.yml` for configuration.

#### Documentation

- **Full documentation**: `scripts/cline/README.md`
- **Implementation plan**: `docs/FEATURE_CLINE_CLI_INTEGRATION_PLAN.md`
- **Hackathon info**: `docs/hackathon.md`

---

### Cline CLI (Interactive Mode)

For interactive use, Cline CLI helps with code generation, refactoring, and debugging:

```bash
# Start interactive session
cline

# Common tasks:
# - "Create a new API endpoint for user authentication"
# - "Fix the TypeScript errors in the components directory"
# - "Add tests for the gemini service"
```

For more information, visit the [Cline documentation](https://docs.cline.bot).

## Kestra Workflow Setup (Local)

Kestra is used to orchestrate the AI research agent workflows. This section covers local setup with PostgreSQL.

### Prerequisites

- Docker and Docker Compose installed
- PostgreSQL running locally on port 5432 (or use the project's Supabase instance)

### 1. Configure Environment Variables

Ensure your root `.env` file has the Kestra database configuration:

```bash
# Kestra Database Configuration
KESTRA_DB_HOST=host.docker.internal   # Use 'localhost' if not using Docker
KESTRA_DB_PORT=5432
KESTRA_DB_USER=postgres
KESTRA_DB_PASSWORD=postgres
KESTRA_DB_NAME=postgres

# API Keys (used by Kestra flows)
GEMINI_API_KEY=your_gemini_api_key
```

### 2. Create the Kestra Schema

Before starting Kestra, create the dedicated schema in PostgreSQL:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c "CREATE SCHEMA IF NOT EXISTS kestra;"
```

### 3. Start Kestra

```bash
docker compose up -d
```

This starts:

- **Kestra Server**: [http://localhost:8082](http://localhost:8082)
- **Management API**: Port 8081 (internal)

### 4. Initial Setup (First Time Only)

On first launch, Kestra requires account creation:

1. Open [http://localhost:8082](http://localhost:8082) in your browser
2. Complete the setup wizard:
   - **Email**: `admin@kestra.local` (or your preferred email)
   - **Password**: Must be 8+ characters with 1 uppercase and 1 number (e.g., `Admin123456`)
3. Click through the configuration validation
4. Login with your new credentials

### 5. Register Flows

Flows are stored in `kestra/flows/`. Register them via API:

```bash
# Register the research_providers flow
curl -u "admin@kestra.local:Admin123456" -X POST "http://localhost:8082/api/v1/flows" \
  -H "Content-Type: application/x-yaml" \
  --data-binary @kestra/flows/research_agent.yaml
```

### 6. Trigger a Test Flow

```bash
curl -u "admin@kestra.local:Admin123456" -X POST \
  "http://localhost:8082/api/v1/executions/ai_concierge/research_providers" \
  -H "Content-Type: multipart/form-data" \
  -F "service=plumber" \
  -F "location=Greenville, SC"
```

### Kestra Configuration Reference

The `docker-compose.yml` contains critical Kestra settings:

```yaml
kestra:
  image: kestra/kestra:v1.1.6
  command: server standalone # Use 'standalone' for PostgreSQL, NOT 'server local'
  environment:
    KESTRA_CONFIGURATION: |
      kestra:
        server:
          basic-auth:
            username: admin@kestra.local
            password: Admin123456     # 8+ chars, 1 upper, 1 number required
        repository:
          type: postgres
        queue:
          type: postgres
      datasources:
        postgres:                     # MUST be 'postgres', not 'default'
          url: jdbc:postgresql://${KESTRA_DB_HOST}:${KESTRA_DB_PORT}/${KESTRA_DB_NAME}?currentSchema=kestra
          driverClassName: org.postgresql.Driver
          username: ${KESTRA_DB_USER}
          password: ${KESTRA_DB_PASSWORD}
```

### Troubleshooting

#### "relation 'settings' does not exist"

**Cause**: Database migrations didn't run properly.
**Fix**:

1. Ensure `datasources.postgres` (not `datasources.default`) is configured
2. Use `server standalone` command (not `server local`)
3. Wipe schema and restart: `DROP SCHEMA kestra CASCADE; CREATE SCHEMA kestra;`

#### 401 Unauthorized on API calls

**Cause**: Basic auth credentials not set up or wrong format.
**Fix**:

1. Complete the setup wizard at http://localhost:8082/ui/setup
2. Password must meet requirements: 8+ chars, 1 uppercase, 1 number
3. Use the credentials you created during setup

#### "Multiple possible bean candidates found: [DSLContext, DSLContext]"

**Cause**: Using `server local` which creates both H2 and PostgreSQL connections.
**Fix**: Change to `command: server standalone` in docker-compose.yml

#### Flow task type errors

**Cause**: Wrong plugin namespace for AI tasks.
**Fix**: Use `io.kestra.plugin.ai.agent.AIAgent` (not `io.kestra.plugin.aiagent.AIAgent`)

### Lessons Learned

| Issue             | Wrong                              | Correct                                     |
| ----------------- | ---------------------------------- | ------------------------------------------- |
| Datasource name   | `datasources.default`              | `datasources.postgres`                      |
| Server command    | `server local`                     | `server standalone`                         |
| AIAgent task type | `io.kestra.plugin.aiagent.AIAgent` | `io.kestra.plugin.ai.agent.AIAgent`         |
| Password format   | `admin`                            | `Admin123456` (8+ chars, 1 upper, 1 number) |
| Flyway env vars   | Manual configuration               | Not needed (auto-handled)                   |

## Contributing

We welcome contributions from all team members! Follow these steps to contribute code via pull requests.

### Step 1: Sync Your Local Main Branch

Before creating a new feature branch, make sure your local `main` branch is up to date:

```bash
git checkout main
git pull origin main
```

### Step 2: Create a Feature Branch

Create a new branch for your feature or fix. Use a descriptive name that reflects what you're working on:

```bash
git checkout -b feature/your-feature-name
```

**Branch naming conventions:**

- `feature/` - for new features (e.g., `feature/add-user-auth`)
- `fix/` - for bug fixes (e.g., `fix/login-button-error`)
- `docs/` - for documentation updates (e.g., `docs/update-readme`)
- `refactor/` - for code refactoring (e.g., `refactor/cleanup-api-routes`)

### Step 3: Make Your Changes

Make your code changes, then stage and commit them with a clear, descriptive message:

```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "feat: add user authentication flow"
```

**Commit message tips:**

- Keep the first line under 50 characters
- Use present tense ("add feature" not "added feature")
- Be specific about what changed

### Step 4: Push Your Branch to GitHub

Push your feature branch to the remote repository:

```bash
git push origin feature/your-feature-name
```

If this is your first push for this branch, Git will provide a link to create a pull request.

### Step 5: Create a Pull Request

1. Go to the repository on GitHub: [https://github.com/beetz12/concierge-ai](https://github.com/beetz12/concierge-ai)
2. You'll see a banner prompting you to **"Compare & pull request"** – click it
3. Or navigate to the **Pull requests** tab and click **"New pull request"**
4. Select your feature branch to merge into `main`
5. Fill out the PR template:
   - **Title**: Brief description of your changes
   - **Description**: Explain what you changed and why
   - **Link any related issues** if applicable
6. Click **"Create pull request"**

### Step 6: Address Review Feedback

After creating your PR:

- Team members will review your code
- Make any requested changes by committing to the same branch
- Push your updates – the PR will automatically update

```bash
# After making requested changes
git add .
git commit -m "fix: address review feedback"
git push origin feature/your-feature-name
```

### Step 7: Merge and Clean Up

Once your PR is approved and merged:

```bash
# Switch back to main and pull the latest changes
git checkout main
git pull origin main

# Delete your local feature branch (optional but recommended)
git branch -d feature/your-feature-name
```

### Quick Reference Commands

| Action                    | Command                    |
| ------------------------- | -------------------------- |
| Check current branch      | `git branch`               |
| See all branches          | `git branch -a`            |
| Switch to a branch        | `git checkout branch-name` |
| Check status              | `git status`               |
| View commit history       | `git log --oneline`        |
| Discard local changes     | `git checkout -- filename` |
| Stash changes temporarily | `git stash`                |
| Apply stashed changes     | `git stash pop`            |

### Need Help?

- Run `git status` to see what's happening in your repo
- Run `git log --oneline -5` to see recent commits
- Ask a team member if you're stuck!

## Troubleshooting

### `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` when running `pnpm install`

If you see an error like:

```
ERR_PNPM_WORKSPACE_PKG_NOT_FOUND In apps/api: "@repo/types@workspace:*" is in the dependencies but no package named "@repo/types" is present in the workspace
```

This means your local repository is missing workspace packages. Fix it by pulling the latest changes:

```bash
git checkout main
git pull origin main
pnpm install
```

If the issue persists, verify that the `packages/` directory contains all required packages:

- `packages/types/`
- `packages/ui/`
- `packages/eslint-config/`
- `packages/typescript-config/`

If any are missing, re-clone the repository or contact a team member.

## Resources

## Beads Workflow

This project uses [Beads](https://github.com/steveyegge/beads) (`bd`) for persistent issue tracking and cross-session memory.

### Quick Start

```bash
bd ready
bd show <id>
bd update <id> --claim
bd close <id>
bd sync
```

### Available Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **Plan a Feature** | `/feature-to-beads` | Analyze requirements, draft implementation plan, save as epic with linked tasks |
| **Execute Next Task** | `/beads-execute` | Pick up highest-priority ready task, execute via agent team, verify, close |
| **Save Session Context** | `/session-to-beads` | Capture remaining work, bugs, and decisions before ending a session |
| **Project Setup** | `/beads-project-setup` | Initialize Beads in a new project |

### Workflow

```text
  /feature-to-beads -> plan feature -> epic + tasks
          |
          v
    /beads-execute -> execute next ready task -> verify -> close
          |
          v
   /session-to-beads -> save remaining context before ending session
```

### Key Commands

| Command | What It Does |
|---------|-------------|
| `bd ready --json` | List unblocked tasks by priority |
| `bd show <id>` | Full task details with dependencies |
| `bd create "title" -t task -p 2 -d "desc" --json` | Create a new task |
| `bd update <id> --claim` | Atomically assign + mark in-progress |
| `bd close <id> --reason "done"` | Complete a task |
| `bd dep add <child> <parent>` | Link a dependency |
| `bd epic <id>` | View an epic and its tasks |
| `bd search "query"` | Full-text search across all issues |
| `bd doctor` | Health check |
| `bd sync` | Commit and push to git |

https://www.youtube.com/watch?v=uFXUniSm7HM - how to build your Own AI Code Review Bot with Cline CLI

https://www.youtube.com/watch?v=hkAp42HBNXw - How to automate workflows with Kestra
