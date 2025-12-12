# Real-Time Update Architecture Analysis

**Date:** 2025-01-12  
**System:** AI Concierge - Frontend Update Mechanism  
**Architecture Pattern:** Supabase Real-Time + Polling Fallback (Hybrid)

---

## Executive Summary

The AI Concierge application uses a **hybrid real-time architecture** combining Supabase Postgres real-time subscriptions as the primary mechanism with intelligent polling fallbacks for edge cases. The system is well-architected with database-level deduplication, proper subscription lifecycle management, and multi-layered state synchronization.

**Health Score:** **8.5/10** (Very Good)

**Strengths:**
- Database-first architecture with proper real-time publication
- Atomic deduplication using unique constraints (2025 best practice)
- Proper subscription cleanup preventing memory leaks
- Intelligent polling fallbacks for race conditions
- Hybrid webhook + polling for VAPI calls (31x efficiency gain)

**Areas for Improvement:**
- Multiple state layers (3) create complexity
- JSONB updates may not trigger real-time in all cases
- Retry logic could be more configurable
- No explicit backpressure handling for rapid updates

---

## Architecture Overview

### System Flow

```
Backend Process → Database Update → Supabase Realtime Broadcast → Frontend Subscription → UI Update
                                                    ↓
                                            (Fallback Polling if missed)
```

### State Management Layers

The frontend maintains **three separate state layers**:

1. **Local State** (`localRequest`) - React Context + localStorage
2. **Database State** (`dbRequest`) - Initial fetch from Supabase
3. **Real-Time State** (`realtimeRequest`) - Subscription updates

**Resolution Order:** `realtimeRequest || localRequest || dbRequest`

This tri-layer approach provides resilience but adds complexity.

---

## Real-Time Subscription Setup

### Location
`/apps/web/app/request/[id]/page.tsx` (Lines 494-724)

### Tables Subscribed

| Table | Events | Filter | Purpose |
|-------|--------|--------|---------|
| `service_requests` | `*` (all) | `id=eq.{requestId}` | Status changes, outcome updates |
| `providers` | `UPDATE` | `request_id=eq.{requestId}` | Call status, results, booking confirmation |
| `interaction_logs` | `INSERT` | `request_id=eq.{requestId}` | New call logs, step updates |

### Subscription Code

```typescript
const channel = supabase
  .channel(`request-${id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'service_requests',
    filter: `id=eq.${id}`,
  }, (payload) => {
    // Handle service request updates
    setRealtimeRequest(converted);
    addRequest(converted); // Update context
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'providers',
    filter: `request_id=eq.${id}`,
  }, async (payload) => {
    // Refetch all providers when call results are saved
    // Triggers recommendation generation when complete
    const { data: providers } = await supabase
      .from('providers')
      .select('*')
      .eq('request_id', id);
    
    setRealtimeRequest((prev) => ({
      ...prev,
      providersFound: providers.map(/* transform */)
    }));
    
    checkAndGenerateRecommendations();
  })
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'interaction_logs',
    filter: `request_id=eq.{id}`,
  }, (payload) => {
    // Refetch full request with all relations
    // Includes deduplication logic
  })
  .subscribe();

// Cleanup
return () => {
  supabase.removeChannel(channel);
};
```

### Cleanup Pattern

✅ **Proper:** Uses `removeChannel()` in `useEffect` cleanup function  
✅ **Dependency Array:** Includes `[id, addRequest, checkAndGenerateRecommendations]`  
✅ **No Memory Leaks:** Channel unsubscribes when component unmounts or ID changes

---

## Database Update Flow

### Backend to Database (Multi-Path)

```
Path 1: Direct VAPI Calls (Polling-only)
  DirectVapiClient.initiateCall()
  → Poll VAPI API every 5s (max 5 min)
  → CallResultService.saveCallResult()
  → UPDATE providers SET call_status, call_result, call_transcript
  → INSERT interaction_logs (with deduplication)

Path 2: Direct VAPI + Webhook (Hybrid)
  DirectVapiClient.initiateCall()
  → VAPI webhook fires → Backend webhook handler
  → Poll backend cache every 2s
  → <500ms latency vs 2.5s average
  → CallResultService.saveCallResult() (if cache hits)
  → Fallback to Path 1 if webhook unavailable

