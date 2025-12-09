# Provider Search Architecture - Comprehensive Analysis & Recommendations

**Date:** 2025-12-09
**Author:** Claude Code
**Status:** Architecture Recommendation

---

## Executive Summary

This document analyzes the current dual-service provider search architecture and provides a definitive recommendation for long-term maintainability. The core issue is **phone number enrichment**: VAPI phone calls require phone numbers, but basic Google Places API text search doesn't return them. Enrichment requires additional API calls per provider, adding ~200ms latency and $0.017 cost each.

**Recommendation:** Implement a **hybrid lazy-enrichment strategy** with a unified service layer.

---

## Current State Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Two Parallel Services                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. LEGACY: apps/api/src/services/gemini.ts                 │
│     Route: POST /api/v1/gemini/search-providers             │
│     Status: ❌ NO PHONE ENRICHMENT                          │
│                                                               │
│  2. RESEARCH: apps/api/src/services/research/               │
│     Route: POST /api/v1/workflows/research                  │
│     Status: ⚠️  HAS enrichProviders() BUT NOT CALLED        │
│                                                               │
│  3. SHARED: apps/api/src/services/places/                   │
│     - textSearch() - Basic info, NO phone                   │
│     - getPlaceDetails() - Full details WITH phone           │
│     - enrichProviders() - Batch enrichment (5 at a time)    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Comparison

#### Legacy Service (gemini.ts)
```typescript
searchProviders(query, location, options) {
  1. GooglePlacesService.textSearch()
     ✅ Returns: name, address, rating, reviewCount, location
     ❌ Missing: phone, hours, website

  2. Transform + Filter + Sort
     ✅ Distance calculation
     ✅ Rating/distance/review filtering
     ❌ NO enrichment with phone numbers

  3. Return top 10
     Status: Incomplete data for VAPI calls
}
```

#### Research Service (direct-research.client.ts)
```typescript
research(request) {
  1. GooglePlacesService.textSearch()
     ✅ Returns: name, address, rating, reviewCount, location
     ❌ Missing: phone, hours, website

  2. Transform + Filter + Sort
     ✅ Distance calculation
     ✅ Rating/distance/review filtering
     ❌ enrichProviders() exists but NOT called

  3. Return top 10
     Status: Incomplete data for VAPI calls
}
```

#### Enrichment Service (google-places.service.ts)
```typescript
enrichProviders(providers, userCoordinates) {
  For each provider (in batches of 5):
    1. getPlaceDetails(placeId)
       ✅ Phone (national + international)
       ✅ Opening hours + isOpenNow
       ✅ Website URL

    2. Add 200ms delay between batches
       Cost: ~$0.017 per provider (Place Details API)
       Time: ~200ms per provider (batched 5x)

  Return: Fully enriched providers
}
```

---

## The Problem

### Critical Issue
**VAPI phone calls REQUIRE phone numbers** - Without enrichment, the core use case breaks:

```typescript
// apps/api/src/services/vapi/types.ts
export interface CallRequest {
  providerPhone: string;  // ❌ REQUIRED - Call fails without this
  providerName: string;
  serviceCriteria: string;
}
```

### Current Gaps

| Service | Route | Phone Data | VAPI Ready | Status |
|---------|-------|------------|------------|---------|
| Legacy | `/api/v1/gemini/search-providers` | ❌ No | ❌ No | Broken |
| Research | `/api/v1/workflows/research` | ❌ No | ❌ No | Broken |
| Enrichment | N/A (utility only) | ✅ Yes | ✅ Yes | Unused |

### Cost/Latency Tradeoffs

**Scenario: Search for 10 providers**

| Strategy | API Calls | Cost | Latency | Data Completeness |
|----------|-----------|------|---------|-------------------|
| No enrichment (current) | 1 text search | $0.03 | ~500ms | ❌ No phones |
| Full enrichment (10 providers) | 1 search + 10 details | $0.20 | ~2.5s | ✅ Complete |
| Selective (top 3) | 1 search + 3 details | $0.08 | ~1.2s | ⚠️  Partial |
| On-demand (when calling) | 1 search + 1 detail | $0.05 | ~700ms | ✅ Just-in-time |

