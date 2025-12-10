# Webhook Infrastructure Analysis for DirectVapiClient

## Executive Summary

The project currently has a **complete webhook infrastructure** for receiving VAPI call results, but **DirectVapiClient does not use it**. DirectVapiClient currently polls VAPI's API directly, while Kestra scripts use the webhook flow. This creates two different code paths with different behaviors.

**Key Finding**: Adding webhook support to DirectVapiClient would:
- ✅ Enable automatic database persistence (currently missing)
- ✅ Reduce API polling overhead
- ✅ Improve data enrichment (background fetch of complete transcripts)
- ⚠️ Require environment configuration (webhook URL)
- ⚠️ Add complexity for local development (ngrok requirement)

---

## 1. Current Webhook Flow (Kestra Scripts Only)

### Architecture

```
VAPI Call Created
    |
    | (with serverUrl parameter)
    v
VAPI executes call
    |
    | (on call end)
    v
VAPI sends webhook → POST /api/v1/vapi/webhook
    |
    ├─→ Validate payload (Zod schemas)
    ├─→ Transform to CallResult
    ├─→ Store in WebhookCacheService (dataStatus='partial')
    ├─→ Return 200 OK immediately
    └─→ Trigger background enrichment (async)
            |
            ├─→ Wait 3s, 5s, 8s (retry delays)
            ├─→ Fetch from VAPI REST API
            ├─→ Merge complete data (transcript, analysis)
            ├─→ Update cache (dataStatus='complete')
            └─→ Persist to database via CallResultService
                    |
                    ├─→ Update providers table
                    └─→ Create interaction_logs entry
    
Meanwhile...

Kestra script polls → GET /api/v1/vapi/calls/:callId
    |
    ├─→ Returns 404 until webhook received
    └─→ Returns CallResult when available
```

### File: `/Users/dave/Work/concierge-ai/apps/api/src/routes/vapi-webhook.ts`

**Key Functions**:

1. **POST /api/v1/vapi/webhook** (lines 138-283)
   - Receives webhook from VAPI
   - Validates payload with Zod schemas
   - Transforms to `CallResult` format
   - Stores in cache with `dataStatus='partial'`
   - Returns 200 OK to VAPI immediately (non-blocking)
   - Triggers background enrichment

2. **GET /api/v1/vapi/calls/:callId** (lines 289-361)
   - Kestra scripts poll this endpoint
   - Returns 404 if webhook not received yet
   - Returns CallResult when available

3. **Background Enrichment** (lines 453-547)
   ```typescript
   async function triggerBackgroundEnrichment(callId: string, logger: FastifyBaseLogger)
   ```
   - Waits 3s, 5s, or 8s (gives VAPI time to process)
   - Fetches from VAPI REST API: `GET https://api.vapi.ai/call/${callId}`
   - Checks if data is complete (transcript length > 50, has analysis)
   - Merges enriched data into cache
   - **Calls `persistCallResultToDatabase()`** 

4. **Database Persistence** (lines 631-703)
   ```typescript
   async function persistCallResultToDatabase(
     result: CallResult,
     vapiCall: VAPICallResponse,
     logger: FastifyBaseLogger
   )
   ```
   - Extracts IDs from VAPI metadata: `providerId`, `serviceRequestId`
   - Calls `CallResultService.saveCallResult()`
   - Updates providers table with call results
   - Creates interaction log

**Metadata Extraction**:
The webhook route extracts metadata from VAPI call:
```typescript
const metadata = call.metadata || {};
const providerId = metadata.providerId as string | undefined;
const serviceRequestId = metadata.serviceRequestId as string | undefined;
const providerName = metadata.providerName as string;
const serviceNeeded = metadata.serviceNeeded as string;
const location = metadata.location as string;
const userCriteria = metadata.userCriteria as string;
const urgency = metadata.urgency as string;
```

---

### File: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/webhook-cache.service.ts`

**Purpose**: In-memory cache for webhook results

**Key Features**:
- 30-minute TTL (configurable)
- Automatic cleanup every 5 minutes
- Data status tracking: `partial` → `fetching` → `complete` | `fetch_failed`
- Timestamp tracking: `webhookReceivedAt`, `fetchedAt`

