# VAPI Webhook API Design Document

## Overview

This document outlines the design for receiving VAPI.ai webhooks in the AI Concierge backend API, replacing the current polling mechanism in `call-provider.js`.

## Current State Analysis

### Current Implementation

- **File**: `/Users/dave/Work/concierge-ai/kestra/scripts/call-provider.js`
- **Problem**: Script polls VAPI API every 5 seconds (max 60 attempts = 5 minutes)
- **Issues**:
  - Inefficient resource usage
  - Delayed results (5-second intervals)
  - Timeout limitations
  - Requires long-running script execution

### Existing Architecture

- **Backend**: Fastify 5 on port 8000
- **Database**: Supabase (PostgreSQL) with existing tables
- **Patterns**:
  - Routes in `/apps/api/src/routes/*.ts`
  - Services in `/apps/api/src/services/*.ts`
  - Zod validation for request schemas
  - Supabase plugin for database access
  - OpenAPI/Swagger documentation

## Proposed Solution

### Architecture: Webhook + In-Memory Cache

**Flow:**

1. VAPI initiates call via existing `call-provider.js` script
2. VAPI sends webhook to our API endpoint when call completes
3. API validates webhook, stores results in in-memory cache (30-min TTL)
4. Kestra workflow polls backend API for results (fast cache lookup)

**Why this approach:**

- ✅ Real-time results (no polling delay)
- ✅ Extremely fast cache lookups (< 10ms)
- ✅ Kestra keeps existing polling pattern (minimal changes)
- ✅ No external dependencies (no database or Redis required initially)
- ✅ Supports async workflows
- ✅ AI-powered disqualification detection
- ✅ Conditional closing scripts (qualified vs disqualified)
- ✅ DRY principle: Single source of truth for assistant configuration

**Future Enhancement:**

- Redis for multi-instance scaling and persistence

---

## Assistant Configuration Architecture

### Single Source of Truth: `assistant-config.ts`

All VAPI assistant behavior is defined in `/apps/api/src/services/vapi/assistant-config.ts`:

```typescript
export function createAssistantConfig(request: CallRequest) {
  // Returns VAPI assistant configuration
  // Used by BOTH Kestra scripts and Direct VAPI paths
}
```

**Key Features:**

- **System Prompt**: Includes disqualification detection logic
- **Conversation Flow**: Structured question order with validation
- **Conditional Closing**: Different scripts for qualified vs disqualified providers
- **Analysis Schema**: Defines structured data output including disqualification fields

### Disqualification Logic

The assistant actively monitors for disqualification during calls:

**Detection Triggers:**

- Provider says they don't have anyone available
- Provider can't meet a specific criterion
- Provider doesn't do the required type of work
- Rate is significantly higher than reasonable

**Response Behaviors:**

**If Disqualified:**

```
"Thank you so much for taking the time to chat. Unfortunately, it sounds
like this particular request might not be the best fit right now, but I
really appreciate your help. Have a wonderful day!"
→ endCall()
```

**If Qualified (all criteria met):**

```
"Perfect, thank you so much for all that information! Once I confirm with
my client, if they decide to proceed, I'll call you back to schedule.
Does that sound good?"
→ Wait for acknowledgment → endCall()
```

### Structured Data Output

```typescript
interface StructuredData {
  availability: "available" | "unavailable" | "callback_requested" | "unclear";
  earliest_availability: string; // NEW: "Tomorrow at 2pm", "Friday morning"
  estimated_rate: string;
  single_person_found: boolean;
  technician_name?: string;
  all_criteria_met: boolean;
  criteria_details: Record<string, boolean>; // NEW: Per-criterion breakdown
  disqualified: boolean; // NEW: Disqualification flag
  disqualification_reason?: string; // NEW: Why they were disqualified
  call_outcome: "positive" | "negative" | "neutral" | "no_answer" | "voicemail";
  recommended: boolean;
  notes?: string;
}
```

### DRY Implementation

**Before (Duplicated Config):**

