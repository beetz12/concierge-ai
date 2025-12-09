# VAPI Webhook Implementation

## Overview

This implementation provides a webhook endpoint for receiving VAPI call completion callbacks and a polling endpoint for Kestra scripts to retrieve results. Instead of Kestra scripts polling VAPI directly, they now poll this backend API which caches webhook results in memory.

**Key Features:**

- AI-powered disqualification detection during calls
- Conditional closing scripts (qualified vs disqualified)
- DRY architecture with single source of truth
- New structured data fields for enhanced analysis
- Fast in-memory cache with automatic cleanup

## Architecture

```
VAPI Call → AI Assistant (assistant-config.ts) → Call Execution
                ↓
         Disqualification Detection
         Conditional Closing
                ↓
VAPI Webhook → Backend API → In-Memory Cache
                                   ↓
                      WebhookCacheService
                      - disqualified: boolean
                      - disqualification_reason: string
                      - earliest_availability: string
                      - criteria_details: object
                                   ↓
Kestra Script ← Poll Backend API ← Cache ← [30min TTL]
```

## Components

### 1. WebhookCacheService (`/apps/api/src/services/vapi/webhook-cache.service.ts`)

In-memory cache for storing call results with automatic TTL and cleanup.

**Features:**

- 30-minute default TTL (configurable)
- Automatic cleanup every 5 minutes
- Thread-safe Map-based storage
- Debug statistics endpoint

**Methods:**

- `set(callId, result, ttl?)` - Store a call result
- `get(callId)` - Retrieve a call result
- `has(callId)` - Check if result exists
- `delete(callId)` - Remove a result
- `getStats()` - Get cache statistics
- `clear()` - Clear all entries
- `shutdown()` - Stop cleanup interval

### 2. Assistant Configuration (`/apps/api/src/services/vapi/assistant-config.ts`)

**Single Source of Truth** for VAPI assistant behavior.

**Key Features:**

- System prompt with disqualification detection logic
- Structured question flow (availability, rates, criteria)
- Conditional closing scripts based on qualification status
- Analysis schema with new fields

**Export:**

```typescript
export function createAssistantConfig(request: CallRequest): AssistantConfig;
```

**Used By:**

- Kestra scripts (via compiled JavaScript)
- Direct VAPI client
- Provider calling service

**Disqualification Logic:**

```typescript
// In system prompt:
"Watch for responses that DISQUALIFY the provider:
- They don't have anyone available
- They can't meet a specific requirement
- They don't do the type of work needed
- Rate is significantly higher than reasonable

If disqualified, politely wrap up:
'Thank you so much for taking the time to chat. Unfortunately,
this particular request might not be the best fit right now,
but I really appreciate your help. Have a wonderful day!'
Then immediately invoke endCall.

DO NOT mention calling back to schedule if they are disqualified."
```

**Structured Data Schema:**

```typescript
{
  availability: "available" | "unavailable" | "callback_requested" | "unclear",
  earliest_availability: string,        // NEW: "Tomorrow at 2pm"
  estimated_rate: string,
  single_person_found: boolean,
  technician_name?: string,
  all_criteria_met: boolean,
  criteria_details: Record<string, boolean>, // NEW: Per-criterion breakdown
  disqualified: boolean,                // NEW: Disqualification flag
  disqualification_reason?: string,     // NEW: Why disqualified
  call_outcome: "positive" | "negative" | "neutral" | "no_answer" | "voicemail",
  recommended: boolean,
  notes?: string
}
```

### 3. Types (`/apps/api/src/services/vapi/types.ts`)

Shared TypeScript interfaces for type safety.

**Key Types:**

