# VAPI Webhook Quick Reference Card

## Endpoints

### Production
```
POST https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook
GET  https://api-production-8fe4.up.railway.app/api/v1/vapi/calls/:callId
```

### Local Development
```
POST http://localhost:8000/api/v1/vapi/webhook
GET  http://localhost:8000/api/v1/vapi/calls/:callId
```

## VAPI Configuration

**Webhook URL:** `https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook`

**Events to Subscribe:** `end-of-call-report`

## Kestra Polling Code

```javascript
const BACKEND_URL = 'https://api-production-8fe4.up.railway.app';

async function pollForResult(callId) {
  const maxAttempts = 60; // 5 minutes
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/vapi/calls/${callId}`);

      if (response.ok) {
        const { data } = await response.json();
        return data; // CallResult
      }

      if (response.status === 404) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      throw new Error(`Unexpected status: ${response.status}`);
    } catch (error) {
      console.error(`Poll attempt ${attempt + 1} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error('Timeout: No result after 5 minutes');
}
```

## Testing Commands

### Send Test Webhook
```bash
curl -X POST http://localhost:8000/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test_123",
        "status": "ended",
        "endedReason": "customer-ended-call",
        "transcript": "Test transcript",
        "metadata": { "providerName": "Test Provider" }
      }
    }
  }'
```

### Retrieve Result
```bash
curl http://localhost:8000/api/v1/vapi/calls/test_123
```

### Check Cache
```bash
curl http://localhost:8000/api/v1/vapi/cache/stats
```

### Delete Result
```bash
curl -X DELETE http://localhost:8000/api/v1/vapi/calls/test_123
```

## Response Formats

### Success (200)
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "callId": "call_123",
    "callMethod": "direct_vapi",
    "duration": 5.5,
    "transcript": "...",
    "analysis": {
      "summary": "...",
      "structuredData": {
        "availability": "available",
        "estimated_rate": "$100/hour",
        "recommended": true
      }
    },
    "cost": 0.45
  }
}
```

### Not Found (404)
```json
{
  "success": false,
  "error": "Call result not found",
  "message": "No cached result found for call ID: call_123"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `apps/api/src/routes/vapi-webhook.ts` | Webhook routes |
| `apps/api/src/services/vapi/webhook-cache.service.ts` | Cache service |
| `apps/api/src/index.ts` | Route registration |

## Configuration

- **Cache TTL:** 30 minutes (default)
- **Cleanup Interval:** 5 minutes
- **Poll Interval:** 5 seconds (recommended)
- **Max Poll Attempts:** 60 (5 minutes total)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Webhook not received | Check VAPI dashboard webhook logs |
| 404 on poll | Keep polling, call may be in progress |
| Cache growing | Check cleanup interval, verify TTL |
| TypeScript errors | Run `pnpm check-types` |

## Monitoring

```bash
# Railway logs
railway logs --project api-production --filter "vapi"

# Key log messages
✅ "VAPI webhook received"
✅ "Call result cached successfully"
✅ "Call result retrieved from cache"
```

## Deployment Checklist

- [ ] Code merged to main
- [ ] Railway deployed
- [ ] VAPI webhook URL configured
- [ ] Kestra script updated
- [ ] End-to-end test passed
- [ ] Production logs verified

## Documentation

- Full Guide: `apps/api/VAPI_WEBHOOK_IMPLEMENTATION.md`
- Migration: `kestra/scripts/POLLING_MIGRATION_GUIDE.md`
- Tests: `apps/api/tests/vapi-webhook.test.md`
- Summary: `VAPI_WEBHOOK_SUMMARY.md`

## Support

Check Swagger docs: https://api-production-8fe4.up.railway.app/docs

Look for "vapi" tag for all webhook endpoints.