Path 3: Kestra Orchestration
  KestraClient.triggerContactProvidersFlow()
  → Kestra calls VAPI via call-provider.js script
  → Kestra HTTP callback to /api/v1/providers/save-call-result
  → Same database updates as Path 1/2

Path 4: Batch Async Endpoint (HTTP 202)
  POST /api/v1/providers/batch-call-async
  → Returns 202 immediately with executionId
  → Background processing with setImmediate()
  → Updates providers.call_status = 'queued' immediately
  → Polls for completion (max 30s)
  → Generates recommendations automatically
  → UPDATE service_requests SET status = 'RECOMMENDED'
```

### Key Database Operations

**Provider Updates** (`/apps/api/src/services/vapi/call-result.service.ts:141-174`)
```typescript
await supabase
  .from('providers')
  .update({
    call_status: result.status,        // Triggers real-time
    call_result: result.analysis.structuredData,
    call_transcript: result.transcript,
    call_summary: result.analysis.summary,
    call_duration_minutes: result.duration,
    call_cost: result.cost,
    call_method: result.callMethod,
    call_id: result.callId,
    called_at: new Date().toISOString(),
  })
  .eq('id', providerId);
```

**Interaction Log Creation** (Lines 181-262)
```typescript
await supabase
  .from('interaction_logs')
  .upsert(insertData, {
    onConflict: 'call_id',
    ignoreDuplicates: true, // Database-level deduplication
  });
```

**Real-Time Publication** (`/supabase/migrations/20250101000000_initial_schema.sql:222-227`)
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE service_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE providers;
ALTER PUBLICATION supabase_realtime ADD TABLE interaction_logs;
```

---

## Polling Fallback Mechanisms

### 1. Recommendation Generation Retry Logic

**Location:** `/apps/web/app/request/[id]/page.tsx:186-373`

**Trigger:** All provider calls complete but frontend hasn't received updates yet

**Strategy:**
- Max 5 retries × 2 seconds = 10 seconds total
- Checks for "final status" providers: `completed`, `failed`, `error`, `timeout`, `no_answer`, `voicemail`, `busy`
- Only counts providers with `call_status` set (test mode support)
- Marks `recommendationsChecked` to prevent duplicate API calls

```typescript
const checkAndGenerateRecommendations = useCallback(async (retryCount = 0) => {
  const MAX_RETRIES = 5;
  
  if (recommendationsChecked || !id || !isValidUuid(id) || !request) return;
  
  const { data: providers } = await supabase
    .from('providers')
    .select('*')
    .eq('request_id', id);
  
  const calledProviders = providers.filter(p => p.call_status);
  const completedProviders = providers.filter(p =>
    p.call_status && finalStatuses.includes(p.call_status)
  );
  
  if (calledProviders.length > 0 && completedProviders.length === calledProviders.length) {
    // Generate recommendations
    setRecommendationsChecked(true);
    // ... API call ...
  } else if (retryCount < MAX_RETRIES) {
    setTimeout(() => checkAndGenerateRecommendations(retryCount + 1), 2000);
  }
}, [id, request, recommendationsChecked]);
```

### 2. Status-Based Polling

**Trigger:** Request status reaches `ANALYZING`, `RECOMMENDED`, or `COMPLETED`

```typescript
useEffect(() => {
  if (
    request &&
    (request.status === RequestStatus.ANALYZING ||
     request.status === RequestStatus.RECOMMENDED ||
     request.status === RequestStatus.COMPLETED) &&
    !recommendationsChecked &&
    !recommendationsLoading
  ) {
    checkAndGenerateRecommendations();
  }
}, [request?.status, recommendationsChecked, recommendationsLoading]);
```

### 3. Fallback Poll Timer

**Timeout:** 5 seconds after status change

```typescript
useEffect(() => {
  if (
    (request?.status === RequestStatus.ANALYZING ||
     request?.status === RequestStatus.RECOMMENDED) &&
    !recommendationsChecked &&
    !recommendationsLoading
  ) {
    const pollTimer = setTimeout(() => {
      console.log('[Recommendations] Fallback poll triggered after 5s');
      checkAndGenerateRecommendations();
    }, 5000);
    return () => clearTimeout(pollTimer);
  }
}, [request?.status, recommendationsChecked, recommendationsLoading]);
```