**Google Places API Pricing:**
- Text Search: ~$0.03 per request (20 results max)
- Place Details: ~$0.017 per request
- Monthly free tier: $200 credit (~10,000 searches or ~11,764 details)

---

## Architectural Recommendations

### ✅ RECOMMENDED: Hybrid Lazy-Enrichment Strategy

#### Architecture Principles
1. **Single Unified Service** - Eliminate parallel implementations
2. **Lazy Enrichment** - Only fetch phone numbers when needed
3. **Smart Caching** - Cache enriched providers for repeat calls
4. **Progressive Enhancement** - Return fast results, enrich in background

#### Implementation Design

```
┌─────────────────────────────────────────────────────────────┐
│           Unified Provider Search Service                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. SEARCH PHASE (Fast - ~500ms)                            │
│     - GooglePlacesService.textSearch()                      │
│     - Filter by rating/distance/reviews                     │
│     - Sort by distance                                      │
│     - Return top N with placeIds                            │
│                                                               │
│  2. ENRICHMENT PHASE (On-demand)                            │
│     Strategy A: User selects provider → enrich 1            │
│     Strategy B: Background enrich top 3 after response      │
│     Strategy C: Param `enrichNow=true` for immediate        │
│                                                               │
│  3. CACHE LAYER (Redis/Memory)                              │
│     - Key: placeId                                          │
│     - Value: { phone, hours, website }                      │
│     - TTL: 7 days (phone numbers stable)                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

#### API Design

```typescript
// UNIFIED ENDPOINT
POST /api/v1/providers/search

Request:
{
  "service": "plumber",
  "location": "Greenville SC",
  "coordinates": { "latitude": 34.8526, "longitude": -82.394 },
  "minRating": 4.5,
  "maxDistance": 25,
  "maxResults": 10,

  // ENRICHMENT CONTROL
  "enrichment": {
    "strategy": "lazy" | "top3" | "all" | "none",
    "fields": ["phone", "hours", "website"]
  }
}

Response:
{
  "providers": [
    {
      "id": "place_abc123",
      "name": "Bob's Plumbing",
      "rating": 4.8,
      "reviewCount": 234,
      "address": "123 Main St",
      "distance": 2.3,
      "distanceText": "2.3 mi",

      // ENRICHMENT STATUS
      "enrichmentStatus": "complete" | "partial" | "pending",
      "phone": "+1-864-555-0123",  // Only if enriched
      "hours": [...],              // Only if enriched
      "website": "..."             // Only if enriched
    }
  ],
  "meta": {
    "totalFound": 47,
    "returned": 10,
    "enrichmentStrategy": "top3",
    "enrichedCount": 3
  }
}
```

---

## Enrichment Strategies Comparison

### Strategy 1: Lazy Enrichment (RECOMMENDED)

**Flow:**
1. Search returns providers WITHOUT phones (~500ms)
2. User selects provider to call
3. Backend enriches that ONE provider on-demand (~700ms)
4. VAPI call initiated with phone number

**Pros:**
- ✅ Fast initial search response (500ms)
- ✅ Minimal API costs ($0.05 per search + call)
- ✅ Only enrich what's actually used
- ✅ Perfect for exploratory searches

**Cons:**
- ⚠️ Extra 700ms delay when user clicks "Call"
- ⚠️ No phone preview in search results

**Best For:** User-driven workflows where users browse before calling

**Example User Flow:**
```
User: "Find plumbers in Greenville"
  → Search results in 500ms (no phones shown)

User clicks "Call Bob's Plumbing"
  → Enrich Bob's in 700ms (get phone)
  → Initiate VAPI call

