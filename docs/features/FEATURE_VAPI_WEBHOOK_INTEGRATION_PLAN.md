# VAPI Webhook Integration Plan

**Date**: 2025-01-08
**Author**: AI Agent (Claude)
**Status**: Approved
**Version**: 1.0
**Confidence Level**: 90%

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Architecture Overview](#architecture-overview)
4. [Implementation Components](#implementation-components)
5. [Environment Variables](#environment-variables)
6. [Implementation Details](#implementation-details)
7. [Testing Strategy](#testing-strategy)
8. [Deployment](#deployment)

---

## Executive Summary

Replace VAPI SDK polling (which fails with UUID validation errors) with a webhook-based architecture where VAPI pushes call results to our existing Fastify backend.

**Key Decision**: Use existing Fastify backend for webhook endpoint (NOT create new Express server in script)

**Benefits**:

- Eliminates UUID validation SDK bug
- Works for both Kestra workflows AND direct API calls
- Centralized call result storage
- Environment-based URL configuration (ngrok local, Railway production)

---

## Problem Statement

### Current Issue

The VAPI SDK's `vapi.calls.get(callId)` method fails with:

```
"id must be a valid UUID"
```

Despite the call ID being a valid UUID format, the SDK rejects it during polling.

### Impact

- Cannot retrieve call transcripts and analysis
- Scripts timeout waiting for results
- Kestra workflows fail to get call outcomes

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VAPI WEBHOOK ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   CALL INITIATION                    WEBHOOK DELIVERY                       │
│   ───────────────                    ────────────────                       │
│                                                                             │
│   ┌──────────────┐                   ┌──────────────────────────────────┐  │
│   │ Kestra       │──┐                │ VAPI Cloud                       │  │
│   │ Workflow     │  │                │ (sends end-of-call-report)       │  │
│   └──────────────┘  │                └────────────────┬─────────────────┘  │
│                     │                                 │                     │
│   ┌──────────────┐  │    ┌────────┐                  │                     │
│   │ Direct API   │──┼───▶│ VAPI   │                  │                     │
│   │ Call         │  │    │ API    │                  │                     │
│   └──────────────┘  │    └────────┘                  │                     │
│                     │                                 ▼                     │
│   ┌──────────────┐  │    ┌─────────────────────────────────────────────┐  │
│   │ call-provider│──┘    │ FASTIFY BACKEND (apps/api)                  │  │
│   │ -webhook.js  │       │                                             │  │
│   └──────┬───────┘       │  POST /api/v1/vapi/webhook ◀────────────────┤  │
│          │               │  (receives VAPI events, stores in cache)    │  │
│          │               │                                             │  │
│          │               │  GET /api/v1/vapi/calls/:callId             │  │
│          └──────────────▶│  (script polls this for results)            │  │
│                          └─────────────────────────────────────────────┘  │
│                                                                             │
│   ENVIRONMENTS:                                                             │
│   • Local:  ngrok → http://localhost:8000                                  │
│   • Prod:   https://api-production-8fe4.up.railway.app                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Components

### Files to Create

| File                                      | Purpose                                       |
| ----------------------------------------- | --------------------------------------------- |
| `apps/api/src/routes/vapi-webhook.ts`     | Fastify route for webhook + polling endpoints |
| `apps/api/src/services/vapi-cache.ts`     | In-memory cache service for call results      |
| `kestra/scripts/call-provider-webhook.js` | Modified script that polls our backend        |

### Files to Modify

| File                    | Changes                               |
| ----------------------- | ------------------------------------- |
| `apps/api/src/index.ts` | Register vapi-webhook routes          |
| `.env`                  | Add `VAPI_WEBHOOK_URL`                |
| `apps/api/.env`         | Add `VAPI_WEBHOOK_URL`                |
| `docker-compose.yml`    | Pass `APP_VAPI_WEBHOOK_URL` to Kestra |

---

## Environment Variables

### Root `.env` (for Kestra container)

```bash
# Existing (keep as-is)
GEMINI_API_KEY=<existing>
VAPI_API_KEY=<existing>
VAPI_PHONE_NUMBER_ID=<existing>

# NEW: Webhook URL
# Local development (use ngrok):
VAPI_WEBHOOK_URL=https://YOUR-NGROK-URL.ngrok.io/api/v1/vapi/webhook

# Production (uncomment for prod):
# VAPI_WEBHOOK_URL=https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook
```

### `apps/api/.env` (Backend)

```bash
# Existing vars...

# NEW: Webhook configuration
VAPI_WEBHOOK_URL=https://YOUR-NGROK-URL.ngrok.io/api/v1/vapi/webhook
VAPI_WEBHOOK_SECRET=<optional-secret-for-verification>
```

### `docker-compose.yml` (Add to environment section)

```yaml
environment:
  # Existing...
  APP_VAPI_WEBHOOK_URL: ${VAPI_WEBHOOK_URL}
```

---

## Implementation Details

### 1. Vapi Cache Service (`apps/api/src/services/vapi-cache.ts`)

```typescript
// In-memory cache for call results with 30 minute TTL
// Automatic cleanup every 5 minutes
// Methods: set, get, delete, getStats
```

### 2. Vapi Webhook Routes (`apps/api/src/routes/vapi-webhook.ts`)

**Endpoints**:

- `POST /api/v1/vapi/webhook` - Receive VAPI webhook events
- `GET /api/v1/vapi/calls/:callId` - Poll for call results
- `GET /api/v1/vapi/cache/stats` - Debug endpoint (optional)

**Webhook Payload Handling**:

- `end-of-call-report`: Store full results (transcript, analysis, cost)
- `status-update`: Store intermediate status

### 3. Modified Call Script (`kestra/scripts/call-provider-webhook.js`)

**Key Changes**:

1. Read `VAPI_WEBHOOK_URL` from environment
2. Configure `assistant.serverUrl` to point to our backend
3. Add `serverMessages` array for events to receive
4. Replace VAPI SDK polling with backend API polling
5. Retain all existing fixes (ElevenLabs voice, single-person logic, etc.)

---

## Testing Strategy

### Local Testing

1. Start ngrok: `ngrok http 8000`
2. Update `.env` with ngrok URL
3. Start backend: `pnpm --filter api dev`
4. Run test call with script
5. Verify webhook received in backend logs
6. Verify polling returns results

### Production Testing

1. Deploy backend to Railway
2. Set production webhook URL
3. Run test call
4. Monitor Railway logs for webhook delivery

---

## Deployment

### Local Development Workflow

```bash
# Terminal 1: Start ngrok
ngrok http 8000

# Terminal 2: Update .env and start backend
# Set VAPI_WEBHOOK_URL to ngrok URL
pnpm --filter api dev

# Terminal 3: Run test call
cd kestra/scripts
node call-provider-webhook.js "+1234567890" "plumbing" "..."
```

### Production Deployment

1. Set Railway environment variables:
   - `VAPI_WEBHOOK_URL=https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook`
2. Deploy backend with new routes
3. Update Kestra with production webhook URL

---

## Benefits Over Current Approach

| Aspect           | SDK Polling (Current)  | Webhook + Backend (New) |
| ---------------- | ---------------------- | ----------------------- |
| Reliability      | UUID validation errors | No SDK bugs             |
| Scalability      | Each script polls VAPI | Single webhook endpoint |
| Reusability      | Kestra-specific        | Works for any caller    |
| Data Persistence | Lost if script crashes | Cached 30 min           |
| Debugging        | Hard to trace          | Logs in backend         |

---

## Document Metadata

**Last Updated**: 2025-01-08
**Review Status**: Approved
**Implementation Status**: Not Started
**Related Documents**:

- `/Users/dave/Work/concierge-ai/kestra/scripts/call-provider.js` (current script)
- `/Users/dave/Work/concierge-ai/apps/api/src/routes/` (existing routes)

**Change Log**:

- 2025-01-08 - Initial creation based on multi-agent analysis
