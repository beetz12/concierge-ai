# Critical Demo Blockers - Fix Plan

**Date**: 2025-12-10
**Author**: Claude AI
**Status**: Complete
**Type**: Fix

## Table of Contents
- [Executive Summary](#executive-summary)
- [Critical Fix #1: Direct Task Transcript Persistence](#critical-fix-1-direct-task-transcript-persistence)
- [Critical Fix #2: Recommendations Race Condition](#critical-fix-2-recommendations-race-condition)
- [Implementation Order](#implementation-order)
- [Verification Steps](#verification-steps)

---

## Executive Summary

Two critical issues are blocking a successful hackathon demo:

| Priority | Issue | Impact | Fix Time | Owner |
|----------|-------|--------|----------|-------|
| **P0** | Direct Task Transcript Not Saved | C6/C7 blocked, transcripts show "No call logs" | 30 min | David |
| **P0** | Recommendations Race Condition | Demo freezes after calling phase | 1-2 hrs | David/Hasan |

---

## Critical Fix #1: Direct Task Transcript Persistence

### Problem
In `apps/web/app/direct/page.tsx`, the transcript is extracted from VAPI but **never saved to the database**. The `addInteractionLog()` server action exists but is never called.

### Root Cause
- `callResponseToInteractionLog()` extracts transcript correctly
- Log is only saved to localStorage via `updateRequest()`
- Database `interaction_logs` table never receives the data
- When user views `/request/[id]`, real-time subscription finds nothing

### Solution
Add `addInteractionLog()` call after `callResponseToInteractionLog()` in direct/page.tsx.

### Code Changes

**File:** `apps/web/app/direct/page.tsx`

1. Add import at top:
```typescript
import { addInteractionLog } from "@/lib/actions/service-requests";
```

2. After line 162 (after `callResponseToInteractionLog`), add:
```typescript
// Save interaction log to database for real-time display
try {
  await addInteractionLog({
    request_id: reqId,
    step_name: log.stepName,
    detail: log.detail,
    status: log.status,
    transcript: log.transcript,
  });
  console.log(`[Direct] Saved interaction log to database`);
} catch (dbErr) {
  console.error("[Direct] Failed to save interaction log:", dbErr);
}
```

---

## Critical Fix #2: Recommendations Race Condition

### Problem
In `apps/web/app/request/[id]/page.tsx`, the code relies on Supabase real-time subscriptions to trigger `checkAndGenerateRecommendations()`. But JSONB field updates (`call_result`) may not reliably trigger subscriptions.

### Root Cause
- Provider updates use JSONB fields which may not trigger Supabase subscriptions
- `checkAndGenerateRecommendations()` only runs when subscription fires
- Race condition: status changes to ANALYZING before all call results are fetched
- Result: recommendations never appear, UI shows loading forever

### Solution
Add explicit trigger for recommendations after all calls complete, plus polling fallback.

### Code Changes

**File:** `apps/web/app/new/page.tsx`

After the call loop completes (around line 368), add explicit recommendation trigger:
```typescript
// After all calls complete, trigger recommendations explicitly
if (successCalls.length > 0) {
  // Update status to ANALYZING
  updateRequest(reqId, { status: RequestStatus.ANALYZING });
  await updateServiceRequest(reqId, { status: "ANALYZING" });

  // Navigate to request page - recommendations will be generated there
  router.push(`/request/${reqId}`);
}
```

**File:** `apps/web/app/request/[id]/page.tsx`

Add polling fallback after the real-time subscription setup:
```typescript
// Fallback: Poll for recommendations if subscription doesn't fire
useEffect(() => {
  if (request?.status === 'ANALYZING' && !recommendationsChecked && !recommendationsLoading) {
    const pollTimer = setTimeout(() => {
      console.log('[Recommendations] Fallback poll triggered');
      checkAndGenerateRecommendations();
    }, 5000);
    return () => clearTimeout(pollTimer);
  }
}, [request?.status, recommendationsChecked, recommendationsLoading]);
```

---

## Implementation Order

1. **Fix #1 First** (simpler, isolated change)
   - Modify `apps/web/app/direct/page.tsx`
   - Add import and database save call
   - Test with a direct task submission

2. **Fix #2 Second** (more complex, touches multiple files)
   - Modify `apps/web/app/new/page.tsx` - explicit trigger
   - Modify `apps/web/app/request/[id]/page.tsx` - polling fallback
   - Test full research & book flow

---

## Verification Steps

### Fix #1 Verification
1. Submit a direct task on `/direct` page
2. Wait for call to complete
3. Navigate to `/request/[id]`
4. Verify transcript displays in call logs section
5. Check database: `SELECT * FROM interaction_logs WHERE request_id = '[id]'`

### Fix #2 Verification
1. Submit new request on `/new` page
2. Wait for research and calling phases
3. Verify recommendations appear within 10 seconds of calls completing
4. Check browser console for "Fallback poll triggered" if needed
5. Select a provider and verify booking flow works

---

## Document Metadata

**Last Updated**: 2025-12-10
**Implementation Status**: Complete
**Related Documents**:
- [3_DAY_HACKATHON_SPRINT.md](../3_DAY_HACKATHON_SPRINT.md)
- [3_DAY_HACKATHON_PLAN.md](../3_DAY_HACKATHON_PLAN.md)

**Change Log**:
- 2025-12-10 - Initial creation based on multi-agent analysis