Total: 1.2s to start call
```

---

### Strategy 2: Top-N Background Enrichment

**Flow:**
1. Search returns providers WITHOUT phones (~500ms)
2. Response sent to user immediately
3. Background job enriches top 3 providers (~1.5s)
4. Cache updated silently

**Pros:**
- ✅ Fast initial response (500ms)
- ✅ Phone numbers ready when user decides to call
- ✅ No perceived latency for top providers
- ✅ Reasonable cost ($0.08 per search)

**Cons:**
- ⚠️ Enriches providers that may not be called
- ⚠️ Need async job queue (complexity)
- ⚠️ Phone numbers not visible immediately

**Best For:** High-intent users who will call one of the top results

**Implementation:**
```typescript
async search(request) {
  // 1. Fast search
  const providers = await textSearch();

  // 2. Return immediately
  const response = { providers, enrichmentStatus: 'pending' };

  // 3. Background enrichment (non-blocking)
  backgroundEnrich(providers.slice(0, 3));

  return response;
}

async backgroundEnrich(providers) {
  const enriched = await enrichProviders(providers);
  cache.setMany(enriched);  // Ready for calls
}
```

---

### Strategy 3: Parameterized Enrichment

**Flow:**
1. Frontend passes `enrichNow=true` for high-intent searches
2. Backend enriches top N providers before response
3. Return complete data in single response

**Pros:**
- ✅ Frontend controls cost/latency tradeoff
- ✅ Single request for complete data
- ✅ Simple implementation (no async jobs)

**Cons:**
- ⚠️ Slower response when enrichment requested (~2.5s)
- ⚠️ Frontend must know when to enrich

**Best For:** "Direct call" workflows where user specified a provider

**API:**
```typescript
// Low-intent: Just browsing
POST /api/v1/providers/search
{ "enrichment": "none" }
→ 500ms response, no phones

// High-intent: Ready to call
POST /api/v1/providers/search
{ "enrichment": "top3" }
→ 1.5s response, phones included
```

---

### Strategy 4: Smart Caching

**Flow:**
1. Enrich providers on first call
2. Cache enriched data for 7 days
3. Subsequent searches return cached data instantly

**Pros:**
- ✅ Amortizes enrichment cost over time
- ✅ Fast for repeat searches (cache hit)
- ✅ Reduces API usage significantly

**Cons:**
- ⚠️ First search still slow
- ⚠️ Requires cache infrastructure (Redis)
- ⚠️ Cache invalidation complexity

**Best For:** Production systems with repeat searches in same areas

**Implementation:**
```typescript
async enrichProvider(placeId: string) {
  // Check cache first
  const cached = await cache.get(`provider:${placeId}`);
  if (cached) return cached;

  // Enrich from API
  const details = await getPlaceDetails(placeId);

  // Cache for 7 days
  await cache.set(`provider:${placeId}`, details, { ttl: 604800 });

  return details;
}
```

---

## Recommended Implementation Plan

### Phase 1: Unify Services (Week 1)

**Goal:** Single source of truth for provider search

```
1. Create unified service: apps/api/src/services/providers/provider-search.service.ts

2. Consolidate logic:
   - Merge gemini.ts and direct-research.client.ts
   - Use GooglePlacesService for all searches
   - Standardize filtering/sorting/distance calculation

3. Create unified route: POST /api/v1/providers/search

4. Deprecate old routes:
   - /api/v1/gemini/search-providers → redirect to new
   - /api/v1/workflows/research → redirect to new
```

**File Structure:**
```
apps/api/src/services/providers/
├── provider-search.service.ts   # Unified search logic
├── enrichment.service.ts        # Phone enrichment logic
├── cache.service.ts             # Redis cache layer
└── types.ts                     # Shared types
```

---

### Phase 2: Implement Lazy Enrichment (Week 1)

**Goal:** Enable on-demand phone enrichment

```typescript
// New endpoint for enrichment
POST /api/v1/providers/:placeId/enrich

Response:
{
  "placeId": "place_abc123",
  "phone": "+1-864-555-0123",
  "internationalPhone": "+18645550123",
  "hours": [...],
  "website": "...",
  "isOpenNow": true
}
```

**Frontend Flow:**
```typescript
// 1. Search (fast)
const results = await searchProviders({ service, location });

// 2. User clicks "Call Bob's Plumbing"
const enriched = await enrichProvider(results[0].placeId);

