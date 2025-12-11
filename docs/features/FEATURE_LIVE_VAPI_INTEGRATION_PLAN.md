# FEATURE: Live VAPI Integration for /new Page

**Date**: 2025-12-09
**Author**: AI Agent
**Status**: Approved
**Version**: 1.0
**Confidence**: 90%

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed Solution](#proposed-solution)
4. [Environment Variables](#environment-variables)
5. [Implementation Plan](#implementation-plan)
6. [Files to Create/Modify](#files-to-createmodify)
7. [Technical Details](#technical-details)
8. [Risk Assessment](#risk-assessment)
9. [Testing Strategy](#testing-strategy)

---

## Executive Summary

Wire up the research agent and contact agent to the `/new` page so that:
1. Research phase uses existing `ResearchService` (already supports KESTRA_ENABLED)
2. Contact phase uses real VAPI calls when `LIVE_CALL_ENABLED=true`
3. Contact phase falls back to existing `/simulate-call` when `LIVE_CALL_ENABLED=false`

This provides a safe toggle between simulated calls (for testing/development) and real VAPI calls (for production).

---

## Current State Analysis

### What Works
- **Research Agent**: `POST /api/v1/workflows/research` with KESTRA_ENABLED fallback
- **Contact Agent**: `POST /api/v1/providers/call` with KESTRA_ENABLED fallback
- **Simulated Calls**: `POST /api/v1/gemini/simulate-call` (Gemini-based fake calls)

### The Gap
The `/new/page.tsx` currently uses `simulateCall()` which calls the fake Gemini simulation endpoint instead of the real VAPI provider calling service.

```typescript
// CURRENT: Fake simulation
const log = await simulateCall(provider, criteria);
```

### Architecture Flow (After Implementation)
```
┌─────────────────────────────────────────────────────────────────┐
│                        /new Page                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User submits request                                         │
│           │                                                      │
│           ▼                                                      │
│  2. Research Phase (existing)                                    │
│     POST /api/v1/workflows/research                              │
│     └─► KESTRA_ENABLED? ─► Kestra : Direct Gemini               │
│           │                                                      │
│           ▼                                                      │
│  3. Contact Phase (NEW TOGGLE)                                   │
│     ┌─────────────────────────────────────────────┐              │
│     │  LIVE_CALL_ENABLED?                         │              │
│     │    ├─► true:  POST /api/v1/providers/call   │              │
│     │    │          └─► KESTRA_ENABLED?           │              │
│     │    │              ├─► Kestra VAPI           │              │
│     │    │              └─► Direct VAPI           │              │
│     │    │                                        │              │
│     │    └─► false: POST /api/v1/gemini/simulate  │              │
│     │               └─► Gemini fake simulation    │              │
│     └─────────────────────────────────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Proposed Solution

### Decision Logic
```typescript
// In /new/page.tsx
const LIVE_CALL_ENABLED = process.env.NEXT_PUBLIC_LIVE_CALL_ENABLED === 'true';

if (LIVE_CALL_ENABLED) {
  // Real VAPI calls via /api/v1/providers/call
  // Backend handles KESTRA_ENABLED toggle internally
  result = await callProvider(request);
} else {
  // Existing fake Gemini simulation
  result = await simulateCall(provider, criteria);
}
```

---

## Environment Variables

### New Variable
| Variable | Location | Values | Description |
|----------|----------|--------|-------------|
| `NEXT_PUBLIC_LIVE_CALL_ENABLED` | `apps/web/.env.local` | `true` / `false` | Toggle real VAPI vs simulated calls |

### Existing Variables (unchanged)
| Variable | Location | Description |
|----------|----------|-------------|
| `KESTRA_ENABLED` | `apps/api/.env` | Toggle Kestra vs Direct API |
| `VAPI_API_KEY` | `apps/api/.env` | VAPI authentication |
| `VAPI_PHONE_NUMBER_ID` | `apps/api/.env` | VAPI phone number |
| `VAPI_WEBHOOK_URL` | `apps/api/.env` | Webhook endpoint |

### Configuration Matrix
| LIVE_CALL_ENABLED | KESTRA_ENABLED | Behavior |
|-------------------|----------------|----------|
| `false` | N/A | Gemini simulated calls (current) |
| `true` | `false` | Direct VAPI API calls |
| `true` | `true` | Kestra-orchestrated VAPI calls |

---

## Implementation Plan

### Phase 1: Frontend Service (providerCallingService.ts)
Create a new frontend service to call the `/api/v1/providers/call` endpoint.

### Phase 2: Modify /new Page
Update `/new/page.tsx` to:
1. Check `LIVE_CALL_ENABLED` environment variable
2. Use `callProvider()` when enabled
3. Fall back to existing `simulateCall()` when disabled

### Phase 3: Type Updates
Ensure types are consistent between frontend and backend.

### Phase 4: Environment Setup
Add the new environment variable to `.env.example` files.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/lib/services/providerCallingService.ts` | CREATE | Frontend service for real VAPI calls |
| `apps/web/app/new/page.tsx` | MODIFY | Add LIVE_CALL_ENABLED toggle logic |
| `apps/web/lib/types/provider.ts` | MODIFY | Add CallProviderRequest/Response types |
| `apps/web/.env.example` | MODIFY | Document NEXT_PUBLIC_LIVE_CALL_ENABLED |
| `apps/api/.env.example` | VERIFY | Ensure VAPI variables documented |

---

## Technical Details

### 1. providerCallingService.ts (CREATE)

```typescript
// apps/web/lib/services/providerCallingService.ts

export interface CallProviderRequest {
  providerName: string;
  providerPhone: string;
  serviceNeeded: string;
  userCriteria: string;
  location: string;
  urgency: string;
  serviceRequestId?: string;
  providerId?: string;
}

export interface CallProviderResponse {
  success: boolean;
  callId?: string;
  status: 'completed' | 'failed' | 'no_answer' | 'voicemail' | 'timeout';
  duration?: number;
  transcript?: string;
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown>;
    successEvaluation?: string;
  };
  error?: string;
}

export async function callProvider(
  request: CallProviderRequest
): Promise<CallProviderResponse> {
  const response = await fetch('/api/v1/providers/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return {
      success: false,
      status: 'failed',
      error: error.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    callId: data.callId,
    status: data.status || 'completed',
    duration: data.duration,
    transcript: data.transcript,
    analysis: data.analysis,
  };
}
```

### 2. /new/page.tsx Modifications

```typescript
// Key changes in apps/web/app/new/page.tsx

// Add import
import { callProvider, CallProviderResponse } from '@/lib/services/providerCallingService';

// Add environment check
const LIVE_CALL_ENABLED = process.env.NEXT_PUBLIC_LIVE_CALL_ENABLED === 'true';

// In the contact phase loop:
for (const provider of providersFound) {
  if (LIVE_CALL_ENABLED) {
    // Real VAPI calls
    if (!provider.phone) {
      console.warn(`Skipping ${provider.name}: no phone number`);
      continue;
    }

    const result = await callProvider({
      providerName: provider.name,
      providerPhone: normalizePhoneNumber(provider.phone),
      serviceNeeded: title,
      userCriteria: criteria,
      location: location,
      urgency: 'within_2_days',
      serviceRequestId: dbRequest?.id,
      providerId: provider.id,
    });

    // Process result...
  } else {
    // Existing simulated calls
    const log = await simulateCall(provider, criteria);
    // Process log...
  }
}
```

### 3. Phone Number Normalization

```typescript
// Utility function to normalize phone to E.164 format
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Add +1 for US numbers if not present
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  // Already has country code
  if (phone.startsWith('+')) {
    return phone;
  }
  return `+${digits}`;
}
```

---

## Risk Assessment

### Low Risk
- **Isolated change**: Toggle is opt-in, default behavior unchanged
- **Existing backend**: `/api/v1/providers/call` is already implemented and tested
- **Fallback preserved**: `simulateCall()` still available when disabled

### Medium Risk
- **Phone number format**: Some providers may have invalid phone numbers
  - **Mitigation**: Skip providers without valid phone, log warning
- **API rate limits**: VAPI may have rate limits
  - **Mitigation**: Sequential calls with delay between calls

### Confidence Level: 90%
- Research service integration: Already working
- Contact service integration: Backend ready, just needs frontend wiring
- Database persistence: Already handled by `CallResultService`

---

## Testing Strategy

### Unit Tests
1. `providerCallingService.ts` - Mock fetch, test error handling
2. Phone normalization function - Various input formats

### Integration Tests
1. With `LIVE_CALL_ENABLED=false` - Verify simulated calls work
2. With `LIVE_CALL_ENABLED=true` + `KESTRA_ENABLED=false` - Direct VAPI
3. With `LIVE_CALL_ENABLED=true` + `KESTRA_ENABLED=true` - Kestra VAPI

### Manual Testing
1. Submit request on `/new` page with simulation mode
2. Submit request with live VAPI (test phone number)
3. Verify call results appear in database

---

## Document Metadata

**Last Updated**: 2025-12-09
**Review Status**: Approved
**Implementation Status**: Complete

**Related Documents**:
- `docs/architecture.md`
- `docs/VAPI_WEBHOOK_ARCHITECTURE.md`
- `CLAUDE.md`

**Change Log**:
- 2025-12-09 - Initial creation with LIVE_CALL_ENABLED toggle