```typescript
interface CallRequest {
  providerName: string;
  providerPhone: string;
  serviceNeeded: string;
  location: string;
  urgency: string;
  userCriteria: string;
}

interface CallResult {
  status: "completed" | "failed" | "no_answer";
  callId: string;
  callMethod: "kestra" | "direct_vapi";
  duration?: number;
  endedReason?: string;
  transcript?: string;
  analysis?: {
    summary: string;
    structuredData: {
      // Fields from assistant-config schema
      earliest_availability: string;
      disqualified: boolean;
      disqualification_reason?: string;
      criteria_details: Record<string, boolean>;
      // ... other fields
    };
    successEvaluation?: string;
  };
  provider: {
    name: string;
    phone: string;
    service: string;
    location: string;
  };
  request: {
    criteria: string;
    urgency: string;
  };
  cost?: number;
  error?: string;
}
```

### 4. VAPI Webhook Routes (`/apps/api/src/routes/vapi-webhook.ts`)

RESTful endpoints for webhook callbacks and result retrieval.

## API Endpoints

### POST `/api/v1/vapi/webhook`

**Purpose:** Receive webhook callbacks from VAPI when calls complete

**Request Body:**

```json
{
  "message": {
    "type": "end-of-call-report",
    "call": {
      "id": "call_abc123",
      "status": "ended",
      "endedReason": "customer-ended-call",
      "transcript": "AI: Hello...\nCustomer: Hi...",
      "summary": "Customer inquiry about pricing",
      "cost": 0.45,
      "startedAt": "2025-01-15T10:00:00Z",
      "endedAt": "2025-01-15T10:05:30Z",
      "analysis": {
        "summary": "Customer confirmed availability",
        "structuredData": {
          "availability": "available",
          "estimated_rate": "$100/hour",
          "recommended": true
        }
      },
      "metadata": {
        "providerName": "Joe's Plumbing",
        "providerPhone": "+15551234567",
        "serviceNeeded": "plumbing",
        "location": "Greenville, SC",
        "userCriteria": "Need same-day service"
      }
    }
  }
}
```

**Response (Success):**

```json
{
  "success": true,
  "message": "Webhook processed and cached successfully",
  "callId": "call_abc123"
}
```

**Configuration in VAPI:**

1. Go to VAPI dashboard → Webhooks
2. Add webhook URL: `https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook`
3. Select events: `end-of-call-report`
4. Save and test

### GET `/api/v1/vapi/calls/:callId`

**Purpose:** Retrieve cached call result (used by Kestra scripts for polling)

**Example Request:**

```bash
curl https://api-production-8fe4.up.railway.app/api/v1/vapi/calls/call_abc123
```

**Response (Success - Qualified Provider):**

```json
{
  "success": true,
  "data": {
    "status": "completed",
    "callId": "call_abc123",
    "callMethod": "direct_vapi",
    "duration": 5.5,
    "endedReason": "assistant-ended-call",
    "transcript": "AI: Hello...\nProvider: Hi...",
    "analysis": {
      "summary": "Provider confirmed availability for tomorrow at 2pm",
      "structuredData": {
        "availability": "available",
        "earliest_availability": "Tomorrow at 2pm",
        "estimated_rate": "$100/hour",
        "single_person_found": true,
        "technician_name": "John",
        "all_criteria_met": true,
        "criteria_details": {
          "licensed": true,
          "10_years_experience": true,
          "emergency_services": true
        },
        "disqualified": false,
        "disqualification_reason": null,
        "call_outcome": "positive",
        "recommended": true,
        "notes": "Very professional, can start tomorrow afternoon"
      },
      "successEvaluation": "successful"
    },
    "provider": {
      "name": "Joe's Plumbing",
      "phone": "+15551234567",
      "service": "plumbing",
      "location": "Greenville, SC"
    },
    "request": {
      "criteria": "Need licensed plumber with 10+ years experience",
      "urgency": "immediate"
    },
    "cost": 0.45
  }
}
```

**Response (Success - Disqualified Provider):**

