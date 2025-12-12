# Recommendation Flow Summary

## The Problem We Solved

**BEFORE:** The `recommend_providers` Kestra flow was never being triggered. Recommendations were never generated automatically.

**ROOT CAUSE:** No code path from "all calls complete" to "trigger recommendation generation". The flow existed but was orphaned.

**SOLUTION:** Added backend-owned recommendation generation in `apps/api/src/routes/providers.ts` lines 708-926.

---

## The Fix: Backend-Owned Recommendation Flow

### Entry Point
```typescript
POST /api/v1/providers/batch-call-async
↓
Returns 202 Accepted immediately
↓
Background processing in setImmediate() [Line 708]
```

### Critical Code Path

```typescript
// Line 713: Execute batch calls
const batchResult = await callingService.callProvidersBatch(requests);

// Line 724: KEY CHECK - Do results live in database?
if (batchResult.resultsInDatabase && serviceRequestId) {
  
  // Line 731: Update status to ANALYZING
  await supabase.update({ status: "ANALYZING" });
  
  // Line 752-918: Poll until all providers complete
  while (!allProvidersComplete && pollAttempts < 15) {
    // Check every 2 seconds if all providers have final status
  }
  
  // Line 805-830: Transform database records to CallResult[]
  const callResults = providers.map(p => ({...}));
  
  // Line 834-844: Try Kestra recommendation flow first
  if (kestraHealthy) {
    const kestraResult = await kestraClient.triggerRecommendProvidersFlow({
      callResults,
      originalCriteria,
      serviceRequestId
    });
  }
  
  // Line 868-881: Fallback to Direct Gemini if Kestra fails
  if (!recommendationSuccess) {
    const directResult = await recommendationService.generateRecommendations({...});
  }
  
  // Line 885: Update status to RECOMMENDED
  if (recommendationSuccess) {
    await supabase.update({ status: "RECOMMENDED" });
  }
}
```

---

## Two Recommendation Paths

### Path A: Kestra Flow (Preferred)
- **File:** `kestra/flows/recommend_providers.yaml`
- **Model:** Gemini 2.5 Flash
- **Method:** POST to `/api/v1/executions/recommend_providers`
- **Polling:** 60 second timeout
- **Output:** Parsed from `recommendations_json` output field

### Path B: Direct Gemini (Fallback)
- **File:** `apps/api/src/services/recommendations/recommend.service.ts`
- **Model:** Gemini 2.5 Flash (same model)
- **Method:** Direct API call via Google GenAI SDK
- **Response:** Immediate (5-10 seconds)
- **Output:** Parsed from JSON response

**Both use identical AI model and prompts** - Path A just orchestrates via Kestra for consistency.

---

## Key Decision Points

### 1. Should we generate recommendations? (Line 724)
```typescript
if (batchResult.resultsInDatabase && serviceRequestId)
```
- **YES:** Results saved to database via Kestra webhooks → proceed
- **NO:** Results returned in response (Direct VAPI) → frontend handles recommendations

### 2. Which recommendation path? (Line 844)
```typescript
if (kestraHealthy)
```
- **YES:** Use Kestra `recommend_providers` flow
- **NO:** Use Direct Gemini API

### 3. Did recommendations generate? (Line 884)
```typescript
if (recommendationSuccess)
```
- **YES:** Update status to `RECOMMENDED`
- **NO:** Keep status as `ANALYZING` for frontend retry

---

## Database Updates

### Providers Table
Updated via webhook from Kestra after each call:
```typescript
POST /api/v1/providers/save-call-result
→ Updates: call_status, call_result, call_transcript, call_summary
→ Triggers: Real-time subscription to frontend
```

### Service Requests Table
Updated by backend flow:
```sql
1. Line 731: status = 'ANALYZING'     -- Calls done, analyzing
2. Line 885: status = 'RECOMMENDED'   -- Top 3 ready
```

### Interaction Logs Table
Three key logs:
```sql
1. "Batch Calls Completed" (Line 739)
2. "Calling [Provider]" per provider (Line 1089, via webhook)
3. "Recommendations Generated" (Line 890)
```

---

## Timeline

```
0:00  → POST /batch-call-async received
0:00  → 202 Accepted returned
0:00  → Background processing starts
0:01  → Kestra batch execution begins
1:00  → All calls complete (60s average)
1:00  → Webhooks save results to database
1:00  → Status updated to ANALYZING
1:00  → Polling detects completion (immediate)
1:00  → Data transformed to CallResult[]
1:01  → Kestra recommendation flow triggered
1:15  → Recommendations generated (15s AI analysis)
1:15  → Status updated to RECOMMENDED
1:15  → Frontend receives real-time update
```

