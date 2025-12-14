# VAPI Error Handling Flow Diagram

## Current Flow (BUG - Shows Success on Failure)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                  apps/web/app/new/page.tsx                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1. POST /batch-call-async
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND: API Route                           │
│              apps/api/src/routes/providers.ts                   │
│                                                                  │
│  Line 657: Zod validation (schema only)                        │
│  Line 690: Generate execution ID                                │
│  Lines 720-726: Mark providers as "queued" in DB               │
│                                                                  │
│  Line 1018: ✓ Return 202 Accepted immediately ◄────────────┐  │
│             {                                                │  │
│               success: true,                                 │  │
│               executionId,                                   │  │
│               providersQueued: X                             │  │
│             }                                                │  │
└────────────────────────────┬────────────────────────────────┼──┘
                              │                                │
                              │                                │
         ┌────────────────────┴──────────┐                    │
         │                                │                    │
         ▼                                ▼                    │
┌─────────────────┐            ┌──────────────────────────────┼──┐
│   FRONTEND      │            │  BACKEND: Background Process │  │
│                 │            │  setImmediate() async block  │  │
│ Line 354:       │            │                               │  │
│ if (202) {      │            │  Line 743:                    │  │
│   success ✓     │            │  callProvidersBatch()         │  │
│ }               │            └────────────┬──────────────────┼──┘
│                 │                         │                  │
│ Line 383:       │                         ▼                  │
│ "Initiated X    │            ┌───────────────────────────────┼──┐
│  concurrent     │            │  BACKEND: Service Layer       │  │
│  calls" ✓       │            │  provider-calling.service.ts  │  │
└─────────────────┘            │                                │  │
                               │  Line 136: shouldUseKestra()   │  │
         USER SEES:            │  Line 235: ConcurrentCall...   │  │
         "Initiated 10 calls"  └────────────┬───────────────────┼──┘
         ✓ Success message                  │                   │
                                            ▼                   │
                               ┌────────────────────────────────┼──┐
                               │  BACKEND: Concurrent Service   │  │
                               │  concurrent-call.service.ts    │  │
                               │                                 │  │
                               │  Lines 104-116:                 │  │
                               │  Build CallRequest[] array      │  │
                               │                                 │  │
                               │  Line 137:                      │  │
                               │  const result = await           │  │
                               │    directClient.initiateCall()  │  │
                               └────────────┬────────────────────┼──┘
                                            │                    │
                                            ▼                    │
                               ┌────────────────────────────────┼──┐
                               │  BACKEND: VAPI Client          │  │
                               │  direct-vapi.client.ts         │  │
                               │                                 │  │
                               │  Line 130:                      │  │
                               │  await client.calls.create()    │  │
                               │                                 │  │
                               │  ▼ VAPI API returns 400 error  │  │
                               │     "silenceTimeoutSeconds:    │  │
                               │      Expected number,           │  │
                               │      received string"           │  │
                               │                                 │  │
                               │  Line 169: catch (error) {      │  │
                               │    logger.error(...)            │  │
                               │    return createErrorResult()   │  │
                               │  }                              │  │
                               │                                 │  │
                               │  Returns CallResult with:       │  │
                               │  {                               │  │
                               │    status: "error",             │  │
                               │    endedReason: "api_error",    │  │
                               │    error: "400 validation..."   │  │
                               │  }                              │  │
                               └────────────┬────────────────────┼──┘
                                            │                    │
                 ┌──────────────────────────┘                    │
                 │ CallResult returned                           │
                 │ (NOT an exception!)                           │
                 ▼                                               │
    ┌────────────────────────────────────────────────────────────┼──┐
    │  BACKEND: Concurrent Service (continued)                   │  │
    │  concurrent-call.service.ts                                │  │
    │                                                             │  │
    │  Line 137-139:                                              │  │
    │  try {                                                      │  │
    │    const result = directClient.initiateCall();             │  │
    │    return { success: true, result }; ◄─ BUG HERE          │  │
    │  } catch (error) {                                         │  │
    │    // Never executes! No exception thrown.                 │  │
    │  }                                                          │  │
    │                                                             │  │
    │  Line 162:                                                  │  │
    │  if (success && result) {                                  │  │
    │    results.push(result); ◄─ Error CallResult added         │  │
    │  }                                                          │  │
    │                                                             │  │
    │  Line 214:                                                  │  │
    │  return {                                                   │  │
    │    success: errors.length < providers.length, ◄─ BUG       │  │
    │    // errors array is EMPTY because catch never ran        │  │
    │    results: [CallResult with status="error"],              │  │
    │    stats: { failed: 0 },                                   │  │
    │    errors: [] ◄─ Empty!                                    │  │
    │  }                                                          │  │
    └────────────┬────────────────────────────────────────────────┼──┘
                 │                                                │
                 │ Returns success: true                          │
                 ▼                                                │
    ┌────────────────────────────────────────────────────────────┼──┐
    │  BACKEND: Service Layer (continued)                         │  │
    │  provider-calling.service.ts                                │  │
    │                                                             │  │
    │  Line 266:                                                  │  │
    │  return {                                                   │  │
    │    ...batchResult,                                          │  │
    │    resultsInDatabase: true                                  │  │
    │  }                                                          │  │
    └────────────┬────────────────────────────────────────────────┼──┘
                 │                                                │
                 │ No exception thrown                            │
                 ▼                                                │
    ┌────────────────────────────────────────────────────────────┼──┐
    │  BACKEND: Background Process (continued)                    │  │
    │  routes/providers.ts                                        │  │
    │                                                             │  │
    │  Line 743:                                                  │  │
    │  const batchResult = await callProvidersBatch();           │  │
    │  // No error thrown, so try block continues                │  │
    │                                                             │  │
    │  Line 754:                                                  │  │
    │  if (batchResult.resultsInDatabase) {                      │  │
    │    // Polls for provider completion...                     │  │
    │    // Waits for call_status to change...                   │  │
    │    // But providers stuck at "queued" forever!             │  │
    │  }                                                          │  │
    │                                                             │  │
    │  Lines 976-1014: catch (error) {                           │  │
    │    // Never executes!                                       │  │
    │  }                                                          │  │
    └─────────────────────────────────────────────────────────────┼──┘
                                                                  │
                                                                  │
    DATABASE STATE:                                               │
    ┌──────────────────────────────┐                             │
    │ service_requests             │                             │
    │   status: "ANALYZING"        │                             │
    │                               │                             │
    │ providers                     │                             │
    │   call_status: "queued"      │◄────────────────────────────┘
    │   call_result: null          │   Never updated!
    │                               │
    │ interaction_logs              │
    │   "Batch Calls Started"      │
    │   (no error logs)             │
    └───────────────────────────────┘

    FRONTEND STATE:
    ┌───────────────────────────────┐
    │ Real-time subscription:       │
    │   Waiting for provider        │
    │   call_status updates...      │
    │                               │
    │ UI shows:                     │
    │   "Initiated 10 calls" ✓     │
    │   Status: ANALYZING           │
    │   (stuck forever)             │
    └───────────────────────────────┘
