# AI Concierge: Complete User Journey

**Purpose**: This document describes the entire flow of creating a new "Research & Book" request in the AI Concierge app, from the moment the user lands on the form until they receive confirmation that their appointment has been scheduled.

**Use Case**: Hackathon video narration script foundation (2-minute demo)

---

## Overview: What AI Concierge Does

AI Concierge is an **AI-powered personal assistant** that helps users find and book local service providers. Instead of spending hours calling plumbers, electricians, or other service professionals, users simply describe what they need, and the AI:

1. **Researches** 10+ qualified providers using Google Maps + Gemini AI
2. **Calls** up to 5 providers simultaneously using VAPI.ai voice AI
3. **Interviews** each provider about availability, rates, and specific requirements
4. **Recommends** the top 3 providers with AI-generated scores and reasoning
5. **Books** the user's chosen provider with a confirmation call
6. **Notifies** the user via SMS/call when the appointment is confirmed

**The magic**: What normally takes 2-3 hours of phone calls happens in under 5 minutes, completely automated.

---

## The Complete Flow: 6 Stages

```
USER SUBMITS REQUEST
        ↓
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 1: RESEARCH (30-60 seconds)                              │
│  Gemini AI + Google Maps grounding → 10+ qualified providers    │
└─────────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 2: CONCURRENT CALLING (2-4 minutes)                      │
│  VAPI.ai calls 5 providers simultaneously                       │
│  AI interviews each about availability, rates, criteria         │
└─────────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 3: AI ANALYSIS (15-30 seconds)                           │
│  Gemini 2.5 Flash scores providers → Top 3 recommendations      │
└─────────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 4: USER NOTIFICATION & SELECTION                         │
│  SMS/Call with recommendations → User selects preferred provider│
└─────────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 5: BOOKING CONFIRMATION (1-2 minutes)                    │
│  AI calls provider back → Locks in specific date/time           │
└─────────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 6: FINAL CONFIRMATION                                    │
│  SMS/Call to user with appointment details + confirmation #     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stage 0: User Creates Request (`/new` Page)

### The Request Form

The user lands on the `/new` page and fills out a comprehensive request form with the following fields:

**Required Fields:**

| Field | Description | Example |
|-------|-------------|---------|
| **Your Name** | How the AI introduces itself | "John Smith" |
| **Service Type** | What service they need | "Emergency Plumber", "Dog Walker", "Dentist" |
| **Service Address** | Full address via Google Places Autocomplete | "123 Main St, Greenville, SC 29601" |
| **Urgency Level** | Timeline dropdown | "Immediate (ASAP)", "Within 24 hours", "Within 2 days", "Flexible timing" |
| **Minimum Rating** | Star rating slider (0-5) | 4.5 stars |
| **Detailed Description** | Problem description textarea | "I have a leaking toilet in the master bathroom that needs fixing ASAP" |
| **Preferred Contact** | How user wants to be notified | SMS or Phone Call |
| **Phone Number** | E.164 format with validation | "+1 (310) 555-1234" |

**Optional Fields:**

| Field | Description | Example |
|-------|-------------|---------|
| **Additional Criteria** | Specific requirements (toggle to enable) | "Licensed, 10+ years experience, background check required" |

### Address Capture Innovation

The **Google Places Autocomplete** component captures structured address data:

```javascript
{
  formatted: "123 Main St, Greenville, SC 29601",
  street: "123 Main St",
  city: "Greenville",
  state: "SC",
  zip: "29601",
  placeId: "ChIJRURMfy-gVogRtM_hIBmcucM"
}
```

**Why this matters**: When the AI calls providers, it can give them the REAL address instead of making one up. Previously, the AI would hallucinate fake addresses when providers asked "Where is the client located?"

### Form Submission

When the user clicks **"Start Research & Booking"**:

1. **Database record created** - Request gets a UUID immediately
2. **Status set to PENDING** - Visible in real-time
3. **User redirected** to `/request/[id]` page
4. **Background process starts** - Kestra workflow triggered

---

## Stage 1: Research Phase (30-60 seconds)

### What the User Sees

The request details page shows a **live status indicator** with animated icons:

```
🔍 Searching for providers...
   AI-powered market research in progress

   ● Querying Google Maps API with grounding... ✓
   ○ Scanning local providers...
   ○ Filtering by rating and reviews...
   ○ Preparing to call providers