**Methods**:
- `set(callId, result, ttl?)` - Store call result
- `get(callId)` - Retrieve (returns null if expired/missing)
- `updateFetchStatus(callId, status, error?)` - Update enrichment status
- `mergeEnrichedData(callId, enrichedData)` - Merge API data

**Cache Entry Structure**:
```typescript
interface CachedCallResult {
  result: CallResult;
  timestamp: number;      // When cached
  expiresAt: number;      // When expires
}
```

---

### File: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/call-result.service.ts`

**Purpose**: Database persistence for call results

**Key Methods**:

1. **`saveCallResult(result: CallResult, request: CallRequest)`** (lines 46-99)
   - Updates provider record (if `providerId` is valid UUID)
   - Creates interaction log (if `serviceRequestId` is valid UUID)
   - **UUID Validation**: Skips non-UUID IDs (localStorage-only Direct Tasks)
   ```typescript
   if (request.providerId && isValidUuid(request.providerId)) {
     await this.updateProvider(request.providerId, result);
   }
   ```

2. **`updateProvider(providerId, result)`** (lines 104-137)
   - Updates providers table with:
     - `call_status`: "completed" | "voicemail" | "error" | etc.
     - `call_result`: structuredData object
     - `call_transcript`: full transcript
     - `call_summary`: AI summary
     - `call_duration_minutes`: duration
     - `call_cost`: cost
     - `call_method`: "kestra" | "direct_vapi"
     - `call_id`: VAPI call ID
     - `called_at`: timestamp

3. **`createInteractionLog(serviceRequestId, result)`** (lines 142-194)
   - Creates entry in `interaction_logs` table
   - Parses transcript into structured format (speaker + text)
   - Sets `step_name: "provider_call"`
   - Sets `status: "success" | "warning"`

---

### File: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/vapi-api.client.ts`

**Purpose**: REST API client for fetching complete call data from VAPI

**Key Methods**:

1. **`getCall(callId)`** (lines 83-114)
   ```typescript
   GET https://api.vapi.ai/call/${callId}
   ```
   - Returns full `VAPICallResponse` with transcript, analysis, cost

2. **`isDataComplete(call)`** (lines 119-128)
   ```typescript
   const hasTranscript = transcript.length > 50;
   const hasAnalysis = !!(call.analysis?.summary || call.analysis?.structuredData);
   const isEnded = call.status === "ended";
   return isEnded && hasTranscript && hasAnalysis;
   ```

3. **`mergeCallData(existing, apiCall)`** (lines 208-240)
   - Merges webhook data (fast but incomplete) with API data (slow but complete)
   - Prefers longer transcript
   - Merges analysis objects
   - Updates `dataStatus` to `"complete"`

---

## 2. Current DirectVapiClient Flow (NO Webhooks)

### File: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/direct-vapi.client.ts`

**Current Flow**:
```
DirectVapiClient.initiateCall()
    |
    ├─→ Create assistant config
    ├─→ Call VAPI SDK: vapi.calls.create()
    |       |
    |       └─→ NO serverUrl parameter
    |
    ├─→ Poll for completion (every 5s for 5 minutes)
    |       |
    |       └─→ GET via SDK: vapi.calls.get({ id: callId })
    |
    ├─→ Format result into CallResult
    └─→ Return CallResult
            |
            └─→ NO DATABASE PERSISTENCE
```

**Key Methods**:

1. **`initiateCall(request)`** (lines 63-115)
   ```typescript
   // Creates call without webhook URL
   const callResponse = await this.client.calls.create({
     phoneNumberId: this.phoneNumberId,
     customer: { number: request.providerPhone, name: request.providerName },
     assistant: assistantConfig  // NO serverUrl
   });
   
   // Polls for completion
   const completedCall = await this.pollCallCompletion(call.id);
   
   // Returns result (NOT persisted to DB)
   return this.formatCallResult(completedCall, request);
   ```

2. **`pollCallCompletion(callId)`** (lines 142-174)
   - Polls every 5 seconds
   - Max 60 attempts (5 minutes)
   - Checks status: `!["queued", "ringing", "in-progress"].includes(call.status)`
   - Returns when call ends

3. **`formatCallResult(call, request)`** (lines 179-228)
   - Transforms VAPI SDK response to `CallResult`
   - Extracts transcript, analysis, cost
   - **Returns result directly (no DB persistence)**

