# Recommendation Flow Diagram

## Visual Flow Chart

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND: POST /batch-call-async                 │
│                                                                       │
│  Request: { providers: [], serviceNeeded, criteria, location }      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│               BACKEND: providers.ts Line 655-706                     │
│                                                                       │
│  1. Validate request (Zod)                                           │
│  2. Generate execution ID                                            │
│  3. Mark providers as "queued" in DB → REAL-TIME TRIGGER            │
│  4. Log execution start                                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              HTTP 202 ACCEPTED (Line 969)                            │
│                                                                       │
│  Response: { executionId, status: "accepted", providersQueued: 5 }  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│            BACKGROUND: setImmediate() (Line 708)                     │
│                   [Fire and Forget Pattern]                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│         BATCH CALL EXECUTION (Line 713)                              │
│         callingService.callProvidersBatch()                          │
│                                                                       │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  KESTRA FLOW: contact_providers.yaml                 │           │
│  │  - Concurrent calls to all providers                 │           │
│  │  - Each result saved via webhook:                    │           │
│  │    POST /api/v1/providers/save-call-result           │           │
│  │  - Returns: { resultsInDatabase: true }              │           │
│  └──────────────────────────────────────────────────────┘           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│           CRITICAL CHECK (Line 724)                                  │
│                                                                       │
│  if (batchResult.resultsInDatabase && serviceRequestId) {           │
│     // Results in DB, not in response                               │
│     // Proceed to recommendation generation                         │
│  }                                                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│         UPDATE STATUS: ANALYZING (Line 731)                          │
│                                                                       │
│  UPDATE service_requests                                             │
│  SET status = 'ANALYZING'                                            │
│  WHERE id = serviceRequestId                                         │
│                                                                       │
│  → REAL-TIME TRIGGER: Frontend sees status change                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              POLLING LOOP (Lines 752-918)                            │
│           Wait for all providers to complete                         │
│                                                                       │
│  while (!allComplete && attempts < 15) {                            │
│    // Query database every 2 seconds                                │
│    SELECT id, call_status, call_result                              │
│    FROM providers                                                    │
│    WHERE request_id = serviceRequestId                               │
│                                                                       │
│    if (all in finalStatuses) {                                      │
│      allComplete = true;                                             │
│      break;                                                          │
│    }                                                                 │
│                                                                       │
│    await sleep(2000);                                                │
│  }                                                                   │
│                                                                       │
│  finalStatuses = [completed, failed, error, timeout,                │
│                   no_answer, voicemail, busy]                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│        TRANSFORM DATA (Lines 805-830)                                │
│        Database Providers → CallResult[]                             │
│                                                                       │
│  callResults = providers.map(p => ({                                │
│    status: p.call_status,                                            │
│    callId: p.call_result.callId,                                     │
│    duration: p.call_result.duration,                                 │
│    transcript: p.call_result.transcript,                             │
│    analysis: p.call_result.analysis,                                 │
│    provider: { name: p.name, phone: p.phone },                      │
│    request: { criteria, urgency }                                    │
│  }))                                                                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│         DECISION POINT (Lines 834-844)                               │
│                                                                       │
│  kestraHealthy = await kestraClient.healthCheck()                   │
│                                                                       │
│  if (kestraHealthy) {                                                │
│    → PATH A: Kestra Recommendation Flow                             │
│  } else {                                                            │
│    → PATH B: Direct Gemini Fallback                                 │
│  }                                                                   │
└────────────┬───────────────────────────────────┬────────────────────┘
             │                                   │
             ▼ PATH A                            ▼ PATH B
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  KESTRA RECOMMENDATION FLOW     │  │  DIRECT GEMINI FALLBACK         │
│  (Lines 846-864)                │  │  (Lines 868-881)                │
│                                 │  │                                 │
│  kestraClient.                  │  │  recommendationService.         │
│    triggerRecommendProvidersFlow│  │    generateRecommendations()    │
│                                 │  │                                 │
│  ┌───────────────────────────┐ │  │  ┌───────────────────────────┐ │
│  │ POST /executions/         │ │  │  │ Direct Gemini API Call    │ │
│  │   recommend_providers     │ │  │  │                           │ │
│  │                           │ │  │  │ Model: gemini-2.5-flash   │ │
│  │ Inputs:                   │ │  │  │                           │ │
│  │ - call_results (JSON)     │ │  │  │ generateContent({         │ │
│  │ - original_criteria       │ │  │  │   model: gemini-2.5-flash │ │
│  │ - service_request_id      │ │  │  │   contents: prompt,       │ │
│  │ - scoring_weights         │ │  │  │   config: {               │ │
│  │                           │ │  │  │     systemInstruction,    │ │
│  └───────────┬───────────────┘ │  │  │     responseMimeType: json│ │
│              │                  │  │  │   }                       │ │
│              ▼                  │  │  │ })                        │ │
│  ┌───────────────────────────┐ │  │  │                           │ │
│  │ KESTRA FLOW EXECUTION     │ │  │  │ Parse JSON response       │ │
│  │ recommend_providers.yaml  │ │  │  └───────────┬───────────────┘ │
│  │                           │ │  │              │                  │
│  │ Task: analyze_and_recommend│ │  │             ▼                  │
│  │ Type: AIAgent              │ │  │  ┌───────────────────────────┐ │
│  │ Provider: GoogleGemini     │ │  │  │ Return:                   │ │
│  │ Model: gemini-2.5-flash    │ │  │  │ {                         │ │
│  │                           │ │  │  │   recommendations: [       │ │
│  │ Prompt:                   │ │  │  │     {                      │ │
│  │ - Scoring weights         │ │  │  │       providerName,        │ │
│  │ - Evaluation guidelines   │ │  │  │       score,               │ │
│  │ - Original criteria       │ │  │  │       reasoning,           │ │
│  │ - Call results JSON       │ │  │  │       ...                  │ │
│  │ - Filtering rules         │ │  │  │     }                      │ │
│  │                           │ │  │  │   ],                       │ │
│  │ Output: recommendations_json│ │ │  │   overallRecommendation,  │ │
│  └───────────┬───────────────┘ │  │  │   analysisNotes,           │ │
│              │                  │  │  │   stats                    │ │
│              ▼                  │  │  │ }                          │ │
│  ┌───────────────────────────┐ │  │  └───────────────────────────┘ │
│  │ POLL FOR COMPLETION       │ │  │                                 │
│  │ (60 second timeout)       │ │  └─────────────────────────────────┘
│  │                           │ │                   │
│  │ Status: SUCCESS           │ │                   │
│  │ Parse: recommendations_json│ │                  │
│  └───────────┬───────────────┘ │                   │
│              │                  │                   │
│              ▼                  │                   │
│  ┌───────────────────────────┐ │                   │
│  │ Return:                   │ │                   │
│  │ {                         │ │                   │
│  │   success: true,          │ │                   │
│  │   executionId,            │ │                   │
│  │   recommendations         │ │                   │
│  │ }                         │ │                   │
│  └───────────────────────────┘ │                   │
└─────────────┬───────────────────┘                   │
              │                                       │
              └───────────────┬───────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│         CHECK RECOMMENDATION SUCCESS (Line 884)                      │
