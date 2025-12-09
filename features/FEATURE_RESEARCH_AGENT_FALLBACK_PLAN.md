# Research Agent Fallback System - Implementation Plan

**Date**: 2025-12-08
**Author**: AI Agent (Claude)
**Status**: Approved
**Version**: 1.0
**Confidence**: 90%

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture](#current-architecture)
3. [Target Architecture](#target-architecture)
4. [Implementation Plan](#implementation-plan)
5. [File Creation Summary](#file-creation-summary)
6. [API Endpoints](#api-endpoints)
7. [Type Definitions](#type-definitions)
8. [Testing Strategy](#testing-strategy)
9. [Risk Mitigation](#risk-mitigation)

---

## Executive Summary

Create a Research Agent fallback system that:

1. Routes between Kestra's `research_providers` flow and direct Gemini API calls based on `KESTRA_ENABLED`
2. Updates the `/new` page to use a unified workflow endpoint
3. Provides automatic fallback when Kestra is unavailable (production/Railway)

---

## Current Architecture

```
Frontend /new page
    ↓ runConciergeProcess()
    ↓
┌──────────────────────────────────────────────────┐
│ Sequential API Calls (ALL use Gemini simulation) │
├──────────────────────────────────────────────────┤
│ 1. POST /api/v1/gemini/search-providers          │
│ 2. POST /api/v1/gemini/simulate-call (×N)        │
│ 3. POST /api/v1/gemini/select-best-provider      │
│ 4. POST /api/v1/gemini/schedule-appointment      │
└──────────────────────────────────────────────────┘
```

**Problems:**

- No Kestra integration for research phase
- No automatic fallback when Kestra unavailable
- Hardcoded to use Gemini simulation only

---

## Target Architecture

```
Frontend /new page
    ↓ Submit form
    ↓
┌────────────────────────────────────────────────────────────┐
│  POST /api/v1/workflows/concierge (NEW UNIFIED ENDPOINT)   │
└──────────────────────┬─────────────────────────────────────┘
                       ↓
            ┌──────────────────────┐
            │  KESTRA_ENABLED?     │
            └──────────────────────┘
           Yes ↓              ↓ No
    ┌──────────────────┐  ┌──────────────────────────────┐
    │   KestraClient   │  │   DirectConciergeService     │
    │ (Full orchestr.) │  │ (Direct Gemini + VAPI calls) │
    └──────────────────┘  └──────────────────────────────┘
            ↓                        ↓
    ┌────────────────────────────────────────────────────┐
    │              Kestra Flows (if enabled)              │
    │ ┌─────────────────┐  ┌─────────────────┐           │
    │ │research_providers│→│contact_providers│→ Analyze  │
    │ └─────────────────┘  └─────────────────┘           │
    └────────────────────────────────────────────────────┘
                       OR
    ┌────────────────────────────────────────────────────┐
    │           Direct API Calls (fallback)              │
    │ ┌─────────────────┐  ┌─────────────────┐           │
    │ │ Gemini Search   │→│ VAPI Direct Call│→ Analyze  │
    │ │(Google Maps)    │  │(existing svc)   │           │
    │ └─────────────────┘  └─────────────────┘           │
    └────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Research Agent Service Layer

Create new service files in `apps/api/src/services/research/`:

| File                        | Purpose                                            | Lines (Est.) |
| --------------------------- | -------------------------------------------------- | ------------ |
| `types.ts`                  | Type definitions (ResearchRequest, ResearchResult) | ~50          |
| `kestra-research.client.ts` | Trigger Kestra `research_providers` flow           | ~120         |
| `direct-research.client.ts` | Direct Gemini API with Google Maps grounding       | ~150         |
| `research.service.ts`       | Main orchestrator (routes Kestra/Direct)           | ~100         |
| `index.ts`                  | Service exports                                    | ~20          |

### Phase 2: Unified Workflow Endpoint

Create new route `apps/api/src/routes/workflows.ts`:

| Endpoint                      | Method | Purpose                                          |
| ----------------------------- | ------ | ------------------------------------------------ |
| `/api/v1/workflows/research`  | POST   | Search providers (Kestra or Direct Gemini)       |
| `/api/v1/workflows/concierge` | POST   | Full workflow (Research → Call → Analyze → Book) |
| `/api/v1/workflows/status`    | GET    | Check system status                              |

### Phase 3: Frontend Integration

Update `/apps/web/app/new/page.tsx`:

- Replace `runConciergeProcess()` with call to new workflow endpoint
- Add service client `apps/web/lib/services/workflowService.ts`

### Phase 4: Configuration

Add environment variables to `.env.example`

---

## File Creation Summary

| #   | File Path                                                  | Action | Purpose                   |
| --- | ---------------------------------------------------------- | ------ | ------------------------- |
| 1   | `apps/api/src/services/research/types.ts`                  | CREATE | Type definitions          |
| 2   | `apps/api/src/services/research/kestra-research.client.ts` | CREATE | Kestra flow client        |
| 3   | `apps/api/src/services/research/direct-research.client.ts` | CREATE | Direct Gemini client      |
| 4   | `apps/api/src/services/research/research.service.ts`       | CREATE | Main orchestrator         |
| 5   | `apps/api/src/services/research/index.ts`                  | CREATE | Exports                   |
| 6   | `apps/api/src/routes/workflows.ts`                         | CREATE | New API routes            |
| 7   | `apps/api/src/index.ts`                                    | MODIFY | Register workflow routes  |
| 8   | `apps/web/app/new/page.tsx`                                | MODIFY | Use new workflow endpoint |
| 9   | `apps/web/lib/services/workflowService.ts`                 | CREATE | Frontend API client       |
| 10  | `apps/api/.env.example`                                    | MODIFY | Add new env vars          |

---

## API Endpoints

### Research Endpoint

```typescript
POST /api/v1/workflows/research
Body: {
  service: string,
  location: string,
  daysNeeded?: number,
  minRating?: number,
  serviceRequestId?: string
}
Response: {
  success: boolean,
  data: {
    method: 'kestra' | 'direct_gemini',
    providers: Provider[],
    reasoning?: string
  }
}
```

### Full Concierge Endpoint

```typescript
POST /api/v1/workflows/concierge
Body: {
  title: string,
  description: string,
  location: string,
  criteria: string,
  urgency?: 'immediate' | 'within_24_hours' | 'within_2_days' | 'flexible',
  useRealCalls?: boolean
}
Response: {
  success: boolean,
  data: {
    requestId: string,
    status: 'searching' | 'calling' | 'analyzing' | 'completed' | 'failed',
    providers: Provider[],
    selectedProvider?: Provider,
    callResults?: CallResult[],
    appointment?: AppointmentDetails
  }
}
```

### Status Endpoint

```typescript
GET /api/v1/workflows/status
Response: {
  kestraEnabled: boolean,
  kestraUrl: string | null,
  kestraHealthy: boolean,
  geminiConfigured: boolean,
  vapiConfigured: boolean,
  activeResearchMethod: 'kestra' | 'direct_gemini',
  activeCallMethod: 'kestra' | 'direct_vapi'
}
```

---

## Type Definitions

```typescript
// apps/api/src/services/research/types.ts

export interface ResearchRequest {
  service: string; // "plumber", "electrician"
  location: string; // "Greenville, SC"
  daysNeeded?: number; // urgency window (default: 2)
  minRating?: number; // minimum rating (default: 4.5)
  serviceRequestId?: string; // for DB linking
}

export interface ResearchResult {
  status: "success" | "error";
  method: "kestra" | "direct_gemini";
  providers: Provider[];
  reasoning?: string;
  error?: string;
}

export interface Provider {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  address?: string;
  reason?: string;
  source?: "kestra" | "gemini_maps" | "user_input";
}

export interface ConciergeRequest {
  title: string;
  description: string;
  location: string;
  criteria: string;
  urgency?: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
  useRealCalls?: boolean;
  serviceRequestId?: string;
}

export interface ConciergeResult {
  requestId: string;
  status:
    | "searching"
    | "calling"
    | "analyzing"
    | "booking"
    | "completed"
    | "failed";
  researchMethod: "kestra" | "direct_gemini";
  callMethod?: "kestra" | "direct_vapi" | "simulated";
  providers: Provider[];
  callResults?: CallResult[];
  selectedProvider?: Provider;
  appointment?: {
    provider: string;
    dateTime: string;
    details: string;
  };
  error?: string;
}

export interface SystemStatus {
  kestraEnabled: boolean;
  kestraUrl: string | null;
  kestraHealthy: boolean;
  geminiConfigured: boolean;
  vapiConfigured: boolean;
  activeResearchMethod: "kestra" | "direct_gemini";
  activeCallMethod: "kestra" | "direct_vapi";
}
```

---

## Decision Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  ResearchService.search()                    │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
                    ┌─────────────────────┐
                    │  KESTRA_ENABLED?    │
                    └─────────────────────┘
                   true ↓           ↓ false
            ┌───────────────────┐   │
            │   Health Check    │   │
            │  Kestra Available?│   │
            └───────────────────┘   │
           yes ↓         ↓ no       │
    ┌─────────────────┐  │          │
    │ KestraResearch  │  └────┬─────┘
    │    Client       │       │
    └─────────────────┘       ↓
            ↓          ┌─────────────────┐
            │          │ DirectResearch  │
            │          │    Client       │
            │          │ (Gemini + Maps) │
            │          └─────────────────┘
            ↓                   ↓
    ┌─────────────────────────────────────┐
    │         ResearchResult               │
    │  { providers[], method, status }     │
    └─────────────────────────────────────┘
```

---

## Testing Strategy

### Unit Tests

- Mock Kestra and Gemini clients
- Test routing logic based on KESTRA_ENABLED
- Test health check fallback behavior

### Integration Tests

```bash
# Test research endpoint
curl -X POST http://localhost:8000/api/v1/workflows/research \
  -H "Content-Type: application/json" \
  -d '{"service": "plumber", "location": "Greenville, SC"}'

# Check system status
curl http://localhost:8000/api/v1/workflows/status
```

### E2E Test

- Full /new page submission → result flow
- Verify database persistence
- Test both Kestra and fallback paths

---

## Risk Mitigation

| Risk                                                 | Mitigation                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Kestra flow output format differs from direct Gemini | Normalize both outputs to common `ResearchResult` type      |
| Phone numbers not extracted by Google Maps           | Use Google Search Grounding in direct client for phone data |
| Frontend breaking changes                            | Keep existing endpoints, add new `/workflows/*` routes      |
| Database schema changes                              | Reuse existing providers table with call tracking columns   |

---

## Environment Configuration

```bash
# Research Agent Configuration
KESTRA_ENABLED=false                    # Set true for local/staging
KESTRA_URL=http://localhost:8082
KESTRA_NAMESPACE=ai_concierge
KESTRA_HEALTH_CHECK_TIMEOUT=3000

# Gemini Configuration
GEMINI_API_KEY=your-key

# VAPI Configuration (for real calls)
VAPI_API_KEY=your-key
VAPI_PHONE_NUMBER_ID=your-phone-id

# Workflow Configuration
USE_REAL_VAPI_CALLS=false               # Toggle real vs simulated calls
```

---

## Document Metadata

**Last Updated**: 2025-12-08
**Review Status**: Approved
**Implementation Status**: Not Started
**Related Documents**:

- `/features/FEATURE_VAPI_FALLBACK_PLAN.md`
- `/features/FEATURE_VAPI_FALLBACK_COMPLETION.md`
- `/docs/architecture.md`

**Change Log**:

- 2025-12-08 - Initial creation