```json
{
  "success": true,
  "data": {
    "status": "completed",
    "callId": "call_def456",
    "callMethod": "direct_vapi",
    "duration": 3.2,
    "endedReason": "assistant-ended-call",
    "transcript": "AI: Hello...\nProvider: We only have 5 years experience...",
    "analysis": {
      "summary": "Provider does not meet 10+ years experience requirement",
      "structuredData": {
        "availability": "available",
        "earliest_availability": "Today at 3pm",
        "estimated_rate": "$85/hour",
        "single_person_found": true,
        "technician_name": "Mike",
        "all_criteria_met": false,
        "criteria_details": {
          "licensed": true,
          "10_years_experience": false,
          "emergency_services": true
        },
        "disqualified": true,
        "disqualification_reason": "Cannot meet criterion: 10+ years experience (only has 5)",
        "call_outcome": "negative",
        "recommended": false,
        "notes": "Polite exit - did not mention callback/scheduling"
      },
      "successEvaluation": "call_ended_appropriately"
    },
    "provider": {
      "name": "Quick Fix Plumbing",
      "phone": "+15559876543",
      "service": "plumbing",
      "location": "Greenville, SC"
    },
    "request": {
      "criteria": "Need licensed plumber with 10+ years experience",
      "urgency": "immediate"
    },
    "cost": 0.28
  }
}
```

**Response (Not Found):**

```json
{
  "success": false,
  "error": "Call result not found",
  "message": "No cached result found for call ID: call_abc123. It may have expired or not been received yet."
}
```

### GET `/api/v1/vapi/cache/stats`

**Purpose:** Debug endpoint to view cache statistics

**Response:**

```json
{
  "success": true,
  "stats": {
    "size": 3,
    "entries": [
      {
        "callId": "call_abc123",
        "timestamp": 1737022800000,
        "expiresAt": 1737024600000
      }
    ]
  }
}
```

### DELETE `/api/v1/vapi/calls/:callId`

**Purpose:** Manually remove a call result from cache

**Response:**

```json
{
  "success": true,
  "message": "Call result call_abc123 deleted from cache"
}
```

## Integration with Kestra Scripts

### Before (Direct VAPI Polling)

```javascript
// scripts/call-provider.js
const callId = await initiateVapiCall();

// Poll VAPI directly
const result = await pollVapiForResult(callId);
```

### After (Backend Webhook Polling)

```javascript
// scripts/call-provider.js
const callId = await initiateVapiCall();

// Poll backend API instead
const result = await pollBackendForResult(callId);

async function pollBackendForResult(callId) {
  const maxAttempts = 60; // 5 minutes
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/v1/vapi/calls/${callId}`,
      );

      if (response.ok) {
        const data = await response.json();
        return data.data; // Return CallResult
      }

      if (response.status === 404) {
        // Not ready yet, continue polling
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      throw new Error(`Unexpected status: ${response.status}`);
    } catch (error) {
      console.error(`Poll attempt ${attempt + 1} failed:`, error);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error("Timeout: Call result not received within 5 minutes");
}
```

## Environment Variables

No new environment variables required. Uses existing Fastify configuration.

## Data Flow

1. **Call Initiation:**
   - Kestra script calls VAPI to initiate call
   - VAPI returns `callId` immediately

2. **Call Execution:**
   - VAPI executes the call (may take 1-10 minutes)
   - Call completes, VAPI generates analysis

3. **Webhook Callback:**
   - VAPI sends POST to `/api/v1/vapi/webhook`
   - Backend validates payload with Zod schemas
   - Transforms VAPI webhook format to `CallResult` format
   - Stores in in-memory cache with 30-minute TTL

4. **Result Retrieval:**
   - Kestra script polls GET `/api/v1/vapi/calls/:callId` every 5 seconds
   - Backend checks cache, returns result if available
   - Returns 404 if not ready yet
   - Script continues polling until success or timeout

## Error Handling

### Webhook Validation Errors

- Invalid payload structure → 400 with Zod error details
- Missing required fields → 400 with specific error

### Processing Failures

- Webhook always returns 200 to VAPI (prevents infinite retries)
- Logs error but acknowledges receipt
- Scripts will timeout naturally if webhook never arrives

### Cache Expiration

- Results expire after 30 minutes
- GET endpoint returns 404 for expired results
- Automatic cleanup prevents memory leaks

## Testing

### 1. Test Webhook Endpoint (Local Development)

Use ngrok to expose local server:

```bash
# Terminal 1: Start backend
cd apps/api
pnpm dev

