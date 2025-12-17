# Fix: Kestra→Frontend Integration Issues

**Date**: 2025-12-11
**Author**: Claude AI
**Status**: In Progress
**Type**: Bug Fix

## Table of Contents
- [Problem Summary](#problem-summary)
- [Root Causes Identified](#root-causes-identified)
- [Fix Plan](#fix-plan)
- [Implementation Details](#implementation-details)
- [Testing Checklist](#testing-checklist)

---

## Problem Summary

After Kestra call providers workflow completes successfully, the frontend has multiple issues:

1. **No real-time progress updates**: Frontend shows "Initializing AI Agent..." instead of live call progress
2. **Provider list not displayed**: Sidebar doesn't show providers being called
3. **Recommendations fail**: Error `Invalid response from recommendations API: {success: true}` with no `data`

### Error Log Evidence

```
page.tsx:353 Invalid response from recommendations API: {success: true}
```

The API returns `{success: true}` but `data` is undefined.

---

## Root Causes Identified

### Root Cause 1: Kestra Inline Script Doesn't Save to Database

**File**: `kestra/flows/contact_providers.yaml` (lines 70-128)

The inline script in the YAML:
- Makes VAPI calls successfully
- Outputs JSON to console
- **Does NOT update** `providers.call_status` in database
- **Does NOT create** `interaction_logs` entries

**Impact**:
- Frontend real-time subscriptions never receive updates
- `request.interactions` stays empty → "Initializing AI Agent..."
- `providers.call_status` stays null → `calledProviders.length === 0`

### Root Cause 2: Recommendations API Returns Empty Data

**File**: `apps/api/src/services/vapi/kestra.client.ts` (lines 731-744)

```typescript
if (finalState.outputs?.recommendations_json) {
  recommendations = JSON.parse(finalState.outputs.recommendations_json);
}
return {
  success: true,
  data: kestraResult.recommendations,  // undefined if parsing failed
};
```

When Kestra's `recommend_providers` workflow runs:
- AI generates recommendations but output format may not match
- If `recommendations_json` is missing or malformed, `recommendations` stays undefined
- API returns `{success: true, data: undefined}`

### Root Cause 3: Frontend Call Progress Logic

**File**: `apps/web/app/request/[id]/page.tsx` (lines 214-236)

```typescript
const calledProviders = providers.filter((p) => p.call_status);
const allInitiatedCallsComplete = calledProviders.length > 0 &&
  completedProviders.length === calledProviders.length;
```

When Kestra doesn't update provider `call_status`:
- `calledProviders.length === 0`
- `allInitiatedCallsComplete` is always false
- Recommendations API is never called (or called with empty array)

### Root Cause 4: Status Display Shows Wrong State

**File**: `apps/web/components/LiveStatus.tsx`

When `callProgress` is null (no providers with call_status):
- Our recent fix shows "calling_failed"
- But Kestra calls ARE succeeding, just not updating DB
- Need to differentiate "calls in progress via Kestra" vs "calls failed"

---

## Fix Plan

### Fix 1: Create Database Persistence for Kestra Call Results

**Strategy**: Add a Kestra task that calls our API to save results after each call.

**Option A**: Use Kestra HTTP task to call `/api/v1/providers/update-call-result`
**Option B**: Add Supabase client directly in Kestra script (requires env vars)
**Option C**: Create webhook endpoint for Kestra to report results

**Recommended**: Option A - Use existing API infrastructure

### Fix 2: Update contact_providers.yaml

**Changes needed**:
1. Use external script `call-provider.js` instead of inline script
2. Add post-call task to save results to database via API
3. Ensure `call_status` and `call_result` are persisted

### Fix 3: Fix Recommendations API Response

**Changes needed**:
1. Add validation before returning - ensure `data` is not undefined
2. Log when recommendations parsing fails
3. Fallback to direct Gemini if Kestra returns empty recommendations

### Fix 4: Update Frontend Status Logic

**Changes needed**:
1. When status is ANALYZING and Kestra is enabled, show appropriate message
2. Don't show "calling_failed" when Kestra is just processing
3. Add Kestra execution status polling as fallback

---

## Implementation Details

### Implementation 1: Add Call Result Save Endpoint

Create new endpoint that Kestra can call to save results.

**File**: `apps/api/src/routes/providers.ts`

```typescript
// POST /api/v1/providers/save-call-result
// Called by Kestra after each call completes
fastify.post("/save-call-result", async (request, reply) => {
  const { providerId, serviceRequestId, callResult } = request.body;

  // Update provider with call result
  await supabase.from("providers").update({
    call_status: callResult.status,
    call_result: callResult,
    call_transcript: callResult.transcript,
    call_summary: callResult.analysis?.summary,
    call_id: callResult.callId,
    called_at: new Date().toISOString(),
  }).eq("id", providerId);

  // Create interaction log
  await supabase.from("interaction_logs").insert({
    request_id: serviceRequestId,
    step_name: `Call to ${callResult.provider.name}`,
    status: callResult.status === "completed" ? "success" : "error",
    detail: callResult.analysis?.summary || callResult.status,
    transcript: callResult.transcript,
    call_id: callResult.callId,
  });

  return reply.send({ success: true });
});
```

### Implementation 2: Update contact_providers.yaml

Replace inline script with external script call and add save step.

```yaml
- id: call_single_provider
  type: io.kestra.plugin.scripts.node.Script
  script: |
    // Load and execute call-provider.js with result saving
    const result = await makeCall(config);

    // Save to database via API
    await fetch(`${process.env.BACKEND_URL}/api/v1/providers/save-call-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: config.providerId,
        serviceRequestId: config.serviceRequestId,
        callResult: result
      })
    });
```

### Implementation 3: Fix Recommendations API

**File**: `apps/api/src/routes/providers.ts`

```typescript
// After getting kestraResult
if (kestraResult.success) {
  if (!kestraResult.recommendations) {
    request.log.warn("Kestra returned success but no recommendations - falling back to direct Gemini");
    // Fall through to direct Gemini
  } else {
    return reply.send({
      success: true,
      data: kestraResult.recommendations,
      method: "kestra",
    });
  }
}
```

### Implementation 4: Frontend Status Enhancement

**File**: `apps/web/components/LiveStatus.tsx`

Add Kestra-aware status handling:

```typescript
// When ANALYZING but no callProgress, check if Kestra is processing
if (safeStatus === "analyzing" && !callProgress) {
  // If providers exist but none have call_status, Kestra might be processing
  if (providers && providers.length > 0) {
    const noCallsStarted = providers.every(p => !p.callStatus);
    const hasErrors = providers.some(p => p.callStatus === 'error');

    if (noCallsStarted && !hasErrors) {
      // Kestra processing - show waiting state, not error
      return "kestra_processing";
    }
  }
}
```

---

## Testing Checklist

- [ ] Create new request via `/new` page
- [ ] Verify "Researching providers..." step shows
- [ ] Verify provider list appears in sidebar after research
- [ ] Verify "Calling Providers" status with progress bar
- [ ] Verify real-time call status updates appear
- [ ] Verify recommendations display after calls complete
- [ ] Verify no console errors during flow
- [ ] Test with Kestra disabled (direct API fallback)
- [ ] Test with Kestra enabled
- [ ] Verify interaction logs are created

---

## Document Metadata

**Last Updated**: 2025-12-11
**Implementation Status**: In Progress
**Related Documents**:
- `docs/VAPI_WEBHOOK_ARCHITECTURE.md`
- `kestra/flows/contact_providers.yaml`
- `apps/api/src/services/vapi/kestra.client.ts`

**Change Log**:
- 2025-12-11 - Initial creation with full analysis