---

## VAPI Hybrid Webhook System

### Architecture

**Location:** `/apps/api/src/services/vapi/direct-vapi.client.ts:79-180`

**Two Modes:**

1. **Hybrid Mode** (when `VAPI_WEBHOOK_URL` set)
   - Primary: Webhook → Backend cache → Poll cache every 2s
   - Fallback: Direct VAPI polling every 5s
   - Latency: <500ms vs 2.5s average
   - API calls: 31x fewer (webhook succeeds ~95% of time)

2. **Polling-Only Mode** (no webhook URL)
   - Direct VAPI polling every 5s
   - Max timeout: 5 minutes
   - Legacy behavior, still fully supported

### Webhook Detection Logic

```typescript
private async waitForWebhookResult(
  callId: string,
  timeoutMs: number = 300000 // 5 minutes
): Promise<CallResult | null> {
  const MAX_CONSECUTIVE_404S = 30; // 60 seconds of 404s
  let consecutive404Count = 0;
  let hasEverReceivedData = false;
  
  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(
      `${this.backendUrl}/api/v1/vapi/calls/${callId}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (response.ok) {
      const result = await response.json();
      consecutive404Count = 0;
      hasEverReceivedData = true;
      
      if (result.data?.dataStatus === 'complete') {
        return result.data; // Fast path!
      }
    } else if (response.status === 404) {
      consecutive404Count++;
      
      // Early fallback if webhook not working
      if (!hasEverReceivedData && consecutive404Count >= MAX_CONSECUTIVE_404S) {
        this.logger.warn('Webhook unavailable, falling back to VAPI polling');
        return null; // Triggers polling fallback
      }
    }
    
    await sleep(2000); // Poll cache every 2s
  }
  
  return null; // Timeout, use polling fallback
}
```

### Performance Comparison

| Metric | Webhook Mode | Polling-Only Mode |
|--------|--------------|-------------------|
| **Average Latency** | <500ms | ~2.5s |
| **VAPI API Calls** | 1-2 per call | 30-60 per call |
| **Cost Efficiency** | 31x better | Baseline |
| **Database Writes** | 1 (deduped) | 1 (deduped) |
| **Fallback Available** | Yes (polling) | N/A |

---

## Database Schema & Indexes

### Real-Time Enabled Tables

All 4 core tables are published to `supabase_realtime`:
- `users`
- `service_requests`
- `providers`
- `interaction_logs`

### Performance Indexes

```sql
-- Service Requests
CREATE INDEX idx_service_requests_user_id ON service_requests(user_id);
CREATE INDEX idx_service_requests_status ON service_requests(status);
CREATE INDEX idx_service_requests_created_at ON service_requests(created_at DESC);

-- Providers
CREATE INDEX idx_providers_request_id ON providers(request_id);
CREATE INDEX idx_providers_call_status ON providers(call_status);
CREATE INDEX idx_providers_call_id ON providers(call_id);

-- Interaction Logs
CREATE INDEX idx_interaction_logs_request_id ON interaction_logs(request_id);
CREATE INDEX idx_interaction_logs_timestamp ON interaction_logs(timestamp);
CREATE INDEX idx_interaction_logs_call_id ON interaction_logs(call_id) 
  WHERE call_id IS NOT NULL;

-- Unique constraint for deduplication
CREATE UNIQUE INDEX idx_interaction_logs_call_id_unique 
  ON interaction_logs(call_id) 
  WHERE call_id IS NOT NULL;
```

### Deduplication Strategy (2025 Best Practice)

**Problem:** Webhook and polling paths both call `saveCallResult()`, causing duplicate logs

**Solution:** Database-level unique constraint on `call_id`

```typescript
// Application code
const { error } = await supabase
  .from('interaction_logs')
  .upsert(insertData, {
    onConflict: 'call_id',
    ignoreDuplicates: true, // ON CONFLICT DO NOTHING
  });