```

### What Happens Behind the Scenes

**Technology Stack**: Kestra orchestration → Gemini 2.5 Flash → Google Maps Grounding

**Two-Stage Research Pipeline:**

#### Stage 1A: Broad Search
- Gemini AI with Google Search Grounding searches for providers
- Query: "Find [service type] near [location] with [minimum rating]+ stars"
- Returns 15+ raw candidates with:
  - Company name
  - Phone number (MANDATORY - skips any without phone)
  - Full address with city/state/zip
  - Rating (numeric)
  - Review count
  - Hours of operation

#### Stage 1B: Filter & Rank
- Filters by: minimum rating, phone availability, hours
- Ranks by: rating (primary), review count (secondary)
- Returns **top 10 qualified providers**

### Database Persistence (Critical Pattern)

**Before VAPI calls can happen**, providers are inserted into the database:

```
Research Results (Place IDs) → addProviders() → Database UUIDs → VAPI Calls
```

**Why this matters**:
- Google Place IDs fail UUID validation
- Without database UUIDs, call results can't be saved
- Real-time subscriptions only trigger on actual database changes

### Real-Time Updates

As research completes, the frontend receives updates via **Supabase Realtime**:

```typescript
// Frontend subscription (listens for INSERT events)
supabase.channel(`request-${id}`)
  .on("postgres_changes", {
    event: "*",  // INSERT, UPDATE, DELETE
    table: "providers",
    filter: `request_id=eq.${id}`
  }, (payload) => {
    // New providers appear instantly!
  })
```

The user sees **all 10 providers appear** in the Candidates panel on the right side of the screen.

---

## Stage 2: Concurrent Calling Phase (2-4 minutes)

### What the User Sees

The status indicator transitions to an **amber calling state**:

```
📞 Making 5 Concurrent Calls
   Real-time VAPI.ai voice calls in progress

   ┌─────────┬─────────┬─────────┐
   │ Queued  │ Active  │  Done   │
   │    5    │    5    │    0    │
   └─────────┴─────────┴─────────┘

   Currently calling: ABC Plumbing

   Overall Progress: ████████░░ 5/10 (50%)
```

As calls complete, the user sees:
- **Call transcripts** appear in the main timeline
- **Provider cards** update with call status badges (Completed, Voicemail, No Answer)
- **Progress bar** fills in real-time

### What Happens Behind the Scenes

**Technology Stack**: Kestra EachParallel → VAPI.ai SDK → ElevenLabs Voice → Gemini 2.5 Flash Analysis

#### Concurrent Calling Architecture

```
Input: 10 providers, max_concurrent = 5

Execution Timeline:
├─ Batch 1 (0-2.5 min): Providers 1-5 call simultaneously
├─ Batch 2 (2.5-5 min): Providers 6-10 call simultaneously
└─ Total: ~5 min (vs 25+ min sequential)

Result: 80%+ time savings with intelligent batching
```

#### The AI Phone Call Conversation

The VAPI assistant uses **ElevenLabs "Rachel" voice** (warm, professional) and follows this interview structure:

**1. GREETING**
```
AI: "Hi there! This is John's personal AI assistant calling to check
     on plumbing services. Do you have just a quick moment?"
```

**2. AVAILABILITY CHECK**
```
AI: "John needs help within 2 days. Are you available?"

Provider: "Yes, we can come out tomorrow afternoon."

AI: "What's your soonest availability? When could you come out?"

Provider: "Tomorrow at 2pm works."
```
→ Captures: `earliest_availability: "Tomorrow at 2pm"`

**3. RATES**
```
AI: "What would your typical rate be for this type of work?"

