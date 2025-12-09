# VAPI Webhook Architecture Diagram

## Current Architecture (Polling - INEFFICIENT)

```
┌─────────────────────────────────────────────────────────────────┐
│ Kestra Workflow: contact_providers                             │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ call-provider.js Script                                │    │
│  │                                                         │    │
│  │  1. Create VAPI call                                   │    │
│  │     │                                                   │    │
│  │     ▼                                                   │    │
│  │  2. Get call ID                                        │    │
│  │     │                                                   │    │
│  │     ▼                                                   │    │
│  │  3. POLL VAPI API every 5 seconds (max 60 times) ◄─┐  │    │
│  │     │                                               │  │    │
│  │     ├─► GET /calls/{id} ──► VAPI API              │  │    │
│  │     │                           │                   │  │    │
│  │     │                           ├─► status: ringing │  │    │
│  │     │                           └─► KEEP POLLING ───┘  │    │
│  │     │                                                   │    │
│  │     ▼                                                   │    │
│  │  4. Wait 5 seconds                                     │    │
│  │     │                                                   │    │
│  │     ▼                                                   │    │
│  │  5. Check again (attempt 2/60)                        │    │
│  │     │                                                   │    │
│  │     ▼                                                   │    │
│  │  6. ... repeat until status='ended' or timeout        │    │
│  │     │                                                   │    │
│  │     ▼                                                   │    │
│  │  7. Return result or timeout error                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

PROBLEMS:
❌ Makes 60+ API calls to VAPI
❌ 5-second delay between checks
❌ Can timeout on long calls
❌ Wastes resources
```

---

## New Architecture (Webhook + Database - EFFICIENT)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         VAPI WEBHOOK FLOW                                    │
└──────────────────────────────────────────────────────────────────────────────┘

STEP 1: Kestra initiates call
┌─────────────────────────┐
│ Kestra Workflow         │
│                         │
│  call-provider.js       │
│  - Create VAPI call     │
│  - Get call ID          │
│  - Return immediately ✓ │
└───────────┬─────────────┘
            │
            ▼
     ┌──────────────┐
     │  VAPI API    │
     │              │
     │  Call starts │
     │  Status: in- │
     │  progress    │
     └──────┬───────┘
            │
            │ Call in progress...
            │ (30 seconds to 5 minutes)
            │
            ▼
    ┌───────────────────┐
    │ Call completes    │
    │ Status: ended     │
    └─────────┬─────────┘
              │
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: VAPI sends webhook                                     │
│                                                                 │
│  POST /api/v1/vapi/webhooks/vapi                               │
│  {                                                              │
│    "message": {                                                 │
│      "type": "end-of-call-report",                             │
│      "call": {                                                  │
│        "id": "abc123",                                          │
│        "status": "ended",                                       │
│        "transcript": "...",                                     │
│        "analysis": { ... }                                      │
│      }                                                          │
│    }                                                            │
│  }                                                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────────┐
              │ API Server              │
              │ (Fastify)               │
              │                         │
              │ 1. Verify signature     │
              │ 2. Validate payload     │
              │ 3. Store in database    │
              └───────────┬─────────────┘
                          │
                          ▼
                 ┌──────────────────────────────────┐
                 │ Supabase Database                │
                 │                                  │
                 │ vapi_call_results                │
                 │ ┌──────────────────────────────┐ │
                 │ │ call_id: abc123              │ │
                 │ │ status: ended                │ │
                 │ │ transcript: {...}            │ │
                 │ │ analysis: {...}              │ │
                 │ │ created_at: 2025-01-08...    │ │
                 │ └──────────────────────────────┘ │
                 └──────────────┬───────────────────┘
                                │
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Kestra retrieves result                                │
│                                                                 │
│  Lightweight database poll:                                    │
│  GET /api/v1/vapi/calls/{call_id}                              │
│                                                                 │
│  ┌────────────────────────────────────┐                        │
│  │ SELECT * FROM vapi_call_results    │                        │
│  │ WHERE call_id = 'abc123'           │                        │
│  │ AND status = 'ended'               │                        │
│  └────────────────────────────────────┘                        │
│                                                                 │
│  Returns immediately if available ✓                            │
│  Or polls every 5 seconds (cheap local DB query)               │
└─────────────────────────────────────────────────────────────────┘

