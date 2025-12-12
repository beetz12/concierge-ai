# Recommendation Flow Trace: Complete Code Path

**Background:** Previously, the `recommend_providers` Kestra flow was NEVER triggered. We fixed this by adding backend-owned recommendation generation in `apps/api/src/routes/providers.ts`.

This document traces the EXACT code path from "all calls complete" to "recommendations generated".

---

## High-Level Flow

```
1. Frontend calls POST /api/v1/providers/batch-call-async
2. Backend returns 202 Accepted immediately
3. Background processing starts (setImmediate)
4. Batch calls execute (Kestra or Direct VAPI)
5. Backend detects resultsInDatabase flag
6. Backend polls for all providers to complete
7. Backend triggers recommendation generation (Kestra or Direct Gemini)
8. Backend updates status to RECOMMENDED
9. Real-time subscription notifies frontend
```

---

## Detailed Step-by-Step Trace

### ENTRY POINT: `batch-call-async` Handler

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 655-995

#### 1. Request Received (Lines 655-687)
```typescript
// Line 655: Handler registered
fastify.post("/batch-call-async", ...)

// Line 657: Request validated
const validated = batchCallSchema.parse(request.body);

// Line 660: Execution ID generated
const executionId = crypto.randomUUID();

// Line 674-687: Transform to CallRequest[] format
const requests: CallRequest[] = validated.providers.map(...)
```

#### 2. Immediate Response (Lines 689-706)
```typescript
// Line 689-696: Mark all providers as "queued" (triggers real-time)
await supabase
  .from("providers")
  .update({ call_status: "queued" })
  .in("id", providerIds);

// Line 699-706: Log execution start
await supabase.from("interaction_logs").insert({...});
```

#### 3. Background Processing Starts (Line 708)
```typescript
// Line 708: DO NOT AWAIT - fire and forget
setImmediate(async () => {
  // All recommendation logic happens here
});

// Line 969-978: Return 202 Accepted immediately
return reply.status(202).send({
  success: true,
  data: {
    executionId,
    status: "accepted",
    ...
  }
});
```

---

### BACKGROUND FLOW: Batch Call Execution

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 708-966

#### 4. Call Providers (Lines 710-720)
```typescript
// Line 713: Execute batch calls
const batchResult = await callingService.callProvidersBatch(requests, {
  maxConcurrent: validated.maxConcurrent || 5,
}) as { success: boolean; resultsInDatabase?: boolean; stats?: { completed?: number } };

// Line 717-720: Log completion
fastify.log.info(
  { executionId, success: batchResult.success, resultsInDatabase: batchResult.resultsInDatabase },
  "Background batch call processing completed"
);
```

**What happens in `callProvidersBatch`?**
- Routes to Kestra if `KESTRA_ENABLED=true` AND healthy
- Kestra calls providers via `kestra/flows/contact_providers.yaml`
- Each call result saved via POST `/api/v1/providers/save-call-result` (webhook from Kestra)
- Returns `{ success: true, resultsInDatabase: true }` to indicate results are in DB, not in response

---

### CRITICAL DECISION POINT: `resultsInDatabase` Flag

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 722-728

#### 5. Check for Database Results (Line 724)
```typescript
// Line 724: Key condition - only generate recommendations if results in DB
if (batchResult.resultsInDatabase && validated.serviceRequestId) {
  fastify.log.info(
    { executionId, serviceRequestId: validated.serviceRequestId },
    "Kestra batch completed with results in database - waiting for all provider results"
  );
```

**Why this matters:**
- Kestra returns a summary string, not CallResult[] data
- Actual call results are saved to database via webhook callbacks
- Backend must poll database to confirm all calls complete before recommending

#### 6. Update Status to ANALYZING (Lines 730-744)
```typescript
// Line 731-736: Update service request status
await supabase
  .from("service_requests")
  .update({
    status: "ANALYZING",
  })
  .eq("id", validated.serviceRequestId);

// Line 739-744: Log success
await supabase.from("interaction_logs").insert({
  request_id: validated.serviceRequestId,
  step_name: "Batch Calls Completed",
  detail: `All ${validated.providers.length} provider calls completed via Kestra. Results saved to database.`,
  status: "success",
});
```

