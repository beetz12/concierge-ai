# CRITICAL: VAPI Call Error Handling Analysis

**Investigation Date:** 2025-12-13  
**Issue:** VAPI calls failing with 400 errors show as success in frontend

## Executive Summary

**ROOT CAUSE IDENTIFIED:** The async batch call endpoint (`POST /api/v1/providers/batch-call-async`) returns 202 Accepted **BEFORE** validating VAPI calls, and errors during background call execution are logged but **NOT propagated to the frontend**.

## The Error Handling Flow (As-Is)

### Frontend: `/apps/web/app/new/page.tsx`

**Lines 346-377:** Fire-and-forget fetch to `/api/v1/providers/batch-call-async`

```typescript
fetch("/api/v1/providers/batch-call-async", { ... })
  .then(async (response) => {
    if (response.status === 202) {
      const result = await response.json();
      console.log(`[Concierge] Calls accepted (execution: ${result.data?.executionId})`);
    } else {
      // Only HTTP-level errors (400, 500) are caught here
      const errorText = await response.text();
      updateRequest(reqId, { status: RequestStatus.FAILED, ... });
    }
  })
  .catch((error) => {
    // Only network errors are caught here
    updateRequest(reqId, { status: RequestStatus.FAILED, ... });
  });
```

**Lines 380-387:** Success message displayed IMMEDIATELY after 202 response

```typescript
const inProgressLog = {
  timestamp: new Date().toISOString(),
  stepName: "Calling Providers",
  detail: `Initiated ${batchProviders.length} concurrent call${batchProviders.length > 1 ? 's' : ''}. Results will appear below as each call completes via real-time updates.`,
  status: "info" as const,
};
callLogs.push(inProgressLog);
console.log(`[Concierge] Batch call initiated for ${batchProviders.length} providers - UI will update via real-time subscriptions`);
```

**PROBLEM:** The frontend treats 202 as success and displays "Initiated X calls" **before any actual VAPI calls are made**.

---

### Backend: `/apps/api/src/routes/providers.ts`

**Lines 655-1044:** `POST /batch-call-async` endpoint

#### Phase 1: Validation & Test Mode (Lines 656-687)
- **Line 657:** Zod validation (catches schema errors only)
- **Lines 660-687:** Test phone substitution
- **IMPORTANT:** No VAPI validation happens here

#### Phase 2: Immediate 202 Response (Lines 1017-1027)
```typescript
// Return 202 Accepted immediately
return reply.status(202).send({
  success: true,
  data: {
    executionId,
    status: "accepted",
    providersQueued: validated.providers.length,
    message: "Calls started. Monitor progress via real-time subscriptions.",
  },
});
```
**PROBLEM:** Returns success BEFORE any VAPI API calls are made.

#### Phase 3: Background Processing (Lines 738-1015)
```typescript
setImmediate(async () => {
  try {
    const batchResult = await callingService.callProvidersBatch(requests, { ... });
    // Success handling...
  } catch (error) {
    fastify.log.error({ executionId, error }, "Background batch call processing failed");
    
    // Update service request status to FAILED
    if (validated.serviceRequestId) {
      await supabase
        .from("service_requests")
        .update({
          status: "FAILED",
          final_outcome: `Failed to complete provider calls: ${errorMessage}`,
        })
        .eq("id", validated.serviceRequestId);
    }
    
    // Mark all queued/in_progress providers as error
    // Log error to interaction_logs
  }
});
```

**PROBLEM:** Background errors are caught and logged, but the HTTP response was already sent with 202 success.

---

### Service Layer: `/apps/api/src/services/vapi/provider-calling.service.ts`

**Lines 126-280:** `callProvidersBatch()` method

```typescript
async callProvidersBatch(requests: CallRequest[], options?: { maxConcurrent?: number }): Promise<BatchCallResult> {
  // Single routing decision for entire batch
  const useKestra = await this.shouldUseKestra();
  
  try {
    if (useKestra) {
      const kestraResult = await this.kestraClient.triggerContactFlow(requests, options);
      // Transform and return...
    }
    
    // Use Direct VAPI
    const concurrentService = new ConcurrentCallService(this.logger);
    const batchResult = await concurrentService.callProvidersBatch({ ... });
    return { ...batchResult, resultsInDatabase: true };
  } catch (error) {
    this.logger.error({ error, ... }, "Batch provider calls failed");
    throw error; // Re-thrown to background handler
  }
}
```

**Lines 269-280:** Errors are thrown back to the background handler in `routes/providers.ts` (Line 976).

---

### VAPI Client: `/apps/api/src/services/vapi/direct-vapi.client.ts`

**Lines 87-180:** `initiateCall()` method

