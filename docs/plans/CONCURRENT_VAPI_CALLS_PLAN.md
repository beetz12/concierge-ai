# Concurrent VAPI Calls Implementation Plan

**Date**: 2025-12-09
**Author**: Claude AI
**Status**: COMPLETE
**Confidence**: 90%

## Table of Contents
- [Problem Statement](#problem-statement)
- [Current Architecture](#current-architecture)
- [Proposed Solution](#proposed-solution)
- [Implementation Steps](#implementation-steps)
- [Files to Create/Modify](#files-to-createmodify)
- [Testing Plan](#testing-plan)

---

## Problem Statement

**Current State**: After finding 10 service providers, VAPI calls are made **sequentially** - each call takes 5+ minutes to complete before the next one starts.

**Impact**:
- 3 providers: 15-18 minutes total wait
- 5 providers: 25-30 minutes total wait
- 10 providers: 50-60 minutes total wait

**Goal**: Implement concurrent VAPI calls with configurable concurrency limit (default: 5 concurrent calls).

**Expected Improvement**:
- With 5 concurrent calls: ~5-6 minutes total (instead of 25-30 minutes for 5 providers)
- 80%+ reduction in total wait time

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Current Flow (SEQUENTIAL)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Providers [1,2,3,4,5]                                          │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐         │
│  │ Call 1  │──▶│ Call 2  │──▶│ Call 3  │──▶│ Call 4  │──▶...   │
│  │ 5 min   │   │ 5 min   │   │ 5 min   │   │ 5 min   │         │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘         │
│                                                                  │
│  Total Time: N × 5 minutes = 25+ minutes for 5 providers        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Two Execution Paths (Both Sequential)**:
1. **Direct VAPI** (`DirectVapiClient.initiateCall()`) - Polls VAPI SDK
2. **Kestra Workflow** (`contact_agent.yaml`) - Triggers Node.js script

**Existing Concurrency Pattern** (Google Places - `google-places.service.ts:275-341`):
```typescript
// Batch processing with Promise.all - ALREADY WORKS WELL
for (let i = 0; i < providers.length; i += batchSize) {
  const batch = providers.slice(i, i + batchSize);
  const batchResults = await Promise.all(batch.map(async (p) => {...}));
  await this.delay(200); // Rate limit protection
}
```

---

## Proposed Solution

```
┌─────────────────────────────────────────────────────────────────┐
│                   Proposed Flow (CONCURRENT)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Providers [1,2,3,4,5,6,7,8,9,10]                               │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────┐                    │
│  │     ConcurrentCallService.callAll()     │  ← NEW SHARED      │
│  │  - Respects VAPI_MAX_CONCURRENT_CALLS   │    SERVICE         │
│  │  - Batches calls with Promise.allSettled│                    │
│  │  - Handles partial failures gracefully   │                    │
│  └─────────────────────────────────────────┘                    │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Call 1   │ Call 2   │ Call 3   │ Call 4   │ Call 5   │      │
│  │ 5 min    │ 5 min    │ 5 min    │ 5 min    │ 5 min    │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
│       │          │          │          │          │             │
│       └──────────┴──────────┴──────────┴──────────┘             │
│                         │                                        │
│                         ▼                                        │
│                    BATCH 1 COMPLETE (~5 min)                    │
│                         │                                        │
│                         ▼                                        │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Call 6   │ Call 7   │ Call 8   │ Call 9   │ Call 10  │      │
│  │ 5 min    │ 5 min    │ 5 min    │ 5 min    │ 5 min    │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
│                         │                                        │
│                         ▼                                        │
│                    BATCH 2 COMPLETE (~5 min)                    │
│                                                                  │
│  Total Time: ~10 minutes for 10 providers (vs 50+ sequential)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Add Environment Variable

**File**: `apps/api/.env.example` and `apps/api/.env`

```bash
# VAPI Concurrent Call Configuration
VAPI_MAX_CONCURRENT_CALLS=5    # Max simultaneous outbound calls
```

### Step 2: Create ConcurrentCallService (NEW SHARED SERVICE)

**File**: `apps/api/src/services/vapi/concurrent-call.service.ts`

```typescript
export interface ConcurrentCallOptions {
  maxConcurrent?: number;        // Default: from env or 5
  batchDelayMs?: number;         // Delay between batches (default: 500ms)
  onCallComplete?: (result: CallResult, index: number) => void;
  onCallError?: (error: Error, request: CallRequest, index: number) => void;
}

export interface ConcurrentCallResult {
  results: CallResult[];
  stats: {
    total: number;
    successful: number;
    failed: number;
    timedOut: number;
    durationMs: number;
  };
}

export class ConcurrentCallService {
  private directClient: DirectVapiClient;
  private maxConcurrent: number;

  constructor(logger: Logger) {
    this.directClient = new DirectVapiClient(logger);
    this.maxConcurrent = parseInt(process.env.VAPI_MAX_CONCURRENT_CALLS || "5", 10);
  }

  /**
   * Execute multiple VAPI calls concurrently with batching
   * Uses Promise.allSettled for graceful partial failure handling
   */
  async callAllProviders(
    requests: CallRequest[],
    options: ConcurrentCallOptions = {}
  ): Promise<ConcurrentCallResult> {
    const {
      maxConcurrent = this.maxConcurrent,
      batchDelayMs = 500,
      onCallComplete,
      onCallError
    } = options;

    const results: CallResult[] = [];
    const stats = { total: requests.length, successful: 0, failed: 0, timedOut: 0, durationMs: 0 };
    const startTime = Date.now();

    // Process in batches
    for (let i = 0; i < requests.length; i += maxConcurrent) {
      const batch = requests.slice(i, i + maxConcurrent);

      this.logger.info({
        batchNumber: Math.floor(i / maxConcurrent) + 1,
        batchSize: batch.length,
        totalProviders: requests.length
      }, "Starting concurrent call batch");

      // Execute batch concurrently with Promise.allSettled
      const batchResults = await Promise.allSettled(
        batch.map(async (request, batchIndex) => {
          const globalIndex = i + batchIndex;
          try {
            const result = await this.directClient.initiateCall(request);
            onCallComplete?.(result, globalIndex);
            return result;
          } catch (error) {
            onCallError?.(error as Error, request, globalIndex);
            throw error;
          }
        })
      );

      // Process batch results
      batchResults.forEach((result, batchIndex) => {
        if (result.status === "fulfilled") {
          results.push(result.value);
          stats.successful++;
        } else {
          stats.failed++;
          // Create error result for failed calls
          results.push({
            status: "error",
            callId: `error-${Date.now()}-${i + batchIndex}`,
            callMethod: "direct_vapi",
            duration: 0,
            endedReason: result.reason?.message || "Unknown error",
            transcript: "",
            analysis: {
              summary: `Call failed: ${result.reason?.message}`,
              structuredData: { call_outcome: "error" },
              successEvaluation: "false"
            }
          } as CallResult);
        }
      });

      // Add delay between batches (except for last batch)
      if (i + maxConcurrent < requests.length) {
        await new Promise(r => setTimeout(r, batchDelayMs));
      }
    }

    stats.durationMs = Date.now() - startTime;

    this.logger.info({ stats }, "Concurrent calls completed");

    return { results, stats };
  }
}
```

### Step 3: Create New Batch Call API Endpoint

**File**: `apps/api/src/routes/providers.ts` (ADD NEW ENDPOINT)

```typescript
/**
 * POST /batch-call
 * Call multiple providers concurrently
 */
fastify.post("/batch-call", async (request, reply) => {
  const body = batchCallSchema.parse(request.body);

  const concurrentService = new ConcurrentCallService(fastify.log);

  const result = await concurrentService.callAllProviders(
    body.providers.map(p => ({
      providerName: p.name,
      providerPhone: p.phone,
      serviceNeeded: body.serviceNeeded,
      userCriteria: body.userCriteria,
      location: body.location,
      urgency: body.urgency,
      serviceRequestId: body.serviceRequestId,
    })),
    {
      maxConcurrent: body.maxConcurrent, // Override from request
      onCallComplete: (callResult, index) => {
        fastify.log.info({
          provider: body.providers[index].name,
          status: callResult.status
        }, "Provider call completed");
      }
    }
  );

  return result;
});
```

### Step 4: Update Kestra Workflow for Parallelism

**File**: `kestra/flows/contact_agent.yaml` (REPLACE)

```yaml
id: contact_providers_concurrent
namespace: ai_concierge
description: "Contact multiple service providers concurrently via VAPI"

inputs:
  - id: providers
    type: JSON
    description: "Array of providers [{name, phone}]"
  - id: service_needed
    type: STRING
  - id: user_criteria
    type: STRING
  - id: location
    type: STRING
  - id: urgency
    type: STRING
    defaults: "within_2_days"
  - id: max_concurrent
    type: INT
    defaults: 5
    description: "Maximum concurrent calls"

tasks:
  # Option A: Use EachParallel for Kestra-native concurrency
  - id: call_providers_parallel
    type: io.kestra.plugin.core.flow.EachParallel
    concurrencyLimit: "{{ inputs.max_concurrent }}"
    value: "{{ inputs.providers }}"
    tasks:
      - id: call_single_provider
        type: io.kestra.plugin.scripts.node.Commands
        containerImage: node:20-alpine
        taskRunner:
          type: io.kestra.plugin.scripts.runner.docker.Docker
          volumes:
            - /Users/dave/Work/concierge-ai/kestra/scripts:/kestra
        beforeCommands:
          - npm install @vapi-ai/server-sdk @google/generative-ai
        commands:
          - node /kestra/call-provider.js "{{ taskrun.value.phone }}" "{{ inputs.service_needed }}" "{{ inputs.user_criteria }}" "{{ inputs.location }}" "{{ taskrun.value.name }}" "{{ inputs.urgency }}"
        env:
          VAPI_API_KEY: "{{ envs.vapi_api_key }}"
          VAPI_PHONE_NUMBER_ID: "{{ envs.vapi_phone_number_id }}"
          GEMINI_API_KEY: "{{ envs.gemini_api_key }}"

  # Aggregate results
  - id: aggregate_results
    type: io.kestra.plugin.scripts.node.Script
    containerImage: node:20-alpine
    script: |
      const results = {{ outputs.call_providers_parallel }};
      const aggregated = {
        total: results.length,
        successful: results.filter(r => r.status === 'completed').length,
        results: results
      };
      console.log(JSON.stringify(aggregated));

outputs:
  - id: call_results
    type: JSON
    value: "{{ outputs.aggregate_results.vars.stdout }}"
```

### Step 5: Create Shared Concurrent Call Script for Kestra

**File**: `kestra/scripts/call-providers-concurrent.js` (NEW)

```javascript
/**
 * Concurrent Provider Calling Script for Kestra
 * Uses the same logic as ConcurrentCallService for consistency
 */
const Vapi = require("@vapi-ai/server-sdk").default;

const MAX_CONCURRENT = parseInt(process.env.VAPI_MAX_CONCURRENT_CALLS || "5", 10);
const BATCH_DELAY_MS = 500;

async function callProvidersConcurrently(providers, config) {
  const vapi = new Vapi({ token: process.env.VAPI_API_KEY });
  const results = [];

  // Process in batches
  for (let i = 0; i < providers.length; i += MAX_CONCURRENT) {
    const batch = providers.slice(i, i + MAX_CONCURRENT);

    console.error(`Starting batch ${Math.floor(i/MAX_CONCURRENT) + 1}: ${batch.length} calls`);

    const batchPromises = batch.map(async (provider) => {
      try {
        return await callSingleProvider(vapi, provider, config);
      } catch (error) {
        return {
          status: "error",
          provider: provider.name,
          error: error.message
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({ status: "error", error: result.reason?.message });
      }
    });

    // Delay between batches
    if (i + MAX_CONCURRENT < providers.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return results;
}

async function callSingleProvider(vapi, provider, config) {
  // ... existing call-provider.js logic ...
}

// Main execution
const providers = JSON.parse(process.argv[2]);
const config = JSON.parse(process.argv[3]);

callProvidersConcurrently(providers, config)
  .then(results => {
    console.log(JSON.stringify({ status: "completed", results }));
  })
  .catch(error => {
    console.error(JSON.stringify({ status: "error", error: error.message }));
    process.exit(1);
  });
```

### Step 6: Update KestraClient to Support Batch Calls

**File**: `apps/api/src/services/vapi/kestra.client.ts` (ADD METHOD)

```typescript
/**
 * Trigger concurrent contact flow for multiple providers
 */
async triggerConcurrentContactFlow(
  providers: Array<{ name: string; phone: string }>,
  config: {
    serviceNeeded: string;
    userCriteria: string;
    location: string;
    urgency: string;
    maxConcurrent?: number;
  }
): Promise<CallResult[]> {
  const inputs = {
    providers: JSON.stringify(providers),
    service_needed: config.serviceNeeded,
    user_criteria: config.userCriteria,
    location: config.location,
    urgency: config.urgency,
    max_concurrent: config.maxConcurrent || 5,
  };

  const execution = await this.triggerFlow("contact_providers_concurrent", inputs);
  const result = await this.pollExecution(execution.id);

  return JSON.parse(result.outputs?.call_results || "[]");
}
```

### Step 7: Update ProviderCallingService for Batch Operations

**File**: `apps/api/src/services/vapi/provider-calling.service.ts` (ADD METHOD)

```typescript
/**
 * Call multiple providers concurrently
 * Routes to Kestra or Direct based on configuration
 */
async callProvidersBatch(
  requests: CallRequest[],
  options?: { maxConcurrent?: number }
): Promise<ConcurrentCallResult> {
  const useKestra = await this.shouldUseKestra();

  if (useKestra) {
    // Use Kestra's EachParallel for concurrent execution
    const results = await this.kestraClient.triggerConcurrentContactFlow(
      requests.map(r => ({ name: r.providerName, phone: r.providerPhone })),
      {
        serviceNeeded: requests[0].serviceNeeded,
        userCriteria: requests[0].userCriteria,
        location: requests[0].location,
        urgency: requests[0].urgency,
        maxConcurrent: options?.maxConcurrent,
      }
    );

    return {
      results,
      stats: {
        total: results.length,
        successful: results.filter(r => r.status === "completed").length,
        failed: results.filter(r => r.status === "error").length,
        timedOut: results.filter(r => r.status === "timeout").length,
        durationMs: 0, // Kestra handles timing
      }
    };
  }

  // Fall back to direct concurrent calls
  const concurrentService = new ConcurrentCallService(this.logger);
  return concurrentService.callAllProviders(requests, options);
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/.env.example` | MODIFY | Add `VAPI_MAX_CONCURRENT_CALLS=5` |
| `apps/api/src/services/vapi/concurrent-call.service.ts` | **CREATE** | New shared concurrent call service |
| `apps/api/src/services/vapi/provider-calling.service.ts` | MODIFY | Add `callProvidersBatch()` method |
| `apps/api/src/services/vapi/kestra.client.ts` | MODIFY | Add `triggerConcurrentContactFlow()` |
| `apps/api/src/routes/providers.ts` | MODIFY | Add `POST /batch-call` endpoint |
| `apps/api/src/services/vapi/index.ts` | MODIFY | Export new service |
| `kestra/flows/contact_agent.yaml` | MODIFY | Add EachParallel for concurrency |
| `kestra/scripts/call-providers-concurrent.js` | **CREATE** | Shared concurrent call script |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     API Routes                                   │
├────────────────────────┬────────────────────────────────────────┤
│  POST /providers/call  │  POST /providers/batch-call (NEW)      │
│  (single provider)     │  (multiple concurrent)                 │
└───────────┬────────────┴───────────────┬────────────────────────┘
            │                            │
            ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              ProviderCallingService                              │
│  ┌──────────────────┐    ┌────────────────────────────────┐    │
│  │ callProvider()   │    │ callProvidersBatch() (NEW)     │    │
│  │ (single)         │    │ - Routes to Kestra or Direct   │    │
│  └────────┬─────────┘    └────────────────┬───────────────┘    │
└───────────┼───────────────────────────────┼────────────────────┘
            │                               │
    ┌───────┴───────┐               ┌───────┴───────┐
    ▼               ▼               ▼               ▼
┌────────┐    ┌──────────┐    ┌────────────────┐  ┌─────────────┐
│ Kestra │    │ Direct   │    │ ConcurrentCall │  │ Kestra      │
│ Client │    │ VAPI     │    │ Service (NEW)  │  │ EachParallel│
│        │    │ Client   │    │ Promise.all    │  │ (native)    │
└────────┘    └──────────┘    └────────────────┘  └─────────────┘
```

---

## Key Design Decisions

1. **Promise.allSettled over Promise.all**: Handles partial failures gracefully - if one call fails, others continue

2. **Batching with configurable limit**: Respects VAPI rate limits and allows tuning per environment

3. **Shared service for DRY**: `ConcurrentCallService` used by both direct API and Kestra paths

4. **Kestra EachParallel**: Native Kestra concurrency with `concurrencyLimit` parameter

5. **Backward compatible**: Existing single-call endpoint unchanged, new batch endpoint added

6. **Environment-driven configuration**: `VAPI_MAX_CONCURRENT_CALLS` allows different settings per environment

---

## Testing Plan

```bash
# Test 1: Direct API batch call
curl -X POST http://localhost:8000/api/v1/providers/batch-call \
  -H "Content-Type: application/json" \
  -d '{
    "providers": [
      {"name": "Provider 1", "phone": "+18645551001"},
      {"name": "Provider 2", "phone": "+18645551002"},
      {"name": "Provider 3", "phone": "+18645551003"}
    ],
    "serviceNeeded": "plumbing",
    "userCriteria": "licensed, available tomorrow",
    "location": "Greenville SC",
    "urgency": "within_24_hours",
    "maxConcurrent": 3
  }'

# Expected: All 3 calls execute concurrently, total time ~5 minutes (not 15)

# Test 2: Verify timing improvement
time curl -X POST http://localhost:8000/api/v1/providers/batch-call ...

# Test 3: Kestra concurrent flow
curl -X POST http://localhost:8082/api/v1/executions/ai_concierge/contact_providers_concurrent \
  -H "Content-Type: application/json" \
  -d '{"providers": [...], "max_concurrent": 5}'
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| VAPI rate limiting | Configurable batch delay, conservative default (5 concurrent) |
| Partial failures | Promise.allSettled handles gracefully, returns partial results |
| Phone number conflicts | VAPI handles per-call, no shared state |
| Kestra container limits | Use Docker resource limits in workflow |
| Timeout accumulation | Each call has independent 5-min timeout |

---

## Document Metadata

**Last Updated**: 2025-12-09
**Implementation Status**: PENDING APPROVAL
**Related Documents**:
- [SERVICE_UNIFIED_PROVIDER_ENRICHMENT.md](./SERVICE_UNIFIED_PROVIDER_ENRICHMENT.md)
- [IMPLEMENTATION_PLAN_10_PROVIDERS.md](./IMPLEMENTATION_PLAN_10_PROVIDERS.md)