---

### POLLING LOOP: Wait for All Providers to Complete

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 746-918

#### 7. Poll for Provider Completion (Lines 746-793)
```typescript
// Line 747: Define final statuses
const finalStatuses = ["completed", "failed", "error", "timeout", "no_answer", "voicemail", "busy"];

// Line 748-750: Initialize polling
let allProvidersComplete = false;
let pollAttempts = 0;
const maxPollAttempts = 15; // 15 attempts * 2 seconds = 30 seconds max

// Line 752: Polling loop
while (!allProvidersComplete && pollAttempts < maxPollAttempts) {
  pollAttempts++;

  // Line 755-758: Fetch all providers for this request
  const { data: providers, error: fetchError } = await supabase
    .from("providers")
    .select("id, call_status, call_result, name, phone")
    .eq("request_id", validated.serviceRequestId);

  // Line 770-773: Count called and completed providers
  const calledProviders = providers.filter(p => p.call_status);
  const completedProviders = providers.filter(p =>
    p.call_status && finalStatuses.includes(p.call_status)
  );

  // Line 786-787: Check if all called providers are complete
  if (calledProviders.length > 0 && completedProviders.length === calledProviders.length) {
    allProvidersComplete = true;
    // Proceed to recommendation generation
  } else {
    // Line 916: Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

---

### TRANSFORM: Prepare Data for Recommendation API

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 797-830

#### 8. Transform Provider Data to CallResult Format (Lines 797-830)
```typescript
// Line 799-803: Fetch service request for context
const { data: serviceRequest } = await supabase
  .from("service_requests")
  .select("title, criteria, location")
  .eq("id", validated.serviceRequestId)
  .single();

// Line 805-830: Transform each provider to CallResult format
const callResults = completedProviders.map(p => {
  const callResultData = p.call_result as any;
  return {
    status: p.call_status,
    callId: callResultData?.callId || "",
    callMethod: "kestra" as const,
    duration: callResultData?.duration || 0,
    endedReason: callResultData?.endedReason || "",
    transcript: callResultData?.transcript || "",
    analysis: callResultData?.analysis || {
      summary: callResultData?.analysis?.summary || "",
      structuredData: callResultData?.structuredData || {},
      successEvaluation: "",
    },
    provider: {
      name: p.name,
      phone: p.phone || "",
      service: serviceRequest?.title || validated.serviceNeeded,
      location: serviceRequest?.location || validated.location,
    },
    request: {
      criteria: serviceRequest?.criteria || validated.userCriteria,
      urgency: validated.urgency,
    },
  };
});
```

---

### RECOMMENDATION GENERATION: Kestra vs Direct Gemini

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 832-906

#### 9. Decision: Kestra or Direct Gemini (Lines 834-844)
```typescript
// Line 834-835: Check if Kestra is enabled and healthy
const kestraEnabled = process.env.KESTRA_ENABLED === "true";
const kestraHealthy = kestraEnabled && await kestraClient.healthCheck();

fastify.log.info(
  { kestraEnabled, kestraHealthy, callResultsCount: callResults.length },
  "Generating recommendations"
);

let recommendationSuccess = false;
```

---

### PATH A: Kestra Recommendation Flow

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 844-864

#### 10a. Trigger Kestra Recommend Flow (Lines 844-864)
```typescript
// Line 844: If Kestra healthy
if (kestraHealthy) {
  // Line 846-850: Trigger recommend_providers flow
  const kestraResult = await kestraClient.triggerRecommendProvidersFlow({
    callResults,
    originalCriteria: serviceRequest?.criteria || validated.userCriteria || "",
    serviceRequestId: validated.serviceRequestId,
  });

  // Line 852: Check if recommendations generated successfully
  if (kestraResult.success && kestraResult.recommendations?.recommendations?.length > 0) {
    recommendationSuccess = true;
    fastify.log.info(
      { executionId: kestraResult.executionId, recommendationCount: kestraResult.recommendations.recommendations.length },
      "Kestra recommendations generated successfully"
    );
  } else {
    // Line 859-862: Kestra failed or returned empty
    fastify.log.warn(
      { error: kestraResult.error },
      "Kestra recommendation failed, falling back to direct Gemini"
    );
    // Falls through to Direct Gemini fallback
  }
}
```

#### Kestra Client Implementation

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/kestra.client.ts`  
**Lines:** 805-889