**Total: ~75 seconds** from request to recommendations displayed.

---

## Why This Architecture?

### Benefits
1. **Guaranteed execution** - Backend owns the flow, can't be missed
2. **Real-time updates** - Frontend just subscribes, no polling
3. **Automatic fallback** - Kestra → Direct Gemini if needed
4. **Idempotent** - Safe to retry at any stage
5. **Auditable** - Every step logged to `interaction_logs`

### Trade-offs
1. **Complexity** - More moving parts than direct frontend call
2. **Latency** - Polling adds 0-30s delay (usually <2s)
3. **Coupling** - Backend and Kestra must stay in sync

---

## Testing

### Verify recommendations are generated:

```bash
# 1. Watch backend logs
tail -f apps/api/logs/api.log | grep -i recommend

# 2. Trigger batch call
curl -X POST http://localhost:8000/api/v1/providers/batch-call-async \
  -H "Content-Type: application/json" \
  -d '{"providers":[...],"serviceRequestId":"uuid"}'

# 3. Look for log sequence:
# ✓ "Kestra batch completed with results in database"
# ✓ "Polling provider completion status"
# ✓ "All provider calls completed - generating recommendations"
# ✓ "Kestra recommendations generated successfully"
# ✓ "Status updated to RECOMMENDED"

# 4. Query database
psql -c "SELECT status FROM service_requests WHERE id = 'uuid';"
# Should return: RECOMMENDED
```

### Trace a specific request:
```bash
# Get execution ID from 202 response
executionId="abc-123"

# Grep logs for this execution
grep "$executionId" apps/api/logs/api.log
```

---

## Common Issues

### 1. Recommendations never generated
**Symptom:** Status stuck at `ANALYZING`  
**Cause:** `batchResult.resultsInDatabase` is false  
**Fix:** Ensure Kestra callbacks are working (POST `/save-call-result`)

### 2. Kestra flow fails
**Symptom:** Log shows "Kestra recommendation failed"  
**Cause:** Kestra down or flow error  
**Fix:** Should auto-fallback to Direct Gemini - check logs

### 3. Polling timeout
**Symptom:** "Timed out waiting for all providers to complete"  
**Cause:** Providers not reaching final status within 30s  
**Fix:** Check provider `call_status` in database - may be stuck

### 4. Empty recommendations
**Symptom:** `recommendationSuccess = true` but recommendations.length = 0  
**Cause:** All providers disqualified or failed  
**Fix:** Check `stats.qualifiedProviders` in response - expected behavior

---

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/src/routes/providers.ts` | 655-995 | Main handler + background flow |
| `apps/api/src/services/vapi/kestra.client.ts` | 805-889 | Kestra client `triggerRecommendProvidersFlow()` |
| `kestra/flows/recommend_providers.yaml` | 1-132 | Kestra AI Agent flow |
| `apps/api/src/services/recommendations/recommend.service.ts` | 1-267 | Direct Gemini fallback service |
| `apps/api/src/routes/providers.ts` | 1003-1113 | Webhook handler `/save-call-result` |

---

## Quick Reference

### Environment Variables
```bash
KESTRA_ENABLED=true                    # Enable Kestra recommendation path
KESTRA_LOCAL_URL=http://localhost:8082 # Kestra API endpoint
GEMINI_API_KEY=xxx                     # Gemini AI for recommendations
```

### Status Enum Values
```typescript
PENDING → RESEARCHING → CALLING → ANALYZING → RECOMMENDED → BOOKING → COMPLETED
                                      ↑
                                 Line 731: Backend sets this
                                      ↓
                                 Line 885: Backend sets this
```

### API Endpoints
```
POST /api/v1/providers/batch-call-async       # Entry point
POST /api/v1/providers/save-call-result       # Kestra webhook
POST /api/v1/providers/recommend              # Direct recommendation (unused in this flow)
GET  /api/v1/providers/batch-status/:id       # Polling fallback
```

---

## Related Documentation

- **Full trace:** `docs/RECOMMENDATION_FLOW_TRACE.md` (detailed line-by-line analysis)
- **Flow diagram:** `docs/RECOMMENDATION_FLOW_DIAGRAM.md` (visual flowchart)
- **API docs:** `apps/api/src/routes/providers.ts` (OpenAPI schemas)
- **Kestra flows:** `kestra/flows/` (workflow definitions)
