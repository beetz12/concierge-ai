# VAPI & Kestra Concurrent Calling Consolidation Plan

**Date**: 2025-12-09
**Author**: Claude AI
**Status**: Complete
**Type**: Refactor

## Table of Contents
- [Executive Summary](#executive-summary)
- [Current State Analysis](#current-state-analysis)
- [Reference Architecture](#reference-architecture)
- [Consolidation Strategy](#consolidation-strategy)
- [Implementation Steps](#implementation-steps)
- [Files to Modify](#files-to-modify)
- [Risk Assessment](#risk-assessment)

## Executive Summary

This plan consolidates duplicate code between Kestra workflows and Direct VAPI concurrent calling paths, following the DRY pattern already established in the Research workflow.

### Key Changes
| Before | After |
|--------|-------|
| 2 Kestra workflows | 1 unified workflow |
| 2 batch methods in ConcurrentCallService | 1 method |
| 2 result formatters | 1 shared function |
| 4 error result creators | 1 factory function |
| 2 flow IDs | 1 flow ID |
| Per-request routing in batch | Single routing decision |

### Expected Benefits
- 80% reduction in duplicate code (~200 lines)
- Single source of truth for result formatting
- Consistent error handling across all paths
- Simpler maintenance and testing

## Current State Analysis

### What IS Shared (Already DRY)

| Component | Location | Used By |
|-----------|----------|---------|
| Type definitions | `types.ts` | Both paths |
| Assistant configuration | `assistant-config.ts` | Both paths (Kestra imports compiled JS) |
| Webhook configuration | `webhook-config.ts` | Direct path |
| CallResultService | `call-result.service.ts` | Both paths |
| ProviderCallingService | `provider-calling.service.ts` | Both paths |

### What IS NOT Shared (Duplicated)

| Component | Direct Path | Kestra Path | Lines |
|-----------|-------------|-------------|-------|
| Batch processing | `ConcurrentCallService.callAllProviders()` | Kestra `EachParallel` | ~70 |
| Polling logic | `pollCallCompletion()` | `pollExecution()` | ~35 |
| Result formatting | `formatCallResult()` | `parseExecutionResult()` | ~50 |
| Error creation | `createErrorResult()` | Inline 3 places | ~90 |

### Critical Bugs Found

1. **Wrong service in route** (CRITICAL)
   - `/batch-call` endpoint uses `ConcurrentCallService.callProvidersBatch()`
   - Should use `ProviderCallingService.callProvidersBatch()`
   - Bypasses Kestra optimization entirely

2. **Per-request routing** (MEDIUM)
   - Each request in batch does separate health check
   - 5 providers = 5+ health checks
   - Can cause mixed `callMethod` in results

3. **Unused code** (LOW)
   - `callAllProviders()` exported but never called via HTTP

## Reference Architecture

The Research workflow provides the ideal pattern to follow:

```
┌─────────────────────────────────────────────────────────────┐
│                    ResearchService                           │
│                  (Unified Orchestrator)                      │
├─────────────────────────────────────────────────────────────┤
│  search() {                                                  │
│    if (await shouldUseKestra()) {                           │
│      return kestraClient.research(request);                 │
│    } else {                                                  │
│      return directClient.research(request);                 │
│    }                                                         │
│  }                                                           │
├─────────────────────┬───────────────────────────────────────┤
│  KestraResearchClient │  DirectResearchClient               │
│  (implements interface) │  (implements interface)            │
├─────────────────────┴───────────────────────────────────────┤
│              ProviderEnrichmentService                       │
│              (Shared Post-Processing)                        │
└─────────────────────────────────────────────────────────────┘
```

### Key Patterns
1. **Shared types** - Both paths use identical interfaces
2. **Separate clients** - Each implements same interface
3. **Unified orchestrator** - Routes between paths, handles fallback
4. **Shared post-processing** - Common enrichment/formatting

## Consolidation Strategy

### Architecture After Consolidation

```
┌─────────────────────────────────────────────────────────────┐
│              ProviderCallingService                          │
│            (Unified Orchestrator - Enhanced)                 │
├─────────────────────────────────────────────────────────────┤
│  callProvidersBatch(requests[]) {                           │
│    if (await shouldUseKestra()) {                           │
│      return kestraClient.callProvidersConcurrent(requests); │
│    } else {                                                  │
│      return directConcurrentClient.callProviders(requests); │
│    }                                                         │
│  }                                                           │
├─────────────────────┬───────────────────────────────────────┤
│  KestraClient       │  ConcurrentCallService                │
│  .triggerContact    │  .callProvidersBatch()                │
│  Flow()             │  (simplified)                         │
├─────────────────────┴───────────────────────────────────────┤
│              Shared: Types, Assistant Config,                │
│              CallResultService, createErrorResult()          │
└─────────────────────────────────────────────────────────────┘
```

### New Shared Utilities

#### 1. Error Factory (add to types.ts)
```typescript
export function createErrorResult(
  error: Error | string,
  request: Partial<CallRequest>,
  callMethod: CallMethod
): CallResult {
  const errorMessage = error instanceof Error ? error.message : error;
  return {
    status: "error",
    callId: "",
    callMethod,
    duration: 0,
    endedReason: errorMessage,
    transcript: "",
    analysis: {
      summary: "",
      structuredData: {
        availability: "unclear",
        earliest_availability: "",
        estimated_rate: "",
        meets_criteria: false,
        criteria_details: {},
        disqualified: true,
        disqualification_reason: errorMessage,
        call_outcome: "error",
        recommended: false,
        notes: errorMessage,
      },
      successEvaluation: "",
    },
    provider: {
      name: request.providerName || "Unknown",
      phone: request.providerPhone || "",
      service: request.serviceNeeded || "",
      location: request.location || "",
    },
    request: {
      criteria: request.userCriteria || "",
      urgency: request.urgency || "flexible",
    },
    error: errorMessage,
  };
}
```

## Implementation Steps

### Phase A: Kestra Workflow Consolidation

| Step | Action | File |
|------|--------|------|
| A1 | Update flow ID in concurrent workflow to `contact_providers` | `contact_providers_concurrent.yaml` |
| A2 | Delete old sequential workflow | `contact_agent.yaml` |
| A3 | Rename YAML file | `contact_providers_concurrent.yaml` → `contact_providers.yaml` |

### Phase B: Shared Utilities

| Step | Action | File |
|------|--------|------|
| B1 | Add `createErrorResult()` factory function | `types.ts` |
| B2 | Export new function | `index.ts` |

### Phase C: Direct VAPI Service Consolidation

| Step | Action | File |
|------|--------|------|
| C1 | Remove unused `callAllProviders()` method | `concurrent-call.service.ts` |
| C2 | Update `callProvidersBatch()` to use shared error factory | `concurrent-call.service.ts` |
| C3 | Simplify exports | `concurrent-call.service.ts` |

### Phase D: Kestra Client Consolidation

| Step | Action | File |
|------|--------|------|
| D1 | Remove `concurrentFlowId` property | `kestra.client.ts` |
| D2 | Update `triggerContactFlow()` to handle arrays | `kestra.client.ts` |
| D3 | Remove `triggerConcurrentContactFlow()` (merge into triggerContactFlow) | `kestra.client.ts` |
| D4 | Use shared error factory | `kestra.client.ts` |

### Phase E: Route & Service Integration

| Step | Action | File |
|------|--------|------|
| E1 | Fix batch-call endpoint to use correct service | `routes/providers.ts` |
| E2 | Ensure single routing decision per batch | `provider-calling.service.ts` |
| E3 | Update imports and exports | `index.ts` |

### Phase F: Verification

| Step | Action |
|------|--------|
| F1 | Run `pnpm build` - verify no TypeScript errors |
| F2 | Run `pnpm check-types` - verify type safety |
| F3 | Run `pnpm lint` - verify code quality |

## Files to Modify

### Delete
- `kestra/flows/contact_agent.yaml`

### Rename
- `kestra/flows/contact_providers_concurrent.yaml` → `kestra/flows/contact_providers.yaml`

### Modify
| File | Changes |
|------|---------|
| `apps/api/src/services/vapi/types.ts` | Add `createErrorResult()` factory |
| `apps/api/src/services/vapi/concurrent-call.service.ts` | Remove `callAllProviders()`, use shared error factory |
| `apps/api/src/services/vapi/kestra.client.ts` | Consolidate to single flow, use shared error factory |
| `apps/api/src/services/vapi/provider-calling.service.ts` | Ensure single routing decision |
| `apps/api/src/services/vapi/index.ts` | Update exports |
| `apps/api/src/routes/providers.ts` | Fix batch-call to use correct service |

## Risk Assessment

| Risk | Mitigation | Severity |
|------|------------|----------|
| Breaking batch endpoint | Same response format maintained | Low |
| Kestra workflow change | Keep compatible input parameters | Low |
| Removing unused code | Verified never called via HTTP | Very Low |
| Type changes | Only adding, not modifying existing | Low |

## Success Criteria

- [x] Single Kestra workflow (`contact_providers`) handles both single and batch
- [x] Single `callProvidersBatch()` method in ConcurrentCallService
- [x] Shared `createErrorResult()` used by all paths
- [x] Route uses correct service (`ProviderCallingService`)
- [x] Build passes with no errors
- [x] Lint passes with no errors

---

## Document Metadata

**Last Updated**: 2025-12-09
**Implementation Status**: In Progress
**Related Documents**:
- [CONCURRENT_VAPI_CALLS_PLAN.md](./CONCURRENT_VAPI_CALLS_PLAN.md)
- [VAPI_FALLBACK_ARCHITECTURE.md](../VAPI_FALLBACK_ARCHITECTURE.md)

**Change Log**:
- 2025-12-09 - Initial creation