BENEFITS:
✅ Zero calls to VAPI API after initial call creation
✅ Real-time results via webhook (no delay)
✅ No timeout issues
✅ Database stores complete audit trail
✅ Kestra polling is fast (local DB, not external API)
```

---

## Detailed Component Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                              COMPONENTS                                       │
└───────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│ Kestra Workflow     │
│ (orchestration)     │
│                     │
│ 1. call-provider.js │◄─── Triggers VAPI call, gets call_id
│    └─► VAPI API     │
│                     │
│ 2. poll-results.sh  │◄─── Polls API server for results
│    └─► API Server   │
└─────────────────────┘
         │
         │ HTTP
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ API Server (Fastify 5, Port 8000)                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ /apps/api/src/routes/vapi.ts                        │   │
│  │                                                      │   │
│  │  POST /webhooks/vapi ──┐                           │   │
│  │  GET  /calls/:callId   │  Request Handlers          │   │
│  │  GET  /calls/by-phone  │                           │   │
│  └────────────────┬───────────────────────────────────┘   │
│                   │                                        │
│                   │ calls                                  │
│                   ▼                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ /apps/api/src/services/vapi.ts                      │   │
│  │                                                      │   │
│  │  storeCallResult()                                  │   │
│  │  getCallResult()                                    │   │
│  │  getCallResultsByPhone()                           │   │
│  │  waitForCallCompletion()                           │   │
│  └────────────────┬───────────────────────────────────┘   │
│                   │                                        │
│                   │ uses                                   │
│                   ▼                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ request.supabase (plugin)                           │   │
│  │                                                      │   │
│  │  - Database queries                                 │   │
│  │  - RLS enforcement                                  │   │
│  └────────────────┬───────────────────────────────────┘   │
└────────────────────┼──────────────────────────────────────┘
                     │
                     │ SQL
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Supabase (PostgreSQL)                                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ vapi_call_results                                   │   │
│  │                                                      │   │
│  │ Columns:                                            │   │
│  │  - id (uuid)                                        │   │
│  │  - call_id (text, unique)                          │   │
│  │  - status (enum)                                    │   │
│  │  - customer_phone (text)                           │   │
│  │  - transcript (jsonb)                              │   │
│  │  - analysis_summary (text)                         │   │
│  │  - analysis_structured_data (jsonb)               │   │
│  │  - provider_name, service_type, etc.              │   │
│  │  - raw_webhook_payload (jsonb)                    │   │
│  │  - created_at, updated_at                          │   │
│  │                                                      │   │
│  │ Indexes:                                            │   │
│  │  - call_id (unique)                                │   │
│  │  - status                                           │   │
│  │  - customer_phone                                   │   │
│  │  - created_at                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  RLS Policies:                                             │
│  - Service role: full access                               │
│  - Users: view their own calls (via service_requests)     │
└─────────────────────────────────────────────────────────────┘
```

---

## Webhook Sequence Diagram

