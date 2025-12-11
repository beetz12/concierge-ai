# VAPI Webhook Integration - Executive Summary

## Problem Statement

The current `call-provider.js` script polls VAPI's API every 5 seconds for up to 5 minutes, which is:

- **Inefficient**: Wastes resources on repeated API calls
- **Slow**: 5-second delay between status checks
- **Fragile**: Can timeout on longer calls
- **Resource-intensive**: Requires long-running script execution

## Proposed Solution

**Webhook-based architecture with in-memory cache:**

```
┌─────────┐         ┌──────────┐         ┌─────────────┐         ┌──────────┐
│ Kestra  │ Trigger │  VAPI    │ Webhook │  API Server │  Store  │In-Memory │
│Workflow │───────→ │  Call    │───────→ │  /webhooks  │────────→│  Cache   │
└─────────┘         └──────────┘         └─────────────┘         └──────────┘
     │                                                                  ↑
     │                     Poll for results (fast cache)                │
     └──────────────────────────────────────────────────────────────────┘
```

### Benefits

- ✅ **Real-time**: Results available immediately when call ends
- ✅ **Efficient**: No polling of VAPI API
- ✅ **Fast**: In-memory cache lookups (< 10ms)
- ✅ **Simple**: No external dependencies (no database or Redis required)
- ✅ **Scalable**: Handles concurrent calls easily
- ✅ **Smart Disqualification**: AI detects unqualified providers during calls
- ✅ **Conditional Closing**: Different scripts for qualified vs disqualified providers
- ✅ **DRY Architecture**: Single source of truth for assistant configuration
- ✅ **Auto-cleanup**: 30-minute TTL with automatic expiration

**Future Enhancement:**

- Redis for multi-instance scaling and persistence

## Implementation Overview

### 1. Cache Service

**New service**: `WebhookCacheService`

Stores:

- Call results in-memory with 30-minute TTL
- Automatic cleanup every 5 minutes
- Fast lookups (< 10ms)
- Debug statistics endpoint

**Location**: `/apps/api/src/services/vapi/webhook-cache.service.ts`

### 2. API Endpoints

Four new endpoints in `/apps/api/src/routes/vapi-webhook.ts`:

| Method | Path                         | Purpose                             | Status    |
| ------ | ---------------------------- | ----------------------------------- | --------- |
| POST   | `/api/v1/vapi/webhook`       | Receive VAPI webhooks               | ✅ ACTIVE |
| GET    | `/api/v1/vapi/calls/:callId` | Get cached call result (for Kestra) | ✅ ACTIVE |
| GET    | `/api/v1/vapi/cache/stats`   | Get cache statistics (debug)        | ✅ ACTIVE |
| DELETE | `/api/v1/vapi/calls/:callId` | Remove cached result                | ✅ ACTIVE |

### 3. New Files

```
apps/api/src/
├── routes/vapi-webhook.ts           # Webhook + cache endpoints
├── services/vapi/
│   ├── types.ts                     # CallRequest, CallResult types
│   ├── assistant-config.ts          # Base assistant behavior (voice, prompts, schema)
│   ├── webhook-config.ts            # Webhook-enabled config (server URL, metadata)
│   ├── webhook-cache.service.ts     # In-memory cache with TTL
│   ├── direct-vapi.client.ts        # Direct VAPI API client
│   ├── kestra.client.ts             # Kestra workflow integration
│   └── provider-calling.service.ts  # Main orchestrator
└── lib/vapi-signature.ts            # Future: Webhook security
```

### 4. Assistant Configuration

**Configuration Services**: `/apps/api/src/services/vapi/`

| File | Purpose |
|------|---------|
| `assistant-config.ts` | Base assistant behavior (voice, prompts, analysis schema) |
| `webhook-config.ts` | Webhook-enabled config (server URL, metadata, timeout settings) |

**Key Functions**:
- `createAssistantConfig()` - Base assistant behavior
- `createWebhookAssistantConfig()` - Wraps base config with webhook server settings
- `createWebhookMetadata()` - Creates metadata for webhook callbacks