// 3. Initiate VAPI call
await initiateCall({
  providerPhone: enriched.phone,
  providerName: results[0].name
});
```

---

### Phase 3: Add Caching (Week 2)

**Goal:** Reduce API costs and improve speed

**Redis Schema:**
```
Key: provider:enriched:{placeId}
Value: { phone, internationalPhone, hours, website, isOpenNow }
TTL: 7 days

Key: provider:search:{hash(query+location)}
Value: [ placeIds ]
TTL: 1 hour
```

**Cache Layers:**
```
1. Memory cache (in-process) - 100 providers, 5 min TTL
2. Redis cache (shared) - Unlimited, 7 day TTL
3. API (fallback) - When cache misses
```

---

### Phase 4: Background Enrichment (Week 3)

**Goal:** Proactive enrichment for high-confidence providers

**Implementation:**
```typescript
async search(request) {
  // 1. Fast search
  const providers = await textSearch();

  // 2. Start background job
  if (request.enableBackgroundEnrich) {
    jobQueue.add('enrich-top-providers', {
      placeIds: providers.slice(0, 3).map(p => p.placeId),
      priority: 'high'
    });
  }

  // 3. Return immediately
  return { providers, enrichmentStatus: 'queued' };
}
```

**Job Queue (BullMQ recommended):**
```typescript
enrichQueue.process('enrich-top-providers', async (job) => {
  const { placeIds } = job.data;

  for (const placeId of placeIds) {
    await enrichProvider(placeId);  // Caches result
  }
});
```

---

## Migration Strategy

### Step 1: Feature Flag Rollout
```typescript
const FEATURE_FLAGS = {
  USE_UNIFIED_SEARCH: process.env.FEATURE_UNIFIED_SEARCH === 'true',
  ENABLE_LAZY_ENRICH: process.env.FEATURE_LAZY_ENRICH === 'true',
  ENABLE_BACKGROUND_ENRICH: process.env.FEATURE_BG_ENRICH === 'true'
};
```

### Step 2: Gradual Cutover
```
Week 1: Deploy unified service, keep old routes
Week 2: Switch 10% traffic to new route
Week 3: Switch 50% traffic
Week 4: Switch 100% traffic, deprecate old routes
```

### Step 3: Cleanup
```
Month 2: Remove deprecated code
  - Delete apps/api/src/services/gemini.ts searchProviders()
  - Delete apps/api/src/services/research/direct-research.client.ts
  - Keep GooglePlacesService as shared utility
```

---

## Alternative Approaches (Evaluated & Rejected)

### ❌ Option A: Always Enrich Everything

**Why Rejected:**
- Too slow (~2.5s for 10 providers)
- Too expensive ($0.20 per search)
- Wastes API quota on providers never called
- Poor user experience (waiting for unneeded data)

---

### ❌ Option B: No Enrichment (Store Phones in DB)

**Why Rejected:**
- Requires maintaining provider database
- Phone numbers change frequently
- Data staleness issues
- Storage/maintenance overhead
- Still need enrichment for new providers

---

### ❌ Option C: Separate VAPI Enrichment Service

**Why Rejected:**
- Adds architectural complexity
- Another service to maintain
- Duplicates enrichment logic
- No advantage over unified approach

---

## Cost Analysis (Production Scale)

**Assumptions:**
- 1,000 searches/day
- 20% of searches lead to calls (200 calls/day)
- Lazy enrichment strategy

**Monthly Costs:**

| Item | Calculation | Cost |
|------|-------------|------|
| Text searches | 1,000/day × $0.03 × 30 days | $900 |
| Enrichments (lazy) | 200/day × $0.017 × 30 days | $102 |
| **Total** | | **$1,002** |

**With Background Enrichment (Top 3):**

| Item | Calculation | Cost |
|------|-------------|------|
| Text searches | 1,000/day × $0.03 × 30 days | $900 |
| Enrichments | 1,000/day × 3 × $0.017 × 30 days | $1,530 |
| **Total** | | **$2,430** |

**Savings with 50% Cache Hit Rate:**

| Item | Calculation | Cost |
|------|-------------|------|
| Text searches | 1,000/day × $0.03 × 30 days | $900 |
| Enrichments (50% cached) | 200/day × 0.5 × $0.017 × 30 days | $51 |
| **Total** | | **$951** |
| **Monthly Savings** | | **$51** |

**Conclusion:** Caching pays for itself at moderate scale.

---

## Monitoring & Metrics

### Key Metrics to Track

```typescript
// Performance
- p50/p95/p99 search latency
- p50/p95/p99 enrichment latency
- Cache hit rate (%)
- API error rate (%)