# Terminal 2: Start ngrok
ngrok http 8000
```

Configure VAPI webhook to ngrok URL:

```
https://abc123.ngrok.io/api/v1/vapi/webhook
```

### 2. Test with curl

Simulate VAPI webhook:

```bash
curl -X POST http://localhost:8000/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test_call_123",
        "status": "ended",
        "endedReason": "customer-ended-call",
        "transcript": "Test transcript",
        "summary": "Test summary",
        "cost": 0.25,
        "metadata": {
          "providerName": "Test Provider",
          "providerPhone": "+15551234567"
        }
      }
    }
  }'
```

Retrieve result:

```bash
curl http://localhost:8000/api/v1/vapi/calls/test_call_123
```

### 3. Test Cache Expiration

```bash
# Check stats
curl http://localhost:8000/api/v1/vapi/cache/stats

# Wait 30+ minutes or manually delete
curl -X DELETE http://localhost:8000/api/v1/vapi/calls/test_call_123

# Verify gone
curl http://localhost:8000/api/v1/vapi/calls/test_call_123
# Should return 404
```

## Production Deployment

### Railway (Current)

Webhook URL: `https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook`

1. Deploy updated backend to Railway
2. Configure VAPI webhook URL in dashboard
3. Update Kestra scripts to poll new endpoint
4. Test end-to-end flow

### Scaling Considerations

**Current Implementation (In-Memory Cache):**

- ✅ Simple, no external dependencies
- ✅ Fast, low latency
- ❌ Lost on server restart
- ❌ Doesn't work with multiple instances (no shared state)

**Future: Redis Cache (if needed):**
If scaling to multiple backend instances, replace `WebhookCacheService` with Redis:

```typescript
// webhook-cache.service.ts with Redis
import Redis from "ioredis";

export class WebhookCacheService {
  private redis: Redis;