```
Kestra script: assistant-config.js
Direct VAPI: assistant-config.ts
→ Two places to maintain
→ Risk of inconsistency
```

**After (Single Source):**

```
apps/api/src/services/vapi/assistant-config.ts
    ↓ (compile)
dist/services/vapi/assistant-config.js
    ↓ (import)
kestra/scripts/call-provider.js
kestra/scripts/call-provider-webhook.js
    ↓ (use)
createAssistantConfig(request)
```

**Benefits:**

- One place to update call behavior
- Version-controlled configuration
- TypeScript type safety
- Consistent structured data schema

---

## Database Design

### New Table: `vapi_call_results`

```sql
-- Migration: 20250108000000_add_vapi_call_results.sql

CREATE TYPE vapi_call_status AS ENUM (
  'queued',
  'ringing',
  'in-progress',
  'forwarding',
  'ended'
);

CREATE TYPE vapi_call_end_reason AS ENUM (
  'assistant-error',
  'assistant-not-found',
  'db-error',
  'no-answer',
  'voicemail',
  'assistant-ended-call',
  'assistant-forwarded-call',
  'phone-call-provider-closed-websocket',
  'unknown'
);

CREATE TABLE vapi_call_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- VAPI identifiers
  call_id TEXT NOT NULL UNIQUE,
  assistant_id TEXT,
  phone_number_id TEXT,

  -- Call metadata
  customer_phone TEXT NOT NULL,
  status vapi_call_status NOT NULL,
  ended_reason vapi_call_end_reason,

  -- Timing
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes DECIMAL(10,2),

  -- Call content
  transcript JSONB,
  messages JSONB,
  recording_url TEXT,

  -- Analysis results (from VAPI's AI analysis)
  analysis_summary TEXT,
  analysis_structured_data JSONB,
  analysis_success_evaluation TEXT,

  -- Provider context (from our system)
  provider_name TEXT,
  provider_phone TEXT,
  service_type TEXT,
  location TEXT,
  user_criteria TEXT,
  urgency TEXT,

  -- Request tracking (optional: link to service_requests table)
  service_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,

  -- Raw webhook data (for debugging)
  raw_webhook_payload JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX idx_vapi_call_results_call_id ON vapi_call_results(call_id);
CREATE INDEX idx_vapi_call_results_status ON vapi_call_results(status);
CREATE INDEX idx_vapi_call_results_customer_phone ON vapi_call_results(customer_phone);
CREATE INDEX idx_vapi_call_results_service_request_id ON vapi_call_results(service_request_id);
CREATE INDEX idx_vapi_call_results_created_at ON vapi_call_results(created_at DESC);
CREATE INDEX idx_vapi_call_results_ended_at ON vapi_call_results(ended_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_vapi_call_results_updated_at
  BEFORE UPDATE ON vapi_call_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (optional - disable for service role access)
ALTER TABLE vapi_call_results ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role has full access to vapi_call_results"
  ON vapi_call_results
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy: Users can view their own call results (if linked to service_requests)
CREATE POLICY "Users can view their own call results"
  ON vapi_call_results FOR SELECT
  USING (
    service_request_id IS NULL OR
    EXISTS (
      SELECT 1 FROM service_requests
      WHERE service_requests.id = vapi_call_results.service_request_id
      AND (service_requests.user_id = auth.uid() OR service_requests.user_id IS NULL)
    )
  );
```

---

## API Endpoint Design

### File Structure

```
apps/api/src/
├── routes/
│   ├── vapi-webhook.ts           # ACTIVE: Webhook routes + cache endpoints
│   └── vapi.ts                   # FUTURE: Database operations
├── services/vapi/
│   ├── types.ts                  # Shared types (CallRequest, CallResult)
│   ├── assistant-config.ts       # SOURCE OF TRUTH for VAPI config
│   ├── webhook-cache.service.ts  # In-memory cache (30-min TTL)
│   ├── direct-vapi.client.ts     # Direct VAPI API client
│   ├── kestra.client.ts          # Kestra workflow integration
│   ├── provider-calling.service.ts # Main orchestrator
│   └── index.ts                  # Service exports
└── lib/
    └── vapi-signature.ts         # FUTURE: Webhook signature validation

kestra/scripts/
├── call-provider.js              # Imports from compiled TS
└── call-provider-webhook.js      # Backend polling logic
```