// Cost
- Text search calls per day
- Place details calls per day
- Daily API spend ($)
- Cost per successful call ($)

// Business
- Search → Call conversion rate (%)
- Average providers returned per search
- Most searched services (top 10)
- Most searched locations (top 10)
```

### Alerting

```yaml
Alerts:
  - name: high_enrichment_latency
    condition: p95 > 2s
    action: page oncall

  - name: cache_hit_rate_low
    condition: hit_rate < 30%
    action: investigate

  - name: api_cost_spike
    condition: daily_cost > $100
    action: notify team

  - name: search_error_rate_high
    condition: error_rate > 5%
    action: page oncall
```

---

## Testing Strategy

### Unit Tests
```typescript
describe('ProviderSearchService', () => {
  it('searches without enrichment by default', async () => {
    const result = await service.search({ service: 'plumber', location: 'Greenville' });
    expect(result.providers[0].phone).toBeUndefined();
  });

  it('enriches on demand when requested', async () => {
    const placeId = 'place_abc123';
    const enriched = await service.enrich(placeId);
    expect(enriched.phone).toBeDefined();
  });

  it('uses cache on second enrichment', async () => {
    await service.enrich('place_abc123');
    const spy = jest.spyOn(googlePlaces, 'getPlaceDetails');
    await service.enrich('place_abc123');
    expect(spy).not.toHaveBeenCalled();  // Cache hit
  });
});
```

### Integration Tests
```typescript
describe('Provider Search API', () => {
  it('returns fast results without enrichment', async () => {
    const start = Date.now();
    const response = await fetch('/api/v1/providers/search', {
      method: 'POST',
      body: JSON.stringify({ service: 'plumber', location: 'Greenville' })
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);  // < 1s
    expect(response.data.providers).toHaveLength(10);
  });

  it('enriches provider on demand', async () => {
    const placeId = 'place_abc123';
    const response = await fetch(`/api/v1/providers/${placeId}/enrich`, {
      method: 'POST'
    });

    expect(response.data.phone).toMatch(/^\+1-\d{3}-\d{3}-\d{4}$/);
  });
});
```

### Load Tests
```yaml
scenarios:
  - name: search_only
    requests_per_second: 100
    duration: 5m
    endpoint: POST /api/v1/providers/search
    expected_p95: < 800ms

  - name: search_and_enrich
    requests_per_second: 20
    duration: 5m
    steps:
      1. POST /api/v1/providers/search
      2. POST /api/v1/providers/{id}/enrich
    expected_p95: < 1500ms
```

---

## Decision Matrix

| Criterion | Weight | Lazy Enrich | Top-3 BG | Full Enrich | No Enrich |
|-----------|--------|-------------|----------|-------------|-----------|
| **User Experience** | 30% | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| **Cost Efficiency** | 25% | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| **Latency** | 25% | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Simplicity** | 15% | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Scalability** | 5% | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **TOTAL** | 100% | **4.25** | **4.15** | **2.20** | **3.90** |

**Winner:** Lazy Enrichment (4.25/5.0)

---

## Final Recommendation

### ✅ Implement Hybrid Lazy-Enrichment Architecture

**Phase 1 (Immediate):**
1. Unify services into single `ProviderSearchService`
2. Implement lazy enrichment endpoint (`POST /providers/:id/enrich`)
3. Update VAPI integration to enrich before calling

**Phase 2 (Month 1):**
1. Add Redis caching layer
2. Implement background enrichment for top 3 providers
3. Add monitoring/alerting

**Phase 3 (Month 2):**
1. Deprecate old routes
2. Remove duplicate code
3. Optimize cache TTLs based on metrics

**Why This Approach:**
- ✅ Solves immediate problem (VAPI needs phones)
- ✅ Balances cost ($0.05/call vs $0.20 always)
- ✅ Fast user experience (500ms search + 700ms enrich)
- ✅ Simple to implement (no complex async jobs initially)
- ✅ Scales gracefully (add caching/background later)
- ✅ Single source of truth (eliminate duplication)

**Key Success Metrics:**
- Search latency p95 < 800ms
- Enrichment latency p95 < 1.5s
- Cache hit rate > 40% (after month 1)
- API cost < $1,000/month at 1K searches/day
- Zero VAPI call failures due to missing phone numbers

---

## Appendix A: Code Examples

### Unified Search Service

```typescript
// apps/api/src/services/providers/provider-search.service.ts

import { GooglePlacesService } from '../places/google-places.service.js';
import { CacheService } from './cache.service.js';
import type { SearchRequest, SearchResult, Provider } from './types.js';

export class ProviderSearchService {
  constructor(
    private places: GooglePlacesService,
    private cache: CacheService,
    private logger: Logger
  ) {}

  /**
   * Search for providers (fast, no enrichment)
   */
  async search(request: SearchRequest): Promise<SearchResult> {
    const { service, location, coordinates, minRating, maxDistance, maxResults } = request;

    // 1. Check search cache
    const cacheKey = this.getSearchCacheKey(request);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.logger.info('Search cache hit');
      return cached;
    }

    // 2. Google Places text search
    const searchResponse = await this.places.textSearch(
      `${service} near ${location}`,
      coordinates,
      50000
    );

    // 3. Transform to provider format
    let providers = searchResponse.places.map((place, index) => ({
      id: place.placeId,
      placeId: place.placeId,
      name: place.name,
      address: place.formattedAddress,
      rating: place.rating,
      reviewCount: place.userRatingsTotal,
      location: place.location,
      googleMapsUri: place.googleMapsUri,
      distance: coordinates
        ? this.places.calculateDistance(coordinates, place.location)
        : undefined,
      enrichmentStatus: 'none' as const
    }));

    // 4. Filter
    if (minRating) {
      providers = providers.filter(p => (p.rating || 0) >= minRating);
    }
    if (maxDistance) {
      providers = providers.filter(p => !p.distance || p.distance <= maxDistance);
    }

    // 5. Sort by distance
    providers.sort((a, b) => (a.distance || 999) - (b.distance || 999));

    // 6. Return top N
    const topProviders = providers.slice(0, maxResults || 10);

    const result = {
      providers: topProviders,
      meta: {
        totalFound: searchResponse.places.length,
        returned: topProviders.length,
        enrichmentStatus: 'none'
      }
    };

    // 7. Cache result
    await this.cache.set(cacheKey, result, { ttl: 3600 });  // 1 hour

    return result;
  }

  /**
   * Enrich a single provider with phone/hours/website
   */
  async enrich(placeId: string): Promise<EnrichedProvider> {
    // 1. Check enrichment cache
    const cacheKey = `enriched:${placeId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.logger.info({ placeId }, 'Enrichment cache hit');
      return cached;
    }

    // 2. Fetch from Google Places API
    const details = await this.places.getPlaceDetails(placeId);
    if (!details) {
      throw new Error(`Failed to get details for place ${placeId}`);
    }

    const enriched = {
      placeId,
      phone: details.phone,
      internationalPhone: details.internationalPhone,
      website: details.website,
      hours: details.openingHours?.weekdayText,
      isOpenNow: details.openingHours?.openNow,
      enrichmentStatus: 'complete' as const
    };

    // 3. Cache for 7 days
    await this.cache.set(cacheKey, enriched, { ttl: 604800 });

    this.logger.info({ placeId, hasPhone: !!enriched.phone }, 'Provider enriched');

    return enriched;
  }

  /**
   * Enrich multiple providers in batch
   */
  async enrichBatch(placeIds: string[]): Promise<Map<string, EnrichedProvider>> {
    const results = new Map();

    // Process in batches of 5 with 200ms delay
    for (let i = 0; i < placeIds.length; i += 5) {
      const batch = placeIds.slice(i, i + 5);

      const batchResults = await Promise.all(
        batch.map(id => this.enrich(id).catch(err => {
          this.logger.warn({ placeId: id, err }, 'Enrichment failed');
          return null;
        }))
      );

      batchResults.forEach((result, idx) => {
        if (result) {
          results.set(batch[idx], result);
        }
      });

      // Delay between batches
      if (i + 5 < placeIds.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return results;
  }

  private getSearchCacheKey(request: SearchRequest): string {
    const { service, location, minRating, maxDistance } = request;
    return `search:${service}:${location}:${minRating}:${maxDistance}`;
  }
}
```

### Enrichment Endpoint

```typescript
// apps/api/src/routes/providers.ts

export default async function providerRoutes(fastify: FastifyInstance) {
  const searchService = new ProviderSearchService(
    new GooglePlacesService(),
    new CacheService(),
    fastify.log
  );

  /**
   * POST /api/v1/providers/search
   */
  fastify.post('/search', async (request, reply) => {
    const body = searchSchema.parse(request.body);
    const result = await searchService.search(body);
    return result;
  });

  /**
   * POST /api/v1/providers/:placeId/enrich
   */
  fastify.post('/:placeId/enrich', async (request, reply) => {
    const { placeId } = request.params as { placeId: string };

    try {
      const enriched = await searchService.enrich(placeId);
      return enriched;
    } catch (error) {
      fastify.log.error({ error, placeId }, 'Enrichment failed');
      return reply.status(500).send({
        error: 'Enrichment failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
```

### Updated VAPI Integration

```typescript
// apps/api/src/services/vapi/provider-calling.service.ts

export class ProviderCallingService {
  constructor(
    private searchService: ProviderSearchService,
    private vapiClient: VAPIClient
  ) {}

  async callProvider(providerId: string, criteria: string) {
    // 1. Enrich provider to get phone number
    const enriched = await this.searchService.enrich(providerId);

    if (!enriched.phone) {
      throw new Error(`Provider ${providerId} has no phone number`);
    }

    // 2. Initiate VAPI call
    const call = await this.vapiClient.initiateCall({
      providerPhone: enriched.phone,
      providerName: enriched.name,
      serviceCriteria: criteria
    });

    return call;
  }
}
```

---

## Appendix B: Database Schema (Future Enhancement)

If caching proves insufficient at scale, consider persisting enriched data:

```sql
-- apps/api/supabase/migrations/20250115000000_provider_cache.sql

CREATE TABLE provider_enrichment_cache (
  place_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  international_phone TEXT,
  website TEXT,
  hours JSONB,  -- Array of weekday strings
  is_open_now BOOLEAN,

  -- Metadata
  last_enriched_at TIMESTAMPTZ DEFAULT NOW(),
  enrichment_source TEXT DEFAULT 'google_places',

  -- Indexing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX idx_provider_cache_updated ON provider_enrichment_cache(updated_at);

-- Auto-update timestamp
CREATE TRIGGER update_provider_cache_updated_at
  BEFORE UPDATE ON provider_enrichment_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Materialized view for frequently searched providers
CREATE MATERIALIZED VIEW popular_providers AS
SELECT
  place_id,
  name,
  phone,
  COUNT(*) as search_count
FROM
  provider_enrichment_cache pec
  JOIN search_logs sl ON sl.provider_place_id = pec.place_id
WHERE
  sl.created_at > NOW() - INTERVAL '30 days'
GROUP BY
  place_id, name, phone
ORDER BY
  search_count DESC
LIMIT 1000;

-- Refresh materialized view daily
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('refresh-popular-providers', '0 3 * * *', 'REFRESH MATERIALIZED VIEW popular_providers');
```

---

## References

- [Google Places API (New) Documentation](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Google Places API Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [VAPI.ai Phone Integration](https://docs.vapi.ai/)
- [BullMQ Job Queue](https://docs.bullmq.io/)
- [Redis Caching Strategies](https://redis.io/docs/manual/patterns/)

---

**Document Status:** Final Recommendation
**Next Steps:** Review with team → Approve architecture → Begin Phase 1 implementation
**Owner:** Backend Team
**Review Date:** 2025-01-15