  constructor(private logger: Logger) {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async set(callId: string, result: CallResult, ttl = 1800) {
    await this.redis.setex(`vapi:call:${callId}`, ttl, JSON.stringify(result));
  }

  async get(callId: string): Promise<CallResult | null> {
    const data = await this.redis.get(`vapi:call:${callId}`);
    return data ? JSON.parse(data) : null;
  }
}
```

## Monitoring & Observability

### Logs

All operations are logged with structured data:

```typescript
// Webhook received
{
  type: 'end-of-call-report',
  callId: 'call_abc123',
  timestamp: '2025-01-15T10:05:30Z'
}

// Result cached
{
  callId: 'call_abc123',
  status: 'completed',
  duration: 5.5,
  cost: 0.45
}

// Result retrieved
{
  callId: 'call_abc123'
}
```

### Metrics to Monitor

- Webhook success rate
- Cache hit/miss rate
- Average TTL before retrieval
- Cache size growth
- Failed webhook validations

## Troubleshooting

### Webhook Not Received

1. Check VAPI dashboard → Webhook Logs
2. Verify webhook URL is correct
3. Check backend logs for incoming requests
4. Test with curl to ensure endpoint works

### 404 on Poll

- Call may still be in progress (keep polling)
- Webhook may have failed (check VAPI logs)
- Result may have expired (check cache stats)

### Cache Growing Too Large

- Check cleanup interval is running
- Verify TTL is reasonable
- Consider shorter TTL or Redis for persistence

## DRY Architecture

### Single Source of Truth

All VAPI assistant behavior is defined once in `assistant-config.ts` and used everywhere:

```
┌────────────────────────────────────────┐
│  assistant-config.ts (TypeScript)      │
│  - System prompt                       │
│  - Disqualification logic              │
│  - Conditional closing scripts         │
│  - Structured data schema              │
│  - Analysis configuration              │
└──────────────┬─────────────────────────┘
               │
               ├─ TypeScript compile ─→ dist/services/vapi/assistant-config.js
               │
               ├─→ Kestra Scripts
               │   - call-provider.js (imports from dist/)
               │   - call-provider-webhook.js
               │
               ├─→ Direct VAPI Client
               │   - direct-vapi.client.ts
               │
               └─→ Provider Calling Service
                   - provider-calling.service.ts
```

**Benefits:**

1. **Consistency**: Same behavior across all call paths
2. **Maintainability**: Update once, applies everywhere
3. **Type Safety**: TypeScript ensures correct usage
4. **Version Control**: Single place to track changes
5. **Testing**: Test one configuration, validates all paths

### Shared Types

`types.ts` defines interfaces used across the system:

```typescript
// Request format (input)
CallRequest → createAssistantConfig() → VAPI Assistant Config

// Response format (output)
VAPI Webhook → transformToCallResult() → CallResult
```

All components work with the same data structures, eliminating transformation errors.

## File Locations

```
apps/api/src/
├── routes/
│   └── vapi-webhook.ts          # Webhook + polling endpoints
├── services/vapi/
│   ├── assistant-config.ts      # SOURCE OF TRUTH
│   ├── webhook-cache.service.ts # In-memory cache
│   ├── types.ts                 # CallRequest, CallResult
│   ├── direct-vapi.client.ts    # Direct VAPI API client
│   ├── kestra.client.ts         # Kestra integration
│   ├── provider-calling.service.ts # Main orchestrator
│   └── index.ts                 # Exports
└── index.ts                     # Route registration

kestra/scripts/
├── call-provider.js             # Imports from compiled TS
└── call-provider-webhook.js     # Backend polling
```

## Architectural Improvements Summary

### 1. AI-Powered Disqualification

- **Before**: All providers got callback script, manual filtering needed
- **After**: AI detects disqualification during call, exits politely without callback mention
- **Impact**: Saves time, sets proper expectations, cleaner transcripts

### 2. Enhanced Structured Data

- **New Fields**:
  - `earliest_availability`: Specific date/time (not just "available")
  - `disqualified`: Clear boolean flag
  - `disqualification_reason`: Actionable explanation
  - `criteria_details`: Per-criterion breakdown for debugging
- **Impact**: Better analytics, easier filtering, clearer decision-making

### 3. DRY Architecture

- **Before**: Duplicate configs in Kestra JS and TypeScript
- **After**: Single source in `assistant-config.ts`, compiled to JS, imported by Kestra
- **Impact**: One place to maintain, no drift, type-safe changes

### 4. In-Memory Cache

- **Before**: Poll VAPI API 60+ times per call
- **After**: Poll backend cache (< 10ms lookups)
- **Impact**: Faster, cheaper, no rate limits, better monitoring

### 5. Conditional Closing

- **Before**: Same closing script for all providers
- **After**: Different scripts based on qualification status
- **Impact**: Professional communication, accurate expectations

## Next Steps

1. ✅ Implement webhook endpoint
2. ✅ Implement cache service
3. ✅ Register routes in Fastify
4. ✅ Create assistant configuration (single source of truth)
5. ✅ Define shared types
6. ⏳ Update Kestra script to poll backend
7. ⏳ Configure VAPI webhook URL
8. ⏳ Test end-to-end flow
9. ⏳ Monitor in production

## References

- VAPI Webhook Documentation: https://docs.vapi.ai/webhooks
- Fastify Documentation: https://fastify.dev/
- Zod Validation: https://zod.dev/
