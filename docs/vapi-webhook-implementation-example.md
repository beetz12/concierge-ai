# VAPI Webhook Implementation Example

This document provides a production-ready webhook implementation for receiving VAPI call completion events.

## Overview

Instead of polling for call results, VAPI can push results to your server via webhooks when calls complete. This is more efficient, scalable, and provides instant results.

---

## 1. Fastify Webhook Endpoint

Add this to your Fastify API (`apps/api/src/routes/vapi-webhooks.ts`):

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Zod schema for VAPI webhook payload
const VapiWebhookEventSchema = z.object({
    type: z.enum([
        'end-of-call-report',
        'status-update',
        'transcript',
        'function-call',
        'hang',
        'speech-update',
    ]),
    call: z.object({
        id: z.string(),
        status: z.enum([
            'queued',
            'ringing',
            'in-progress',
            'forwarding',
            'ended',
        ]),
        endedReason: z.string().optional(),
        artifact: z.object({
            transcript: z.string().optional(),
            video: z.string().optional(),
            stereoRecordings: z.array(z.string()).optional(),
            performanceMetrics: z.object({
                turnLatencies: z.array(z.number()).optional(),
                interruptionCount: z.number().optional(),
                averageLatency: z.number().optional(),
            }).optional(),
        }).optional(),
        analysis: z.object({
            summary: z.string().optional(),
            structuredData: z.any().optional(),
            successEvaluation: z.union([z.string(), z.number()]).optional(),
        }).optional(),
        messages: z.array(z.any()).optional(),
        costBreakdown: z.object({
            transport: z.number().optional(),
            stt: z.number().optional(),
            llm: z.number().optional(),
            tts: z.number().optional(),
            vapi: z.number().optional(),
            total: z.number().optional(),
        }).optional(),
        durationMinutes: z.number().optional(),
    }),
    timestamp: z.string().optional(),
});

type VapiWebhookEvent = z.infer<typeof VapiWebhookEventSchema>;

export default async function vapiWebhookRoutes(fastify: FastifyInstance) {
    // Webhook endpoint for VAPI events
    fastify.post('/webhooks/vapi', async (request, reply) => {
        try {
            // Parse and validate webhook payload
            const event = VapiWebhookEventSchema.parse(request.body);

            fastify.log.info({
                type: event.type,
                callId: event.call.id,
                status: event.call.status,
            }, 'Received VAPI webhook event');

            // Handle end-of-call-report
            if (event.type === 'end-of-call-report') {
                await handleEndOfCallReport(event, fastify);
            }

            // Handle other event types as needed
            // if (event.type === 'status-update') { ... }
            // if (event.type === 'function-call') { ... }

            // Acknowledge webhook
            reply.status(200).send({ received: true });

        } catch (error) {
            fastify.log.error(error, 'Error processing VAPI webhook');
            reply.status(500).send({ error: 'Failed to process webhook' });
        }
    });
}

/**
 * Handle end-of-call-report webhook
 */
async function handleEndOfCallReport(
    event: VapiWebhookEvent,
    fastify: FastifyInstance
) {
    const { call } = event;

    // Extract call results
    const result = {
        callId: call.id,
        status: call.status,
        endedReason: call.endedReason,

        // Transcript
        transcript: call.artifact?.transcript || '',

        // Analysis (structured data)
        summary: call.analysis?.summary || '',
        structuredData: call.analysis?.structuredData || {},
        successEvaluation: call.analysis?.successEvaluation || 'unknown',

        // Metadata
        cost: call.costBreakdown?.total || 0,
        duration: call.durationMinutes || 0,
        timestamp: event.timestamp || new Date().toISOString(),
    };

    fastify.log.info({
        callId: result.callId,
        success: result.successEvaluation,
        duration: result.duration,
        cost: result.cost,
    }, 'Processing call completion');

    // Store in database
    await storeCallResult(result, fastify);

    // Trigger next workflow step (e.g., select best provider)
    await triggerNextWorkflowStep(result, fastify);
}

/**
 * Store call result in Supabase
 */