**Missing**:
- ❌ No `serverUrl` parameter in assistant config
- ❌ No webhook reception
- ❌ No database persistence
- ❌ No background enrichment
- ❌ No retry logic for incomplete data

---

## 3. Database Persistence Gap

### Current State

| Aspect | Kestra Scripts | DirectVapiClient |
|--------|----------------|------------------|
| **Webhook URL** | ✅ Set in assistant config | ❌ Not set |
| **Webhook Reception** | ✅ Via POST /api/v1/vapi/webhook | ❌ None |
| **Cache Storage** | ✅ WebhookCacheService | ❌ None |
| **Background Enrichment** | ✅ Automatic (3s, 5s, 8s delays) | ❌ None |
| **DB Persistence** | ✅ Automatic via webhook flow | ❌ **NONE** |
| **Providers Table Update** | ✅ Yes | ❌ **NO** |
| **Interaction Logs** | ✅ Yes | ❌ **NO** |
| **Data Status Tracking** | ✅ partial → fetching → complete | ❌ None |

### Database Schema Impact

When DirectVapiClient is used, these database fields are **NOT updated**:

**`providers` table**:
- `call_status` - remains NULL
- `call_result` - remains NULL
- `call_transcript` - remains NULL
- `call_summary` - remains NULL
- `call_duration_minutes` - remains NULL
- `call_cost` - remains NULL
- `call_method` - remains NULL
- `call_id` - remains NULL
- `called_at` - remains NULL

**`interaction_logs` table**:
- No entry created for the call

### Why This Matters

1. **Lost Data**: Call results exist only in memory (returned to caller)
2. **No History**: Can't review calls later in the UI
3. **No Analytics**: Can't track call success rates, costs, durations
4. **No Audit Trail**: No record of what was said to providers
5. **Inconsistent State**: Frontend may show "calling..." but DB never updated

---

## 4. What Would Need to Change for Webhook Support

### Option A: Full Webhook Integration (Recommended)

**Changes to DirectVapiClient** (`/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/direct-vapi.client.ts`):

```typescript
// ADD: Inject webhook URL from environment
constructor(private logger: Logger) {
  const apiKey = process.env.VAPI_API_KEY;
  this.phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || "";
  // NEW: Get webhook URL
  this.webhookUrl = process.env.VAPI_WEBHOOK_URL || "";
  
  if (!apiKey || !this.phoneNumberId) {
    throw new Error("VAPI_API_KEY and VAPI_PHONE_NUMBER_ID required");
  }
  
  // NEW: Warn if webhook URL not configured
  if (!this.webhookUrl) {
    this.logger.warn({}, "VAPI_WEBHOOK_URL not set - DB persistence disabled");
  }
  
  this.client = new VapiClient({ token: apiKey });
}

// MODIFY: Add serverUrl to assistant config
async initiateCall(request: CallRequest): Promise<CallResult> {
  const assistantConfig = createAssistantConfig(request, request.customPrompt);
  
  // NEW: Add webhook URL and metadata
  if (this.webhookUrl) {
    assistantConfig.serverUrl = this.webhookUrl;
    assistantConfig.metadata = {
      providerId: request.providerId,
      serviceRequestId: request.serviceRequestId,
      providerName: request.providerName,
      providerPhone: request.providerPhone,
      serviceNeeded: request.serviceNeeded,
      userCriteria: request.userCriteria,
      location: request.location,
      urgency: request.urgency,
    };
  }
  
  this.logger.info(
    {
      provider: request.providerName,
      phone: request.providerPhone,
      service: request.serviceNeeded,
      webhookEnabled: !!this.webhookUrl,
    },
    "Initiating direct VAPI call"
  );
  
  // ... rest of method unchanged
}

// NEW METHOD: Wait for webhook instead of polling VAPI
private async waitForWebhook(callId: string): Promise<CallResult> {
  const maxAttempts = 60; // 5 minutes
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    // Poll our own backend webhook cache
    const response = await fetch(
      `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/v1/vapi/calls/${callId}`
    );
    
    if (response.ok) {
      const { success, data } = await response.json();
      if (success && data) {
        this.logger.info(
          { callId, attempt: attempts + 1 },
          "Webhook result received"
        );
        return data;
      }
    }
    
    // Wait 5 seconds before retry
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
  }
  
  throw new Error(`Webhook timeout after ${maxAttempts * 5} seconds`);
}

// MODIFY: Use webhook waiting instead of VAPI polling
async initiateCall(request: CallRequest): Promise<CallResult> {
  try {
    // Create call...
    const callResponse = await this.client.calls.create({
      phoneNumberId: this.phoneNumberId,
      customer: {
        number: request.providerPhone,
        name: request.providerName,
      },
      assistant: assistantConfig,
    });
    
    const call = this.extractCallFromResponse(callResponse);
    
    this.logger.info({ callId: call.id, status: call.status }, "VAPI call created");
    
    // NEW: Choose waiting strategy
    const completedCall = this.webhookUrl
      ? await this.waitForWebhook(call.id)      // Wait for webhook
      : await this.pollCallCompletion(call.id); // Fallback to polling
    
    return completedCall;
  } catch (error) {
    // ... error handling
  }
}
```

