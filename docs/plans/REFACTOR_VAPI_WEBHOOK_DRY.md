# VAPI Webhook Configuration DRY Refactoring

**Date**: 2025-12-09
**Author**: Claude AI
**Status**: Complete
**Type**: Refactor

## Table of Contents
- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Solution Architecture](#solution-architecture)
- [Implementation Plan](#implementation-plan)
- [Files to Create/Modify](#files-to-createmodify)
- [Testing Strategy](#testing-strategy)

---

## Executive Summary

Create a shared `webhook-config.ts` service following the existing `assistant-config.ts` pattern to:
1. **Fix the `serverUrl` bug** - VAPI SDK requires `assistant.server.url`, not `callParams.serverUrl`
2. **Eliminate DRY violation** - Both DirectVapiClient and Kestra scripts share the same webhook config
3. **Maintain single source of truth** - TypeScript source compiles to JS for Kestra consumption

---

## Problem Statement

### Issue 1: API Rejection
```
"property serverUrl should not exist"
```
VAPI SDK v0.11.0 rejects `serverUrl` at call level. Must use `assistant.server.url`.

### Issue 2: Code Duplication
| Location | Webhook Config |
|----------|----------------|
| `direct-vapi.client.ts:107-123` | Inline `serverUrl` + metadata |
| `call-provider-webhook.js:104-111` | `server.url` + `serverMessages` |

Both define webhook configuration separately, violating DRY.

### Issue 3: Inconsistent Patterns
- DirectVapiClient: `callParams.serverUrl = url` (WRONG)
- Kestra script: `assistant.server.url = url` (CORRECT)

---

## Solution Architecture

### Single Source of Truth Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOURCE OF TRUTH                              │
│  apps/api/src/services/vapi/webhook-config.ts                   │
│  ├── createWebhookAssistantConfig(request, webhookUrl)          │
│  ├── createWebhookMetadata(request)                             │
│  └── WEBHOOK_SERVER_CONFIG (timeout, messages)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    pnpm build (TypeScript → JS)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COMPILED OUTPUT                              │
│  apps/api/dist/services/vapi/webhook-config.js                  │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐           ┌─────────────────────────────┐
│  DirectVapiClient   │           │  Kestra Scripts             │
│  (TypeScript)       │           │  (JavaScript)               │
│  imports from src/  │           │  imports from dist/         │
└─────────────────────┘           └─────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Create Shared Webhook Config

**File**: `apps/api/src/services/vapi/webhook-config.ts`

```typescript
/**
 * VAPI Webhook Configuration
 * Single source of truth for webhook settings
 * Used by: DirectVapiClient (TypeScript) + Kestra scripts (JavaScript)
 */
import { createAssistantConfig } from "./assistant-config.js";
import type { CallRequest } from "./types.js";

// Webhook server configuration constants
export const WEBHOOK_SERVER_CONFIG = {
  timeoutSeconds: 20,
  serverMessages: ["status-update", "end-of-call-report"] as const,
};

// Build metadata for webhook callbacks
export function createWebhookMetadata(request: CallRequest) {
  return {
    serviceRequestId: request.serviceRequestId || "",
    providerId: request.providerId || "",
    providerName: request.providerName,
    providerPhone: request.providerPhone,
    serviceNeeded: request.serviceNeeded,
    userCriteria: request.userCriteria,
    location: request.location,
    urgency: request.urgency,
  };
}

// Create assistant config WITH webhook server config merged in
export function createWebhookAssistantConfig(
  request: CallRequest,
  webhookUrl: string,
  customPrompt?: CallRequest["customPrompt"]
) {
  const baseConfig = createAssistantConfig(request, customPrompt);

  return {
    ...baseConfig,
    server: {
      url: webhookUrl,
      timeoutSeconds: WEBHOOK_SERVER_CONFIG.timeoutSeconds,
    },
    serverMessages: WEBHOOK_SERVER_CONFIG.serverMessages,
  };
}
```

### Phase 2: Update DirectVapiClient

**File**: `apps/api/src/services/vapi/direct-vapi.client.ts`

```typescript
// BEFORE (broken):
if (this.webhookUrl) {
  callParams.serverUrl = this.webhookUrl;  // ❌ REJECTED
  callParams.metadata = { /* inline */ };
}

// AFTER (using shared config):
import {
  createWebhookAssistantConfig,
  createWebhookMetadata
} from "./webhook-config.js";

if (this.webhookUrl) {
  // Replace assistant with webhook-enabled version
  callParams.assistant = createWebhookAssistantConfig(
    request,
    this.webhookUrl,
    request.customPrompt
  );
  callParams.metadata = createWebhookMetadata(request);
}
```

### Phase 3: Update Kestra Webhook Script

**File**: `kestra/scripts/call-provider-webhook.js`

```javascript
// BEFORE: Inline webhook config
const { createAssistantConfig } = await import(
  '../../apps/api/dist/services/vapi/assistant-config.js'
);
// ... manual server config ...

// AFTER: Use shared config
const {
  createWebhookAssistantConfig,
  createWebhookMetadata
} = await import(
  '../../apps/api/dist/services/vapi/webhook-config.js'
);

const assistantConfig = createWebhookAssistantConfig(request, webhookUrl);
const metadata = createWebhookMetadata(request);
```

### Phase 4: Update Exports

**File**: `apps/api/src/services/vapi/index.ts`

Add exports for new webhook config functions.

---

## Files to Create/Modify

### NEW FILES
| File | Purpose |
|------|---------|
| `apps/api/src/services/vapi/webhook-config.ts` | Shared webhook configuration |

### MODIFIED FILES
| File | Changes |
|------|---------|
| `apps/api/src/services/vapi/direct-vapi.client.ts` | Use `createWebhookAssistantConfig()` |
| `apps/api/src/services/vapi/index.ts` | Export webhook config functions |
| `kestra/scripts/call-provider-webhook.js` | Import from compiled webhook-config.js |

---

## Testing Strategy

### Unit Tests
1. `createWebhookMetadata()` returns correct structure
2. `createWebhookAssistantConfig()` merges server config correctly
3. `WEBHOOK_SERVER_CONFIG` contains expected values

### Integration Tests
1. DirectVapiClient with webhook URL creates valid VAPI call
2. Kestra script imports compiled webhook-config.js successfully
3. End-to-end call with webhook configuration succeeds

### Manual Verification
1. Run `pnpm build` - TypeScript compiles without errors
2. Run `pnpm check-types` - No type errors
3. Call POST `/api/v1/providers/call` - No `serverUrl` rejection
4. Verify webhook callbacks received at backend

---

## Quality Gates

- [x] TypeScript compilation passes (`pnpm build`)
- [x] Type checking passes (`pnpm check-types`)
- [x] No `serverUrl` property in VAPI call params
- [x] Webhook URL in `assistant.server.url` structure
- [x] Kestra script imports from compiled output
- [x] Both clients use identical webhook configuration

---

## Document Metadata

**Last Updated**: 2025-12-09
**Implementation Status**: Complete
**Related Documents**:
- [VAPI Webhook Architecture](../VAPI_WEBHOOK_ARCHITECTURE.md)
- [VAPI Fallback Architecture](../VAPI_FALLBACK_ARCHITECTURE.md)
- [Feature: Direct VAPI Hybrid Webhook](./FEATURE_DIRECT_VAPI_HYBRID_WEBHOOK.md)

**Change Log**:
- 2025-12-09 - Initial creation from multi-agent analysis
- 2025-12-09 - Implementation complete: Created webhook-config.ts, updated DirectVapiClient to use `assistant.server.url` instead of `callParams.serverUrl`, updated Kestra script to import from shared config