async function storeCallResult(result: any, fastify: FastifyInstance) {
    const { data, error } = await fastify.supabase
        .from('interaction_logs')
        .insert({
            interaction_type: 'phone_call',
            payload: {
                callId: result.callId,
                transcript: result.transcript,
                summary: result.summary,
                structuredData: result.structuredData,
                cost: result.cost,
                duration: result.duration,
            },
            result: result.structuredData,
            timestamp: result.timestamp,
        });

    if (error) {
        fastify.log.error(error, 'Failed to store call result in database');
        throw error;
    }

    fastify.log.info({ callId: result.callId }, 'Call result stored in database');
}

/**
 * Trigger next workflow step (e.g., select best provider)
 */
async function triggerNextWorkflowStep(result: any, fastify: FastifyInstance) {
    // Example: If this was a provider verification call,
    // trigger the "select best provider" step

    // You could:
    // 1. Publish to a message queue
    // 2. Update service request status
    // 3. Trigger another API call
    // 4. Send notification to user

    fastify.log.info({
        callId: result.callId,
        structuredData: result.structuredData,
    }, 'Triggering next workflow step');

    // Example: Update service request with provider info
    const { availability, licensed_and_insured, estimated_rate } = result.structuredData;

    if (availability === 'available' && licensed_and_insured === 'yes') {
        fastify.log.info('Provider is qualified, proceeding to selection');
        // Trigger provider selection logic...
    }
}
```

---

## 2. Configure VAPI Webhook

### In VAPI Dashboard

1. Go to **Account Settings** → **Webhooks**
2. Click **Add Webhook**
3. Enter webhook URL: `https://your-api-domain.com/api/v1/webhooks/vapi`
4. Select events to receive:
   - ✅ `end-of-call-report` (required)
   - ✅ `status-update` (optional, for real-time status)
   - ✅ `function-call` (optional, if using function calling)
5. Save webhook configuration

### Webhook Security (Optional but Recommended)

VAPI can sign webhooks with a secret. Add verification:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

// In webhook handler
fastify.post('/webhooks/vapi', async (request, reply) => {
    const signature = request.headers['x-vapi-signature'] as string;
    const secret = process.env.VAPI_WEBHOOK_SECRET!;

    if (!verifyWebhookSignature(JSON.stringify(request.body), signature, secret)) {
        return reply.status(401).send({ error: 'Invalid signature' });
    }

    // Process webhook...
});
```

---

## 3. Modified Call Initiation (Non-Blocking)

When using webhooks, you don't need to wait for the call to complete:

```typescript
// apps/api/src/routes/gemini.ts (or similar)

import { VapiClient } from '@vapi-ai/server-sdk';

// Initiate call (returns immediately)
app.post('/api/v1/vapi/initiate-call', async (request, reply) => {
    const { phoneNumber, serviceType, serviceRequestId } = request.body;

    const vapi = new VapiClient({ token: process.env.VAPI_API_KEY });

    try {
        const call = await vapi.calls.create({
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
            customer: { number: phoneNumber },
            assistant: {
                name: `Concierge Agent - ${serviceType}`,
                voice: { provider: "playht", voiceId: "jennifer" },
                model: {
                    provider: "google",
                    model: "gemini-2.5-flash",
                    messages: [{ role: "system", content: "..." }]
                },
                analysisPlan: {
                    // ... (structured output config from previous example)
                },
                endCallFunctionEnabled: true
            }
        });

        // Store call ID for tracking
        await request.server.supabase
            .from('interaction_logs')
            .insert({
                interaction_type: 'phone_call_initiated',
                payload: { callId: call.id, phoneNumber, serviceType },
                service_request_id: serviceRequestId,
            });

        // Return immediately (webhook will handle completion)
        reply.send({
            success: true,
            callId: call.id,
            status: call.status,
            message: 'Call initiated successfully'
        });

    } catch (error) {
        reply.status(500).send({ error: 'Failed to initiate call' });
    }
});
```

---

## 4. Testing Webhooks Locally

Use ngrok to expose local server for webhook testing:

```bash
# Terminal 1: Start your API
pnpm --filter api dev

# Terminal 2: Start ngrok
ngrok http 8000