**Environment Variables Required**:

```bash
# .env or Railway/deployment config
VAPI_WEBHOOK_URL=https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook

# For local development with ngrok:
VAPI_WEBHOOK_URL=https://abc123.ngrok.io/api/v1/vapi/webhook
```

**Assistant Config Type Update** (`assistant-config.ts`):

```typescript
export function createAssistantConfig(
  request: CallRequest,
  customPrompt?: GeneratedPrompt
) {
  const config = {
    // ... existing config
  };
  
  // Return type needs to support optional serverUrl and metadata
  return config as AssistantConfig & {
    serverUrl?: string;
    metadata?: Record<string, unknown>;
  };
}
```

---

### Option B: Hybrid Approach (Fallback to Webhook)

Keep current polling but add webhook support as opt-in:

```typescript
async initiateCall(request: CallRequest): Promise<CallResult> {
  const useWebhook = !!this.webhookUrl && request.providerId && request.serviceRequestId;
  
  if (useWebhook) {
    // Use webhook flow (enables DB persistence)
    assistantConfig.serverUrl = this.webhookUrl;
    assistantConfig.metadata = { /* ... */ };
    return await this.waitForWebhook(call.id);
  } else {
    // Use direct polling (no DB persistence)
    return await this.pollCallCompletion(call.id);
  }
}
```

**Benefits**:
- ✅ Backward compatible (no breaking changes)
- ✅ Works without webhook URL configured
- ✅ Enables DB persistence when IDs provided

**Drawbacks**:
- ⚠️ Two code paths to maintain
- ⚠️ Inconsistent behavior depending on config

---

### Option C: Always Use Webhook, Add Manual Persistence Fallback

Keep webhook as primary, but add manual DB persistence for non-webhook cases:

```typescript
async initiateCall(request: CallRequest): Promise<CallResult> {
  // ... create call
  
  let result: CallResult;
  
  if (this.webhookUrl) {
    // Webhook flow (automatic DB persistence)
    result = await this.waitForWebhook(call.id);
  } else {
    // Polling flow
    const completedCall = await this.pollCallCompletion(call.id);
    result = this.formatCallResult(completedCall, request);
    
    // NEW: Manual DB persistence
    if (request.providerId || request.serviceRequestId) {
      await this.persistToDatabase(result, request);
    }
  }
  
  return result;
}

// NEW METHOD
private async persistToDatabase(result: CallResult, request: CallRequest) {
  // Same logic as webhook route's persistCallResultToDatabase()
  const callResultService = new CallResultService(this.logger);
  await callResultService.saveCallResult(result, request);
}
```

**Benefits**:
- ✅ DB persistence works either way
- ✅ Can work locally without ngrok

**Drawbacks**:
- ⚠️ Duplicates persistence logic
- ⚠️ No background enrichment for polling path
- ⚠️ Still two code paths

---

## 5. Configuration Requirements

### Environment Variables

```bash
# Required (already configured)
VAPI_API_KEY=sk-vapi-...
VAPI_PHONE_NUMBER_ID=...

# NEW: Required for webhook support
VAPI_WEBHOOK_URL=https://your-api-domain.com/api/v1/vapi/webhook

# NEW: For local development
BACKEND_URL=http://localhost:8000  # Used by waitForWebhook polling
```

### Production (Railway)

