# VAPI Webhook Integration - Executive Summary

## Problem Statement

The current `call-provider.js` script polls VAPI's API every 5 seconds for up to 5 minutes, which is:
- **Inefficient**: Wastes resources on repeated API calls
- **Slow**: 5-second delay between status checks
- **Fragile**: Can timeout on longer calls
- **Resource-intensive**: Requires long-running script execution

## Proposed Solution

**Webhook-based architecture with database storage:**

```
┌─────────┐         ┌──────────┐         ┌─────────────┐         ┌─────────┐
│ Kestra  │ Trigger │  VAPI    │ Webhook │  API Server │  Store  │Supabase │
│Workflow │───────→ │  Call    │───────→ │  /webhooks  │────────→│Database │
└─────────┘         └──────────┘         └─────────────┘         └─────────┘
     │                                                                  ↑
     │                        Poll for results                          │
     └──────────────────────────────────────────────────────────────────┘
```

### Benefits
- ✅ **Real-time**: Results available immediately when call ends
- ✅ **Efficient**: No polling of VAPI API
- ✅ **Reliable**: Database persists results across restarts
- ✅ **Auditable**: Complete call history stored
- ✅ **Scalable**: Handles concurrent calls easily

## Implementation Overview

### 1. Database Changes

**New table**: `vapi_call_results`

Stores:
- Call metadata (ID, status, phone numbers)
- Transcript and recording
- AI analysis results
- Provider context
- Raw webhook payload (for debugging)

**Migration file**: `supabase/migrations/20250108000000_add_vapi_call_results.sql`

### 2. API Endpoints

Three new endpoints in `/apps/api/src/routes/vapi.ts`:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/vapi/webhooks/vapi` | Receive VAPI webhooks |
| GET | `/api/v1/vapi/calls/:callId` | Get call result by ID (for Kestra) |
| GET | `/api/v1/vapi/calls/by-phone/:phone` | Get call history |

### 3. New Files

```
apps/api/src/
├── routes/vapi.ts              # Webhook + query endpoints
├── services/vapi.ts            # Database operations
└── lib/vapi-signature.ts       # Webhook security
```

### 4. Kestra Workflow Changes

**Minimal changes required:**

**Option A**: Modify existing `call-provider.js` to return call ID immediately, then add a database polling task to Kestra workflow.

**Option B**: Keep `call-provider.js` as-is initially, but switch from VAPI API polling to database polling (faster, no external API limits).

## File Locations

### Database Migration
- **Path**: `/Users/dave/Work/concierge-ai/supabase/migrations/20250108000000_add_vapi_call_results.sql`
- **Content**: Full SQL schema in design doc

### API Route
- **Path**: `/Users/dave/Work/concierge-ai/apps/api/src/routes/vapi.ts`
- **Pattern**: Follows existing routes (`gemini.ts`, `users.ts`, `workflows.ts`)
- **Dependencies**: Fastify, Zod validation, Supabase plugin

### Service Layer
- **Path**: `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi.ts`
- **Exports**:
  - `storeCallResult()` - Upsert webhook data
  - `getCallResult()` - Retrieve by call ID
  - `getCallResultsByPhone()` - Query by phone number
  - `waitForCallCompletion()` - Polling helper

### Security Library
- **Path**: `/Users/dave/Work/concierge-ai/apps/api/src/lib/vapi-signature.ts`
- **Purpose**: Verify VAPI webhook signatures (HMAC-SHA256)

### Environment Variables
Add to `/apps/api/.env`:
```env
VAPI_WEBHOOK_SECRET=your_webhook_secret
```

## Deployment Steps

### 1. Database Setup
```bash
# Create migration file (see design doc)
supabase db push
```

### 2. Code Implementation
```bash
# Create the 3 new files (routes/vapi.ts, services/vapi.ts, lib/vapi-signature.ts)
# Update apps/api/src/index.ts to register routes
pnpm build
```

### 3. VAPI Configuration
1. Get webhook secret from VAPI dashboard
2. Add to environment variables
3. Set webhook URL in VAPI: `https://your-domain.com/api/v1/vapi/webhooks/vapi`
4. For local testing, use ngrok: `ngrok http 8000`

### 4. Kestra Updates
```yaml
# Option 1: Modify contact_agent.yaml to poll database instead of VAPI API
# Option 2: Add new task after call-provider.js that queries /api/v1/vapi/calls/{callId}
```

### 5. Testing
```bash
# Test webhook endpoint
curl -X POST http://localhost:8000/api/v1/vapi/webhooks/vapi -d @test-webhook.json

# Test retrieval
curl http://localhost:8000/api/v1/vapi/calls/{call-id}

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