```typescript
async initiateCall(request: CallRequest): Promise<CallResult> {
  try {
    // Build call parameters (Lines 104-127)
    const callParams: any = { phoneNumberId, customer, assistant };
    
    // Create the call using the SDK (Line 130)
    const callResponse = await this.client.calls.create(callParams);
    // ^^^ THIS IS WHERE THE 400 ERROR OCCURS ^^^
    
    // Extract call data... (Lines 133-147)
    // Wait for results... (Lines 149-168)
    
    return this.formatCallResult(completedCall, request);
  } catch (error) {
    this.logger.error({ error, provider: request.providerName }, "Failed to initiate VAPI call");
    return this.createErrorResult(request, error); // Returns error CallResult
  }
}
```

**Lines 169-180:** Exception handler catches VAPI API errors (including 400 validation errors)

**Lines 473-506:** `createErrorResult()` returns a CallResult with status="error"

```typescript
private createErrorResult(request: CallRequest, error: unknown): CallResult {
  return {
    status: "error",
    callId: "",
    callMethod: "direct_vapi",
    duration: 0,
    endedReason: "api_error",
    transcript: "",
    analysis: { ... },
    provider: { name: request.providerName, ... },
    error: error instanceof Error ? error.message : "Unknown error",
  };
}
```

**CRITICAL ISSUE:** The error is converted to a CallResult instead of being thrown. This means `callProvidersBatch()` sees a "successful" return (a CallResult object), not an exception.

---

### Concurrent Call Service: `/apps/api/src/services/vapi/concurrent-call.service.ts`

**Lines 135-151:** Individual call error handling

```typescript
const batchPromises = batch.map(async (request) => {
  try {
    const result = await this.directClient.initiateCall(request);
    return { success: true, result };
  } catch (error) {
    // This catch never triggers because initiateCall() returns error CallResult instead of throwing
    return { success: false, error: { provider, phone, message: errorMessage } };
  }
});
```

**PROBLEM:** Since `initiateCall()` returns an error CallResult instead of throwing, this catch block never executes for VAPI 400 errors.

**Lines 157-193:** Result processing

```typescript
for (const settledResult of batchResults) {
  if (settledResult.status === "fulfilled") {
    const { success, result, error } = settledResult.value;
    
    if (success && result) {
      results.push(result); // Error CallResults are pushed here
      this.logger.debug({ provider: result.provider.name, status: result.status, ... });
    } else if (error) {
      errors.push({ provider, phone, error: error.message });
      this.logger.error({ ... });
    }
  }
}
```

**Lines 213-218:** Success calculation

```typescript
return {
  success: errors.length < options.providers.length,
  results, // Contains error CallResults with status="error"
  stats,
  errors, // Empty because catch block didn't trigger
};
```

**CRITICAL:** `success: true` is returned even when all results have `status="error"` because the `errors` array is empty.

---

## The Bug Chain

1. **Frontend calls `/api/v1/providers/batch-call-async`** (Line 347, `apps/web/app/new/page.tsx`)
2. **Backend returns 202 immediately** (Line 1018, `apps/api/src/routes/providers.ts`)
3. **Frontend displays "Initiated X calls"** (Line 383, `apps/web/app/new/page.tsx`)
4. **Background process starts** (Line 739, `apps/api/src/routes/providers.ts`)
5. **VAPI API call fails with 400 error** (Line 130, `apps/api/src/services/vapi/direct-vapi.client.ts`)
6. **Error is caught and converted to CallResult** (Lines 169-178, `direct-vapi.client.ts`)
7. **ConcurrentCallService treats it as successful** (Lines 137, 162, `concurrent-call.service.ts`)
8. **ProviderCallingService returns success** (Line 266, `provider-calling.service.ts`)
9. **Background handler doesn't catch error** (Line 743, `apps/api/src/routes/providers.ts`)
10. **Database status never updated to FAILED**
11. **Frontend shows "Initiated X calls" with no error indication**

---

## Why VAPI 400 Errors Appear as Success

### The Specific Error Case

```
silenceTimeoutSeconds: Validation error: Expected number, received string
```

This error occurs in:
- **File:** `apps/api/src/services/vapi/direct-vapi.client.ts`
- **Line:** 130 (`await this.client.calls.create(callParams)`)
- **Handler:** Lines 169-180 (converts to error CallResult)

### Why It Shows Success