```

**Benefits:**
- Atomic operation (no race conditions)
- Works across multiple backend instances
- Automatically handles webhook + polling duplicates
- No application-level state needed

---

## Identified Issues & Edge Cases

### 1. JSONB Update Detection

**Issue:** Real-time subscriptions may not fire for nested JSONB field updates

**Location:** `providers.call_result` (JSONB column)

**Impact:** Frontend might miss granular call result updates if only JSONB is modified

**Workaround:** Current code always updates multiple columns including `call_status`, which triggers subscription

**Recommendation:**
```typescript
// Always update a non-JSONB field to ensure real-time fires
await supabase
  .from('providers')
  .update({
    call_result: newData,
    updated_at: new Date().toISOString(), // Force trigger
  });
```

### 2. Multiple State Layers Complexity

**Current:** 3 state layers (`realtimeRequest`, `localRequest`, `dbRequest`)

**Risk:** State synchronization bugs, race conditions between layers

**Example:**
```typescript
const request = realtimeRequest || localRequest || dbRequest;
```

**Recommendation:** Consolidate to 2 layers:
- **Source of Truth:** Database + real-time
- **Cache:** React Context (derived from source)

### 3. Retry Logic Configuration

**Current:** Hardcoded retry values
- Max retries: 5
- Poll interval: 2 seconds
- Timeout: 10 seconds total

**Issue:** Not configurable for different network conditions or deployment environments

**Recommendation:**
```typescript
const RECOMMENDATION_RETRY_CONFIG = {
  maxRetries: parseInt(process.env.NEXT_PUBLIC_RECOMMENDATION_MAX_RETRIES || '5'),
  pollInterval: parseInt(process.env.NEXT_PUBLIC_RECOMMENDATION_POLL_INTERVAL || '2000'),
  timeout: parseInt(process.env.NEXT_PUBLIC_RECOMMENDATION_TIMEOUT || '10000'),
};
```

### 4. Provider Refetch on Update

**Current:** On `providers` UPDATE event, frontend refetches ALL providers

```typescript
.on('postgres_changes', { event: 'UPDATE', table: 'providers' }, async (payload) => {
  const { data: providers } = await supabase
    .from('providers')
    .select('*')
    .eq('request_id', id);
  // ...
})
```

**Issue:** 
- N+1 pattern: If 5 providers update, triggers 5 full table scans
- Race condition: Updates may arrive out of order
- Network overhead: Fetches unchanged providers

**Recommendation:**
```typescript
// Option A: Use payload.new directly
.on('postgres_changes', { event: 'UPDATE', table: 'providers' }, (payload) => {
  setRealtimeRequest((prev) => ({
    ...prev,
    providersFound: prev.providersFound.map(p =>
      p.id === payload.new.id ? transformProvider(payload.new) : p
    )
  }));
});

// Option B: Debounced batch refetch
const debouncedRefetch = debounce(async () => {
  const { data } = await supabase.from('providers').select('*').eq('request_id', id);
  setRealtimeRequest(prev => ({ ...prev, providersFound: data }));
}, 500);
```

### 5. No Backpressure Handling

**Scenario:** 10 providers calling simultaneously → 10 rapid UPDATE events

**Issue:** No rate limiting or throttling for subscription handlers

**Impact:** UI might thrash, multiple re-renders per second

**Recommendation:**
```typescript
import { throttle } from 'lodash';

const throttledProviderUpdate = throttle((providers) => {
  setRealtimeRequest(prev => ({ ...prev, providersFound: providers }));
}, 500, { leading: true, trailing: true });
```

### 6. Subscription Error Handling

**Current:** No explicit error handlers on subscription channel

**Risk:** Silent subscription failures, no reconnection logic

**Recommendation:**
```typescript
const channel = supabase
  .channel(`request-${id}`)
  .on('postgres_changes', /* ... */)
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('✅ Subscribed to real-time updates');
    } else if (status === 'CHANNEL_ERROR') {
      console.error('❌ Subscription error:', err);
      // Retry logic or fallback to polling
    } else if (status === 'TIMED_OUT') {
      console.warn('⏱️ Subscription timeout, retrying...');
    }
  });