---

### 1. Route: `/apps/api/src/routes/vapi.ts`

```typescript
import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  storeCallResult,
  getCallResult,
  getCallResultsByPhone,
  type VapiWebhookPayload,
} from "../services/vapi.js";
import { verifyVapiSignature } from "../lib/vapi-signature.js";

// Zod schema for VAPI webhook payload
const VapiWebhookSchema = z.object({
  message: z.object({
    type: z.enum([
      "status-update",
      "end-of-call-report",
      "transcript",
      "hang",
      "function-call",
      "speech-update",
      "conversation-update",
    ]),
    call: z.object({
      id: z.string(),
      assistantId: z.string().optional(),
      phoneNumberId: z.string().optional(),
      customer: z
        .object({
          number: z.string(),
          name: z.string().optional(),
        })
        .optional(),
      status: z.enum([
        "queued",
        "ringing",
        "in-progress",
        "forwarding",
        "ended",
      ]),
      endedReason: z.string().optional(),
      startedAt: z.string().optional(),
      endedAt: z.string().optional(),
      transcript: z.string().optional(),
      messages: z.array(z.any()).optional(),
      recordingUrl: z.string().optional(),
      analysis: z
        .object({
          summary: z.string().optional(),
          structuredData: z.record(z.any()).optional(),
          successEvaluation: z.string().optional(),
        })
        .optional(),
      artifact: z
        .object({
          transcript: z.string().optional(),
          recordingUrl: z.string().optional(),
        })
        .optional(),
    }),
    // Additional metadata fields
    timestamp: z.string().optional(),
    phoneNumber: z
      .object({
        number: z.string(),
      })
      .optional(),
  }),
});

const GetCallResultSchema = z.object({
  callId: z.string().min(1, "Call ID is required"),
});

const GetCallsByPhoneSchema = z.object({
  phone: z.string().min(1, "Phone number is required"),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
});

export default async function vapiRoutes(fastify: FastifyInstance) {
  /**
   * POST /webhooks/vapi
   * Receive VAPI webhook notifications
   *
   * VAPI sends webhooks for various events:
   * - status-update: Call status changes (queued, ringing, in-progress, ended)
   * - end-of-call-report: Final call results with transcript and analysis
   * - transcript: Real-time transcript updates
   * - etc.
   *
   * We primarily care about 'end-of-call-report' and 'status-update' when status='ended'
   */
  fastify.post(
    "/webhooks/vapi",
    {
      schema: {
        description: "Receive VAPI webhook notifications for call events",
        tags: ["vapi"],
        body: {
          type: "object",
          properties: {
            message: {
              type: "object",
              properties: {
                type: { type: "string" },
                call: { type: "object" },
                timestamp: { type: "string" },
              },
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              callId: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
          401: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // Step 1: Verify webhook signature (if VAPI provides one)
        const signature = request.headers["x-vapi-signature"] as
          | string
          | undefined;
        const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;

        if (webhookSecret && signature) {
          const isValid = verifyVapiSignature(
            JSON.stringify(request.body),
            signature,
            webhookSecret,
          );

          if (!isValid) {
            fastify.log.warn({ signature }, "Invalid VAPI webhook signature");
            return reply.status(401).send({
              success: false,
              error: "Invalid webhook signature",
            });
          }
        }

        // Step 2: Validate webhook payload
        const validation = VapiWebhookSchema.safeParse(request.body);

        if (!validation.success) {
          fastify.log.warn(
            { errors: validation.error.errors },
            "Invalid VAPI webhook payload",
          );
          return reply.status(400).send({
            success: false,
            error: "Invalid webhook payload",
            details: validation.error.errors,
          });
        }

        const webhookData = validation.data;
        const { message } = webhookData;
        const { type: eventType, call } = message;

        fastify.log.info(
          {
            callId: call.id,
            eventType,
            status: call.status,
          },
          "Received VAPI webhook",
        );

        // Step 3: Store call result (upsert based on call_id)
        // We store all events, but the most important is when status='ended'
        const result = await storeCallResult(request.supabase, {
          callId: call.id,
          assistantId: call.assistantId,
          phoneNumberId: call.phoneNumberId,
          customerPhone: call.customer?.number || "",
          status: call.status,
          endedReason: call.endedReason,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
          transcript: call.transcript || call.artifact?.transcript,
          messages: call.messages,
          recordingUrl: call.recordingUrl || call.artifact?.recordingUrl,
          analysisSummary: call.analysis?.summary,
          analysisStructuredData: call.analysis?.structuredData,
          analysisSuccessEvaluation: call.analysis?.successEvaluation,
          rawWebhookPayload: request.body,
          eventType,
        });

        return reply.send({
          success: true,
          message: `Webhook processed: ${eventType}`,
          callId: call.id,
        });
      } catch (error: any) {
        fastify.log.error({ error }, "Error processing VAPI webhook");

        // Return 200 to prevent VAPI from retrying (we logged the error)
        // Alternatively, return 500 if you want VAPI to retry
        return reply.status(200).send({
          success: false,
          error: "Internal error (logged)",
          message: error.message,
        });
      }
    },
  );

  /**
   * GET /calls/:callId
   * Retrieve call result by VAPI call ID
   * Used by Kestra workflows to poll for results
   */
  fastify.get(
    "/calls/:callId",
    {
      schema: {
        description: "Get call result by VAPI call ID",
        tags: ["vapi"],
        params: {
          type: "object",
          properties: {
            callId: { type: "string" },
          },
          required: ["callId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object" },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const params = GetCallResultSchema.parse(request.params);
        const result = await getCallResult(request.supabase, params.callId);

        if (!result) {
          return reply.status(404).send({
            success: false,
            error: "Call result not found",
          });
        }

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            details: error.errors,
          });
        }

        fastify.log.error({ error }, "Error retrieving call result");
        return reply.status(500).send({
          success: false,
          error: "Internal server error",
        });
      }
    },
  );

  /**
   * GET /calls/by-phone/:phone
   * Retrieve call results by phone number
   * Useful for debugging or viewing call history
   */
  fastify.get(
    "/calls/by-phone/:phone",
    {
      schema: {
        description: "Get call results by phone number",
        tags: ["vapi"],
        params: {
          type: "object",
          properties: {
            phone: { type: "string" },
          },
          required: ["phone"],
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "number", default: 10 },
            offset: { type: "number", default: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "array" },
              count: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { phone } = request.params as { phone: string };
        const { limit = 10, offset = 0 } = request.query as {
          limit?: number;
          offset?: number;
        };

        const { results, count } = await getCallResultsByPhone(
          request.supabase,
          phone,
          limit,
          offset,
        );

        return reply.send({
          success: true,
          data: results,
          count,
          pagination: {
            limit,
            offset,
            hasMore: offset + limit < count,
          },
        });
      } catch (error: any) {
        fastify.log.error({ error }, "Error retrieving calls by phone");
        return reply.status(500).send({
          success: false,
          error: "Internal server error",
        });
      }
    },
  );
}
```