```bash
# Railway environment variables
VAPI_WEBHOOK_URL=https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook
BACKEND_URL=https://api-production-8fe4.up.railway.app
```

✅ **Works immediately** - Railway apps have public URLs

### Local Development

**Problem**: `localhost:8000` is not publicly accessible for VAPI webhooks

**Solutions**:

#### 1. ngrok (Recommended for Testing)

```bash
# Terminal 1: Start backend
pnpm dev

# Terminal 2: Start ngrok
ngrok http 8000

# Output:
# Forwarding: https://abc123.ngrok.io -> http://localhost:8000

# Terminal 3: Set webhook URL
export VAPI_WEBHOOK_URL=https://abc123.ngrok.io/api/v1/vapi/webhook
export BACKEND_URL=http://localhost:8000

# Test call
node kestra/scripts/call-provider.js +15551234567
```

**Pros**:
- ✅ Tests real webhook flow locally
- ✅ Free tier available
- ✅ Easy setup

**Cons**:
- ⚠️ URL changes on restart (paid tier has static URLs)
- ⚠️ Extra process to manage
- ⚠️ Slight latency

#### 2. Skip Webhooks Locally

```typescript
// In DirectVapiClient constructor:
const isProduction = process.env.NODE_ENV === 'production';
this.webhookUrl = isProduction ? process.env.VAPI_WEBHOOK_URL : '';

if (!isProduction) {
  this.logger.info({}, "Local dev: Webhook disabled, using polling");
}
```

**Pros**:
- ✅ Simple local development
- ✅ No ngrok required

**Cons**:
- ⚠️ Different behavior local vs production
- ⚠️ Can't test webhook flow locally

#### 3. Railway Preview Environment

Deploy to Railway preview env for testing:

```bash
# Creates preview deployment with public URL
railway up

# Get webhook URL
railway vars get VAPI_WEBHOOK_URL
```

---

## 6. Comparison: Polling vs Webhook

| Aspect | Direct Polling (Current) | Webhook (Proposed) |
|--------|--------------------------|-------------------|
| **API Calls** | 60+ polls to VAPI | 1 call to create + webhook callback |
| **Latency** | 5s polling interval | Immediate webhook |
| **Complete Data** | May be incomplete early | Background fetch ensures complete |
| **DB Persistence** | ❌ None | ✅ Automatic |
| **Cost** | Higher (many API calls) | Lower (one create + one fetch) |
| **Local Dev** | ✅ Works immediately | ⚠️ Requires ngrok |
| **Production** | ✅ Works | ✅ Better |
| **Code Complexity** | Simpler | More complex (webhook + polling fallback) |
| **Data Enrichment** | None | ✅ Automatic background fetch |
| **Cache** | None | ✅ WebhookCacheService |
| **Reliability** | Polling timeout risk | Webhook + retry logic |

---

## 7. Recommended Implementation Plan

### Phase 1: Add Webhook Support (Backward Compatible)

```typescript
// Option B: Hybrid approach
async initiateCall(request: CallRequest): Promise<CallResult> {
  const enableWebhook = 
    !!this.webhookUrl && 
    (!!request.providerId || !!request.serviceRequestId);
  
  if (enableWebhook) {
    this.logger.info({}, "Using webhook flow (DB persistence enabled)");
    assistantConfig.serverUrl = this.webhookUrl;
    assistantConfig.metadata = { /* IDs and request data */ };
    return await this.waitForWebhook(call.id);
  } else {
    this.logger.info({}, "Using polling flow (no DB persistence)");
    return await this.pollCallCompletion(call.id);
  }
}
```

**Why Hybrid**:
- ✅ Doesn't break existing functionality
- ✅ Enables DB persistence when IDs provided
- ✅ Works locally without configuration
- ✅ Production can opt-in with env var

### Phase 2: Add Manual DB Persistence Fallback

```typescript
// In polling path:
const result = await this.pollCallCompletion(call.id);

if (request.providerId || request.serviceRequestId) {
  await this.persistToDatabase(result, request);
}
```

**Why**:
- ✅ Ensures DB updates even without webhook
- ✅ Useful for local development
- ⚠️ Still no background enrichment (transcript may be incomplete)

### Phase 3: Make Webhook Default in Production