**10a.1. Trigger Execution (Lines 832-853)**
```typescript
// Line 832-843: Build inputs
const inputs = {
  call_results: request.callResults,  // buildRequestBody handles JSON stringification
  original_criteria: request.originalCriteria || "",
  service_request_id: request.serviceRequestId,
  scoring_weights: request.scoringWeights || {
    availabilityUrgency: 0.30,
    rateCompetitiveness: 0.20,
    allCriteriaMet: 0.25,
    callQuality: 0.15,
    professionalism: 0.10,
  },
};

// Line 846-853: POST to Kestra execution API
const formData = this.buildRequestBody(inputs);
const response = await axios.post(
  `${this.baseUrl}/api/v1/executions/${this.namespace}/recommend_providers`,
  formData,
  { headers: this.buildHeaders(true) }
);
```

**10a.2. Poll for Completion (Line 865)**
```typescript
// Line 865: Poll for completion (60 seconds timeout for AI analysis)
const finalState = await this.pollExecutionWithTimeout(response.data.id, 60000);
```

**10a.3. Parse Response (Lines 867-882)**
```typescript
// Line 869-875: Parse recommendations from workflow output
if (finalState.outputs?.recommendations_json) {
  try {
    recommendations = JSON.parse(finalState.outputs.recommendations_json as string);
  } catch (parseError) {
    this.logger.warn({ parseError }, "Failed to parse recommendations JSON");
  }
}

// Line 877-882: Return result
return {
  success: finalState.state.current === "SUCCESS",
  executionId: response.data.id,
  recommendations,
  error: finalState.state.current !== "SUCCESS" ? `Execution ${finalState.state.current.toLowerCase()}` : undefined,
};
```

#### Kestra Flow Execution

**File:** `/Users/dave/Work/concierge-ai/kestra/flows/recommend_providers.yaml`  
**Lines:** 1-132

**10a.4. Flow Inputs (Lines 5-26)**
```yaml
inputs:
  - id: call_results
    type: JSON
    description: "Array of call results from provider calls"
  - id: original_criteria
    type: STRING
    defaults: ""
  - id: service_request_id
    type: STRING
  - id: scoring_weights
    type: JSON
    defaults: |
      {
        "availabilityUrgency": 0.30,
        "rateCompetitiveness": 0.20,
        "allCriteriaMet": 0.25,
        "callQuality": 0.15,
        "professionalism": 0.10
      }
```

**10a.5. AI Agent Task (Lines 40-107)**
```yaml
- id: analyze_and_recommend
  type: io.kestra.plugin.ai.agent.AIAgent
  description: "Use Gemini AI to analyze call results and recommend top 3 providers"
  provider:
    type: io.kestra.plugin.ai.provider.GoogleGemini
    apiKey: "{{ envs.gemini_api_key }}"
    modelName: gemini-2.5-flash  # <-- AI MODEL USED
  prompt: |
    You are an expert service provider analyst. Your job is to analyze phone call results and recommend the TOP 3 providers based on multiple factors.

    SCORING WEIGHTS:
    {{ inputs.scoring_weights }}

    EVALUATION GUIDELINES:
    - Availability: Immediate > 24hrs > 2 days > Flexible
    - Rate: Consider competitiveness, clarity, reasonableness
    - Criteria: Providers meeting ALL requirements score highest
    - Call Quality: Assess how informative and helpful
    - Professionalism: Evaluate courtesy, clarity, responsiveness

    ORIGINAL CLIENT CRITERIA:
    {{ inputs.original_criteria }}

    CALL RESULTS TO ANALYZE:
    {{ inputs.call_results | json }}

    FILTERING RULES:
    1. EXCLUDE providers where disqualified = true
    2. EXCLUDE providers where availability = "unavailable"
    3. EXCLUDE providers with status = "error", "timeout", "voicemail", or "no_answer"

    Return EXACTLY this JSON structure (no markdown, just raw JSON):
    {
      "recommendations": [...],
      "overallRecommendation": "...",
      "analysisNotes": "...",
      "stats": {...}
    }
```