│                                                                       │
│  if (recommendationSuccess) {                                        │
│    // Either Kestra or Direct Gemini succeeded                      │
│    // Proceed to update status                                      │
│  } else {                                                            │
│    // Both paths failed                                             │
│    // Keep status as ANALYZING for frontend retry                   │
│  }                                                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│         UPDATE STATUS: RECOMMENDED (Line 885)                        │
│                                                                       │
│  UPDATE service_requests                                             │
│  SET status = 'RECOMMENDED'                                          │
│  WHERE id = serviceRequestId                                         │
│                                                                       │
│  → REAL-TIME TRIGGER: Frontend shows recommendations                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│         LOG SUCCESS (Line 890)                                       │
│                                                                       │
│  INSERT INTO interaction_logs                                        │
│  VALUES (                                                            │
│    request_id,                                                       │
│    step_name: "Recommendations Generated",                           │
│    detail: "AI analyzed all call results...",                        │
│    status: "success"                                                 │
│  )                                                                   │
│                                                                       │
│  → REAL-TIME TRIGGER: Frontend logs UI updates                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Key State Transitions

```
┌──────────────┐
│   PENDING    │  Initial state when request created
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  RESEARCHING │  Finding providers via Google Maps
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   CALLING    │  Batch calls initiated (providers marked "queued")
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  ANALYZING   │  ← Line 731: All calls complete, waiting to recommend
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ RECOMMENDED  │  ← Line 885: AI generated top 3 recommendations
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   BOOKING    │  User selected provider, making booking call
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  COMPLETED   │  Appointment confirmed
└──────────────┘
```