---

### 2. Service: `/apps/api/src/services/vapi.ts`

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

export interface VapiWebhookPayload {
  callId: string;
  assistantId?: string;
  phoneNumberId?: string;
  customerPhone: string;
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  transcript?: string;
  messages?: any[];
  recordingUrl?: string;
  analysisSummary?: string;
  analysisStructuredData?: Record<string, any>;
  analysisSuccessEvaluation?: string;
  rawWebhookPayload: any;
  eventType: string;

  // Optional: Provider context (if included in webhook)
  providerName?: string;
  providerPhone?: string;
  serviceType?: string;
  location?: string;
  userCriteria?: string;
  urgency?: string;
  serviceRequestId?: string;
}

export interface VapiCallResult {
  id: string;
  call_id: string;
  assistant_id?: string;
  phone_number_id?: string;
  customer_phone: string;
  status: string;
  ended_reason?: string;
  started_at?: string;
  ended_at?: string;
  duration_minutes?: number;
  transcript?: any;
  messages?: any;
  recording_url?: string;
  analysis_summary?: string;
  analysis_structured_data?: any;
  analysis_success_evaluation?: string;
  provider_name?: string;
  provider_phone?: string;
  service_type?: string;
  location?: string;
  user_criteria?: string;
  urgency?: string;
  service_request_id?: string;
  raw_webhook_payload: any;
  created_at: string;
  updated_at: string;
}