**10a.6. Flow Outputs (Lines 120-131)**
```yaml
outputs:
  - id: recommendations_json
    type: STRING
    value: "{{ outputs.analyze_and_recommend.textOutput }}"  # <-- PARSED BY KESTRA CLIENT

  - id: service_request_id
    type: STRING
    value: "{{ inputs.service_request_id }}"

  - id: status
    type: STRING
    value: "completed"
```

---

### PATH B: Direct Gemini Recommendation Flow

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 866-881

#### 10b. Direct Gemini Fallback (Lines 866-881)
```typescript
// Line 867: If Kestra unavailable or failed
if (!recommendationSuccess) {
  // Line 868-872: Call Direct Gemini API
  const directResult = await recommendationService.generateRecommendations({
    callResults,
    originalCriteria: serviceRequest?.criteria || validated.userCriteria || "",
    serviceRequestId: validated.serviceRequestId,
  });

  // Line 874-880: Check if recommendations generated
  if (directResult?.recommendations?.length > 0) {
    recommendationSuccess = true;
    fastify.log.info(
      { recommendationCount: directResult.recommendations.length },
      "Direct Gemini recommendations generated successfully"
    );
  }
}
```

#### Direct Gemini Service Implementation

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/services/recommendations/recommend.service.ts`  
**Lines:** 1-267

**10b.1. Service Initialization (Lines 16-26)**
```typescript
export class RecommendationService {
  private ai: GoogleGenAI;
  private model = "gemini-2.5-flash";  // <-- AI MODEL USED

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }
```

**10b.2. Generate Recommendations (Lines 31-71)**
```typescript
async generateRecommendations(
  request: RecommendationRequest,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): Promise<RecommendationResponse> {
  // Line 36: Filter qualified providers
  const qualifiedResults = this.filterQualifiedProviders(request.callResults);

  // Line 39-46: Calculate stats
  const stats = {
    totalCalls: request.callResults.length,
    qualifiedProviders: qualifiedResults.length,
    disqualifiedProviders: request.callResults.filter(
      (r) => r.analysis.structuredData.disqualified
    ).length,
    failedCalls: request.callResults.filter((r) => r.status === "error" || r.status === "timeout").length,
  };

  // Line 49-57: Handle no qualified providers edge case
  if (qualifiedResults.length === 0) {
    return {
      recommendations: [],
      overallRecommendation: "Unfortunately, none of the providers were qualified...",
      analysisNotes: "Consider expanding your search criteria...",
      stats,
    };
  }

  // Line 61-65: Use Gemini to analyze and score
  const aiAnalysis = await this.analyzeWithGemini(
    qualifiedResults,
    request.originalCriteria,
    weights
  );

  // Line 67-70: Return combined result
  return {
    ...aiAnalysis,
    stats,
  };
}
```

**10b.3. AI Analysis (Lines 107-210)**
```typescript
private async analyzeWithGemini(
  qualifiedResults: CallResult[],
  originalCriteria: string,
  weights: ScoringWeights
): Promise<Omit<RecommendationResponse, "stats">> {
  // Line 112-137: System instruction with scoring weights
  const systemInstruction = `You are an expert service provider analyst...`;

  // Line 139-164: Prompt with call results and criteria
  const prompt = `Analyze these call results and recommend the top 3 providers...`;

  // Line 167-174: Call Gemini API
  const response = await this.ai.models.generateContent({
    model: this.model,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });

  // Line 176: Parse JSON response
  const data = JSON.parse(this.cleanJson(response.text || "{}"));

  // Line 179-199: Validate and format recommendations
  const recommendations: ProviderRecommendation[] = (data.recommendations || [])
    .slice(0, 3)
    .map((rec: any) => ({
      providerName: rec.providerName || "Unknown",
      phone: rec.phone || "",
      score: Math.min(100, Math.max(0, rec.score || 0)),
      reasoning: rec.reasoning || "No reasoning provided",
      criteriaMatched: rec.criteriaMatched || [],
      earliestAvailability: rec.earliestAvailability,
      estimatedRate: rec.estimatedRate,
      callQualityScore: Math.min(100, Math.max(0, rec.callQualityScore || 0)),
      professionalismScore: Math.min(100, Math.max(0, rec.professionalismScore || 0)),
    }));

  // Line 201-202: Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  // Line 204-210: Return result
  return {
    recommendations,
    overallRecommendation: data.overallRecommendation || "Unable to provide recommendation",
    analysisNotes: data.analysisNotes || "",
  };
}
```

---

### DATABASE UPDATE: Status to RECOMMENDED

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 883-906

#### 11. Update Status to RECOMMENDED (Lines 883-906)
```typescript
// Line 884: If recommendations were generated (either Kestra or Direct Gemini)
if (recommendationSuccess) {
  // Line 885-888: Update service_requests table
  await supabase
    .from("service_requests")
    .update({ status: "RECOMMENDED" })
    .eq("id", validated.serviceRequestId);

  // Line 890-895: Log success to interaction_logs
  await supabase.from("interaction_logs").insert({
    request_id: validated.serviceRequestId,
    step_name: "Recommendations Generated",
    detail: "AI analyzed all call results and generated provider recommendations.",
    status: "success",
  });

  // Line 897-900: Log final status
  fastify.log.info(
    { executionId, serviceRequestId: validated.serviceRequestId },
    "Status updated to RECOMMENDED"
  );
} else {
  // Line 902-905: Failed to generate recommendations
  fastify.log.warn(
    { executionId },
    "Failed to generate recommendations - keeping status as ANALYZING"
  );
}
```

---

## Data Saved to Database

### 1. Provider Records (`providers` table)
Updated via POST `/api/v1/providers/save-call-result` webhook from Kestra:

**File:** `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`  
**Lines:** 1066-1078

```typescript
await supabase
  .from("providers")
  .update({
    call_status: callResult.status || "completed",
    call_result: callResult,  // <-- Full CallResult object stored as JSONB
    call_transcript: callResult.transcript || "",
    call_summary: callResult.analysis?.summary || "",
    call_duration_minutes: callResult.duration || 0,
    call_id: callResult.callId || null,
    call_method: "kestra",
    called_at: new Date().toISOString(),
  })
  .eq("id", providerId);