1. **DirectVapiClient.initiateCall()** catches the VAPI 400 error and returns `createErrorResult()` instead of throwing
2. **ConcurrentCallService** sees a fulfilled promise with a CallResult (not an exception)
3. **Result pushed to results array** with `status: "error"`
4. **Success calculation** only checks `errors.length < providers.length`
5. Since the `errors` array is empty (catch didn't trigger), `success: true`
6. **Background handler doesn't throw**, so database never updated to FAILED
7. **Frontend shows "Initiated X calls"** and waits for real-time updates that never come

---

## Impact Assessment

### User Experience
- Users see "Initiated X calls" even when all calls fail immediately
- No error message displayed
- Page stuck in "CALLING" or "ANALYZING" state indefinitely
- Real-time subscriptions show no updates because no calls actually ran

### Data Integrity
- Database shows `call_status: "queued"` when calls never executed
- No interaction logs created for validation errors
- No way to distinguish between "call in progress" and "call failed before starting"

### Debugging Difficulty
- Frontend console shows success: `[Concierge] Batch call initiated for 10 providers`
- Backend logs show error: `Failed to initiate VAPI call`
- No connection between the two without correlating timestamps

---

## Recommended Fixes

### Option 1: Throw Errors in DirectVapiClient (Strictest)

**Change:** `apps/api/src/services/vapi/direct-vapi.client.ts` Lines 169-180

```typescript
} catch (error) {
  this.logger.error({ error, provider: request.providerName }, "Failed to initiate VAPI call");
  
  // For validation/config errors (400, 401, 403), throw immediately
  // These are not recoverable call failures, they're setup issues
  if (error instanceof Error && error.message.includes('400')) {
    throw error; // Propagate to caller
  }
  
  // For call-related errors (no answer, busy, etc), return error result
  return this.createErrorResult(request, error);
}
```

**Impact:**
- Validation errors bubble up to background handler
- Database status set to FAILED
- Clear error messages in interaction logs
- **Downside:** Partial batch failures might abort entire batch

---

### Option 2: Check CallResult Status in ConcurrentCallService

**Change:** `apps/api/src/services/vapi/concurrent-call.service.ts` Lines 160-170

```typescript
if (success && result) {
  // Check if the result indicates an API error (not a call outcome)
  if (result.status === "error" && result.endedReason === "api_error") {
    // Treat API errors as failures, not successful calls
    errors.push({
      provider: result.provider.name,
      phone: result.provider.phone,
      error: result.error || "VAPI API error",
    });
    this.logger.error({ provider: result.provider.name, error: result.error }, "VAPI API error");
  } else {
    // Regular call result (completed, no_answer, voicemail, etc)
    results.push(result);
    this.logger.debug({ provider: result.provider.name, status: result.status });
  }
}
```

**Impact:**
- API errors counted as failures in batch stats
- `success: false` when all calls have API errors
- Database status set to FAILED
- **Downside:** Requires distinguishing API errors from call outcome errors

---

### Option 3: Validate VAPI Config Before Returning 202

**Change:** `apps/api/src/routes/providers.ts` Lines 655-690

```typescript
async (request, reply) => {
  try {
    let validated = batchCallSchema.parse(request.body);
    
    // VALIDATE VAPI CONFIGURATION BEFORE RETURNING 202
    const { VapiClient } = await import("@vapi-ai/server-sdk");
    const vapiClient = new VapiClient({ token: process.env.VAPI_API_KEY! });
    
    // Test call creation with first provider to catch config errors early
    const testRequest = validated.providers[0];
    try {
      const testConfig = createAssistantConfig({ ... });
      // Validate but don't actually create (or create and immediately cancel)
      // This catches 400 validation errors before returning 202
    } catch (vapiError) {
      fastify.log.error({ error: vapiError }, "VAPI configuration validation failed");
      return reply.status(400).send({
        success: false,
        error: "VAPI configuration error: " + (vapiError instanceof Error ? vapiError.message : "Unknown"),
      });
    }
    
    // ... rest of endpoint (Lines 690+)
```

**Impact:**
- Frontend gets 400 response instead of 202
- Error displayed immediately, no false success message
- Prevents wasted database writes and background processing
- **Downside:** Adds latency to endpoint (one test VAPI call before returning)

---

## Immediate Action Required

1. **Add status checks in ConcurrentCallService** (Option 2) - safest, no breaking changes
2. **Add config validation** (Option 3) - prevents issue at source
3. **Add frontend timeout/polling** - detect stuck "CALLING" state after 5 minutes
4. **Improve error logging** - include execution ID in all logs for correlation

## Files Requiring Changes

| File Path | Lines | Change Type | Priority |
|-----------|-------|-------------|----------|
| `apps/api/src/services/vapi/concurrent-call.service.ts` | 160-170 | Add API error detection | **Critical** |
| `apps/api/src/routes/providers.ts` | 655-690 | Add pre-validation | High |
| `apps/web/app/new/page.tsx` | 346-377 | Add timeout detection | Medium |
| `apps/api/src/services/vapi/direct-vapi.client.ts` | 169-180 | Consider throwing on 4xx | Low |

---

## Root Cause Summary

**The fundamental issue:** The async batch call pattern (202 Accepted) assumes that all validation happens **before** the 202 response, but VAPI API validation only happens **during** background processing. When VAPI rejects the call with a 400 error, the DirectVapiClient converts it to a CallResult instead of throwing, causing ConcurrentCallService to treat it as a successful call with an error outcome rather than a failed API request.

**The fix:** Distinguish between "call outcome errors" (no answer, voicemail) and "API errors" (400 validation, auth failures) at the service layer, and only treat the former as successful CallResults.