/**
 * Store or update call result from VAPI webhook
 * Uses upsert to handle multiple webhook events for the same call
 */
export async function storeCallResult(
  supabase: SupabaseClient,
  payload: VapiWebhookPayload,
): Promise<VapiCallResult> {
  const data = {
    call_id: payload.callId,
    assistant_id: payload.assistantId,
    phone_number_id: payload.phoneNumberId,
    customer_phone: payload.customerPhone,
    status: payload.status,
    ended_reason: payload.endedReason,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    transcript: payload.transcript ? { text: payload.transcript } : null,
    messages: payload.messages,
    recording_url: payload.recordingUrl,
    analysis_summary: payload.analysisSummary,
    analysis_structured_data: payload.analysisStructuredData,
    analysis_success_evaluation: payload.analysisSuccessEvaluation,
    provider_name: payload.providerName,
    provider_phone: payload.providerPhone,
    service_type: payload.serviceType,
    location: payload.location,
    user_criteria: payload.userCriteria,
    urgency: payload.urgency,
    service_request_id: payload.serviceRequestId,
    raw_webhook_payload: payload.rawWebhookPayload,
  };

  const { data: result, error } = await supabase
    .from("vapi_call_results")
    .upsert(data, {
      onConflict: "call_id",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store VAPI call result: ${error.message}`);
  }

  return result as VapiCallResult;
}

/**
 * Retrieve call result by VAPI call ID
 */
export async function getCallResult(
  supabase: SupabaseClient,
  callId: string,
): Promise<VapiCallResult | null> {
  const { data, error } = await supabase
    .from("vapi_call_results")
    .select("*")
    .eq("call_id", callId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw new Error(`Failed to retrieve call result: ${error.message}`);
  }

  return data as VapiCallResult;
}

/**
 * Retrieve call results by phone number
 */
export async function getCallResultsByPhone(
  supabase: SupabaseClient,
  phone: string,
  limit: number = 10,
  offset: number = 0,
): Promise<{ results: VapiCallResult[]; count: number }> {
  const { data, error, count } = await supabase
    .from("vapi_call_results")
    .select("*", { count: "exact" })
    .eq("customer_phone", phone)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to retrieve calls by phone: ${error.message}`);
  }

  return {
    results: data as VapiCallResult[],
    count: count || 0,
  };
}

/**
 * Wait for call to reach 'ended' status
 * Used by polling logic (lightweight database query)
 */
export async function waitForCallCompletion(
  supabase: SupabaseClient,
  callId: string,
  maxAttempts: number = 60,
  intervalMs: number = 5000,
): Promise<VapiCallResult | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getCallResult(supabase, callId);

    if (result && result.status === "ended") {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null; // Timeout
}
```

---

### 3. Signature Verification: `/apps/api/src/lib/vapi-signature.ts`

```typescript
import crypto from "crypto";