**SDK Compatibility**: VAPI SDK v0.11.0+ deprecated `callParams.serverUrl`. The `webhook-config.ts` module handles this by using `assistant.server.url` instead.

**Key Features:**

- Disqualification detection logic in system prompt
- Conditional closing scripts (qualified vs disqualified)
- Structured data schema with new fields
- Used by both Kestra scripts and Direct VAPI paths

**New Structured Data Fields:**

- `earliest_availability`: Specific date/time (e.g., "Tomorrow at 2pm")
- `disqualified`: Boolean flag for unqualified providers
- `disqualification_reason`: Explanation of disqualification
- `criteria_details`: Per-criterion breakdown
- `technician_name`: Name of specific technician discussed

### 5. Kestra Workflow Changes

**Minimal changes required:**

**Current Approach**: Switch from VAPI API polling to backend cache polling

**Changes:**

- Replace VAPI polling endpoint with backend endpoint
- Poll `GET /api/v1/vapi/calls/:callId` instead of VAPI API
- Same polling logic (5-second interval, max 60 attempts)
- Much faster response (cache vs external API)

**Files:**

- `kestra/scripts/call-provider.js` - Imports `createAssistantConfig()` from compiled TS
- `kestra/scripts/call-provider-webhook.js` - Backend polling implementation

## File Locations

### API Routes

- **Path**: `/Users/dave/Work/concierge-ai/apps/api/src/routes/vapi-webhook.ts`
- **Pattern**: Follows existing routes (`gemini.ts`, `users.ts`, `workflows.ts`)
- **Dependencies**: Fastify, Zod validation, WebhookCacheService
- **Endpoints**: POST webhook, GET result, GET stats, DELETE result

### Service Layer

- **Path**: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/webhook-cache.service.ts`
- **Purpose**: In-memory cache with TTL and automatic cleanup
- **Methods**:
  - `set()` - Store call result with TTL
  - `get()` - Retrieve cached result
  - `has()` - Check if result exists
  - `delete()` - Remove cached result
  - `getStats()` - Get cache statistics
  - `clear()` - Clear all entries

### Assistant Configuration

**Base Configuration**:
- **Path**: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/assistant-config.ts`
- **Purpose**: Base assistant behavior (voice, prompts, analysis schema)
- **Export**: `createAssistantConfig(request: CallRequest)`

**Webhook Configuration**:
- **Path**: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/webhook-config.ts`
- **Purpose**: Webhook-enabled config (server URL, metadata, timeout settings)
- **Exports**: `createWebhookAssistantConfig()`, `createWebhookMetadata()`, `WEBHOOK_SERVER_CONFIG`
- **SDK Fix**: Uses `assistant.server.url` instead of deprecated `callParams.serverUrl`

**Used by**: Kestra scripts (via compiled JS), Direct VAPI client

### Types

- **Path**: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/types.ts`
- **Exports**: `CallRequest`, `CallResult`, structured data interfaces

### Kestra Scripts

- **Path**: `/Users/dave/Work/concierge-ai/kestra/scripts/call-provider.js`
- **Purpose**: Initiates VAPI calls with VAPI SDK polling
- **Imports**: `createAssistantConfig()` from compiled `assistant-config.js`

- **Path**: `/Users/dave/Work/concierge-ai/kestra/scripts/call-provider-webhook.js`
- **Purpose**: Initiates VAPI calls with webhook-based backend polling
- **Imports**: `createWebhookAssistantConfig()` from compiled `webhook-config.js`

### Environment Variables

Existing in `/apps/api/.env`:

```env
VAPI_API_KEY=your_vapi_api_key
VAPI_PHONE_NUMBER_ID=your_phone_number_id
```

No new environment variables required for webhook cache.

## Deployment Steps

### 1. Code Implementation (✅ COMPLETE)

```bash
# Files already created:
# - routes/vapi-webhook.ts
# - services/vapi/webhook-cache.service.ts
# - services/vapi/assistant-config.ts
# - services/vapi/types.ts
# Already registered in apps/api/src/index.ts
pnpm build
```

### 2. Deploy Backend