Provider: "It's $85 for the service call plus parts."
```
→ Captures: `estimated_rate: "$85 service call + parts"`

**4. CLIENT CRITERIA (One at a time, tracking SAME person)**
```
AI: "Do you have a technician who is licensed?"

Provider: "Yes, all our techs are licensed."

AI: "And is this SAME person also available within your timeframe?"

Provider: "Yes, Mike can come tomorrow."
```
→ Captures: `single_person_found: true`, `technician_name: "Mike"`

**5. INTELLIGENT CLOSING**

**If provider is QUALIFIED:**
```
AI: "Perfect! I'll share this with John and if he'd like to proceed,
     we'll call you back to schedule. Does that sound good?"
```
→ Then: AI invokes `endCall` function to hang up cleanly

**If provider is DISQUALIFIED:**
```
AI: "Thank you so much for your time. Unfortunately, this isn't the
     best fit right now, but I really appreciate your help. Have a
     wonderful day!"
```
→ No mention of callback → AI invokes `endCall`

#### Disqualification Detection

The AI automatically detects when providers should be disqualified:

| Trigger | Example | Action |
|---------|---------|--------|
| Not available | "We're booked for 2 weeks" | Polite exit, mark `disqualified: true` |
| Can't meet criteria | "We don't do background checks" | Polite exit, mark `disqualified: true` |
| Rate too high | "$500 service call minimum" | Polite exit, mark `disqualification_reason` |
| Wrong service type | "We don't do residential" | Polite exit, mark `disqualified: true` |

#### Voicemail Detection

Using **Twilio machine detection**:
- `machineDetectionTimeout: 10s`
- If voicemail detected: IMMEDIATELY invoke `endCall` (don't leave message)
- Provider marked as `call_outcome: "voicemail"`

#### Structured Data Extraction

After each call, VAPI's analysis plan extracts structured data:

```json
{
  "availability": "available",
  "earliest_availability": "Tomorrow at 2pm",
  "estimated_rate": "$85 service call + parts",
  "single_person_found": true,
  "technician_name": "Mike",
  "all_criteria_met": true,
  "criteria_details": {
    "licensed": true,
    "background_check": true
  },
  "disqualified": false,
  "call_outcome": "positive",
  "recommended": true
}
```

#### Hybrid Webhook Mode (Performance)

For fast results, the system uses a **webhook + polling hybrid**:

| Mode | API Calls | Latency |
|------|-----------|---------|
| Webhook (primary) | 1-3 per call | <500ms |
| Polling (fallback) | 12-18 per call | 2.5s |
| **Improvement** | **31x fewer** | **5x faster** |

### Call Results in Database

Each call result is persisted to the `providers` table:

```sql
UPDATE providers SET
  call_status = 'completed',
  call_result = {...},           -- Structured JSON
  call_transcript = '...',       -- Full conversation
  call_summary = '...',          -- AI summary
  call_duration_minutes = 2.5,
  call_cost = 0.15,
  call_method = 'kestra',
  called_at = NOW()
WHERE id = provider_uuid;
```

### Real-Time Transcript Display

The frontend shows call transcripts in a **chat bubble format**:

```
┌─────────────────────────────────────────┐
│ Call to ABC Plumbing          Completed │
├─────────────────────────────────────────┤
│ Summary:                                │
│ Provider is available tomorrow at 2pm, │
│ rate is $85 + parts, Mike is licensed. │
├─────────────────────────────────────────┤
│ Transcript:                    ▼ Expand │
│                                         │
│ 🤖 AI: "Hi there! This is John's..."   │
│                                         │
│       Provider: "Hello, ABC Plumbing." │
│                                         │
│ 🤖 AI: "John needs help within 2..."   │
│                                         │
│       Provider: "Yes, we can come..."  │
└─────────────────────────────────────────┘
```

---

## Stage 3: AI Analysis & Recommendations (15-30 seconds)

### What the User Sees

The status transitions to a **purple analyzing state**:

```
🧠 AI Analysis in Progress
   Gemini 2.5 Flash analyzing call results

   ● Collecting call transcripts and data... ✓
   ● Running Gemini AI analysis on results... ✓
   ○ Scoring providers against criteria...
   ○ Generating top 3 recommendations...