/**
 * Verify VAPI webhook signature
 *
 * VAPI may send a signature header (e.g., x-vapi-signature) to verify
 * that the webhook originated from their servers.
 *
 * This is a placeholder implementation. Check VAPI's documentation for
 * their exact signature format (HMAC-SHA256, etc.)
 */
export function verifyVapiSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  try {
    // Common webhook signature format: HMAC-SHA256
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  } catch (error) {
    return false;
  }
}
```

---

### 4. Update Main Index: `/apps/api/src/index.ts`

Add VAPI routes registration:

```typescript
// Add to imports
import vapiRoutes from './routes/vapi.js';

// Add after existing route registrations (around line 125)
await server.register(vapiRoutes, { prefix: '/api/v1/vapi' });

// Update the API info endpoint to include VAPI
// Around line 106-115, update endpoints object:
endpoints: {
  health: '/health',
  users: '/api/v1/users',
  gemini: '/api/v1/gemini',
  workflows: '/api/v1/workflows',
  vapi: '/api/v1/vapi',  // Add this line
  docs: '/docs',
}
```

---

## Environment Variables

Add to `/apps/api/.env`:

```env
# VAPI Configuration
VAPI_WEBHOOK_SECRET=your_vapi_webhook_secret_here
```

The webhook secret is used to verify that webhooks are actually from VAPI. Get this from VAPI dashboard.

---

## Kestra Workflow Integration

### Option 1: Modify `call-provider.js` to Return Immediately

Instead of polling VAPI's API, return the call ID and let Kestra poll the database:

```javascript
// In call-provider.js, replace polling logic with:

const call = await vapi.calls.create({
  phoneNumberId: VAPI_PHONE_NUMBER_ID,
  customer: {
    number: PHONE_NUMBER,
    name: "Service Provider",
  },
  assistant: assistantConfig,
});

// Return immediately with call ID
const result = {
  status: "initiated",
  callId: call.id,
  message: "Call started. Results will be available via webhook.",
  provider: {
    name: PROVIDER_NAME,
    phone: PHONE_NUMBER,
    service: SERVICE_TYPE,
    location: LOCATION,
  },
};

console.log(JSON.stringify(result));
```

### Option 2: Create New Kestra Task to Poll Database

Add to `contact_agent.yaml`:

```yaml
- id: wait_for_call_completion
  type: io.kestra.plugin.scripts.shell.Commands
  commands:
    - |
      CALL_ID="{{ outputs.call_provider_script.vars.callId }}"
      MAX_ATTEMPTS=60

      for i in $(seq 1 $MAX_ATTEMPTS); do
        RESULT=$(curl -s http://api:8000/api/v1/vapi/calls/$CALL_ID)
        STATUS=$(echo $RESULT | jq -r '.data.status // empty')

        if [ "$STATUS" = "ended" ]; then
          echo $RESULT
          exit 0
        fi

        echo "Attempt $i/$MAX_ATTEMPTS: Status=$STATUS"
        sleep 5
      done

      echo "Timeout waiting for call completion"
      exit 1
```

### Option 3: Use Supabase Realtime (Advanced)

Enable realtime subscriptions in Kestra to listen for database changes (requires custom plugin).

---

## API Endpoints Summary

| Method | Path                                 | Description                  | Status         |
| ------ | ------------------------------------ | ---------------------------- | -------------- |
| POST   | `/api/v1/vapi/webhook`               | Receive VAPI webhooks        | ✅ ACTIVE      |
| GET    | `/api/v1/vapi/calls/:callId`         | Get cached call result by ID | ✅ ACTIVE      |
| GET    | `/api/v1/vapi/cache/stats`           | Get cache statistics (debug) | ✅ ACTIVE      |
| DELETE | `/api/v1/vapi/calls/:callId`         | Remove cached result         | ✅ ACTIVE      |
| GET    | `/api/v1/vapi/calls/by-phone/:phone` | Get call history by phone    | 🔮 FUTURE (DB) |

**Current Implementation:**

- Webhooks stored in in-memory cache (30-min TTL)
- Fast polling via cache lookups (< 10ms)
- Automatic cleanup every 5 minutes

**Future Enhancement:**

- Database storage for persistence and audit trail
- Multi-instance support via Redis

---

## Testing

### 1. Test Webhook Endpoint

```bash
# Test with mock VAPI webhook payload
curl -X POST http://localhost:8000/api/v1/vapi/webhooks/vapi \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test-call-123",
        "status": "ended",
        "endedReason": "assistant-ended-call",
        "customer": {
          "number": "+18641234567"
        },
        "startedAt": "2025-01-08T12:00:00Z",
        "endedAt": "2025-01-08T12:05:00Z",
        "transcript": "Test transcript",
        "analysis": {
          "summary": "Test summary",
          "structuredData": {
            "availability": "available",
            "estimated_rate": "$100/hour"
          }
        }
      }
    }
  }'
