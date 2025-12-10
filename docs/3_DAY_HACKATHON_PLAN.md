# AI Concierge - 3-Day Final Sprint Plan

**Project:** AI Concierge - An AI receptionist that researches local service providers, calls them to verify availability/rates, and helps users book appointments.

**Hackathon Sponsors:** Kestra (workflow orchestration), VAPI.ai (voice AI), Gemini (LLM), Vercel (deployment)

**Team Composition:**
- **S1 (Senior):** 17 years experience - Architecture, complex integrations, critical path items
- **M1 (Mid-level):** 5 years experience - Feature development, API work, moderate complexity
- **J1 (Junior):** 1 year experience - UI components, testing, documentation, guided tasks

**Timeline:** December 10-12, 2025 (3 days remaining)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Current State - What's Complete](#3-current-state---whats-complete)
4. [Gaps Remaining - What's Needed](#4-gaps-remaining---whats-needed)
5. [Key Files Reference](#5-key-files-reference)
6. [Day 1 Schedule](#day-1-backend-apis--vapi-fixes-tuesday)
7. [Day 2 Schedule](#day-2-frontend--real-time-wednesday)
8. [Day 3 Schedule](#day-3-kestra-cloud--demo-thursday)
9. [Environment Setup](#environment-setup)
10. [Testing Guide](#testing-guide)
11. [Submission Checklist](#submission-checklist)

---

## 1. Project Overview

### What AI Concierge Does

AI Concierge is an AI-powered assistant that handles the tedious task of finding and booking service providers. Instead of spending hours calling plumbers, electricians, or other service providers, users describe what they need and the AI:

1. **Researches** - Finds 10+ providers via Google Maps grounding (Gemini AI)
2. **Enriches** - Gets detailed info via Google Places API (hours, phone, ratings)
3. **Calls** - Makes real phone calls via VAPI.ai to verify availability/rates
4. **Analyzes** - Uses Gemini to evaluate call results and rank providers
5. **Recommends** - Shows top 3 qualified providers with earliest availability
6. **Notifies** - Contacts user via SMS/call/web with recommendations
7. **Books** - After user selection, calls provider back to schedule appointment
8. **Confirms** - Sends confirmation to user once booked

### User Flow (Current Implementation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER SUBMITS REQUEST                                                     │
│     └── "Find a licensed plumber in Greenville SC, available within 2 days" │
│                           │                                                  │
│                           ▼                                                  │
│  2. AI RESEARCHES (Gemini + Google Places)                                  │
│     └── Finds 10+ providers with ratings, phone numbers, hours              │
│                           │                                                  │
│                           ▼                                                  │
│  3. AI CALLS PROVIDERS (VAPI.ai)  ◄── We call until 3 qualify               │
│     └── Concurrent calls (5 at a time)                                      │
│     └── Checks: availability, rates, criteria match                         │
│     └── Handles: voicemail, no-answer, disqualification                     │
│                           │                                                  │
│                           ▼                                                  │
│  4. AI ANALYZES & RECOMMENDS (Gemini)  ◄── 🔴 NEEDS IMPLEMENTATION         │
│     └── Scores providers based on call results                              │
│     └── Returns top 3 with reasoning                                        │
│                           │                                                  │
│                           ▼                                                  │
│  5. NOTIFY USER  ◄── 🔴 NEEDS IMPLEMENTATION                                │
│     └── SMS (Twilio) / Call (VAPI) / Web (real-time UI)                    │
│     └── "Here are your top 3 providers, reply 1/2/3 to book"               │
│                           │                                                  │
│                           ▼                                                  │
│  6. USER SELECTS PROVIDER  ◄── 🔴 NEEDS UI                                  │
│     └── Web: Click "Select This Provider" button                            │
│     └── SMS: Reply with number                                              │
│                           │                                                  │
│                           ▼                                                  │
│  7. AI BOOKS APPOINTMENT  ◄── 🔴 NEEDS IMPLEMENTATION                       │
│     └── Calls chosen provider back                                          │
│     └── Uses booking-focused VAPI assistant                                 │
│                           │                                                  │
│                           ▼                                                  │
│  8. CONFIRMATION  ◄── 🔴 NEEDS IMPLEMENTATION                               │
│     └── Updates database with final outcome                                 │
│     └── Sends confirmation via same channel user selected                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Two Request Types

1. **Research & Book** (`/new` page) - Full flow: research → call → recommend → book
2. **Direct Task** (`/direct` page) - Single call: user provides phone, AI performs task (negotiate, complain, etc.)

---

## 2. Architecture & Tech Stack

### Monorepo Structure

```
concierge-ai/
├── apps/
│   ├── web/                    # Next.js 16 frontend (Port 3000)
│   │   ├── app/                # App Router pages
│   │   ├── components/         # Reusable UI components
│   │   └── lib/                # Services, hooks, providers
│   └── api/                    # Fastify 5 backend (Port 8000)
│       ├── routes/             # API endpoints
│       └── services/           # Business logic
│           ├── vapi/           # VAPI calling services
│           ├── research/       # Provider research services
│           ├── direct-task/    # Direct task analysis
│           └── places/         # Google Places integration
├── kestra/
│   ├── flows/                  # Workflow YAML definitions
│   └── scripts/                # Node.js scripts for Kestra tasks
├── supabase/
│   └── migrations/             # Database schema
└── packages/                   # Shared packages (ui, types, config)
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4 | User interface |
| **Backend** | Fastify 5, TypeScript 5.9 | API server |
| **Database** | Supabase (PostgreSQL) | Data persistence, real-time |
| **AI/LLM** | Gemini 2.5 Flash | Research, analysis, prompts |
| **Voice AI** | VAPI.ai | Automated phone calls |
| **Workflow** | Kestra | Orchestration (local Docker + Cloud) |
| **Deployment** | Vercel (web), Railway (api) | Production hosting |

### API Flow

```
Frontend (Next.js :3000)
    │
    │ HTTP requests to /api/*
    ▼
Next.js rewrites ────────────► Backend (Fastify :8000)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Supabase         VAPI.ai          Gemini
              (Database)       (Calls)          (AI)
```

---

## 3. Current State - What's Complete

### ✅ VAPI Calling System (95% Complete) ⬆️ Updated Dec 10

**What Works:**
- Direct VAPI SDK integration with hybrid webhook/polling
- Concurrent calling (5 providers simultaneously)
- Call result extraction (transcript, structured data, analysis)
- Database persistence of all call data
- Voicemail/no-answer DETECTION (status tracked)
- ✅ **NEW: Auto-disconnect on voicemail** (AI invokes `endCall` immediately)
- Disqualification logic (polite exit when provider can't meet criteria)
- Single-person tracking (ensures ONE technician has ALL qualities)

**Key Files:**
| File | Purpose |
|------|---------|
| `apps/api/src/services/vapi/assistant-config.ts` | VAPI assistant prompts & behavior (SINGLE SOURCE OF TRUTH) |
| `apps/api/src/services/vapi/direct-vapi.client.ts` | Direct VAPI API calls with hybrid webhook |
| `apps/api/src/services/vapi/concurrent-call.service.ts` | Batch concurrent calls (5 at a time) |
| `apps/api/src/services/vapi/call-result.service.ts` | Saves call results to database |
| `apps/api/src/services/vapi/webhook-cache.service.ts` | Caches webhook results (30min TTL) |

**What's Missing:**
- Retry logic for failed calls

### ✅ Research System (95% Complete)

**What Works:**
- Gemini-powered provider search with Google Maps grounding
- Google Places API enrichment (hours, phone, ratings, reviews)
- Fallback between Kestra and direct API
- Returns 10+ providers with full details

**Key Files:**
| File | Purpose |
|------|---------|
| `apps/api/src/services/research/research.service.ts` | Main research orchestrator |
| `apps/api/src/services/research/enrichment.service.ts` | Google Places enrichment |
| `apps/api/src/services/places/google-places.service.ts` | Places API client |

### ✅ Direct Task System (90% Complete)

**What Works:**
- Task type classification (negotiate, complain, refund, schedule, cancel, inquire)
- Dynamic prompt generation via Gemini
- Custom VAPI assistant for each task type

**Key Files:**
| File | Purpose |
|------|---------|
| `apps/api/src/services/direct-task/analyzer.ts` | Classifies task type |
| `apps/api/src/services/direct-task/prompt-generator.ts` | Generates custom prompts |

### ✅ Frontend Pages (98% Complete) ⬆️ Updated Dec 10

**What Works:**
| Page | Route | Status |
|------|-------|--------|
| Dashboard | `/` | ✅ Stats cards, recent activity |
| New Request | `/new` | ✅ Full research & book form |
| Direct Task | `/direct` | ✅ Single call task form |
| Request Detail | `/request/[id]` | ✅ Timeline, transcripts, providers sidebar, **real-time updates**, **top 3 recommendations**, **selection flow** |
| History | `/history` | ✅ All past requests |

**New Components (Dec 10, 2025):**
| Component | File | Purpose |
|-----------|------|---------|
| LiveStatus | `components/LiveStatus.tsx` | ✅ Real-time status animations |
| RecommendedProviders | `components/RecommendedProviders.tsx` | ✅ Top 3 provider cards with scoring |
| SelectionModal | `components/SelectionModal.tsx` | ✅ Booking confirmation dialog |

**What's Missing:**
- Confirmation display after booking (API call TODO)

### ✅ Database Schema (100% Complete)

**Tables:**
- `users` - User accounts
- `service_requests` - Request records with status
- `providers` - Provider info + call results
- `interaction_logs` - Activity timeline

**Call Tracking Columns (providers table):**
```sql
call_status         TEXT      -- queued, ringing, in-progress, ended, error
call_result         JSONB     -- structured analysis data
call_transcript     TEXT      -- full conversation
call_summary        TEXT      -- AI-generated summary
call_duration_minutes DECIMAL
call_cost           DECIMAL
call_method         TEXT      -- 'kestra' or 'direct_vapi'
call_id             TEXT      -- VAPI call ID
called_at           TIMESTAMPTZ
```

**Provider Enrichment Columns:**
```sql
review_count        INTEGER
distance            DECIMAL
hours_of_operation  JSONB     -- Business hours
is_open_now         BOOLEAN
place_id            TEXT      -- Google Place ID
google_maps_uri     TEXT
website             TEXT
```

### ✅ Kestra Workflows (4 of 7 Complete)

**Existing Flows:**
| Flow | File | Status |
|------|------|--------|
| `research_providers` | `research_agent.yaml` | ✅ Working |
| `contact_providers` | `contact_agent.yaml` | ✅ Working |
| `contact_providers_concurrent` | `contact_providers_concurrent.yaml` | ✅ Working |
| `book_appointment` | `booking_agent.yaml` | ✅ Working (but uses old GCal) |

**Missing Flows:**
- `recommend_providers` - Analyze calls, select top 3
- `notify_user` - Send SMS/call to user
- `schedule_service` - Book with chosen provider

### ✅ Deployment (100% Complete)

| Service | Platform | URL |
|---------|----------|-----|
| Web App | Vercel | https://concierge-ai-web.vercel.app |
| API | Railway | Configured via secrets |
| Kestra | Docker (local) | http://localhost:8082 |

### ✅ Cline CLI Commands

```bash
pnpm cline:security    # Security review
pnpm cline:review      # Code review
pnpm cline:workflow    # Validate Kestra workflows
pnpm cline:test        # Generate tests
pnpm cline:docs        # Update documentation
```

---

## 4. Gaps Remaining - What's Needed

### 🔴 Critical (Must Have for Demo)

| # | Feature | Description | Effort | Owner | Status |
|---|---------|-------------|--------|-------|--------|
| 1 | VAPI Voicemail Auto-Disconnect | Detect voicemail within 10s and invoke `endCall` immediately | Low | S1 | ✅ DONE |
| 2 | recommend_providers API | Analyze call results, return top 3 with AI reasoning | Medium | S1 | ✅ DONE |
| 3 | Real-time UI Updates | Enable Supabase real-time subscriptions on request detail page | Medium | M1 | ✅ DONE |
| 4 | Top 3 Providers Display | Card component showing recommendations with "Select" button | Medium | M1 | ✅ DONE |
| 5 | User Selection Flow | Handle provider selection, show confirmation modal | Medium | M1 | ✅ DONE |
| 6 | Demo Video | 2-minute walkthrough showing all 4 sponsors | Low | All | 🔴 TODO |

**✅ Implementation Complete (Dec 10, 2025):**

**Backend Changes:**
- `apps/api/src/services/vapi/assistant-config.ts` - Added `voicemailDetection` config + prompt instructions
- `apps/api/src/services/recommendations/recommend.service.ts` - NEW: Gemini-powered provider scoring
- `apps/api/src/services/recommendations/types.ts` - NEW: TypeScript interfaces
- `apps/api/src/routes/providers.ts` - Added `POST /api/v1/providers/recommend` endpoint

**Frontend Changes:**
- `apps/web/components/LiveStatus.tsx` - NEW: Real-time status animations
- `apps/web/components/RecommendedProviders.tsx` - NEW: Top 3 provider cards with scores
- `apps/web/components/SelectionModal.tsx` - NEW: Booking confirmation modal
- `apps/web/app/request/[id]/page.tsx` - Added Supabase real-time subscriptions + component integration

### 🟡 Important (Should Have)

| # | Feature | Description | Effort | Owner |
|---|---------|-------------|--------|-------|
| 7 | notify_user API | Send SMS (Twilio) or call (VAPI) to user with recommendations | High | S1 |
| 8 | schedule_service API | Call provider back to book appointment | Medium | S1 |
| 9 | show_confirmation API | Send final confirmation, update DB | Low | M1 |
| 10 | Kestra Cloud Deployment | Deploy all 7 workflows to Kestra Cloud | Medium | M1 |
| 11 | Business Hours Check | Skip calling providers that are currently closed | Low | J1 |

### 🟢 Nice to Have

| # | Feature | Description | Effort | Owner |
|---|---------|-------------|--------|-------|
| 12 | History Page Enhancement | Show transcripts, recommendations for past requests | Low | J1 |
| 13 | Loading Skeletons | Better loading states during operations | Low | J1 |
| 14 | Error Recovery UI | Retry buttons, better error messages | Low | J1 |

---

## 5. Key Files Reference

### Backend - Where to Make Changes

```
apps/api/src/
├── routes/
│   ├── providers.ts        # 🔴 ADD: /recommend, /schedule endpoints
│   ├── notifications.ts    # 🔴 CREATE: /notify, /confirm endpoints
│   └── vapi.ts             # Webhook handler (complete)
├── services/
│   ├── vapi/
│   │   ├── assistant-config.ts  # 🔴 MODIFY: Add voicemail detection
│   │   ├── direct-vapi.client.ts
│   │   └── concurrent-call.service.ts
│   ├── research/
│   │   └── research.service.ts
│   ├── notifications/       # 🔴 CREATE: New folder
│   │   ├── twilio.service.ts
│   │   └── notification.service.ts
│   └── recommendations/     # 🔴 CREATE: New folder
│       └── recommend.service.ts
```

### Frontend - Where to Make Changes

```
apps/web/
├── app/
│   ├── request/[id]/
│   │   └── page.tsx        # 🔴 MODIFY: Add real-time, top 3 display
│   └── history/
│       └── page.tsx        # 🟢 MODIFY: Enhance with transcripts
├── components/
│   ├── RecommendedProviders.tsx  # 🔴 CREATE: Top 3 card
│   ├── ProviderSelection.tsx     # 🔴 CREATE: Selection modal
│   └── LiveStatus.tsx            # 🔴 CREATE: Real-time status
├── lib/
│   ├── hooks/
│   │   └── useServiceRequests.ts  # EXISTS but UNUSED - enable it
│   └── services/
│       └── notificationService.ts # 🔴 CREATE: API client
```

### Kestra - Workflow Files

```
kestra/
├── flows/
│   ├── research_agent.yaml           # ✅ Complete
│   ├── contact_agent.yaml            # ✅ Complete
│   ├── contact_providers_concurrent.yaml  # ✅ Complete
│   ├── booking_agent.yaml            # ✅ Complete (needs update)
│   ├── recommend_providers.yaml      # 🔴 CREATE
│   ├── notify_user.yaml              # 🔴 CREATE
│   └── schedule_service.yaml         # 🔴 CREATE
└── scripts/
    ├── call-provider.js              # ✅ Complete
    └── create-event.js               # ✅ Complete
```

---

## Day 1: Backend APIs & VAPI Fixes (Tuesday)

**Goal:** All backend APIs complete and tested. VAPI handles voicemail correctly.

### S1 (Senior) - Critical Path

#### Morning (4 hours)

**Task 1.1: VAPI Voicemail Auto-Disconnect** (P0, 2 hours)

The current system DETECTS voicemail but doesn't disconnect. We need the AI to immediately hang up.

**File:** `apps/api/src/services/vapi/assistant-config.ts`

```typescript
// Add to the assistant config object (both createProviderSearchConfig and createDirectTaskConfig)

// 1. Add voicemail detection configuration
voicemailDetection: {
  provider: "twilio",
  enabled: true,
  machineDetectionTimeout: 10,           // seconds to wait
  machineDetectionSpeechThreshold: 2500, // ms of speech = machine
  machineDetectionSpeechEndThreshold: 1200,
},

// 2. Update system prompt - add this section before "ENDING THE CALL"
═══════════════════════════════════════════════════════════════════
VOICEMAIL / ANSWERING MACHINE DETECTION
═══════════════════════════════════════════════════════════════════
If you hear ANY of these indicators, IMMEDIATELY invoke endCall:
- "Please leave a message after the beep"
- "You have reached the voicemail of"
- "No one is available to take your call"
- "Leave your name and number"
- Long automated greeting (more than 10 seconds)
- Beep sound indicating recording

DO NOT leave a voicemail message. DO NOT wait for the beep.
Simply invoke endCall immediately - we will try again later.
```

**Test:** Call a number that goes to voicemail, verify call ends within 15 seconds.

---

**Task 1.2: recommend_providers API** (P0, 2 hours)

Create the endpoint that analyzes call results and returns top 3 providers.

**File:** `apps/api/src/services/recommendations/recommend.service.ts` (CREATE)

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CallResult } from "../vapi/types.js";

interface RecommendedProvider {
  providerId: string;
  providerName: string;
  phone: string;
  rating: number;
  reviewCount: number;
  earliestAvailability: string;
  estimatedRate: string;
  score: number;           // 0-100
  reasoning: string;       // AI explanation why recommended
  criteriaMatched: string[];
}

interface RecommendationResult {
  topProviders: RecommendedProvider[];
  overallRecommendation: string;
  analysisNotes: string;
}

export class RecommendationService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  async analyzeAndRecommend(
    callResults: CallResult[],
    originalCriteria: string
  ): Promise<RecommendationResult> {
    // Filter to only successful calls
    const successfulCalls = callResults.filter(
      r => r.status === "completed" &&
           r.analysis?.structuredData?.availability === "available" &&
           !r.analysis?.structuredData?.disqualified
    );

    if (successfulCalls.length === 0) {
      return {
        topProviders: [],
        overallRecommendation: "No qualified providers found. All providers were either unavailable or did not meet the criteria.",
        analysisNotes: `Analyzed ${callResults.length} calls. None qualified.`
      };
    }

    const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const prompt = `You are analyzing service provider call results to recommend the top 3 providers.

ORIGINAL USER CRITERIA:
${originalCriteria}

CALL RESULTS:
${JSON.stringify(successfulCalls.map(c => ({
  provider: c.provider.name,
  phone: c.provider.phone,
  transcript: c.transcript,
  analysis: c.analysis,
  duration: c.duration
})), null, 2)}

SCORING CRITERIA (weight each appropriately):
1. Availability urgency (sooner is better) - 30%
2. Rate competitiveness (lower is better if quality equal) - 20%
3. All criteria explicitly met - 25%
4. Call quality (clear communication, helpful) - 15%
5. Professionalism and reliability signals - 10%

Return a JSON object with this exact structure:
{
  "topProviders": [
    {
      "providerName": "string",
      "phone": "string",
      "earliestAvailability": "string (e.g., 'Tomorrow 2pm')",
      "estimatedRate": "string (e.g., '$150/hour')",
      "score": number (0-100),
      "reasoning": "string (2-3 sentences explaining why recommended)",
      "criteriaMatched": ["criterion1", "criterion2"]
    }
  ],
  "overallRecommendation": "string (which provider you recommend most and why)",
  "analysisNotes": "string (any concerns or things user should know)"
}

Return ONLY the JSON, no markdown formatting.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON response
    const analysis = JSON.parse(text.replace(/```json\n?|\n?```/g, ''));

    // Enrich with provider IDs from original results
    analysis.topProviders = analysis.topProviders.map((p: any) => {
      const original = successfulCalls.find(c => c.provider.name === p.providerName);
      return {
        ...p,
        providerId: original?.callId || '',
        rating: original?.provider?.rating || 0,
        reviewCount: original?.provider?.reviewCount || 0
      };
    });

    return analysis;
  }
}
```

**File:** `apps/api/src/routes/providers.ts` - Add endpoint:

```typescript
// POST /api/v1/providers/recommend
fastify.post('/recommend', {
  schema: {
    body: {
      type: 'object',
      required: ['serviceRequestId', 'callResults'],
      properties: {
        serviceRequestId: { type: 'string' },
        callResults: { type: 'array' },
        originalCriteria: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  const { callResults, originalCriteria } = request.body;
  const service = new RecommendationService();
  const result = await service.analyzeAndRecommend(callResults, originalCriteria);
  return reply.send(result);
});
```

---

#### Afternoon (4 hours)

**Task 1.3: schedule_service API** (P1, 2 hours)

Create endpoint to call provider back and book appointment.

**File:** `apps/api/src/services/vapi/booking-assistant-config.ts` (CREATE)

```typescript
export function createBookingAssistantConfig(
  providerName: string,
  providerPhone: string,
  appointmentDetails: {
    preferredDate: string;
    preferredTime: string;
    serviceDescription: string;
    customerName: string;
    customerPhone: string;
  }
) {
  const systemPrompt = `You are calling ${providerName} to schedule a service appointment.

YOUR MISSION:
Book an appointment with the following details:
- Service: ${appointmentDetails.serviceDescription}
- Preferred Date: ${appointmentDetails.preferredDate}
- Preferred Time: ${appointmentDetails.preferredTime}
- Customer Name: ${appointmentDetails.customerName}
- Customer Contact: ${appointmentDetails.customerPhone}

CONVERSATION FLOW:
1. Greet and identify yourself as calling on behalf of ${appointmentDetails.customerName}
2. Say you spoke earlier about ${appointmentDetails.serviceDescription}
3. Request to book for ${appointmentDetails.preferredDate} at ${appointmentDetails.preferredTime}
4. If not available, ask for nearest available slot
5. Confirm all details: date, time, address, any prep needed
6. Get confirmation number if provided
7. Thank them and end call

IMPORTANT:
- Be friendly and efficient
- Get explicit confirmation of the appointment
- Note any special instructions they provide
- After confirmation, immediately invoke endCall`;

  return {
    name: `Booking-${Date.now().toString().slice(-8)}`,
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM",
    },
    model: {
      provider: "google" as const,
      model: "gemini-2.0-flash-exp",
      messages: [{ role: "system" as const, content: systemPrompt }],
    },
    firstMessage: `Hi! I'm calling on behalf of ${appointmentDetails.customerName}. We spoke earlier about ${appointmentDetails.serviceDescription} and I'd like to schedule an appointment.`,
    endCallFunctionEnabled: true,
    analysisPlan: {
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            booking_confirmed: { type: "boolean" },
            confirmed_date: { type: "string" },
            confirmed_time: { type: "string" },
            confirmation_number: { type: "string" },
            special_instructions: { type: "string" },
            provider_contact_name: { type: "string" }
          },
          required: ["booking_confirmed"]
        }
      }
    }
  };
}
```

---

**Task 1.4: notify_user API** (P1, 2 hours)

Create notification service with SMS (Twilio) and call (VAPI) support.

**File:** `apps/api/src/services/notifications/twilio.service.ts` (CREATE)

```typescript
import twilio from 'twilio';

export class TwilioService {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
  }

  async sendSMS(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to
      });
      return { success: true, messageId: result.sid };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

// Message templates
export function createRecommendationSMS(
  providers: Array<{ name: string; availability: string; rate: string }>,
  requestUrl: string
): string {
  return `AI Concierge found your top providers:

1. ${providers[0]?.name || 'N/A'} - ${providers[0]?.availability || 'N/A'}
2. ${providers[1]?.name || 'N/A'} - ${providers[1]?.availability || 'N/A'}
3. ${providers[2]?.name || 'N/A'} - ${providers[2]?.availability || 'N/A'}

Reply 1, 2, or 3 to book, or visit:
${requestUrl}`;
}

export function createConfirmationSMS(
  providerName: string,
  appointmentDate: string,
  appointmentTime: string
): string {
  return `Your appointment is confirmed!

Provider: ${providerName}
Date: ${appointmentDate}
Time: ${appointmentTime}

We'll send a reminder before your appointment.

- AI Concierge`;
}
```

---

#### Evening (2 hours)

**Task 1.5: Integration Testing** (P0)

Test the full backend flow:
1. Research providers → Get 10+ results
2. Call providers concurrently → Get call results
3. Recommend providers → Get top 3
4. (If Twilio ready) Send SMS notification

---

### M1 (Mid-level) - Supporting APIs

#### All Day Tasks

**Task 1.6: show_confirmation API** (P1, 2 hours)

**File:** `apps/api/src/routes/notifications.ts` (CREATE)

```typescript
import { FastifyInstance } from 'fastify';
import { TwilioService, createConfirmationSMS } from '../services/notifications/twilio.service.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  const twilioService = new TwilioService();

  // POST /api/v1/notifications/confirm
  fastify.post('/confirm', async (request, reply) => {
    const {
      userPhone,
      method,
      providerName,
      appointmentDate,
      appointmentTime,
      serviceRequestId
    } = request.body as any;

    // Update database
    const supabase = fastify.supabase;
    await supabase
      .from('service_requests')
      .update({
        status: 'completed',
        final_outcome: `Booked with ${providerName} on ${appointmentDate} at ${appointmentTime}`
      })
      .eq('id', serviceRequestId);

    // Send confirmation
    if (method === 'sms') {
      const message = createConfirmationSMS(providerName, appointmentDate, appointmentTime);
      const result = await twilioService.sendSMS(userPhone, message);
      return reply.send({ success: result.success, method: 'sms' });
    }

    // For 'web' method, just update DB - frontend will show it
    return reply.send({ success: true, method: 'web' });
  });
}
```

**Task 1.7: API Route Registration** (P0, 1 hour)

Register all new routes in `apps/api/src/index.ts`.

**Task 1.8: Type Definitions** (P0, 1 hour)

Add TypeScript interfaces for all new endpoints in `apps/api/src/services/vapi/types.ts`.

---

### J1 (Junior) - Testing & Documentation

#### All Day Tasks

**Task 1.9: Business Hours Utility** (P2, 2 hours)

**File:** `apps/api/src/utils/business-hours.ts` (CREATE)

```typescript
/**
 * Check if a provider is currently open based on their hours_of_operation
 * @param hoursJson - JSONB from database, typically array of strings like ["Monday: 9 AM – 5 PM", ...]
 * @returns boolean - true if currently open
 */
export function isProviderOpen(hoursJson: any): boolean {
  if (!hoursJson || !Array.isArray(hoursJson)) {
    return true; // Assume open if no data
  }

  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDay = dayNames[now.getDay()];
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Find today's hours
  const todayHours = hoursJson.find((h: string) =>
    typeof h === 'string' && h.startsWith(currentDay)
  );

  if (!todayHours) return true; // Assume open if day not found

  // Parse hours like "Monday: 9 AM – 5 PM" or "Monday: Closed"
  if (todayHours.toLowerCase().includes('closed')) return false;
  if (todayHours.toLowerCase().includes('24 hours')) return true;

  // Extract time range
  const timeMatch = todayHours.match(/(\d{1,2})\s*(AM|PM)\s*[–-]\s*(\d{1,2})\s*(AM|PM)/i);
  if (!timeMatch) return true;

  const [, openHour, openPeriod, closeHour, closePeriod] = timeMatch;

  const openTime = convertTo24Hour(parseInt(openHour), openPeriod);
  const closeTime = convertTo24Hour(parseInt(closeHour), closePeriod);
  const currentTime = currentHour * 60 + currentMinute;

  return currentTime >= openTime && currentTime < closeTime;
}

function convertTo24Hour(hour: number, period: string): number {
  let h = hour;
  if (period.toUpperCase() === 'PM' && hour !== 12) h += 12;
  if (period.toUpperCase() === 'AM' && hour === 12) h = 0;
  return h * 60; // Convert to minutes for easier comparison
}
```

**Task 1.10: Test Data Setup** (P1, 2 hours)

Create test fixtures for demo:
- 5 mock providers with phone numbers
- Sample service request data
- Expected call results for testing

**Task 1.11: API Documentation** (P2, 2 hours)

Update `CLAUDE.md` with new endpoints and their usage.

---

## Day 2: Frontend & Real-Time (Wednesday)

**Goal:** User can see live updates, view recommendations, and select a provider.

### M1 (Mid-level) - Core Frontend

#### Morning (4 hours)

**Task 2.1: Enable Supabase Real-Time** (P0, 2 hours)

The hook exists but isn't used. Enable it on the request detail page.

**File:** `apps/web/app/request/[id]/page.tsx` - Add real-time subscription:

```typescript
// Add these imports
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

// Inside RequestDetails component, add:
const [realtimeRequest, setRealtimeRequest] = useState<ServiceRequest | null>(null);
const supabase = createClient();

useEffect(() => {
  if (!id || !isValidUuid(id)) return;

  // Subscribe to changes on this specific request
  const channel = supabase
    .channel(`request-${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests',
        filter: `id=eq.${id}`
      },
      (payload) => {
        console.log('Real-time update:', payload);
        if (payload.new) {
          // Convert and update
          const updated = convertDbToFrontend(payload.new);
          setRealtimeRequest(updated);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [id, supabase]);

// Use realtimeRequest if available, otherwise fall back to context
const request = realtimeRequest || localRequest || dbRequest;
```

**Task 2.2: Live Status Component** (P0, 2 hours)

**File:** `apps/web/components/LiveStatus.tsx` (CREATE)

```tsx
"use client";

import { Loader2, Search, Phone, Brain, CheckCircle, XCircle } from "lucide-react";

interface LiveStatusProps {
  status: string;
  currentStep?: string;
  progress?: {
    current: number;
    total: number;
    currentProvider?: string;
  };
}

export function LiveStatus({ status, currentStep, progress }: LiveStatusProps) {
  const statusConfig = {
    searching: {
      icon: Search,
      label: "Searching for providers...",
      color: "text-blue-400",
      animate: true
    },
    calling: {
      icon: Phone,
      label: progress
        ? `Calling provider ${progress.current} of ${progress.total}${progress.currentProvider ? `: ${progress.currentProvider}` : ''}`
        : "Calling providers...",
      color: "text-amber-400",
      animate: true
    },
    analyzing: {
      icon: Brain,
      label: "Analyzing results & selecting top providers...",
      color: "text-purple-400",
      animate: true
    },
    completed: {
      icon: CheckCircle,
      label: "Complete! See your recommendations below.",
      color: "text-emerald-400",
      animate: false
    },
    failed: {
      icon: XCircle,
      label: "Unable to complete request. Please try again.",
      color: "text-red-400",
      animate: false
    }
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.searching;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 p-4 rounded-lg bg-surface border border-surface-highlight ${config.color}`}>
      <Icon className={`w-5 h-5 ${config.animate ? 'animate-pulse' : ''}`} />
      <span className="font-medium">{config.label}</span>
      {config.animate && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
    </div>
  );
}
```

---

#### Afternoon (4 hours)

**Task 2.3: Recommended Providers Component** (P0, 3 hours)

**File:** `apps/web/components/RecommendedProviders.tsx` (CREATE)

```tsx
"use client";

import { Star, Clock, DollarSign, CheckCircle, Phone } from "lucide-react";
import { useState } from "react";

interface Provider {
  providerId: string;
  providerName: string;
  phone: string;
  rating: number;
  reviewCount?: number;
  earliestAvailability: string;
  estimatedRate: string;
  score: number;
  reasoning: string;
  criteriaMatched?: string[];
}

interface Props {
  providers: Provider[];
  overallRecommendation: string;
  onSelect: (provider: Provider) => void;
  loading?: boolean;
  selectedId?: string;
}

export function RecommendedProviders({
  providers,
  overallRecommendation,
  onSelect,
  loading,
  selectedId
}: Props) {
  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400">
        <div className="animate-pulse">Analyzing providers...</div>
      </div>
    );
  }

  if (!providers.length) {
    return (
      <div className="p-6 text-center text-slate-400">
        No qualified providers found. Try adjusting your criteria.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall recommendation */}
      <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-lg">
        <h3 className="font-bold text-primary-300 mb-2">AI Recommendation</h3>
        <p className="text-sm text-primary-400/80">{overallRecommendation}</p>
      </div>

      {/* Provider cards */}
      {providers.map((provider, index) => (
        <div
          key={provider.providerId}
          className={`p-4 rounded-lg border transition-all ${
            selectedId === provider.providerId
              ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/30'
              : 'bg-surface border-surface-highlight hover:border-primary-500/30'
          }`}
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {index === 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-400 rounded">
                    🏆 BEST MATCH
                  </span>
                )}
                {index > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded">
                    #{index + 1}
                  </span>
                )}
              </div>
              <h4 className="font-bold text-lg text-slate-100">{provider.providerName}</h4>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary-400">{provider.score}</div>
              <div className="text-xs text-slate-500">score</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Star className="w-4 h-4 text-amber-400" />
              {provider.rating} {provider.reviewCount && `(${provider.reviewCount})`}
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-4 h-4 text-blue-400" />
              {provider.earliestAvailability}
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              {provider.estimatedRate}
            </div>
          </div>

          <p className="text-sm text-slate-400 mb-3">{provider.reasoning}</p>

          {provider.criteriaMatched && provider.criteriaMatched.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {provider.criteriaMatched.map((criterion, i) => (
                <span key={i} className="px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 rounded flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {criterion}
                </span>
              ))}
            </div>
          )}

          <button
            onClick={() => onSelect(provider)}
            disabled={selectedId === provider.providerId}
            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
              selectedId === provider.providerId
                ? 'bg-emerald-600 text-white cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-500 text-white'
            }`}
          >
            {selectedId === provider.providerId ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" /> Selected
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Phone className="w-4 h-4" /> Select This Provider
              </span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Task 2.4: Selection Confirmation Modal** (P0, 1 hour)

**File:** `apps/web/components/SelectionModal.tsx` (CREATE)

```tsx
"use client";

import { X, Phone, Calendar } from "lucide-react";

interface Props {
  provider: {
    providerName: string;
    phone: string;
    earliestAvailability: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function SelectionModal({ provider, onConfirm, onCancel, loading }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl border border-surface-highlight p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold text-slate-100">Confirm Selection</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-400 mb-4">
          You're about to book with <strong className="text-slate-200">{provider.providerName}</strong>.
          Our AI will call them now to schedule your appointment.
        </p>

        <div className="space-y-2 mb-6 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <Phone className="w-4 h-4" /> {provider.phone}
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar className="w-4 h-4" /> Earliest: {provider.earliestAvailability}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2 px-4 rounded-lg border border-surface-highlight text-slate-300 hover:bg-surface-highlight transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2 px-4 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Booking...' : 'Confirm & Book'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

#### Evening (2 hours)

**Task 2.5: Integrate Components into Request Page** (P0, 2 hours)

Update `apps/web/app/request/[id]/page.tsx` to use new components.

---

### S1 (Senior) - Backend Support

**Task 2.6: Debug Real-Time Issues** (P1, 2 hours)

Help M1 troubleshoot any Supabase real-time subscription issues.

**Task 2.7: API Refinements** (P1, 2 hours)

Adjust APIs based on frontend needs discovered during integration.

---

### J1 (Junior) - UI Polish

**Task 2.8: History Page Enhancement** (P2, 3 hours)

Update history page to show:
- Call status icons
- Top recommendation (if available)
- Quick view of outcome

**Task 2.9: Loading Skeletons** (P2, 2 hours)

Add skeleton loading states to:
- Provider cards
- Timeline items
- Stats cards

**Task 2.10: Responsive Testing** (P1, 1 hour)

Test all new components on mobile viewports.

---

## Day 3: Kestra Cloud & Demo (Thursday)

**Goal:** Deploy to Kestra Cloud, final testing, record demo video.

### M1 (Mid-level) - Kestra Cloud

#### Morning (4 hours)

**Task 3.1: Kestra Cloud Setup** (P1, 2 hours)

1. Create Kestra Cloud account at https://kestra.io
2. Create new namespace: `ai_concierge`
3. Configure secrets:
   - `VAPI_API_KEY`
   - `VAPI_PHONE_NUMBER_ID`
   - `GEMINI_API_KEY`
   - `TWILIO_ACCOUNT_SID` (if using)
   - `TWILIO_AUTH_TOKEN` (if using)

**Task 3.2: Deploy Existing Workflows** (P1, 1 hour)

Upload these to Kestra Cloud:
- `research_agent.yaml`
- `contact_agent.yaml`
- `contact_providers_concurrent.yaml`
- `booking_agent.yaml`

**Task 3.3: Create Missing Workflows** (P1, 1 hour)

**File:** `kestra/flows/recommend_providers.yaml` (CREATE)

```yaml
id: recommend_providers
namespace: ai_concierge
description: "Analyze call results and recommend top 3 providers"

inputs:
  - id: call_results
    type: JSON
    description: "Array of call results from provider calls"
  - id: original_criteria
    type: STRING
    description: "Original user criteria for the request"
  - id: service_request_id
    type: STRING
    description: "Service request ID for database update"

tasks:
  - id: analyze_with_gemini
    type: io.kestra.plugin.scripts.node.Commands
    containerImage: node:20-alpine
    beforeCommands:
      - npm install @google/generative-ai
    commands:
      - node -e "
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        async function analyze() {
          const results = JSON.parse(process.env.CALL_RESULTS);
          const criteria = process.env.ORIGINAL_CRITERIA;

          // Filter successful calls
          const successful = results.filter(r =>
            r.status === 'completed' &&
            r.analysis?.structuredData?.availability === 'available'
          );

          if (successful.length === 0) {
            console.log(JSON.stringify({ topProviders: [], message: 'No qualified providers' }));
            return;
          }

          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
          const prompt = 'Analyze these providers and return top 3: ' + JSON.stringify(successful);
          const result = await model.generateContent(prompt);
          console.log(result.response.text());
        }

        analyze().catch(console.error);
        "
    env:
      GEMINI_API_KEY: "{{ secret('GEMINI_API_KEY') }}"
      CALL_RESULTS: "{{ inputs.call_results | json }}"
      ORIGINAL_CRITERIA: "{{ inputs.original_criteria }}"

outputs:
  - id: recommendations
    type: STRING
    value: "{{ outputs.analyze_with_gemini.stdOut }}"
```

---

### S1 (Senior) - Final Integration

#### Morning (2 hours)

**Task 3.4: End-to-End Testing** (P0)

Full user journey test:
1. Submit request on `/new`
2. Watch real-time status updates
3. See provider calls happening
4. View top 3 recommendations
5. Select a provider
6. See booking confirmation

#### Afternoon (2 hours)

**Task 3.5: Bug Fixes** (P0)

Address any issues found during testing.

**Task 3.6: Production Environment Check** (P0)

Verify all environment variables are set in:
- Vercel (web)
- Railway (api)
- Kestra Cloud

---

### All Team - Demo & Submission

#### Afternoon (3 hours)

**Task 3.7: Demo Video Recording** (P0, 2 hours)

**Script:**
```
[0:00-0:15] Intro
"Hi! This is AI Concierge - an AI assistant that finds and books service providers for you."

[0:15-0:45] Show the problem
"Normally, finding a plumber means calling 10+ companies, waiting on hold, and comparing options manually."

[0:45-1:15] Show the solution - Submit request
"With AI Concierge, I just describe what I need..."
[Show /new page, fill form, submit]

[1:15-1:30] Show Kestra orchestration
"Behind the scenes, Kestra orchestrates our AI workflows..."
[Show Kestra Cloud UI with running flow]

[1:30-1:45] Show VAPI calls
"VAPI.ai makes real phone calls to providers..."
[Show call in progress, maybe audio snippet]

[1:45-2:00] Show recommendations
"Gemini AI analyzes the results and recommends the top 3 providers..."
[Show top 3 cards with scores and reasoning]

[2:00-2:15] Show selection & booking
"I select my preferred provider, and the AI books the appointment..."
[Click select, show confirmation]

[2:15-2:30] Closing
"AI Concierge - powered by Kestra, VAPI, Gemini, and deployed on Vercel."
```

**Task 3.8: Final Documentation** (P1, 1 hour)

Update README with:
- Final architecture diagram
- Setup instructions
- Demo video link
- Sponsor technology descriptions

**Task 3.9: Submission** (P0)

Complete hackathon submission form with:
- GitHub repo link
- Demo video link
- Live site URL
- Team info

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
VAPI_WEBHOOK_URL=https://your-domain/api/v1/vapi/webhook  # Optional
VAPI_MAX_CONCURRENT_CALLS=5

# Twilio (for SMS)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Kestra
KESTRA_ENABLED=false  # Set true to use Kestra instead of direct APIs
KESTRA_URL=http://localhost:8082
```

**Frontend (`apps/web/.env.local`):**
```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_LIVE_CALL_ENABLED=false  # Set true for real calls
```

### Local Development

```bash
# Install dependencies
pnpm install

# Start development servers (web + api)
pnpm dev

# Start Kestra (optional, for workflow testing)
docker compose up -d

# Build (required before Kestra can use TypeScript configs)
pnpm build
```

---

## Testing Guide

### Manual Test Checklist

- [ ] Submit new request on `/new`
- [ ] See "Searching..." status
- [ ] See "Calling..." status with progress
- [ ] See "Analyzing..." status
- [ ] See top 3 provider recommendations
- [ ] Click "Select This Provider"
- [ ] See confirmation modal
- [ ] Confirm and see booking status
- [ ] Check history page shows completed request

### Test Phone Numbers

For VAPI testing without real calls:
- Use admin test mode: Set `NEXT_PUBLIC_ADMIN_TEST_NUMBER` to your phone
- This routes all calls to your number instead of actual providers

---

## Submission Checklist

### Technical Requirements
- [ ] All APIs working in production (Railway)
- [ ] Frontend deployed and functional (Vercel)
- [ ] Real-time updates working
- [ ] Provider selection flow complete
- [ ] At least one notification method working (SMS, call, or web)

### Sponsor Integration
- [ ] **Kestra:** Workflows visible in Kestra Cloud, show in demo
- [ ] **VAPI:** Real calls demonstrated, transcripts shown
- [ ] **Gemini:** Research + recommendation AI visible
- [ ] **Vercel:** Live production URL

### Submission Materials
- [ ] Demo video (2 minutes max)
- [ ] GitHub repository (public or shared with judges)
- [ ] README with setup instructions
- [ ] Hackathon submission form completed

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Twilio setup delays | High | Fall back to VAPI call notification or web-only |
| VAPI rate limits | Medium | Limit concurrent calls to 3, add delays |
| Kestra Cloud issues | Medium | Keep local Docker as backup |
| Demo bugs | High | Record backup video on Day 2 evening |
| Provider no-answers | Medium | Have 10+ test providers, test during business hours |

---

## Quick Reference Commands

```bash
# Development
pnpm dev              # Start all services
pnpm build            # Build all apps
pnpm check-types      # TypeScript check

# Testing
curl http://localhost:8000/api/v1/providers/call/status  # Check VAPI status
curl http://localhost:8000/api/v1/workflows/status       # Check system status

# Kestra
docker compose up -d   # Start Kestra
docker compose logs -f kestra  # View logs

# Deployment
git push origin main   # Triggers Vercel + Railway deploy
```

---

**Last Updated:** December 9, 2025
**Confidence Level:** 90%
**Plan Author:** AI Assistant based on comprehensive codebase analysis