```

### 7. UUID Validation Pattern

**Good Practice:** Frontend checks for valid UUIDs before Supabase queries

```typescript
const isValidUuid = (str: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

if (!isValidUuid(id)) {
  setError('Request not found (session-only request may have expired)');
  return;
}
```

**Purpose:** Prevents invalid queries for non-UUID IDs (e.g., `task-xxx` for Direct Tasks)

**Benefit:** Clear error messages, no unnecessary database queries

---

## Performance Characteristics

### Latency Analysis

| Update Type | Path | Latency | Triggers |
|-------------|------|---------|----------|
| **Service Request Status** | Real-time | ~50-200ms | `service_requests` UPDATE |
| **Provider Call Start** | Real-time | ~50-200ms | `providers` UPDATE (call_status='in_progress') |
| **Provider Call Complete** | Real-time + Webhook | <500ms | Webhook → DB → Real-time |
| **Provider Call Complete** | Real-time + Polling | ~2.5s | VAPI poll → DB → Real-time |
| **Interaction Log** | Real-time | ~50-200ms | `interaction_logs` INSERT |
| **Recommendations** | Polling fallback | 0-10s | Frontend polls when status='ANALYZING' |

### Database Query Patterns

**Initial Page Load:**
```sql
-- 3 parallel queries
SELECT * FROM service_requests WHERE id = ?;
SELECT * FROM providers WHERE request_id = ?;
SELECT * FROM interaction_logs WHERE request_id = ? ORDER BY timestamp;
```

**Real-Time Updates:**
```sql
-- Triggered by subscription
SELECT * FROM providers WHERE request_id = ?; -- On provider UPDATE
SELECT * FROM service_requests WHERE id = ?;  -- On logs INSERT
SELECT * FROM providers WHERE request_id = ?;  -- (duplicate)
SELECT * FROM interaction_logs WHERE request_id = ? ORDER BY timestamp;
```

**Optimization Opportunity:** Reduce duplicate provider queries

---

## Comparison to Alternatives

### Current: Supabase Real-Time + Polling

**Pros:**
- Native Postgres integration
- No additional infrastructure
- Scales with database
- Low latency (50-200ms)
- Proper Row-Level Security

**Cons:**
- Limited to database events
- JSONB updates may not propagate
- No custom event filtering
- Requires Supabase dependency

### Alternative 1: Server-Sent Events (SSE)

**Pros:**
- Full control over event format
- Can push arbitrary data
- Works with any backend
- Simpler protocol than WebSocket

**Cons:**
- Requires custom server infrastructure
- One-way communication only
- Connection management complexity
- No native browser reconnection

### Alternative 2: WebSocket

**Pros:**
- Bidirectional communication
- Very low latency (<10ms)
- Full control over protocol
- Can push custom events

**Cons:**
- Requires separate WS server
- Connection state management
- More complex client code
- Scaling challenges (sticky sessions)

### Alternative 3: Short Polling

**Pros:**
- Simple to implement
- No persistent connections
- Works everywhere
- Easy debugging

**Cons:**
- High latency (poll interval)
- Wasted requests (99% empty)
- Server load
- Not real-time

**Verdict:** Current approach (Supabase Real-Time) is optimal for this use case

---

## Recommendations

### Priority 1: High Impact, Low Effort

1. **Add Subscription Error Handlers**
   ```typescript
   .subscribe((status, err) => {
     if (status === 'CHANNEL_ERROR') {
       // Log error, show UI warning, retry
     }
   });
   ```

2. **Use Payload Data Directly** (avoid refetch on every update)
   ```typescript
   setRealtimeRequest(prev => ({
     ...prev,
     providersFound: prev.providersFound.map(p =>
       p.id === payload.new.id ? transform(payload.new) : p
     )
   }));
   ```

3. **Externalize Retry Configuration**
   ```typescript
   const config = {
     maxRetries: process.env.NEXT_PUBLIC_RECOMMENDATION_MAX_RETRIES || 5,
     pollInterval: process.env.NEXT_PUBLIC_RECOMMENDATION_POLL_INTERVAL || 2000,
   };
   ```

### Priority 2: Medium Impact, Medium Effort

4. **Consolidate State Layers**
   - Remove `dbRequest` and `localRequest`
   - Use `realtimeRequest` as single source of truth
   - Persist to localStorage from real-time updates

5. **Add Throttling for Rapid Updates**
   ```typescript
   const throttledUpdate = throttle(updateProviders, 500);
   ```

6. **Implement Backpressure Handling**
   - Debounce batch operations
   - Queue updates during high load
   - Show loading indicator for backpressure

### Priority 3: Low Impact, High Effort

7. **Migration to Server-Sent Events** (if scaling issues arise)
   - Custom event server for non-DB events
   - Hybrid: SSE for custom + Supabase for DB

8. **Add Telemetry for Real-Time Health**
   - Track subscription connect/disconnect
   - Measure latency from DB write to UI update
   - Alert on subscription failures

9. **Connection Health Monitoring**
   ```typescript
   const [connectionHealth, setConnectionHealth] = useState('connected');
   
   useEffect(() => {
     const healthCheck = setInterval(() => {
       // Ping server or check last update timestamp
       if (Date.now() - lastUpdate > 60000) {
         setConnectionHealth('stale');
         // Trigger reconnect or polling fallback
       }
     }, 10000);
     return () => clearInterval(healthCheck);
   }, [lastUpdate]);
   ```

---

## Testing Strategy

### Real-Time Subscription Tests

```typescript
describe('Real-Time Updates', () => {
  it('should update UI when provider call status changes', async () => {
    // 1. Render page with request ID
    // 2. Mock Supabase subscription
    // 3. Emit UPDATE event for provider
    // 4. Assert UI shows new status
  });
  
  it('should refetch providers on JSONB update', async () => {
    // Test that JSONB-only updates trigger refetch
  });
  
  it('should handle subscription errors gracefully', async () => {
    // Mock subscription failure
    // Assert fallback polling kicks in
  });
  
  it('should cleanup subscription on unmount', async () => {
    // Render, unmount, assert removeChannel called
  });
});
```

### Polling Fallback Tests

```typescript
describe('Recommendation Polling', () => {
  it('should retry up to 5 times if calls incomplete', async () => {
    // Mock incomplete providers
    // Assert 5 retries with 2s intervals
  });
  
  it('should generate recommendations when all calls complete', async () => {
    // Mock complete providers
    // Assert API call made only once
  });
  
  it('should respect recommendationsChecked flag', async () => {
    // Assert no duplicate API calls
  });
});
```

### Webhook System Tests

```typescript
describe('VAPI Hybrid Webhook', () => {
  it('should prefer webhook over polling when available', async () => {
    // Mock webhook cache returning complete result
    // Assert no VAPI polling API calls made
  });
  
  it('should fallback to polling if webhook times out', async () => {
    // Mock 30 consecutive 404s
    // Assert switch to VAPI polling
  });
  
  it('should deduplicate call results from webhook + polling', async () => {
    // Trigger both paths
    // Assert only one interaction_log entry (via unique constraint)
  });
});
```

---

## Conclusion

The AI Concierge real-time update mechanism is **well-architected** and follows **2025 best practices**:

✅ **Database-Level Deduplication** - Uses unique constraints instead of app logic  
✅ **Hybrid Webhook System** - 31x efficiency improvement over pure polling  
✅ **Proper Subscription Lifecycle** - No memory leaks  
✅ **Intelligent Fallbacks** - Multiple retry strategies for race conditions  
✅ **Real-Time Publication** - All core tables broadcast changes  
✅ **Performance Indexes** - Optimized for common queries  

The system is **production-ready** with minor improvements recommended:
- Add subscription error handlers (Priority 1)
- Reduce refetch overhead (Priority 1)
- Consolidate state layers (Priority 2)
- Add throttling for rapid updates (Priority 2)

**Overall Assessment:** 8.5/10 - Excellent architecture with room for polish

---

**Analyzed Files:**
- `/apps/web/app/request/[id]/page.tsx` (1191 lines)
- `/apps/web/lib/supabase/client.ts` (22 lines)
- `/apps/web/lib/hooks/useServiceRequests.ts` (111 lines)
- `/apps/api/src/routes/providers.ts` (1772 lines)
- `/apps/api/src/services/vapi/direct-vapi.client.ts` (489 lines)
- `/apps/api/src/services/vapi/call-result.service.ts` (264 lines)
- `/supabase/migrations/20250101000000_initial_schema.sql` (227 lines)
- `/supabase/migrations/20250108000000_add_provider_call_tracking.sql` (20 lines)
- `/supabase/migrations/20250111000000_add_call_id_unique.sql` (24 lines)
- `/supabase/migrations/20250112000002_add_booking_status.sql` (19 lines)

**Total Lines Analyzed:** 4,139 lines across 10 files