```

### What Happens Behind the Scenes

**Technology Stack**: Kestra → Gemini 2.5 Flash → Weighted Scoring Algorithm

#### Status Timing (Critical Fix)

The status is updated to `ANALYZING` **only AFTER** polling confirms all providers have completed calls:

```
✓ All 10 providers complete (completed/failed/timeout/voicemail)
  ↓
✓ Update status → ANALYZING
  ↓
✓ Generate recommendations
  ↓
✓ Update status → RECOMMENDED
```

**Why this matters**: Previously, status jumped to ANALYZING before calls finished, confusing users.

#### Filtering Qualified Providers

Before scoring, unqualified providers are filtered out:

```
EXCLUDE providers where:
  ✗ disqualified = true
  ✗ availability = "unavailable"
  ✗ status = "error", "timeout", "voicemail", "no_answer"

INCLUDE only:
  ✓ Successful calls with positive outcomes
  ✓ Available providers
  ✓ Criteria met
```

**Example**: 10 providers called → 6 qualified → Top 3 recommended

#### Weighted Scoring System

Gemini analyzes qualified providers using this rubric:

| Dimension | Weight | Scoring Logic |
|-----------|--------|---------------|
| **Availability/Urgency** | 30% | Immediate > 24hrs > 2 days > Flexible |
| **Rate Competitiveness** | 20% | Lower/reasonable rates score higher |
| **All Criteria Met** | 25% | Meeting ALL requirements = highest score |
| **Call Quality** | 15% | Informative, helpful conversations score higher |
| **Professionalism** | 10% | Courtesy, clarity, responsiveness |

#### Recommendation Output

```json
{
  "recommendations": [
    {
      "providerName": "ABC Plumbing",
      "phone": "+18645551234",
      "score": 95,
      "reasoning": "Best availability (tomorrow 2pm), competitive rate ($85),
                   all criteria met, Mike is licensed with 15 years experience",
      "criteriaMatched": ["licensed", "background_check", "10+ years"],
      "earliestAvailability": "Tomorrow at 2pm",
      "estimatedRate": "$85 service call + parts"
    },
    // ... 2 more recommendations
  ],
  "overallRecommendation": "ABC Plumbing is the best choice because...",
  "stats": {
    "totalCalls": 10,
    "qualifiedProviders": 6,
    "disqualifiedProviders": 3,
    "failedCalls": 1
  }
}
```

### Recommendation Cards Display

The user sees **beautiful recommendation cards**:

```
┌──────────────────────────────────────────────────────────┐
│  🏆 BEST MATCH                                           │
│                                                          │
│  ABC Plumbing                                   95       │
│  ★★★★★ 4.8 (156 reviews)                       SCORE    │
│                                                          │
│  📅 Available: Tomorrow at 2pm                           │
│  💰 Rate: $85 service call + parts                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ AI ANALYSIS                                        │  │
│  │ Best availability with competitive rate. Mike is   │  │
│  │ licensed with 15 years experience and can meet    │  │
│  │ all stated requirements.                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ✓ licensed  ✓ background_check  ✓ 10+ years           │
│                                                          │
│  [ Select This Provider ]                                │
└──────────────────────────────────────────────────────────┘
```

---

## Stage 4: User Notification & Selection

### Multi-Channel Notification

Based on the user's **preferred contact method**, they receive:

**If SMS Selected:**
```
AI Concierge: Your top 3 plumber recommendations are ready!

🥇 ABC Plumbing (95/100) - Tomorrow 2pm, $85
🥈 XYZ Services (88/100) - Wed 10am, $95
🥉 123 Repair (82/100) - Thu 3pm, $75

