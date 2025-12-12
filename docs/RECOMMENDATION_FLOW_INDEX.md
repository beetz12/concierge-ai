# Recommendation Flow Documentation Index

## Overview

This documentation set traces the EXACT code path from "all calls complete" to "recommendations generated" in the AI Concierge system.

**Problem Solved:** The `recommend_providers` Kestra flow was never being triggered. We fixed this by adding backend-owned recommendation generation in `apps/api/src/routes/providers.ts`.

---

## Documentation Files

### 1. Summary (Start Here)
**File:** `RECOMMENDATION_FLOW_SUMMARY.md` (8.4 KB)

Quick reference guide covering:
- The problem we solved
- The fix (high-level code path)
- Two recommendation paths (Kestra vs Direct Gemini)
- Key decision points
- Timeline and architecture
- Testing and troubleshooting

**Best for:** Quick reference, understanding architecture decisions, troubleshooting

---

### 2. Visual Diagram
**File:** `RECOMMENDATION_FLOW_DIAGRAM.md` (26 KB)

ASCII flowchart showing:
- Complete visual flow from request to recommendations
- State transitions (PENDING → CALLING → ANALYZING → RECOMMENDED)
- Database table updates
- Real-time trigger points
- Timing analysis
- Error recovery paths

**Best for:** Visual learners, presentations, onboarding new developers

---

### 3. Detailed Trace
**File:** `RECOMMENDATION_FLOW_TRACE.md` (25 KB)

Line-by-line code analysis:
- Entry point: `batch-call-async` handler (lines 655-995)
- Background flow: `setImmediate()` execution (lines 708-966)
- Critical check: `resultsInDatabase` flag (line 724)
- Polling loop: Wait for completion (lines 752-918)
- Transform: Database → CallResult[] (lines 805-830)
- Kestra path: `triggerRecommendProvidersFlow()` (lines 846-864)
- Direct Gemini path: Fallback service (lines 868-881)
- Database updates: Status to RECOMMENDED (line 885)

**Best for:** Deep debugging, code reviews, understanding exact implementation

---

## Quick Navigation

### By Use Case

| Need | Document | Section |
|------|----------|---------|
| Understand the fix | Summary | "The Fix" |
| See visual flow | Diagram | "Visual Flow Chart" |
| Debug a stuck request | Trace | "POLLING LOOP" |
| Add logging | Trace | "DATABASE UPDATE" |
| Understand timing | Diagram | "Timing Analysis" |
| Test the flow | Summary | "Testing" |
| Troubleshoot errors | Summary | "Common Issues" |

### By Code File

| File | Document | Lines | Description |
|------|----------|-------|-------------|
| `apps/api/src/routes/providers.ts` | Trace | 655-995 | Main handler + background flow |
| `apps/api/src/services/vapi/kestra.client.ts` | Trace | 805-889 | Kestra recommendation client |
| `kestra/flows/recommend_providers.yaml` | Trace | 40-107 | AI Agent task definition |
| `apps/api/src/services/recommendations/recommend.service.ts` | Trace | 107-210 | Direct Gemini fallback |

---

## Key Concepts

### 1. resultsInDatabase Flag
**Location:** `providers.ts` line 724

This flag determines whether the backend should trigger recommendation generation:

```typescript
if (batchResult.resultsInDatabase && serviceRequestId) {
  // Results in DB via Kestra webhooks
  // Backend polls for completion
  // Backend triggers recommendations
}
```

**Why it matters:** Kestra returns a summary string, not CallResult[] data. The actual results are saved to the database via webhook callbacks. The backend must poll the database to know when all calls are complete.

### 2. Polling Loop
**Location:** `providers.ts` lines 752-918

Backend polls the database every 2 seconds (max 30 seconds) waiting for all providers to reach a final status:

```typescript
finalStatuses = ["completed", "failed", "error", "timeout", "no_answer", "voicemail", "busy"]

while (!allProvidersComplete && pollAttempts < 15) {
  // Check if all providers have final status
  // If yes: proceed to recommendations
  // If no: wait 2 seconds and check again
}
```

### 3. Dual Recommendation Paths
**Location:** `providers.ts` lines 834-881

The system tries Kestra first, then falls back to Direct Gemini:

```typescript
if (kestraHealthy) {
  // Path A: Kestra flow (orchestrated)
  const kestraResult = await kestraClient.triggerRecommendProvidersFlow({...});
}

if (!recommendationSuccess) {
  // Path B: Direct Gemini (fallback)
  const directResult = await recommendationService.generateRecommendations({...});
}
```

**Both use the same AI model:** Gemini 2.5 Flash

### 4. Real-Time Subscriptions
**Location:** Diagram → "Real-Time Triggers"

Frontend doesn't poll - it subscribes to database changes:

```typescript
supabase
  .channel('service_requests')
  .on('postgres_changes', { ... }, (payload) => {
    if (payload.new.status === 'RECOMMENDED') {
      showRecommendations();
    }
  })
  .subscribe();
```

Three tables trigger real-time updates:
1. `providers` - Individual call progress
2. `service_requests` - Overall workflow state
3. `interaction_logs` - Activity feed

---

## Execution Flow Summary

```
1. POST /batch-call-async
   → 202 Accepted (instant)
   
2. Background: setImmediate()
   → callProvidersBatch()
   → Kestra calls all providers
   → Results saved via webhooks
   
3. Check: resultsInDatabase flag
   → If true: proceed to recommendations
   → If false: frontend handles recommendations
   
4. Update: status = ANALYZING
   → Real-time trigger to frontend
   
5. Poll: Wait for all providers complete
   → Check every 2 seconds
   → Max 30 seconds timeout
   
6. Transform: Database → CallResult[]
   → Fetch provider records
   → Map to recommendation format
   
7. Generate recommendations
   → Try Kestra flow first (60s timeout)
   → Fallback to Direct Gemini (5-10s)
   
8. Update: status = RECOMMENDED
   → Real-time trigger to frontend
   
9. Frontend: Display top 3 providers
   → User selects provider
   → Proceed to booking
```

**Total time:** 65-225 seconds (1-4 minutes)

---

## Files Modified

### Backend
- `apps/api/src/routes/providers.ts` (lines 708-926)
  - Added background recommendation flow
  - Added polling loop
  - Added dual-path recommendation generation

### Kestra Flow (Already Existed)
- `kestra/flows/recommend_providers.yaml`
  - No changes needed
  - Previously orphaned, now properly triggered

### Services
- `apps/api/src/services/vapi/kestra.client.ts` (lines 805-889)
  - Already had `triggerRecommendProvidersFlow()` method
  - No changes needed

- `apps/api/src/services/recommendations/recommend.service.ts`
  - Already had Direct Gemini implementation
  - No changes needed

**Key insight:** The fix was entirely in the routes file - we just connected existing pieces!

---

## Testing Checklist

- [ ] Backend starts without errors
- [ ] Kestra is running and healthy
- [ ] POST /batch-call-async returns 202
- [ ] Providers marked as "queued" in database
- [ ] Status updates to "ANALYZING" after calls complete
- [ ] Backend logs show "Polling provider completion status"
- [ ] Backend logs show "All provider calls completed"
- [ ] Backend logs show "Kestra recommendations generated successfully" OR "Direct Gemini recommendations generated successfully"
- [ ] Status updates to "RECOMMENDED"
- [ ] Frontend receives real-time update and displays recommendations

---

## Debugging Tips

### Request Stuck at ANALYZING
1. Check backend logs for "Polling provider completion status"
2. Query `providers` table: `SELECT id, name, call_status FROM providers WHERE request_id = ?`
3. Look for providers without a final status
4. Check if Kestra callbacks are working: POST `/save-call-result`

### Recommendations Never Generated
1. Check `batchResult.resultsInDatabase` flag in logs
2. If false: Results in response, not database (Direct VAPI path)
3. If true: Check polling loop logs - did it timeout?
4. Check Kestra health: `curl http://localhost:8082/api/v1/configs`

### Kestra Path Failed
1. Look for log: "Kestra recommendation failed, falling back to direct Gemini"
2. Should automatically fallback - check for Direct Gemini logs
3. If both failed: Check GEMINI_API_KEY environment variable
4. Check recommendations array length in response

### Empty Recommendations
1. Check log: "AI analyzed all call results and generated provider recommendations"
2. Query response for `stats.qualifiedProviders` count
3. If 0: All providers disqualified or failed (expected behavior)
4. Check call results for `disqualified: true` or `availability: "unavailable"`

---

## Related Documentation

### Internal Docs
- `CLAUDE.md` - Project overview and architecture
- `docs/BEFORE_AFTER_COMPARISON.md` - UX improvements
- `docs/ENHANCED_LIVE_STATUS.md` - Real-time status updates
- `docs/error_logs.md` - Known issues and fixes

### Kestra Flows
- `kestra/flows/contact_providers.yaml` - Batch calling flow
- `kestra/flows/recommend_providers.yaml` - Recommendation generation
- `kestra/flows/schedule_service.yaml` - Booking flow

### API Documentation
- OpenAPI schemas in route handlers
- Zod validation schemas at top of routes file
- Type definitions in `apps/api/src/services/vapi/types.ts`

---

## Questions?

For detailed analysis of specific code sections, see the full trace document. For visual understanding, see the diagram. For quick reference, see the summary.

All three documents cover the same flow from different perspectives - use the one that matches your learning style!