```bash
# Railway auto-deploys on push
git push origin main
# Production URL: https://api-production-8fe4.up.railway.app
```

### 3. VAPI Configuration

1. Go to VAPI dashboard → Settings → Webhooks
2. Add webhook URL: `https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook`
3. Select events: `end-of-call-report`
4. Save and test

For local testing:

```bash
# Terminal 1: Start backend
cd apps/api && pnpm dev

# Terminal 2: Start ngrok
ngrok http 8000
# Use: https://abc123.ngrok.io/api/v1/vapi/webhook
```

### 4. Kestra Updates

```bash
# Update call-provider.js to poll backend instead of VAPI API
# Change endpoint from VAPI to: https://api-production-8fe4.up.railway.app/api/v1/vapi/calls/{callId}
```

### 5. Testing

```bash
# Test webhook endpoint
curl -X POST https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d @test-webhook-payload.json

# Test retrieval
curl https://api-production-8fe4.up.railway.app/api/v1/vapi/calls/test_call_123

# Check cache stats
curl https://api-production-8fe4.up.railway.app/api/v1/vapi/cache/stats

# Make real VAPI call and verify webhook received
```

## Migration Timeline

**Week 1: Infrastructure**

- Day 1-2: Create database migration and files
- Day 3-4: Test locally with ngrok
- Day 5: Deploy to staging

**Week 2: Integration**

- Day 1-2: Configure VAPI webhooks
- Day 3-4: Update Kestra workflows
- Day 5: End-to-end testing

**Week 3: Production**

- Deploy to production
- Monitor webhook delivery
- Optimize and tune

## Code Structure Patterns

The implementation follows existing patterns in the codebase:

### Route Pattern (like `gemini.ts`)

- Zod schema validation
- Swagger/OpenAPI documentation
- Error handling with appropriate status codes
- Request/reply typing

### Service Pattern (like `gemini.ts` service)

- Pure business logic
- Accepts Supabase client as parameter
- Returns typed results
- Throws errors for service layer to handle

### Plugin Pattern (like `supabase.ts`)

- Decorates Fastify instance
- Available via `request.supabase`
- Handles connection lifecycle

## Security Checklist

- [ ] Webhook signature verification enabled
- [ ] `VAPI_WEBHOOK_SECRET` stored securely
- [ ] Database RLS policies configured
- [ ] Rate limiting on webhook endpoint
- [ ] Raw webhook payload sanitized before storage
- [ ] Error messages don't leak sensitive data

## Testing Checklist

- [ ] Unit tests for `vapi.ts` service functions
- [ ] Integration test for webhook endpoint
- [ ] Test signature verification
- [ ] Test Kestra polling logic
- [ ] End-to-end call flow test
- [ ] Load test webhook endpoint

## Monitoring

Key metrics to track:

1. Webhook delivery success rate
2. Average call duration
3. Calls by status (ended, failed, timeout)
4. Database query performance
5. Failed webhook reasons

## Rollback Plan

If issues arise:

1. Remove webhook URL from VAPI dashboard (stops new webhooks)
2. Revert `call-provider.js` to original polling logic
3. Keep database table (no harm in having extra data)
4. Debug and redeploy fixes

## Questions for Review

1. **VAPI Signature Format**: Confirm VAPI's exact signature algorithm (assumed HMAC-SHA256)
2. **Webhook Events**: Which VAPI events should we store? (Currently: all events, but focused on 'ended' status)
3. **Retention Policy**: How long to keep call results? (Suggest: 90 days with archival)
4. **Kestra Polling**: Option A (immediate return + DB poll) or Option B (keep polling but use DB)?
5. **Service Request Linking**: Should we link `vapi_call_results` to `service_requests` table?

## Next Steps

1. **Review** this design document
2. **Approve** the approach
3. **Create** database migration
4. **Implement** route + service files
5. **Test** locally with sample webhooks
6. **Deploy** to staging environment
7. **Configure** VAPI webhook URL
8. **Update** Kestra workflows
9. **Monitor** and iterate

---

**Full detailed design**: See `VAPI_WEBHOOK_DESIGN.md` in the same directory.