```

### 2. Service Request Status (`service_requests` table)
Updated in three stages:

**Stage 1: ANALYZING** (Lines 731-736)
```typescript
await supabase
  .from("service_requests")
  .update({ status: "ANALYZING" })
  .eq("id", validated.serviceRequestId);
```

**Stage 2: RECOMMENDED** (Lines 885-888)
```typescript
await supabase
  .from("service_requests")
  .update({ status: "RECOMMENDED" })
  .eq("id", validated.serviceRequestId);
```

### 3. Interaction Logs (`interaction_logs` table)
Three key logs created:

**Log 1: Batch Calls Completed** (Lines 739-744)
```typescript
await supabase.from("interaction_logs").insert({
  request_id: validated.serviceRequestId,
  step_name: "Batch Calls Completed",
  detail: `All ${validated.providers.length} provider calls completed via Kestra. Results saved to database.`,
  status: "success",
});
```

**Log 2: Individual Call Results** (Lines 1089-1098)
```typescript
await supabase.from("interaction_logs").insert({
  request_id: serviceRequestId,
  step_name: `Calling ${callResult.provider?.name || "Provider"}`,
  status: logStatus,
  detail: callResult.analysis?.summary || `Call ${callResult.status}`,
  transcript: callResult.transcript ? [{ role: "transcript", content: callResult.transcript }] : null,
  call_id: callResult.callId || null,
});
```

**Log 3: Recommendations Generated** (Lines 890-895)
```typescript
await supabase.from("interaction_logs").insert({
  request_id: validated.serviceRequestId,
  step_name: "Recommendations Generated",
  detail: "AI analyzed all call results and generated provider recommendations.",
  status: "success",
});
```

---

## Summary: Complete Execution Path

### When Everything Works (Happy Path)

```
1. POST /batch-call-async (Line 655)
   ↓
2. Return 202 Accepted (Line 969)
   ↓