# Use ngrok URL in VAPI webhook config:
# https://abc123.ngrok.io/api/v1/webhooks/vapi
```

### Test Webhook Manually

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/vapi \
  -H "Content-Type: application/json" \
  -d '{
    "type": "end-of-call-report",
    "call": {
      "id": "test-call-123",
      "status": "ended",
      "endedReason": "assistant-ended-call",
      "artifact": {
        "transcript": "Test conversation..."
      },
      "analysis": {
        "summary": "Provider confirmed availability and rates",
        "structuredData": {
          "availability": "available",
          "estimated_rate": "$95/hour",
          "licensed_and_insured": "yes",
          "call_outcome": "completed"
        },
        "successEvaluation": "Pass"
      },
      "costBreakdown": {
        "total": 0.15
      },
      "durationMinutes": 2.5
    },
    "timestamp": "2025-12-08T12:00:00Z"
  }'
```

---

## 5. Database Schema for Call Results

Add to your Supabase migrations:

```sql
-- Store VAPI call results
CREATE TABLE IF NOT EXISTS vapi_call_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id TEXT UNIQUE NOT NULL,
    service_request_id UUID REFERENCES service_requests(id),
    provider_id UUID REFERENCES providers(id),

    -- Call metadata
    status TEXT NOT NULL,
    ended_reason TEXT,
    duration_minutes NUMERIC,
    cost NUMERIC,

    -- Content
    transcript TEXT,
    summary TEXT,

    -- Structured data (JSON)
    structured_data JSONB,
    success_evaluation TEXT,

    -- Performance
    performance_metrics JSONB,

    -- Timestamps
    call_started_at TIMESTAMPTZ,
    call_ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_vapi_call_results_call_id ON vapi_call_results(call_id);
CREATE INDEX idx_vapi_call_results_service_request_id ON vapi_call_results(service_request_id);
CREATE INDEX idx_vapi_call_results_provider_id ON vapi_call_results(provider_id);

-- Enable RLS
ALTER TABLE vapi_call_results ENABLE ROW LEVEL SECURITY;
```

---

## 6. Comparison: Polling vs Webhook

### Polling (Current Approach)
```javascript
// Synchronous, blocks until call completes
const call = await vapi.calls.create({...});
let result = null;

while (!result) {
    await sleep(5000);
    const updated = await vapi.calls.get(call.id);
    if (updated.status === 'ended') {
        result = updated;
    }
}

processResult(result);
```

**Pros:**
- Simple to implement
- Works in synchronous scripts (Kestra)

**Cons:**
- Wastes resources (repeated API calls)
- Higher latency (up to 5 seconds)
- Not scalable for many concurrent calls

### Webhook (Production Approach)
```javascript
// Asynchronous, non-blocking
const call = await vapi.calls.create({...});

// Store call ID, return immediately
await saveCallId(call.id);
return { callId: call.id, status: 'initiated' };

// Later: Webhook receives completion event
app.post('/webhooks/vapi', (req) => {
    const { call } = req.body;
    processResult(call);
});
```

**Pros:**
- Instant notification (no delay)
- No wasted API calls
- Scalable to thousands of concurrent calls
- Event-driven architecture

**Cons:**
- Requires webhook endpoint setup
- More complex initial setup

---

## 7. Recommendation

- **For Hackathon (Current)**: Use improved polling script with structured output
- **For Production**: Migrate to webhook-based architecture

This gives you the best of both worlds:
1. Quick implementation for demo
2. Clear path to production-ready system

---

## Summary

**Webhook Flow:**
1. API initiates call → Returns call ID immediately
2. User can track call status in real-time
3. VAPI calls webhook when done → Processes result instantly
4. Database updated → Next workflow step triggered

**Key Files:**
- `/apps/api/src/routes/vapi-webhooks.ts` - Webhook handler
- `/apps/api/src/routes/vapi.ts` - Call initiation endpoint
- `/supabase/migrations/...` - Database schema for call results

**Next Steps:**
1. Implement webhook endpoint in Fastify API
2. Configure VAPI webhook in dashboard
3. Test with ngrok locally
4. Deploy and update webhook URL to production domain