Reply 1, 2, or 3 to select, or visit:
concierge-ai.vercel.app/request/abc123
```

**If Phone Call Selected:**
```
AI: "Hi John! This is your AI Concierge with your plumber recommendations.

     Your top choice is ABC Plumbing with a score of 95 out of 100.
     They're available tomorrow at 2pm and charge $85 for the service call.

     Would you like me to book ABC Plumbing, or would you prefer to
     hear about the other options?"

John: "Book ABC Plumbing"

AI: "Perfect! I'll call them right now to schedule your appointment
     for tomorrow at 2pm. You'll receive a confirmation shortly."
```

### Selection Methods

The user can select their preferred provider via:

1. **Web App** - Click "Select This Provider" button
2. **SMS Reply** - Reply with "1", "2", or "3"
3. **Phone Response** - Tell the AI their choice

**All paths converge** to the same booking flow.

### Web App Selection Flow

When user clicks "Select This Provider":

1. **Confirmation Modal** appears:
   ```
   ┌─────────────────────────────────────┐
   │        Confirm Booking              │
   ├─────────────────────────────────────┤
   │  ABC Plumbing                       │
   │  📞 (864) 555-1234                  │
   │                                     │
   │  📅 Available: Tomorrow at 2pm     │
   │                                     │
   │  ℹ️ Our AI will call them now to   │
   │     schedule your appointment       │
   │                                     │
   │  [ Cancel ]  [ Confirm & Book ]     │
   └─────────────────────────────────────┘
   ```

2. **User clicks "Confirm & Book"**
3. **Status updates to BOOKING**
4. **Booking call initiated**

---

## Stage 5: Booking Confirmation Call (1-2 minutes)

### What Happens

The AI calls the selected provider **back** to lock in the appointment:

```
AI: "Hi! This is John's AI assistant calling back about scheduling
     the plumbing appointment. Do you have a moment?"

Provider: "Yes, of course."

AI: "We spoke earlier and you mentioned you were available tomorrow
     at 2pm. I'd like to lock in that specific time if possible."

Provider: "Yes, 2pm tomorrow works. We have Mike available."

AI: "Perfect! Just to confirm:
     - Service: Plumbing repair (leaking toilet)
     - Date and time: Tomorrow, January 15th at 2pm
     - Location: 123 Main St, Greenville, SC 29601
     - Client: John Smith

     Is there anything else you need?"

Provider: "No, we're all set. Confirmation number is PLB-2025-0115."

AI: "Excellent! John will see you tomorrow at 2pm. Thank you so much!"
```
→ AI invokes `endCall`

### Booking Structured Data

```json
{
  "booking_confirmed": true,
  "confirmed_date": "Tuesday, January 15th, 2025",
  "confirmed_time": "2:00 PM",
  "confirmation_number": "PLB-2025-0115",
  "contact_name": "Mike",
  "call_outcome": "confirmed"
}
```

### Database Update

```sql
UPDATE service_requests SET
  status = 'COMPLETED',
  selected_provider_id = provider_uuid,
  final_outcome = 'Appointment confirmed for January 15th, 2025 at 2:00 PM',
  booking_confirmation = 'PLB-2025-0115'
WHERE id = request_uuid;
```

---

## Stage 6: Final Confirmation to User

### What the User Receives

**SMS Notification:**
```
AI Concierge: Your appointment is confirmed! 🎉

📍 ABC Plumbing
📅 Tomorrow, January 15th at 2:00 PM
📍 123 Main St, Greenville, SC
🔖 Confirmation #: PLB-2025-0115

Mike will arrive to fix your leaking toilet.

Need to reschedule? Reply HELP or visit:
concierge-ai.vercel.app/request/abc123
```

**Phone Call:**
```
AI: "Hi John! Great news - your appointment is confirmed!

     ABC Plumbing will be at your home tomorrow, January 15th at 2pm.
     Mike will be the technician handling your leaking toilet repair.
     Your confirmation number is PLB-2025-0115.

     Is there anything else I can help you with?"

John: "No, that's perfect. Thank you!"