```typescript
// In Railway environment:
VAPI_WEBHOOK_URL=https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook

// DirectVapiClient will automatically use webhooks when URL is set
```

---

## 8. Code References

### Files to Modify

1. **`/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/direct-vapi.client.ts`**
   - Add `webhookUrl` property
   - Add `waitForWebhook()` method
   - Modify `initiateCall()` to conditionally use webhooks
   - Add metadata to assistant config when using webhooks

2. **`/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/assistant-config.ts`**
   - Update return type to support `serverUrl` and `metadata`
   - No logic changes needed (just type annotations)

### Files That Already Work

These files already support DirectVapiClient if webhooks are enabled:

1. **`/Users/dave/Work/concierge-ai/apps/api/src/routes/vapi-webhook.ts`** ✅
   - Already receives webhooks
   - Already extracts metadata
   - Already persists to DB
   - **No changes needed**

2. **`/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/webhook-cache.service.ts`** ✅
   - Already caches results
   - Already tracks data status
   - **No changes needed**

3. **`/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/call-result.service.ts`** ✅
   - Already validates UUIDs
   - Already updates providers table
   - Already creates interaction logs
   - **No changes needed**

4. **`/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/vapi-api.client.ts`** ✅
   - Already fetches enriched data
   - Already merges call data
   - **No changes needed**

### Environment Variables to Add

**Railway (Production)**:
```bash
VAPI_WEBHOOK_URL=https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook
```

**Local (Optional, for testing)**:
```bash
VAPI_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/v1/vapi/webhook
BACKEND_URL=http://localhost:8000
```

---

## 9. Testing Strategy

### Test Case 1: Production with Webhooks

```bash
# Railway environment
VAPI_WEBHOOK_URL=https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook

# Expected:
# 1. DirectVapiClient creates call with serverUrl
# 2. VAPI sends webhook to backend
# 3. Webhook route caches result
# 4. Background enrichment fetches complete data
# 5. Database updated automatically
# 6. DirectVapiClient polls webhook cache
# 7. Returns complete CallResult
```

### Test Case 2: Local without Webhooks

```bash
# Local environment (no VAPI_WEBHOOK_URL)

# Expected:
# 1. DirectVapiClient creates call without serverUrl
# 2. DirectVapiClient polls VAPI directly
# 3. Returns CallResult (no DB persistence)
```

### Test Case 3: Local with ngrok

```bash
# Local with ngrok
export VAPI_WEBHOOK_URL=https://abc123.ngrok.io/api/v1/vapi/webhook

# Expected:
# Same as Test Case 1 (full webhook flow)
```

---

## 10. Risks and Mitigations

### Risk 1: Webhook URL Misconfigured

**Impact**: VAPI sends webhooks to wrong URL, DirectVapiClient times out waiting

**Mitigation**:
- Validate webhook URL format in constructor
- Log webhook URL being used
- Add timeout fallback to polling if webhook fails
- Health check endpoint to verify webhook connectivity

### Risk 2: Webhook Never Arrives

**Impact**: DirectVapiClient waits forever (or until timeout)

**Mitigation**:
- Keep polling timeout (5 minutes)
- Log warning if webhook not received after 1 minute
- Fallback to direct VAPI poll if webhook timeout

### Risk 3: Background Enrichment Fails

**Impact**: Database has partial data (no transcript/analysis)

**Mitigation**:
- Already handled by webhook route (keeps partial data)
- Logs fetch failures
- Sets `dataStatus='fetch_failed'`
- Still usable, just incomplete

### Risk 4: Duplicate Code Paths

**Impact**: Maintenance burden, inconsistent behavior

**Mitigation**:
- Prefer webhook path when possible
- Clear logging of which path is used
- Consider deprecating polling path eventually

---

## Conclusion

The webhook infrastructure is **fully functional and ready to use**. DirectVapiClient only needs:

1. **Add webhook URL to assistant config** (when `VAPI_WEBHOOK_URL` is set)
2. **Add metadata to assistant config** (IDs and request data)
3. **Poll webhook cache** instead of VAPI directly (when webhook URL is set)
4. **Environment variable configuration** (production: automatic, local: optional)

**No changes needed** to existing webhook routes, cache service, or database persistence logic.

**Recommended**: Implement **Option B (Hybrid)** for backward compatibility and gradual rollout.
