# Kestra Database Persistence Fix

**Date**: 2025-01-XX
**Status**: Implemented
**Priority**: Critical

## Problem

The Kestra `contact_providers.yaml` workflow was making VAPI calls successfully but not persisting results to the database. This caused:

1. Frontend real-time subscriptions never received updates
2. Provider call results were lost after workflow completion
3. Service request status remained stuck in "pending"

## Root Cause

The inline Node.js script in the Kestra workflow only output JSON to console but had no database integration. The results existed only in Kestra's execution logs, not in Supabase.

## Solution

### 1. Created New API Endpoint

**File**: `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts`

Added `POST /api/v1/providers/save-call-result` endpoint that:
- Accepts `providerId`, `serviceRequestId`, and `callResult` from Kestra
- Uses existing `CallResultService` to save to database
- Updates provider records with call status, transcript, analysis
- Creates interaction logs for audit trail
- Handles UUID validation for database IDs

### 2. Updated Kestra Workflow

**File**: `/Users/dave/Work/concierge-ai/kestra/flows/contact_providers.yaml`

#### Changes Made:

**a) Added Environment Variables** (lines 58-70)
```yaml
env:
  # ... existing vars ...
  BACKEND_URL: "{{ envs.backend_url | default('http://localhost:8000') }}"
```

**b) Added node-fetch Dependency** (line 58)
```yaml
beforeCommands:
  - npm install @vapi-ai/server-sdk node-fetch
```

**c) Enhanced Call Success Handler** (lines 113-147)
- Builds complete `callResult` object with transcript, analysis, provider info
- POSTs to `/api/v1/providers/save-call-result`
- Non-blocking error handling (logs failures but doesn't break workflow)

**d) Enhanced Timeout Handler** (lines 150-182)
- Saves timeout status to database
- Includes provider info for tracking

**e) Enhanced Error Handler** (lines 185-220)
- Catches exceptions and saves error status to database
- Preserves error message in result object

## Data Flow

```
Kestra Workflow (call completes)
  ↓
Build callResult object {status, callId, transcript, analysis, provider}
  ↓
POST http://localhost:8000/api/v1/providers/save-call-result
  ↓
API validates and calls CallResultService.saveCallResult()
  ↓
Supabase: Update providers table + Create interaction_logs entry
  ↓
Real-time subscription triggers frontend update
```

## Benefits

1. **Real-time Updates**: Frontend subscriptions now receive instant updates
2. **Data Persistence**: All call results saved to database, not just logs
3. **Audit Trail**: Complete interaction logs for debugging
4. **Error Resilience**: Database save failures don't break Kestra workflow
5. **Consistency**: Same database logic as direct VAPI calls

## Testing

### Manual Test Steps

1. Start backend: `pnpm --filter api dev`
2. Ensure Kestra is running with `BACKEND_URL` env var set
3. Trigger workflow with test data:
```bash
curl -X POST http://localhost:8080/api/v1/executions/ai_concierge/contact_providers \
  -H "Content-Type: application/json" \
  -d '{
    "providers": [{"name": "Test Plumber", "phone": "+18645551234", "id": "valid-uuid"}],
    "service_needed": "plumbing",
    "user_criteria": "Test criteria",
    "location": "Greenville, SC",
    "service_request_id": "valid-uuid"
  }'
```
4. Verify database updates:
```sql
SELECT id, name, call_status, call_summary FROM providers WHERE id = 'valid-uuid';
SELECT * FROM interaction_logs WHERE request_id = 'valid-uuid' ORDER BY created_at DESC LIMIT 5;
```

### Expected Results

- Provider `call_status` changes from `null` → `queued` → `in_progress` → `completed`
- `call_transcript`, `call_summary`, `call_result` populated
- Interaction log created with call details
- Frontend real-time UI updates automatically

## Environment Variables Required

### Kestra

Add to Kestra namespace secrets or global config:

```yaml
backend_url: "http://localhost:8000"  # or production URL
vapi_api_key: "your-vapi-key"
vapi_phone_number_id: "your-phone-id"
```

### Backend API

Existing `.env` should already have:
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
VAPI_API_KEY=...
```

## Rollback Plan

If issues arise, revert these files:
1. `/Users/dave/Work/concierge-ai/apps/api/src/routes/providers.ts` (remove save-call-result endpoint)
2. `/Users/dave/Work/concierge-ai/kestra/flows/contact_providers.yaml` (revert to console-only logging)

Original behavior: Results only in Kestra logs, no database updates.

## Related Files

- `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/call-result.service.ts` - Database save logic
- `/Users/dave/Work/concierge-ai/apps/api/src/services/vapi/types.ts` - CallResult type definition
- `/Users/dave/Work/concierge-ai/apps/web/app/new/page.tsx` - Frontend real-time subscriptions

## Future Improvements

1. Add retry logic for failed database saves
2. Implement exponential backoff for API calls
3. Add monitoring/alerting for save failures
4. Consider webhook-based updates instead of polling
