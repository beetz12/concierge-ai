# Unified Provider Enrichment Service

**Date**: 2025-12-09
**Author**: Claude AI
**Status**: COMPLETE
**Type**: Service Refactoring

## Table of Contents
- [Problem Statement](#problem-statement)
- [Architecture Overview](#architecture-overview)
- [Implementation Steps](#implementation-steps)
- [Files to Modify](#files-to-modify)
- [Testing Plan](#testing-plan)

---

## Problem Statement

Currently, provider enrichment is inconsistent across the codebase:
- `gemini.ts`: Has inline enrichment → returns phone numbers ✅
- `DirectResearchClient`: Has placeId but NO enrichment → phone undefined ❌
- `KestraResearchClient`: Returns phone from Gemini but NO placeId → can't enrich further ⚠️

**Critical Bug**: DirectResearchClient filters by `requirePhone` BEFORE enrichment, but phone is always `undefined` from Places text search → ALL providers get filtered out!

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Routes                               │
├────────────────────────────────┬────────────────────────────────┤
│  /gemini/search-providers      │   /workflows/research          │
└────────────────┬───────────────┴───────────────┬────────────────┘
                 │                               │
                 ▼                               ▼
┌────────────────────────────────┐   ┌────────────────────────────┐
│  gemini.ts searchProviders()   │   │  ResearchService.search()  │
└────────────────┬───────────────┘   └───────────────┬────────────┘
                 │                                   │
                 └───────────────┬───────────────────┘
                                 ▼
              ┌──────────────────────────────────────┐
              │  ProviderEnrichmentService.enrich()  │  ← SHARED
              │  - Batch processing (5 providers)    │
              │  - Adds: phone, hours, website       │
              │  - Applies requirePhone AFTER enrich │
              └──────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create ProviderEnrichmentService (NEW FILE)

**File:** `apps/api/src/services/research/enrichment.service.ts`

```typescript
export interface EnrichmentOptions {
  coordinates?: { latitude: number; longitude: number };
  minEnrichedResults?: number;  // Minimum providers with phone (default: 3)
  maxToEnrich?: number;         // Max providers to enrich (default: 10)
  requirePhone?: boolean;       // Filter by phone after enrichment
}

export interface EnrichmentResult {
  providers: Provider[];
  stats: {
    totalInput: number;
    enrichedCount: number;
    withPhoneCount: number;
    skippedNoPlaceId: number;
  };
}

export class ProviderEnrichmentService {
  async enrich(providers: Provider[], options: EnrichmentOptions): Promise<EnrichmentResult>;
  async resolvePlaceIds(providers: Provider[], location: string): Promise<Provider[]>;
}
```

**Key Logic:**
1. Partition providers: with placeId vs without
2. For providers WITH placeId: call `GooglePlacesService.getPlaceDetails()`
3. Merge enriched data: phone, internationalPhone, hoursOfOperation, isOpenNow, website
4. Apply `requirePhone` filter AFTER enrichment (not before!)
5. Return stats for logging

### Step 2: Update ResearchService (ADD ENRICHMENT)

**File:** `apps/api/src/services/research/research.service.ts`

**Changes:**
1. Add `enrichmentService` as class property
2. Call `enrichResults()` AFTER getting results from Kestra or Direct
3. For Kestra results: optionally call `resolvePlaceIds()` first

```typescript
async search(request: ResearchRequest): Promise<ResearchResult> {
  // ... existing routing logic ...

  let result = useKestra
    ? await this.kestraClient.research(request)
    : await this.directClient.research(request);

  // NEW: Enrich results after getting them
  if (result.status !== "error" && result.providers.length > 0) {
    result = await this.enrichResults(result, request);
  }

  return result;
}

private async enrichResults(result: ResearchResult, request: ResearchRequest): Promise<ResearchResult> {
  const enriched = await this.enrichmentService.enrich(result.providers, {
    coordinates: request.coordinates,
    requirePhone: request.requirePhone ?? true,
    minEnrichedResults: request.minEnrichedResults ?? 3,
  });

  return {
    ...result,
    providers: enriched.providers,
    filteredCount: enriched.providers.length,
  };
}
```

### Step 3: Fix DirectResearchClient (REMOVE PHONE FILTER)

**File:** `apps/api/src/services/research/direct-research.client.ts`

**Changes:**
1. **Line 307-309**: REMOVE phone filter from `filterProviders()` - phone filtering now happens in ResearchService AFTER enrichment
2. **Line 249**: Remove `requirePhone` from FilterCriteria

```typescript
// REMOVE THIS BLOCK (lines 307-309):
if (criteria.requirePhone) {
  filtered = filtered.filter((p) => !!p.phone || !!p.internationalPhone);
}
```

### Step 4: Update gemini.ts (USE SHARED SERVICE)

**File:** `apps/api/src/services/gemini.ts`

**Changes:**
1. Import `ProviderEnrichmentService`
2. Replace inline enrichment (lines 164-184) with service call

```typescript
// Replace lines 164-184 with:
if (topProviders.length > 0) {
  const enrichmentResult = await enrichmentService.enrich(topProviders, {
    coordinates: latLng,
    maxToEnrich: requirePhone ? Math.max(maxResults, 5) : maxResults,
    requirePhone,
    minEnrichedResults: minEnrichedResults ?? 3,
  });
  topProviders = enrichmentResult.providers;
}
```

### Step 5: Align Route Parameters

**File:** `apps/api/src/routes/workflows.ts`

Add missing parameters to match `/gemini/search-providers`:
```typescript
const researchSchema = z.object({
  // ...existing...
  maxResults: z.number().int().min(1).max(20).optional().default(10),
  minEnrichedResults: z.number().int().min(1).max(10).optional().default(3),
});
```

### Step 6: Update Types

**File:** `apps/api/src/services/research/types.ts`

```typescript
export interface ResearchRequest {
  // ...existing...
  maxResults?: number;          // ADD
  minEnrichedResults?: number;  // ADD
}
```

---

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `apps/api/src/services/research/enrichment.service.ts` | **CREATE** | New shared enrichment service |
| `apps/api/src/services/research/research.service.ts` | MODIFY | Add enrichment call after search |
| `apps/api/src/services/research/direct-research.client.ts` | MODIFY | Remove phone filter (line 307-309) |
| `apps/api/src/services/gemini.ts` | MODIFY | Use shared enrichment service |
| `apps/api/src/services/research/types.ts` | MODIFY | Add maxResults, minEnrichedResults |
| `apps/api/src/routes/workflows.ts` | MODIFY | Add new parameters to schema |
| `apps/api/src/routes/gemini.ts` | MODIFY | Add minEnrichedResults parameter |
| `apps/api/src/services/research/index.ts` | MODIFY | Export ProviderEnrichmentService |

---

## Enrichment Flow Comparison

### Before (Broken)
```
DirectResearchClient:
  textSearch → transform (phone=undefined) → filter(requirePhone) → EMPTY RESULTS!
```

### After (Fixed)
```
ResearchService:
  DirectClient.search() → providers (no phone)
       ↓
  EnrichmentService.enrich() → getPlaceDetails() → adds phone
       ↓
  filter(requirePhone) → RESULTS WITH PHONES!
```

---

## Testing Plan

```bash
# Test 1: /workflows/research with requirePhone=true
curl -X POST http://localhost:8000/api/v1/workflows/research \
  -H "Content-Type: application/json" \
  -d '{"service":"plumbers","location":"Greenville SC","requirePhone":true}'

# Expected: Returns providers WITH phone numbers

# Test 2: /gemini/search-providers with same params
curl -X POST http://localhost:8000/api/v1/gemini/search-providers \
  -H "Content-Type: application/json" \
  -d '{"query":"plumbers","location":"Greenville SC","requirePhone":true}'

# Expected: Same provider data as Test 1

# Test 3: Verify enriched fields
jq '.providers[0] | {name, phone, hoursOfOperation, isOpenNow, website}'

# Expected: All fields populated
```

---

## Key Decisions

1. **Keep both routes** - `/gemini/search-providers` for frontend workflow, `/workflows/research` for orchestration
2. **Centralize enrichment** - Single ProviderEnrichmentService used by all paths
3. **Filter AFTER enrichment** - Phone filter only makes sense after we have phone data
4. **Kestra results** - Can optionally resolve placeIds for deeper enrichment, but Kestra already provides phone from Gemini

---

## Document Metadata

**Last Updated**: 2025-12-09
**Implementation Status**: In Progress
**Related Documents**:
- [IMPLEMENTATION_PLAN_10_PROVIDERS.md](./IMPLEMENTATION_PLAN_10_PROVIDERS.md)

**Change Log**:
- 2025-12-09 - Initial creation