## Database Tables Updated

### 1. `providers` Table
Updated via webhook: POST `/api/v1/providers/save-call-result`

```sql
UPDATE providers
SET 
  call_status = 'completed',          -- or 'failed', 'timeout', etc.
  call_result = {...},                -- Full CallResult JSONB
  call_transcript = '...',            -- Full conversation
  call_summary = '...',               -- AI summary
  call_duration_minutes = 5.2,        -- Call length
  call_id = 'vapi-xxx',               -- VAPI call ID
  call_method = 'kestra',             -- Execution method
  called_at = NOW()                   -- Timestamp
WHERE id = provider_id;
```

### 2. `service_requests` Table
Updated in background flow:

```sql
-- Step 1: Line 731
UPDATE service_requests
SET status = 'ANALYZING'
WHERE id = service_request_id;

-- Step 2: Line 885
UPDATE service_requests
SET status = 'RECOMMENDED'
WHERE id = service_request_id;
```

### 3. `interaction_logs` Table
Three key logs created:

```sql
-- Log 1: Line 739
INSERT INTO interaction_logs
VALUES ('Batch Calls Completed', 'All 5 provider calls completed...', 'success');

-- Log 2: Line 1089 (per provider, via webhook)
INSERT INTO interaction_logs
VALUES ('Calling ABC Plumbing', 'Available tomorrow, $85/hr', 'success');

-- Log 3: Line 890
INSERT INTO interaction_logs
VALUES ('Recommendations Generated', 'AI analyzed all call results...', 'success');
```

## Real-Time Triggers

Frontend subscribes to changes on these tables:

1. **`providers` table** - Shows individual call progress
   - `call_status: "queued"` → Show "Waiting..."
   - `call_status: "in_progress"` → Show "Calling..."
   - `call_status: "completed"` → Show result summary

2. **`service_requests` table** - Shows overall workflow state
   - `status: "CALLING"` → Show progress bar
   - `status: "ANALYZING"` → Show "Analyzing results..."
   - `status: "RECOMMENDED"` → Show top 3 recommendations

3. **`interaction_logs` table** - Shows step-by-step activity feed
   - New logs appear in chronological order
   - Color-coded by status (success/warning/error)

## Timing Analysis

Typical execution times:

```
Operation                          Duration    Cumulative
────────────────────────────────────────────────────────
1. POST /batch-call-async          ~50ms      0.05s
2. Return 202 Accepted             instant    0.05s
3. Mark providers as queued        ~100ms     0.15s
4. Kestra batch call execution     60-180s    60-180s
   - Single call duration:         30-60s
   - Concurrent (max 5):           ~60s
5. Webhook save call results       ~100ms     (concurrent)
6. Update status: ANALYZING        ~100ms     60-180s
7. Poll for completion             0-30s      60-210s
   - Check every 2 seconds
   - Usually completes immediately
8. Transform data                  ~10ms      60-210s
9. Kestra health check             ~100ms     60-210s
10. Generate recommendations       5-15s      65-225s
    - Kestra flow: 10-15s
    - Direct Gemini: 5-10s
11. Update status: RECOMMENDED     ~100ms     65-225s
12. Real-time notification         ~50ms      65-225s

TOTAL: 65-225 seconds (1-4 minutes)
```

## Error Recovery

Each stage has error handling:

| Stage | Failure | Recovery |
|-------|---------|----------|
| Batch calls | Kestra down | Fallback to Direct VAPI |
| Individual call | Provider timeout | Mark as `timeout`, continue with others |
| Polling | 30s timeout | Frontend can retry recommendation |
| Kestra recommendation | Flow fails | Fallback to Direct Gemini |
| Direct Gemini | API error | Keep status `ANALYZING`, log error |
| Database update | Constraint error | Log error, keep previous status |

## Frontend Integration

Frontend doesn't need to poll - just subscribe:

```typescript
// Subscribe to service request status changes
const subscription = supabase
  .channel('service_requests')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'service_requests',
    filter: `id=eq.${requestId}`
  }, (payload) => {
    if (payload.new.status === 'RECOMMENDED') {
      // Fetch and display recommendations
      showRecommendations();
    }
  })
  .subscribe();
```

No manual API calls needed - everything is push-based!