3. Background: callProvidersBatch() (Line 713)
   → Kestra contact_providers flow
   → Calls saved via webhook to /save-call-result
   → Returns { resultsInDatabase: true }
   ↓
4. Update status: ANALYZING (Line 731)
   ↓
5. Poll for completion (Lines 752-918)
   → Check call_status every 2 seconds
   → Wait for all providers to reach final status
   ↓
6. Transform to CallResult[] (Lines 805-830)
   ↓
7. Generate recommendations (Lines 832-906)
   → Try Kestra first (Line 846)
     • POST /executions/recommend_providers
     • Flow uses Gemini 2.5 Flash
     • Parse recommendations_json output
   → Fallback to Direct Gemini (Line 868)
     • recommendationService.generateRecommendations()
     • Direct Gemini 2.5 Flash API call
   ↓
8. Update status: RECOMMENDED (Line 885)
   ↓
9. Real-time subscription notifies frontend
```

### Key Decision Points

| Line | Decision | Outcome |
|------|----------|---------|
| 724 | `if (batchResult.resultsInDatabase)` | Enter recommendation flow vs skip |
| 844 | `if (kestraHealthy)` | Use Kestra vs Direct Gemini |
| 852 | `if (kestraResult.success && recommendations.length > 0)` | Success vs fallback |
| 884 | `if (recommendationSuccess)` | Update to RECOMMENDED vs keep ANALYZING |

### AI Models Used

Both paths use the same model:
- **Kestra Path:** `gemini-2.5-flash` (Line 46 of recommend_providers.yaml)
- **Direct Gemini Path:** `gemini-2.5-flash` (Line 18 of recommend.service.ts)

---

## Error Handling

**Timeout Scenario** (Lines 920-925)
```typescript
if (!allProvidersComplete) {
  fastify.log.warn(
    { executionId, pollAttempts, serviceRequestId: validated.serviceRequestId },
    "Timed out waiting for all providers to complete - frontend will handle recommendation generation"
  );
}
```

**Recommendation Failure** (Lines 907-913)
```typescript
catch (recError) {
  fastify.log.error(
    { error: recError },
    "Error generating recommendations"
  );
  // Keep status as ANALYZING so frontend can retry
}
```

**Background Processing Failure** (Lines 927-965)
```typescript
catch (error) {
  // Update service request status to FAILED
  await supabase
    .from("service_requests")
    .update({
      status: "FAILED",
      final_outcome: `Failed to complete provider calls: ${errorMessage}`,
    })
    .eq("id", validated.serviceRequestId);
  
  // Mark all queued/in_progress providers as error
  await supabase
    .from("providers")
    .update({ call_status: "error" })
    .in("id", providerIds)
    .in("call_status", ["queued", "in_progress"]);
}
```

---

## Why This Fix Was Needed

**Before the fix:**
- Frontend called POST `/recommend` endpoint manually after all calls completed
- No backend ownership of the recommendation workflow
- Recommendations could be missed if frontend failed to trigger
- No automatic flow from calls → recommendations

**After the fix:**
- Backend automatically detects when calls are complete
- Backend owns the entire flow: calls → poll → recommend → update status
- Frontend just subscribes to real-time updates
- Guarantees recommendations are generated for every successful batch call

---

## Testing the Flow

To verify recommendations are generated:

```bash
# 1. Watch backend logs
tail -f apps/api/logs/api.log

# 2. Trigger batch call
curl -X POST http://localhost:8000/api/v1/providers/batch-call-async \
  -H "Content-Type: application/json" \
  -d '{
    "providers": [...],
    "serviceNeeded": "plumbing",
    "userCriteria": "Licensed, under $100/hr",
    "location": "Greenville SC",
    "serviceRequestId": "uuid-here"
  }'

# 3. Look for these log messages:
# - "Kestra batch completed with results in database"
# - "Polling provider completion status"
# - "All provider calls completed - generating recommendations"
# - "Kestra recommendations generated successfully" OR "Direct Gemini recommendations generated successfully"
# - "Status updated to RECOMMENDED"

# 4. Query database
psql -c "SELECT id, status FROM service_requests WHERE id = 'uuid-here';"
# Should show status = 'RECOMMENDED'
```