AI: "You're welcome! Have a great day, and good luck with the repair!"
```

### Web App Display

The request page shows a **green confirmation card**:

```
┌──────────────────────────────────────────────────────────┐
│  ✅ Appointment Confirmed!                               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  📅 Date: Tuesday, January 15th, 2025                   │
│  🕐 Time: 2:00 PM                                        │
│  🔖 Confirmation: PLB-2025-0115                         │
│                                                          │
│  ABC Plumbing                                            │
│  Mike will arrive to fix your leaking toilet.           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Technology Summary

### Orchestration Layer: Kestra
- **research_providers.yaml** - Gemini + Google Maps grounding
- **contact_providers.yaml** - EachParallel concurrent calling
- **recommend_providers.yaml** - AI scoring and top 3 selection
- **schedule_service.yaml** - Booking confirmation call
- **notify_user.yaml** - SMS/Phone notifications

### Voice AI Layer: VAPI.ai
- **ElevenLabs "Rachel"** voice - Warm, professional
- **Deepgram Nova-2** transcription - Accurate conversation capture
- **Twilio** telephony - Voicemail detection, machine detection
- **5 concurrent calls** - 80%+ time savings
- **Structured data extraction** - Availability, rates, criteria

### AI Layer: Google Gemini 2.5 Flash
- **Research** - Google Search grounding for provider discovery
- **Analysis** - Weighted scoring for recommendations
- **Dynamic prompts** - Task-specific conversation generation

### Database Layer: Supabase
- **PostgreSQL** - Providers, requests, interaction logs
- **Real-time subscriptions** - Live UI updates
- **Row Level Security** - Data protection

### Frontend: Next.js 16 + React 19
- **Server Components** - Fast initial load
- **Real-time updates** - Supabase postgres_changes
- **Google Places Autocomplete** - Accurate address capture

---

## Key Metrics for Hackathon Demo

| Metric | Value |
|--------|-------|
| Time from request to recommendations | **~5 minutes** |
| Providers researched | **10-15** |
| Concurrent calls | **5 simultaneous** |
| Time savings vs manual | **80%+** |
| API call reduction (webhook mode) | **31x fewer** |
| Average call latency | **<500ms** |

---

## The User's Complete Journey (Summary)

1. **0:00** - User fills out form with service details and address
2. **0:30** - AI researches and finds 10+ qualified providers
3. **1:00** - Status shows "Searching..." with progress steps
4. **1:30** - Providers appear in Candidates panel
5. **2:00** - AI starts calling 5 providers simultaneously
6. **2:30** - User sees live call status (Queued → Active → Done)
7. **4:00** - Call transcripts appear as each call completes
8. **4:30** - AI analyzes results and generates recommendations
9. **5:00** - Top 3 recommendation cards appear with scores
10. **5:15** - User receives SMS/call with recommendations
11. **5:30** - User selects preferred provider (web/SMS/phone)
12. **6:00** - AI calls provider back to book appointment
13. **7:00** - User receives confirmation with date/time/confirmation #
14. **Done!** - Appointment booked, user saved 2+ hours

---

## What Makes This Special

### For the Hackathon Video

1. **Real AI Phone Calls** - Not simulated, actual VAPI calls to real phones
2. **Concurrent Calling** - 5 providers at once, visible progress
3. **Intelligent Conversation** - AI asks smart questions, detects disqualification
4. **Live Updates** - Real-time UI shows calls in progress
5. **Top 3 Recommendations** - AI-scored with reasoning
6. **End-to-End Automation** - From "I need a plumber" to confirmed appointment
7. **Multi-Channel** - Web, SMS, and phone all work together

### Technical Innovation

1. **DRY Architecture** - Single assistant config used by Kestra AND direct API
2. **Hybrid Webhook Mode** - 31x fewer API calls, <500ms latency
3. **Graceful Fallbacks** - Kestra → Direct VAPI → Polling
4. **Database-First Pattern** - Proper UUIDs for real-time subscriptions
5. **Status Timing Fix** - ANALYZING only after ALL calls complete

---

*This document serves as the foundation for the 2-minute hackathon video narration script.*