```

## Key Problems Highlighted

1. **Line 1018 (routes/providers.ts):** Returns 202 BEFORE any VAPI validation
2. **Line 169 (direct-vapi.client.ts):** Catches VAPI errors but returns CallResult instead of throwing
3. **Line 137 (concurrent-call.service.ts):** Treats error CallResult as success because no exception
4. **Line 214 (concurrent-call.service.ts):** `success: true` because `errors` array is empty
5. **Line 976 (routes/providers.ts):** Error handler never executes

## Expected Flow (After Fix)

```
[Same until VAPI error occurs]
                                            │
                                            ▼
                               ┌────────────────────────────────────┐
                               │  BACKEND: VAPI Client              │
                               │  direct-vapi.client.ts             │
                               │                                     │
                               │  Line 130:                          │
                               │  await client.calls.create()        │
                               │                                     │
                               │  ▼ VAPI API returns 400 error      │
                               │                                     │
                               │  Line 169: catch (error) {          │
                               │    logger.error(...)                │
                               │                                     │
                               │    // FIX: Check error type         │
                               │    if (isAPIError(error)) {         │
                               │      throw error; ◄─ THROW IT!     │
                               │    }                                │
                               │                                     │
                               │    // Only call outcomes return     │
                               │    return createErrorResult()       │
                               │  }                                  │
                               └────────────┬───────────────────────┘
                                            │
                                            │ Exception thrown!
                                            ▼
    ┌────────────────────────────────────────────────────────────┐
    │  BACKEND: Concurrent Service                               │
    │  Line 139: catch (error) {                                 │
    │    return { success: false, error: {...} }; ◄─ NOW RUNS!  │
    │  }                                                          │
    │                                                             │
    │  Line 172: } else if (error) {                             │
    │    errors.push({...}); ◄─ Error tracked!                  │
    │  }                                                          │
    │                                                             │
    │  Line 214:                                                  │
    │  return {                                                   │
    │    success: false, ◄─ Correct!                             │
    │    errors: [{provider, phone, error}] ◄─ Populated!        │
    │  }                                                          │
    └────────────┬───────────────────────────────────────────────┘
                 │
                 │ Returns success: false
                 ▼
    ┌────────────────────────────────────────────────────────────┐
    │  BACKEND: Service Layer                                     │
    │  Line 269: catch (error) {                                 │
    │    logger.error(...)                                        │
    │    throw error; ◄─ Re-throw to background handler          │
    │  }                                                          │
    └────────────┬───────────────────────────────────────────────┘
                 │
                 │ Exception propagates
                 ▼
    ┌────────────────────────────────────────────────────────────┐
    │  BACKEND: Background Process                                │
    │  routes/providers.ts                                        │
    │                                                             │
    │  Line 976: } catch (error) { ◄─ NOW EXECUTES!             │
    │    logger.error(...)                                        │
    │                                                             │
    │    // Update service request to FAILED                     │
    │    await supabase                                           │
    │      .from("service_requests")                              │
    │      .update({                                              │
    │        status: "FAILED",                                    │
    │        final_outcome: "Failed: 400 validation error"       │
    │      })                                                     │
    │                                                             │
    │    // Mark providers as error                              │
    │    await supabase                                           │
    │      .from("providers")                                     │
    │      .update({ call_status: "error" })                     │
    │                                                             │
    │    // Log to interaction_logs                              │
    │    await supabase.from("interaction_logs").insert({        │
    │      step_name: "Batch Calls Error",                       │
    │      detail: "400 validation error: ..."                   │
    │    })                                                       │
    │  }                                                          │
    └─────────────────────────────────────────────────────────────┘

    DATABASE STATE (CORRECTED):
    ┌───────────────────────────────┐
    │ service_requests              │
    │   status: "FAILED" ✓          │
    │   final_outcome: "Failed..."  │
    │                                │
    │ providers                      │
    │   call_status: "error" ✓      │
    │                                │
    │ interaction_logs               │
    │   "Batch Calls Started"       │
    │   "Batch Calls Error" ✓       │
    └───────────────────────────────┘

    FRONTEND STATE (UPDATED VIA REAL-TIME):
    ┌───────────────────────────────┐
    │ Real-time subscription        │
    │   receives status: "FAILED"   │
    │                                │
    │ UI shows:                      │
    │   Status: FAILED ✓            │
    │   Error message displayed ✓   │
    │   "Failed: 400 validation..." │
    └───────────────────────────────┘
```

## Fix Locations

| File | Line | Change |
|------|------|--------|
| `direct-vapi.client.ts` | 169-180 | Throw on API errors (400, 401, 403) |
| `concurrent-call.service.ts` | 160-170 | Check `endedReason === "api_error"` |
| `routes/providers.ts` | 655-690 | Add VAPI config validation before 202 |