```

### 2. Test Get Call Result

```bash
curl http://localhost:8000/api/v1/vapi/calls/test-call-123
```

### 3. Configure VAPI Webhook URL

In VAPI dashboard, set webhook URL to:

```
https://your-domain.com/api/v1/vapi/webhooks/vapi
```

For local testing, use ngrok:

```bash
ngrok http 8000
# Use: https://abc123.ngrok.io/api/v1/vapi/webhooks/vapi
```

---

## Migration Path

### Phase 1: Add Infrastructure (Week 1)

1. Create database migration
2. Run migration: `supabase db push`
3. Create route, service, and signature files
4. Register routes in index.ts
5. Test webhook endpoint locally

### Phase 2: Configure VAPI (Week 1)

1. Get webhook secret from VAPI
2. Add to environment variables
3. Configure webhook URL in VAPI dashboard
4. Test with real VAPI call

### Phase 3: Update Kestra (Week 2)

1. Modify `call-provider.js` to return immediately
2. Add database polling task to workflow
3. Test end-to-end flow
4. Monitor and optimize

### Phase 4: Cleanup (Week 2)

1. Remove polling logic from `call-provider.js`
2. Add monitoring/alerting for failed webhooks
3. Document for team

---

## Security Considerations

1. **Webhook Signature Validation**: Always verify VAPI signature to prevent spoofed webhooks
2. **Rate Limiting**: Consider adding rate limiting to webhook endpoint
3. **Database RLS**: Ensure proper row-level security policies
4. **Secrets Management**: Store `VAPI_WEBHOOK_SECRET` securely (use Railway/Vercel env vars)
5. **Error Handling**: Return 200 to VAPI even on internal errors to prevent retries

---

## Monitoring & Observability

1. **Logging**: All webhook events are logged via Fastify logger
2. **Database Audit**: Raw webhook payload stored for debugging
3. **Metrics to Track**:
   - Webhook delivery success rate
   - Average call duration
   - Call completion rate
   - Failed call reasons

---

## Alternative Considerations

### Alternative 1: Direct Database Write from Kestra

- Kestra could write directly to Supabase after call
- Pro: No webhook dependency
- Con: Requires Kestra Supabase plugin, less real-time

### Alternative 2: Queue-Based (Overkill for MVP)

- Use Redis/Bull for job queue
- Pro: Highly scalable
- Con: Added complexity

### Alternative 3: Kestra Webhook Receiver

- Kestra has built-in webhook triggers
- Pro: Native Kestra feature
- Con: Requires public Kestra endpoint, security concerns

**Recommendation**: Proceed with webhook + database storage approach (most balanced).

---

## Summary

This design provides:

- ✅ Real-time call results via webhooks
- ✅ Persistent storage in Supabase
- ✅ RESTful API for Kestra to poll results
- ✅ Follows existing project patterns
- ✅ Secure signature verification
- ✅ Comprehensive error handling
- ✅ Backwards compatible with minimal Kestra changes

Next steps:

1. Review and approve design
2. Create database migration
3. Implement route + service files
4. Test locally with ngrok
5. Deploy and configure VAPI webhook URL