```
VAPI          API Server       Database       Kestra
 │                │               │              │
 │  Call starts   │               │              │
 ├───────────────►│               │              │
 │  (initiated    │               │              │
 │   by Kestra)   │               │              │
 │                │               │              │
 │  ... call in progress ...      │              │
 │                │               │              │
 │  Call ends     │               │              │
 │  (status:      │               │              │
 │   'ended')     │               │              │
 │                │               │              │
 │  POST webhook  │               │              │
 ├───────────────►│               │              │
 │                │               │              │
 │                │  Verify sig   │              │
 │                ├─────────┐     │              │
 │                │         │     │              │
 │                │◄────────┘     │              │
 │                │               │              │
 │                │  Validate     │              │
 │                ├─────────┐     │              │
 │                │         │     │              │
 │                │◄────────┘     │              │
 │                │               │              │
 │                │  UPSERT       │              │
 │                ├──────────────►│              │
 │                │               │              │
 │                │  Success      │              │
 │                │◄──────────────┤              │
 │                │               │              │
 │   200 OK       │               │              │
 │◄───────────────┤               │              │
 │                │               │              │
 │                │               │  Poll for    │
 │                │               │  results     │
 │                │  GET /calls/{id}             │
 │                │◄──────────────────────────────┤
 │                │               │              │
 │                │  Query DB     │              │
 │                ├──────────────►│              │
 │                │               │              │
 │                │  Result       │              │
 │                │◄──────────────┤              │
 │                │               │              │
 │                │  200 + data   │              │
 │                ├──────────────────────────────►│
 │                │               │              │
 │                │               │  Process     │
 │                │               │  results     │
 │                │               │              │
```

---

## File System Layout

```
concierge-ai/
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts ──────────────────► Register vapi routes
│   │   │   ├── routes/
│   │   │   │   ├── gemini.ts ─────────────► Existing (reference)
│   │   │   │   ├── users.ts ──────────────► Existing (reference)
│   │   │   │   ├── workflows.ts ──────────► Existing (reference)
│   │   │   │   └── vapi.ts ───────────────► NEW: Webhook endpoints
│   │   │   ├── services/
│   │   │   │   ├── gemini.ts ─────────────► Existing (reference)
│   │   │   │   └── vapi.ts ───────────────► NEW: Database operations
│   │   │   ├── lib/
│   │   │   │   ├── supabase.ts ───────────► Existing (reference)
│   │   │   │   └── vapi-signature.ts ─────► NEW: Webhook security
│   │   │   └── plugins/
│   │   │       └── supabase.ts ───────────► Existing (reference)
│   │   └── .env ──────────────────────────► Add VAPI_WEBHOOK_SECRET
│   │
│   └── web/ (unchanged)
│
├── supabase/
│   └── migrations/
│       ├── 20250101000000_initial_schema.sql ──► Existing
│       └── 20250108000000_add_vapi_call_results.sql ──► NEW
│
├── kestra/
│   ├── flows/
│   │   └── contact_agent.yaml ────────────► UPDATE: Add DB polling
│   └── scripts/
│       └── call-provider.js ──────────────► UPDATE: Return immediately
│
└── docs/
    ├── VAPI_WEBHOOK_DESIGN.md ────────────► Complete design (this doc)
    ├── VAPI_WEBHOOK_SUMMARY.md ───────────► Executive summary
    └── VAPI_WEBHOOK_ARCHITECTURE.md ──────► Architecture diagrams
```

---

## Data Flow Example

### Example: Call to "Joe's Plumbing"

