# AI Concierge - 3-Day Final Sprint

**Project:** AI Concierge - An AI receptionist that researches local service providers, calls them to verify availability/rates, and helps users book appointments.

**Hackathon Sponsors:** Kestra (workflow orchestration), VAPI.ai (voice AI), Gemini (LLM), Vercel (deployment)

**Team:**
| Role | Experience | Focus Areas |
|------|------------|-------------|
| **S1 (Senior)** | 17 years | Architecture, critical path, complex integrations |
| **M1 (Mid-level)** | 5 years | Feature development, APIs, frontend components |
| **J1 (Junior)** | 1 year | UI polish, testing, documentation |

**Timeline:** Wednesday - Friday (3 days remaining)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Quick Reference](#2-architecture-quick-reference)
3. [Current State - What's Done](#3-current-state---whats-done)
4. [Gaps Remaining](#4-gaps-remaining)
5. [Key Files Map](#5-key-files-map)
6. [Wednesday Schedule](#wednesday-backend-apis--vapi-fixes)
7. [Thursday Schedule](#thursday-frontend--real-time)
8. [Friday Schedule](#friday-kestra-cloud--demo)
9. [Environment Setup](#environment-setup)
10. [Testing & Submission](#testing--submission)

---

## 1. Project Overview

### What It Does

AI Concierge automates the tedious process of finding and booking service providers:

1. **User submits request** - "Find a licensed plumber in Greenville SC, available within 2 days"
2. **AI researches** - Finds 10+ providers via Gemini + Google Places API
3. **AI calls providers** - Makes real phone calls via VAPI.ai to verify availability/rates
4. **AI analyzes** - Scores providers, recommends top 3
5. **User selects** - Picks preferred provider from recommendations
6. **AI books** - Calls provider back to schedule appointment
7. **Confirmation** - User receives confirmation via SMS/web

### Two Request Types

| Type | Route | Purpose |
|------|-------|---------|
| **Research & Book** | `/new` | Full flow: research → call → recommend → book |
| **Direct Task** | `/direct` | Single call: user provides phone, AI performs task (negotiate, inquire, etc.) |

### User Journey Diagram

```
User Submits Request
        │
        ▼
┌───────────────────┐
│  AI RESEARCHES    │ ← Gemini + Google Places (DONE)
│  10+ providers    │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  AI CALLS (VAPI)  │ ← Concurrent calls, 5 at a time (DONE)
│  Verify each one  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  AI RECOMMENDS    │ ← 🔴 NEEDS: recommend_providers API
│  Top 3 providers  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  USER SELECTS     │ ← 🔴 NEEDS: UI components
│  Choose provider  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  AI BOOKS         │ ← 🔴 NEEDS: schedule_service API
│  Calls back       │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  CONFIRMATION     │ ← 🔴 NEEDS: notify_user API
│  SMS/Web notify   │
└───────────────────┘
```

---

## 2. Architecture Quick Reference

### Monorepo Structure

```
concierge-ai/
├── apps/
│   ├── web/                 # Next.js 16 frontend (Port 3000)
│   │   ├── app/             # Pages (/, /new, /direct, /request/[id], /history)
│   │   ├── components/      # Reusable UI components
│   │   └── lib/             # Services, hooks, providers, types
│   └── api/                 # Fastify 5 backend (Port 8000)
│       ├── routes/          # API endpoints
│       └── services/        # Business logic (vapi/, research/, direct-task/)
├── kestra/
│   ├── flows/               # Workflow YAML definitions
│   └── scripts/             # Node.js scripts for Kestra tasks
├── supabase/
│   └── migrations/          # Database schema SQL files
└── packages/                # Shared packages (ui, types, config)
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 | User interface |
| Backend | Fastify 5, TypeScript 5.9, Zod | API server |
| Database | Supabase (PostgreSQL) | Persistence, real-time subscriptions |
| AI/LLM | Gemini 2.5 Flash | Research, analysis, dynamic prompts |
| Voice AI | VAPI.ai | Automated phone calls |
| Workflow | Kestra | Orchestration (local Docker + Cloud) |
| Deployment | Vercel (web), Railway (api) | Production hosting |

### API Request Flow

```
Browser → Next.js (:3000) → /api/* rewrites → Fastify (:8000) → Services
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              ▼                     ▼                     ▼
                          Supabase              VAPI.ai               Gemini
                         (Database)             (Calls)                (AI)
```

---

## 3. Current State - What's Done

### VAPI Calling System (95% Complete) ⬆️ Updated Dec 10

**Working:**
- Direct VAPI SDK with hybrid webhook/polling architecture
- Concurrent calling (5 providers simultaneously via batching)
- Call result extraction: transcript, structured data, analysis
- Database persistence of all call data
- Voicemail/no-answer detection (status tracked in `call_outcome`)
- ✅ **NEW: Auto-disconnect on voicemail** (AI invokes `endCall` immediately)
- Disqualification logic (polite exit when provider can't meet criteria)
- Single-person tracking (ensures ONE technician has ALL required qualities)

**Missing:**
- Retry logic for failed calls

### Research System (95% Complete)

**Working:**
- Gemini-powered provider search with Google Maps grounding
- Google Places API enrichment (hours, phone, ratings, reviews, distance)
- Fallback between Kestra orchestration and direct API calls
- Returns 10+ providers with full details

### ✅ NEW: Recommendation System (100% Complete) - Added Dec 10

**Working:**
- `RecommendationService` with Gemini 2.0 Flash analysis
- `POST /api/v1/providers/recommend` endpoint
- Weighted scoring: availability (30%), rate (20%), criteria (25%), quality (15%), professionalism (10%)
- Returns top 3 providers with scores, reasoning, and criteria matched
- Handles edge cases: no qualified providers, API failures

**Key Files:**
- `apps/api/src/services/recommendations/recommend.service.ts`
- `apps/api/src/services/recommendations/types.ts`

### Direct Task System (90% Complete)

**Working:**
- Task type classification: negotiate, complain, refund, schedule, cancel, inquire, general
- Dynamic prompt generation via Gemini analyzer
- Custom VAPI assistant configuration per task type
- Task analysis returns: difficulty level, key goals, talking points, objection handlers

**Missing:**
- Transcript display after call completes
- Results summary shown to user
- Task analysis display (what AI planned to do)

### Frontend Pages (98% Complete) ⬆️ Updated Dec 10

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Dashboard | `/` | ✅ Done | Stats cards, recent activity |
| New Request | `/new` | ✅ Done | Full research & book form |
| Direct Task | `/direct` | Partial | Form works, needs transcript/results display |
| Request Detail | `/request/[id]` | ✅ Done | Timeline, **real-time updates**, **top 3 recommendations**, **selection flow** |
| History | `/history` | ✅ Done | Shows all past requests |

**New Components (Dec 10, 2025):**
- `components/LiveStatus.tsx` - Real-time status animations
- `components/RecommendedProviders.tsx` - Top 3 provider cards with scoring
- `components/SelectionModal.tsx` - Booking confirmation dialog

### Database Schema (100% Complete)

**Tables:** `users`, `service_requests`, `providers`, `interaction_logs`

**Key columns in `providers`:**
- `call_status`, `call_result` (JSONB), `call_transcript`, `call_summary`
- `call_duration_minutes`, `call_cost`, `call_method`, `call_id`, `called_at`
- `review_count`, `distance`, `hours_of_operation`, `is_open_now`, `place_id`

### Kestra Workflows (3 of 6 Complete)

| Workflow | File | Status |
|----------|------|--------|
| `research_providers` | `research_agent.yaml` | Done |
| `contact_providers` | `contact_agent.yaml` | Done |
| `contact_providers_concurrent` | `contact_providers_concurrent.yaml` | Done |
| `recommend_providers` | - | Needs creation |
| `notify_user` | - | Needs creation (SMS via Twilio) |
| `schedule_service` | - | Needs creation (VAPI callback) |

### Deployment (100% Complete)

| Service | Platform | Status |
|---------|----------|--------|
| Web App | Vercel | Deployed |
| API | Railway | Deployed |
| Kestra | Docker (local) | Running at localhost:8082 |

---

## 4. Gaps Remaining

### Critical (Must Have for Demo)

| ID | Feature | Description | Owner | Status |
|----|---------|-------------|-------|--------|
| C1 | VAPI Voicemail Auto-Disconnect | AI should hang up immediately on voicemail | S1 | ✅ DONE |
| C2 | recommend_providers API | Analyze call results, return top 3 with AI reasoning | S1 | ✅ DONE |
| C3 | Real-time UI Updates | Enable Supabase subscriptions on request detail page | M1 | ✅ DONE |
| C4 | Top 3 Providers Display | Card component showing recommendations with Select button | M1 | ✅ DONE |
| C5 | User Selection Flow | Handle selection, show confirmation modal | M1 | ✅ DONE |
| C6 | /direct Transcript Display | Show call transcript after direct task completes | M1 | 🔴 TODO |
| C7 | /direct Results Summary | Display task outcome, key findings, success/failure | M1 | 🔴 TODO |
| C8 | Demo Video | 2-minute walkthrough showing all 4 sponsors | All | 🔴 TODO |

**Implementation Summary (Dec 10, 2025):**
- **C1**: Added `voicemailDetection` config + prompt instructions to all VAPI assistants
- **C2**: Created `RecommendationService` with Gemini scoring + `POST /api/v1/providers/recommend` endpoint
- **C3**: Added Supabase real-time subscriptions to `request/[id]/page.tsx`
- **C4**: Created `RecommendedProviders.tsx` component with scores, badges, and selection
- **C5**: Created `SelectionModal.tsx` + integrated selection handlers

### Important (Should Have)

| ID | Feature | Description | Owner |
|----|---------|-------------|-------|
| I1 | notify_user API | SMS (Twilio) or call (VAPI) to notify user | S1 |
| I2 | schedule_service API | Call provider back to book appointment | S1 |
| I3 | show_confirmation API | Send confirmation, update database | M1 |
| I4 | Kestra Cloud Deployment | Deploy all workflows to Kestra Cloud | M1 |
| I5 | Business Hours Check | Skip calling providers currently closed | J1 |

### Nice to Have

| ID | Feature | Description | Owner |
|----|---------|-------------|-------|
| N1 | History Page Enhancement | Show transcripts, recommendations for past requests | J1 |
| N2 | Loading Skeletons | Better loading states during operations | J1 |
| N3 | Responsive Testing | Test all new components on mobile viewports | J1 |

---

## 5. Key Files Map

### Backend - Where to Make Changes

```
apps/api/src/
├── routes/
│   ├── providers.ts              # ✅ DONE: Added /recommend endpoint
│   ├── notifications.ts          # CREATE: /notify, /confirm endpoints
│   └── vapi-webhook.ts           # EXISTS: Webhook handler (complete)
├── services/
│   ├── vapi/
│   │   ├── assistant-config.ts   # ✅ DONE: Added voicemail auto-disconnect
│   │   ├── direct-vapi.client.ts # EXISTS: Initiates calls, handles polling
│   │   ├── concurrent-call.service.ts # EXISTS: Batch concurrent calls
│   │   └── call-result.service.ts     # EXISTS: Saves to database
│   ├── recommendations/          # ✅ DONE: Created folder
│   │   ├── recommend.service.ts  # ✅ DONE: Top 3 scoring with Gemini
│   │   ├── types.ts              # ✅ DONE: TypeScript interfaces
│   │   └── index.ts              # ✅ DONE: Exports
│   └── notifications/            # CREATE: New folder
│       └── twilio.service.ts     # CREATE: SMS sending
```

### Frontend - Where to Make Changes

```
apps/web/
├── app/
│   ├── direct/
│   │   └── page.tsx              # MODIFY: Add transcript + results display
│   ├── request/[id]/
│   │   └── page.tsx              # ✅ DONE: Added real-time + component integration
│   └── history/
│       └── page.tsx              # OPTIONAL: Enhance with transcripts
├── components/
│   ├── RecommendedProviders.tsx  # ✅ DONE: Top 3 provider cards with scoring
│   ├── SelectionModal.tsx        # ✅ DONE: Confirm selection dialog
│   ├── LiveStatus.tsx            # ✅ DONE: Real-time status indicator
│   ├── DirectTaskResults.tsx     # CREATE: Transcript + outcome display
│   └── LogItem.tsx               # EXISTS: Already has transcript rendering
├── lib/
│   ├── hooks/
│   │   └── useServiceRequests.ts # EXISTS: Real-time enabled in page.tsx directly
│   └── services/
│       ├── geminiService.ts      # EXISTS: Frontend API client
│       └── providerCallingService.ts # EXISTS: VAPI call client
```

### Kestra - Workflow Files

```
kestra/flows/
├── research_agent.yaml               # Done
├── contact_agent.yaml                # Done
├── contact_providers_concurrent.yaml # Done
├── recommend_providers.yaml          # CREATE
├── notify_user.yaml                  # CREATE (SMS via Twilio)
└── schedule_service.yaml             # CREATE (VAPI callback)
```

---

## Wednesday: Backend APIs & VAPI Fixes

**Goal:** All backend APIs complete and tested. VAPI handles voicemail correctly.

---

### S1 (Senior) Tasks

#### TICKET: W-S1-1 - VAPI Voicemail Auto-Disconnect
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
Currently, the VAPI assistant DETECTS voicemail (it's in the structured data schema as `call_outcome: "voicemail"`) but the AI continues talking to the voicemail instead of hanging up. This wastes VAPI credits and creates useless call data.

**Acceptance Criteria:**
- [ ] When AI detects voicemail greeting phrases (e.g., "leave a message after the beep"), it immediately invokes `endCall`
- [ ] Voicemail detection happens within 10 seconds of call start
- [ ] Call result shows `status: "voicemail"` and `endedReason: "voicemail_detected"`
- [ ] No voicemail messages are left (AI doesn't speak after detection)

**Implementation Hints:**
- Modify `apps/api/src/services/vapi/assistant-config.ts`
- Add `voicemailDetection` configuration to the assistant config
- Update system prompt with explicit voicemail detection instructions
- Test with a real phone number that goes to voicemail

**Validation:**
Call a number that goes to voicemail. Call should end within 15 seconds with voicemail status.

---

#### TICKET: W-S1-2 - Recommend Providers API
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
After calling providers, we have call results but no way to analyze them and select the top 3. The frontend needs an API that scores providers and explains why each is recommended.

**Acceptance Criteria:**
- [ ] `POST /api/v1/providers/recommend` endpoint accepts array of call results
- [ ] Uses Gemini to analyze results against original user criteria
- [ ] Returns exactly top 3 providers (or fewer if not enough qualified)
- [ ] Each provider has: score (0-100), reasoning (2-3 sentences), criteriaMatched array
- [ ] Includes overall recommendation explaining best choice
- [ ] Handles edge case: no qualified providers returns helpful message

**Data Structures:**

Input: `{ callResults: CallResult[], originalCriteria: string }`

Output:
```
{
  topProviders: [
    { providerName, phone, score, reasoning, criteriaMatched, earliestAvailability, estimatedRate }
  ],
  overallRecommendation: string,
  analysisNotes: string
}
```

**Scoring Weights (suggested):**
- Availability urgency (sooner = better): 30%
- Rate competitiveness: 20%
- All criteria explicitly met: 25%
- Call quality (clear communication): 15%
- Professionalism signals: 10%

**Implementation Hints:**
- Create `apps/api/src/services/recommendations/recommend.service.ts`
- Use `gemini-2.0-flash-exp` model for analysis
- Filter out: `status !== "completed"`, `availability === "unavailable"`, `disqualified === true`
- Add route in `apps/api/src/routes/providers.ts`

---

#### TICKET: W-S1-3 - Schedule Service API
**Priority:** P1 Important | **Effort:** 2 hours | **Dependencies:** W-S1-2

**Problem:**
After user selects a provider, we need to call them back to actually book the appointment. This requires a different VAPI assistant focused on booking rather than screening.

**Acceptance Criteria:**
- [ ] `POST /api/v1/providers/schedule` endpoint initiates booking call
- [ ] Uses booking-specific VAPI assistant (different prompts than screening)
- [ ] Assistant confirms: date, time, customer name, customer phone
- [ ] Returns booking confirmation or failure reason
- [ ] Structured data captures: `booking_confirmed`, `confirmed_date`, `confirmed_time`, `confirmation_number`

**Input:**
```
{
  providerId: string,
  providerPhone: string,
  providerName: string,
  appointmentDetails: {
    preferredDate: string,
    preferredTime: string,
    serviceDescription: string,
    customerName: string,
    customerPhone: string
  }
}
```

**Implementation Hints:**
- Create `apps/api/src/services/vapi/booking-assistant-config.ts`
- Different system prompt focused on scheduling, not screening
- First message should reference previous call: "We spoke earlier about {service}"
- Use `endCallFunctionEnabled: true`

---

#### TICKET: W-S1-4 - Notify User API
**Priority:** P1 Important | **Effort:** 2 hours | **Dependencies:** W-S1-2

**Problem:**
Users need to be notified when recommendations are ready. We need SMS capability (Twilio) with fallback to web-only notification.

**Acceptance Criteria:**
- [ ] `POST /api/v1/notifications/notify` sends SMS to user
- [ ] Message includes top 3 provider names and availability
- [ ] Message includes link to view full details on web
- [ ] Message allows reply selection (1, 2, or 3)
- [ ] Graceful fallback if Twilio credentials not configured

**SMS Template:**
```
AI Concierge found your top providers:

1. {name1} - {availability1}
2. {name2} - {availability2}
3. {name3} - {availability3}

Reply 1, 2, or 3 to book, or visit:
{requestUrl}
```

**Implementation Hints:**
- Create `apps/api/src/services/notifications/twilio.service.ts`
- Use Twilio SDK: `npm install twilio`
- Create `apps/api/src/routes/notifications.ts`
- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

---

#### TICKET: W-S1-5 - Integration Testing
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** W-S1-1 through W-S1-4

**Problem:**
Before handing off to frontend team, backend flow must be verified end-to-end.

**Acceptance Criteria:**
- [ ] Can trigger research and get 10+ providers
- [ ] Can call multiple providers concurrently
- [ ] Voicemail calls end quickly
- [ ] Can get top 3 recommendations from call results
- [ ] Can send SMS notification (if Twilio configured)
- [ ] All APIs return proper error messages on failure

**Test Sequence:**
1. `POST /api/v1/research/search` → Get providers
2. `POST /api/v1/providers/call` → Call one provider
3. `POST /api/v1/providers/recommend` → Analyze results
4. `POST /api/v1/notifications/notify` → Send SMS

---

### M1 (Mid-level) Tasks

#### TICKET: W-M1-1 - Confirmation API
**Priority:** P1 Important | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
After booking completes, we need to send confirmation to user and update database with final outcome.

**Acceptance Criteria:**
- [ ] `POST /api/v1/notifications/confirm` updates database status to 'completed'
- [ ] Stores `final_outcome` with provider name, date, time
- [ ] Sends confirmation SMS with appointment details
- [ ] Supports web-only mode (just DB update, frontend shows it)

**Input:**
```
{
  serviceRequestId: string,
  userPhone: string,
  method: "sms" | "web",
  providerName: string,
  appointmentDate: string,
  appointmentTime: string
}
```

---

#### TICKET: W-M1-2 - API Route Registration
**Priority:** P0 Critical | **Effort:** 1 hour | **Dependencies:** W-S1-2, W-S1-3, W-S1-4

**Problem:**
New API files need to be registered in the main Fastify app.

**Acceptance Criteria:**
- [ ] All new routes accessible via API
- [ ] Proper prefixing: `/api/v1/providers/*`, `/api/v1/notifications/*`
- [ ] Zod validation schemas for all endpoints
- [ ] Swagger/OpenAPI docs updated (if applicable)

**Files to modify:**
- `apps/api/src/index.ts` - Register route handlers

---

#### TICKET: W-M1-3 - Type Definitions
**Priority:** P0 Critical | **Effort:** 1 hour | **Dependencies:** W-S1-2

**Problem:**
New API request/response types need TypeScript definitions for type safety.

**Acceptance Criteria:**
- [ ] `RecommendedProvider` interface defined
- [ ] `RecommendationResult` interface defined
- [ ] `BookingRequest` interface defined
- [ ] `NotificationRequest` interface defined
- [ ] All types exported from appropriate locations

**Files to modify:**
- `apps/api/src/services/vapi/types.ts`
- `apps/api/src/services/recommendations/types.ts` (create)

---

### J1 (Junior) Tasks

#### TICKET: W-J1-1 - Business Hours Utility
**Priority:** P2 Nice-to-have | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
We waste VAPI credits calling providers who are closed. Need utility to check business hours before calling.

**Acceptance Criteria:**
- [ ] `isProviderOpen(hoursJson)` function returns boolean
- [ ] Parses Google Places hours format: `["Monday: 9 AM – 5 PM", ...]`
- [ ] Handles "Closed", "24 hours", missing data
- [ ] Uses current local time for comparison

**Files to create:**
- `apps/api/src/utils/business-hours.ts`

**Test cases:**
- "Monday: 9 AM – 5 PM" at 10 AM Monday → true
- "Monday: Closed" on Monday → false
- "Monday: 24 hours" anytime Monday → true
- `null` or `[]` → true (assume open)

---

#### TICKET: W-J1-2 - Test Data Setup
**Priority:** P1 Important | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
Team needs consistent test data for development and demo.

**Acceptance Criteria:**
- [ ] 5 mock provider records in database
- [ ] 1 sample service request with status "completed"
- [ ] Sample call results JSON for testing recommend API
- [ ] Document test phone numbers that are safe to call

**Deliverables:**
- SQL insert statements or Supabase seed file
- JSON fixture files for API testing
- README section with test data instructions

---

#### TICKET: W-J1-3 - API Documentation
**Priority:** P2 Nice-to-have | **Effort:** 2 hours | **Dependencies:** W-M1-2

**Problem:**
New endpoints need documentation for team and future reference.

**Acceptance Criteria:**
- [ ] CLAUDE.md updated with new endpoint descriptions
- [ ] Request/response examples for each endpoint
- [ ] Error codes and their meanings documented

---

## Thursday: Frontend & Real-Time

**Goal:** User can see live updates, view recommendations, select provider, and see direct task results.

---

### M1 (Mid-level) Tasks

#### TICKET: T-M1-1 - Enable Supabase Real-Time
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
The real-time hook exists (`useServiceRequests.ts`) but isn't used. Request detail page should update automatically when backend changes data.

**Acceptance Criteria:**
- [ ] Subscribe to `service_requests` table changes for current request ID
- [ ] Subscribe to `interaction_logs` table for new log entries
- [ ] UI updates within 1 second of database change
- [ ] Proper cleanup on component unmount (remove channel)
- [ ] Fallback to manual refresh if subscription fails

**Implementation Hints:**
- Use `supabase.channel()` with `postgres_changes` event
- Filter by request ID: `filter: \`id=eq.${id}\``
- Merge real-time data with local state

**Files to modify:**
- `apps/web/app/request/[id]/page.tsx`

---

#### TICKET: T-M1-2 - Live Status Component
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
Users don't see what's happening during the research/calling flow. Need visual status indicator.

**Acceptance Criteria:**
- [ ] Shows current phase: Searching → Calling → Analyzing → Completed
- [ ] Calling phase shows progress: "Calling provider 3 of 10: ABC Plumbing"
- [ ] Animated indicators for active phases
- [ ] Green checkmark for completed, red X for failed
- [ ] Matches app's dark theme styling

**States to support:**
- `searching`: Blue, animated, "Searching for providers..."
- `calling`: Amber, animated, "Calling provider X of Y: {name}"
- `analyzing`: Purple, animated, "Analyzing results..."
- `completed`: Green, static, "Complete!"
- `failed`: Red, static, "Request failed"

**Files to create:**
- `apps/web/components/LiveStatus.tsx`

---

#### TICKET: T-M1-3 - Recommended Providers Component
**Priority:** P0 Critical | **Effort:** 3 hours | **Dependencies:** W-S1-2 (API must exist)

**Problem:**
After calls complete, user needs to see the top 3 recommended providers with scores and reasoning.

**Acceptance Criteria:**
- [ ] Displays up to 3 provider cards in ranked order
- [ ] First card has "BEST MATCH" badge
- [ ] Each card shows: name, score (0-100), rating, availability, rate, reasoning
- [ ] Criteria matched displayed as green checkmark chips
- [ ] "Select This Provider" button on each card
- [ ] Loading state while recommendations being generated
- [ ] Empty state if no qualified providers

**Card layout:**
```
┌─────────────────────────────────────┐
│ 🏆 BEST MATCH                    95 │
│ ABC Plumbing                  score │
│                                     │
│ ⭐ 4.8 (127)  🕐 Tomorrow 2pm       │
│ 💵 $85/hour                         │
│                                     │
│ "Best availability and competitive  │
│ rate. Confirmed licensed."          │
│                                     │
│ ✓ Licensed  ✓ Available  ✓ Insured │
│                                     │
│     [ Select This Provider ]        │
└─────────────────────────────────────┘
```

**Files to create:**
- `apps/web/components/RecommendedProviders.tsx`

---

#### TICKET: T-M1-4 - Selection Confirmation Modal
**Priority:** P0 Critical | **Effort:** 1 hour | **Dependencies:** T-M1-3

**Problem:**
When user clicks "Select This Provider", confirm before initiating booking call.

**Acceptance Criteria:**
- [ ] Modal appears over page content
- [ ] Shows provider name, phone, earliest availability
- [ ] Explains: "Our AI will call them now to schedule"
- [ ] Cancel button closes modal
- [ ] Confirm button triggers booking API call
- [ ] Loading state during booking call
- [ ] Error state if booking fails

**Files to create:**
- `apps/web/components/SelectionModal.tsx`

---

#### TICKET: T-M1-5 - Direct Task Results Display
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
The `/direct` page initiates calls but doesn't show the transcript or results afterward. Users need to see what happened.

**Current behavior:**
1. User fills form (name, phone, task)
2. Page redirects to `/request/[id]`
3. Call happens in background
4. User sees generic timeline but no transcript

**Acceptance Criteria:**
- [ ] After call completes, show full transcript in chat bubble format
- [ ] Display task outcome summary: success/failure, key findings
- [ ] Show call metadata: duration, call ID
- [ ] Display AI's task analysis (what it planned to do)
- [ ] Works for both live VAPI calls and simulated calls

**Transcript display should use existing LogItem pattern:**
- `apps/web/app/request/[id]/page.tsx` lines 52-77 already have transcript rendering
- Issue: transcript data not being populated from VAPI response
- Fix: Ensure `callResponseToInteractionLog()` extracts transcript correctly

**Files to modify:**
- `apps/web/lib/services/providerCallingService.ts` - Fix transcript extraction
- `apps/web/app/request/[id]/page.tsx` - Ensure transcript renders

**Files to create (optional):**
- `apps/web/components/DirectTaskResults.tsx` - Specialized results summary

---

#### TICKET: T-M1-6 - Integrate Components into Request Page
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** T-M1-1 through T-M1-5

**Problem:**
New components need to be wired into the request detail page.

**Acceptance Criteria:**
- [ ] LiveStatus shows at top of page during active requests
- [ ] RecommendedProviders appears after calling phase completes
- [ ] SelectionModal triggers on provider selection
- [ ] Direct task results display for DIRECT_TASK type requests
- [ ] Real-time updates flow through to all components
- [ ] Mobile responsive layout

**Files to modify:**
- `apps/web/app/request/[id]/page.tsx`

---

### S1 (Senior) Tasks

#### TICKET: T-S1-1 - Debug Real-Time Issues
**Priority:** P1 Important | **Effort:** 2 hours | **Dependencies:** T-M1-1

**Problem:**
Supabase real-time can be tricky. Support M1 with debugging.

**Potential issues to watch for:**
- RLS policies blocking subscriptions
- Channel naming conflicts
- Event filtering not matching
- State merge conflicts

---

#### TICKET: T-S1-2 - API Refinements
**Priority:** P1 Important | **Effort:** 2 hours | **Dependencies:** All Wednesday backend tasks

**Problem:**
Frontend integration often reveals API issues that need adjustment.

**Potential adjustments:**
- Response format changes
- Additional fields needed
- Error message improvements
- Performance optimizations

---

### J1 (Junior) Tasks

#### TICKET: T-J1-1 - History Page Enhancement
**Priority:** P2 Nice-to-have | **Effort:** 3 hours | **Dependencies:** None

**Problem:**
History page shows basic request info but could show more useful data.

**Acceptance Criteria:**
- [ ] Show call status icons (completed, failed, voicemail)
- [ ] Display top recommendation name if available
- [ ] Show final outcome summary
- [ ] Link to full details page

**Files to modify:**
- `apps/web/app/history/page.tsx`

---

#### TICKET: T-J1-2 - Loading Skeletons
**Priority:** P2 Nice-to-have | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
Loading states should show content structure, not just spinners.

**Acceptance Criteria:**
- [ ] Provider cards have skeleton layout
- [ ] Timeline items have skeleton layout
- [ ] Stats cards have skeleton layout
- [ ] Skeletons match actual content dimensions

**Files to create:**
- `apps/web/components/Skeletons.tsx`

---

#### TICKET: T-J1-3 - Responsive Testing
**Priority:** P1 Important | **Effort:** 1 hour | **Dependencies:** T-M1-3, T-M1-4

**Problem:**
New components must work on mobile for demo.

**Acceptance Criteria:**
- [ ] Test at 375px width (iPhone SE)
- [ ] Test at 768px width (iPad)
- [ ] All buttons tappable (min 44px)
- [ ] Text readable without zooming
- [ ] Modal doesn't overflow viewport

---

## Friday: Kestra Cloud & Demo

**Goal:** Deploy to Kestra Cloud, final testing, record demo video, submit.

---

### M1 (Mid-level) Tasks

#### TICKET: F-M1-1 - Kestra Cloud Setup
**Priority:** P1 Important | **Effort:** 2 hours | **Dependencies:** None

**Problem:**
Kestra currently runs locally. Need to deploy to Kestra Cloud for production use and demo.

**Acceptance Criteria:**
- [ ] Create Kestra Cloud account at https://kestra.io
- [ ] Create namespace: `ai_concierge`
- [ ] Configure all required secrets
- [ ] Verify connectivity from Railway backend

**Secrets to configure:**
- `VAPI_API_KEY`
- `VAPI_PHONE_NUMBER_ID`
- `GEMINI_API_KEY`
- `TWILIO_ACCOUNT_SID` (if using)
- `TWILIO_AUTH_TOKEN` (if using)
- `TWILIO_PHONE_NUMBER` (if using)

---

#### TICKET: F-M1-2 - Deploy Existing Workflows
**Priority:** P1 Important | **Effort:** 1 hour | **Dependencies:** F-M1-1

**Problem:**
Need to upload our 3 working workflows to Kestra Cloud.

**Acceptance Criteria:**
- [ ] `research_agent.yaml` deployed and runnable
- [ ] `contact_agent.yaml` deployed and runnable
- [ ] `contact_providers_concurrent.yaml` deployed and runnable
- [ ] Test one workflow execution end-to-end

---

#### TICKET: F-M1-3 - Create Missing Workflows
**Priority:** P1 Important | **Effort:** 1 hour | **Dependencies:** F-M1-2

**Problem:**
3 workflows need to be created for full orchestration.

**Acceptance Criteria:**
- [ ] `recommend_providers.yaml` - Calls recommend API, returns top 3
- [ ] `notify_user.yaml` - Sends SMS notification via Twilio
- [ ] `schedule_service.yaml` - Calls schedule API to book

**Note:** These can be simple HTTP call wrappers to existing APIs, or can contain full logic in Kestra tasks.

---

### S1 (Senior) Tasks

#### TICKET: F-S1-1 - End-to-End Testing
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** All previous tasks

**Problem:**
Full user journey must work before demo recording.

**Test script:**
1. Go to `/new`, submit request for "plumber in Greenville SC"
2. Watch real-time status: Searching → Calling → Analyzing
3. See top 3 recommendations appear
4. Click "Select This Provider" on #1
5. Confirm in modal
6. See booking status update
7. Verify database has final outcome

**Acceptance Criteria:**
- [ ] Complete flow without errors
- [ ] All status transitions visible
- [ ] Recommendations appear correctly
- [ ] Selection flow completes
- [ ] Duration under 3 minutes total

---

#### TICKET: F-S1-2 - Bug Fixes
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** F-S1-1

**Problem:**
Issues found during testing must be fixed before demo.

**Process:**
1. Document each bug found
2. Prioritize by demo impact
3. Fix critical bugs only (demo blockers)
4. Document known issues for later

---

#### TICKET: F-S1-3 - Production Environment Check
**Priority:** P0 Critical | **Effort:** 1 hour | **Dependencies:** F-S1-2

**Problem:**
Verify all environment variables and services are working in production.

**Checklist:**
- [ ] Vercel web app loads correctly
- [ ] Railway API responds to health check
- [ ] Supabase database accessible
- [ ] VAPI credentials working
- [ ] Gemini API responding
- [ ] Kestra Cloud flows accessible
- [ ] Twilio SMS working (if configured)

---

### All Team Tasks

#### TICKET: F-ALL-1 - Demo Video Recording
**Priority:** P0 Critical | **Effort:** 2 hours | **Dependencies:** F-S1-1

**Problem:**
Need 2-minute demo video showing all 4 sponsor technologies.

**Script outline:**
```
[0:00-0:15] Intro
- "This is AI Concierge - finds and books service providers automatically"

[0:15-0:45] The Problem
- "Normally, finding a plumber means calling 10+ companies, waiting on hold..."

[0:45-1:15] Submit Request
- Show /new page, fill form, submit
- "I just describe what I need..."

[1:15-1:30] Kestra Orchestration
- Show Kestra Cloud UI with running workflow
- "Kestra orchestrates our AI workflows..."

[1:30-1:45] VAPI Calls
- Show call status, maybe audio snippet
- "VAPI.ai makes real phone calls..."

[1:45-2:00] Recommendations
- Show top 3 cards with scores
- "Gemini AI analyzes and recommends..."

[2:00-2:15] Selection & Booking
- Click select, show confirmation
- "I select my preferred provider..."

[2:15-2:30] Closing
- "AI Concierge - powered by Kestra, VAPI, Gemini, deployed on Vercel"
```

**Requirements:**
- Max 2 minutes
- Show all 4 sponsors
- Clear audio
- No major bugs visible

---

#### TICKET: F-ALL-2 - Final Documentation
**Priority:** P1 Important | **Effort:** 1 hour | **Dependencies:** F-ALL-1

**Problem:**
README needs final updates for submission.

**Acceptance Criteria:**
- [ ] Architecture diagram updated
- [ ] Setup instructions complete
- [ ] Demo video link added
- [ ] Live site URL added
- [ ] Sponsor technology descriptions

---

#### TICKET: F-ALL-3 - Submission
**Priority:** P0 Critical | **Effort:** 30 min | **Dependencies:** F-ALL-1, F-ALL-2

**Problem:**
Complete hackathon submission before deadline.

**Submission checklist:**
- [ ] GitHub repo link (public or shared with judges)
- [ ] Demo video link (YouTube, Loom, or similar)
- [ ] Live site URL
- [ ] Team info
- [ ] Technology descriptions
- [ ] Any required form fields

---

## Environment Setup

### Required Environment Variables

**Backend (`apps/api/.env`):**
```bash
# Server
PORT=8000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI
GEMINI_API_KEY=your-gemini-key

# VAPI
VAPI_API_KEY=your-vapi-key
VAPI_PHONE_NUMBER_ID=your-phone-id
VAPI_WEBHOOK_URL=https://your-domain/api/v1/vapi/webhook
VAPI_MAX_CONCURRENT_CALLS=5

# Twilio (optional)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890

# Kestra
KESTRA_ENABLED=false
KESTRA_URL=http://localhost:8082
```

**Frontend (`apps/web/.env.local`):**
```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_LIVE_CALL_ENABLED=false
```

### Local Development

```bash
# Install dependencies
pnpm install

# Start development (web + api)
pnpm dev

# Start Kestra (optional)
docker compose up -d

# Build (required before Kestra scripts work)
pnpm build
```

---

## Testing & Submission

### Manual Test Checklist

- [ ] Submit new request on `/new`
- [ ] See "Searching..." status update
- [ ] See "Calling..." with provider names
- [ ] See top 3 recommendations
- [ ] Click "Select This Provider"
- [ ] See confirmation modal
- [ ] See booking status
- [ ] Check `/history` shows completed request
- [ ] Test `/direct` page with transcript display

### Submission Requirements

**Technical:**
- [ ] All APIs working in production
- [ ] Frontend deployed and functional
- [ ] Real-time updates working
- [ ] Provider selection flow complete

**Sponsor Integration:**
- [ ] **Kestra:** Workflows in Kestra Cloud, shown in demo
- [ ] **VAPI:** Real calls demonstrated, transcripts visible
- [ ] **Gemini:** Research + recommendations visible
- [ ] **Vercel:** Live production URL

**Materials:**
- [ ] Demo video (max 2 min)
- [ ] GitHub repository
- [ ] README with instructions
- [ ] Submission form completed

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Twilio setup delays | High | Fall back to web-only notification |
| VAPI rate limits | Medium | Limit to 3 concurrent, add delays |
| Kestra Cloud issues | Medium | Keep local Docker as backup |
| Demo bugs | High | Record backup video Thursday evening |
| Provider no-answers | Medium | Test during business hours with 10+ providers |

---

**Last Updated:** December 9, 2025
**Plan Author:** AI Assistant based on comprehensive codebase analysis
