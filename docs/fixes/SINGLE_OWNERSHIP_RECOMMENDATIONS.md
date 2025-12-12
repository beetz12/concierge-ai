# Fix: Single Ownership for Recommendation Generation

## Problem

Both backend AND frontend were triggering recommendation generation, causing race conditions:

1. **Backend** (`apps/api/src/routes/providers.ts` lines 833-906): Automatically generates recommendations when all calls complete
2. **Frontend** (`apps/web/app/request/[id]/page.tsx` lines 186-373): Was ALSO calling `/api/v1/providers/recommend` API

### Race Condition Symptoms
- Duplicate Gemini API calls for the same recommendation request
- Unpredictable timing - whichever triggered first would win
- Potential for inconsistent data if both completed at different times
- Wasted API quota and compute resources

## Solution

**Establish single ownership: Backend ONLY generates, Frontend ONLY displays**

### Backend (No Changes Needed)
The backend already correctly:
1. Waits for all provider calls to complete
2. Polls database until all providers have final status
3. Generates recommendations via Gemini AI
4. Updates service_requests status to "RECOMMENDED"
5. Real-time subscriptions notify frontend

### Frontend Changes

**File:** `apps/web/app/request/[id]/page.tsx`

**Before:**
```typescript
// Frontend called the recommend API
const response = await fetch("/api/v1/providers/recommend", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    callResults,
    originalCriteria: request.criteria || "",
    serviceRequestId: id,
  }),
});
```

**After:**
```typescript
// Frontend ONLY displays recommendations - does NOT call the recommend API
// Wait for backend to generate recommendations (status RECOMMENDED)
if (request.status === RequestStatus.RECOMMENDED || request.status === RequestStatus.COMPLETED) {
  console.log("Request status is RECOMMENDED/COMPLETED - displaying recommendations from database");

  // Build recommendations from provider call results that backend already analyzed
  const qualifiedProviders = completedProviders
    .filter((p) => {
      const callResult = p.call_result as any;
      const structuredData = callResult?.analysis?.structuredData || {};

      // Filter out disqualified, unavailable, and failed calls
      return (
        !structuredData.disqualified &&
        structuredData.availability !== "unavailable" &&
        p.call_status === "completed"
      );
    })
    .map((p) => {
      // Extract data from database records
      const callResult = p.call_result as any;
      const structuredData = callResult?.analysis?.structuredData || {};

      return {
        providerId: p.id,
        providerName: p.name,
        phone: p.phone || "",
        rating: p.rating ?? 0,
        earliestAvailability: structuredData.earliest_availability || "Not specified",
        estimatedRate: structuredData.estimated_rate || "Not specified",
        score: 85,
        reasoning: callResult?.analysis?.summary || "Provider meets criteria and is available",
        criteriaMatched: structuredData.all_criteria_met ? ["All criteria met"] : [],
      };
    })
    .slice(0, 3); // Top 3 providers
}
```

## Key Changes

### 1. Removed API Call
- **Deleted:** `fetch("/api/v1/providers/recommend")`
- **Impact:** No duplicate Gemini API calls

### 2. Wait for Backend Status
- Frontend now waits for `request.status === RequestStatus.RECOMMENDED`
- Backend sets this status when recommendations are ready
- Frontend retries every 2 seconds if status is still ANALYZING

### 3. Display Database Data
- Frontend builds recommendation UI from provider records
- Uses call_result JSONB field for structured data
- Same filtering logic as backend (disqualified, unavailable, failed)

## Flow Diagram

### Before (Race Condition)
```
Calls Complete
    ├─► Backend: Generate Recommendations ─► Update DB ─► Status: RECOMMENDED
    └─► Frontend: Generate Recommendations ─► Update UI ─► (race!)
```

### After (Single Ownership)
```
Calls Complete
    └─► Backend: Generate Recommendations ─► Update DB ─► Status: RECOMMENDED
            └─► Real-time Subscription
                    └─► Frontend: Fetch from DB ─► Display UI
```

## Benefits

1. **No Race Conditions**: Only backend generates recommendations
2. **Consistent Data**: Single source of truth (database)
3. **Efficient**: No duplicate Gemini API calls
4. **Simpler Logic**: Frontend just displays what backend calculated
5. **Real-time Updates**: Supabase subscriptions trigger UI updates

## Testing

To verify the fix:

1. Start a new service request
2. Watch browser console logs:
   - Should see: `"Request status is RECOMMENDED/COMPLETED - displaying recommendations from database"`
   - Should NOT see: `"Calling recommendations API"`
3. Check backend logs - recommendations should only be generated once
4. Verify UI shows top 3 providers correctly

## Files Modified

- `apps/web/app/request/[id]/page.tsx` - Removed API call, added database fetch logic

## Related Documentation

- Backend recommendation flow: `apps/api/src/routes/providers.ts` (lines 833-906)
- Recommendation service: `apps/api/src/services/recommendations/recommend.service.ts`
- Provider persistence pattern: `CLAUDE.md` (Provider Persistence Pattern section)