```
1. KESTRA INITIATES CALL
   └─► call-provider.js
       └─► VAPI.calls.create({
             customer: { number: "+18641234567" },
             assistant: { ... }
           })
       ◄─── { id: "call_abc123", status: "queued" }
       └─► Return: { callId: "call_abc123", status: "initiated" }

2. VAPI MAKES CALL
   └─► Dials +18641234567
   └─► Status: "ringing" → "in-progress"
   └─► AI conversation happens (2 minutes)
   └─► Status: "ended"
   └─► Analysis runs

3. VAPI SENDS WEBHOOK
   └─► POST https://api.example.com/api/v1/vapi/webhooks/vapi
       Body:
       {
         "message": {
           "type": "end-of-call-report",
           "call": {
             "id": "call_abc123",
             "status": "ended",
             "endedReason": "assistant-ended-call",
             "customer": { "number": "+18641234567" },
             "startedAt": "2025-01-08T10:00:00Z",
             "endedAt": "2025-01-08T10:02:00Z",
             "transcript": "AI: Hi, this is...\nJoe: Hello...",
             "analysis": {
               "summary": "Joe's Plumbing is available...",
               "structuredData": {
                 "availability": "available",
                 "estimated_rate": "$85/hour",
                 "single_person_found": true,
                 "all_criteria_met": true
               }
             }
           }
         }
       }

4. API SERVER PROCESSES WEBHOOK
   └─► vapi.ts route receives POST
   └─► Verifies signature ✓
   └─► Validates payload ✓
   └─► vapi.ts service calls storeCallResult()
   └─► Supabase UPSERT:
       INSERT INTO vapi_call_results (
         call_id: "call_abc123",
         status: "ended",
         customer_phone: "+18641234567",
         transcript: {...},
         analysis_summary: "Joe's Plumbing is available...",
         analysis_structured_data: {...},
         provider_name: "Joe's Plumbing",
         ...
       )
       ON CONFLICT (call_id) DO UPDATE
   └─► Returns 200 OK to VAPI

5. KESTRA POLLS FOR RESULT
   └─► GET http://api:8000/api/v1/vapi/calls/call_abc123
   └─► vapi.ts route receives GET
   └─► vapi.ts service calls getCallResult()
   └─► Supabase query:
       SELECT * FROM vapi_call_results
       WHERE call_id = 'call_abc123'
   └─► Returns:
       {
         "success": true,
         "data": {
           "id": "uuid-...",
           "call_id": "call_abc123",
           "status": "ended",
           "transcript": {...},
           "analysis_summary": "...",
           "analysis_structured_data": {
             "availability": "available",
             "estimated_rate": "$85/hour"
           }
         }
       }
   └─► Kestra workflow continues with result
```

---

## Security Flow

```
┌────────────┐
│ VAPI sends │
│ webhook    │
└─────┬──────┘
      │
      │ Headers:
      │   x-vapi-signature: "abc123..."
      │ Body:
      │   { "message": { ... } }
      │
      ▼
┌─────────────────────────────────────────────────┐
│ API Server                                      │
│                                                 │
│ 1. Extract signature from header               │
│    signature = req.headers['x-vapi-signature'] │
│                                                 │
│ 2. Get webhook secret from env                 │
│    secret = process.env.VAPI_WEBHOOK_SECRET    │
│                                                 │
│ 3. Compute expected signature                  │
│    expected = HMAC-SHA256(body, secret)        │
│                                                 │
│ 4. Compare (constant-time)                     │
│    if (signature === expected) {               │
│      ✓ Valid webhook                           │
│    } else {                                     │
│      ✗ Reject (401 Unauthorized)               │
│    }                                            │
│                                                 │
│ 5. Validate schema (Zod)                       │
│    if (valid) {                                 │
│      ✓ Process webhook                         │
│    } else {                                     │
│      ✗ Reject (400 Bad Request)                │
│    }                                            │
│                                                 │
│ 6. Store in database                           │
│    - Service role bypasses RLS                 │
│    - Raw payload stored for audit              │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Performance Comparison

### Current (Polling)
```
Call duration: 2 minutes
Polling interval: 5 seconds
Max attempts: 60 (5 minutes)

Actual attempts needed: 2 min / 5 sec = 24 polls
API calls to VAPI: 24
Time to get result: ~24 * 5 sec = 120 seconds (2 min delay)
Resources: High (24 HTTP requests, script running for 2+ min)
```

### New (Webhook)
```
Call duration: 2 minutes
Webhook delivery: ~1 second after call ends

API calls to VAPI: 1 (initial call creation only)
Time to get result: ~1 second (webhook delivery time)
Resources: Low (1 webhook, instant storage)

Kestra polling (database):
  - Cheap local queries
  - Can poll every 1 second if needed
  - No external API rate limits
```

**Performance improvement: ~120x faster result delivery**

---

This architecture provides a scalable, efficient, and reliable foundation for handling VAPI call results in the AI Concierge system.
