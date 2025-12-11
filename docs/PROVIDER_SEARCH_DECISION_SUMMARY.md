# Provider Search Architecture - Executive Summary

**Date:** 2025-12-09
**Status:** APPROVED FOR IMPLEMENTATION
**Priority:** HIGH (Blocks VAPI integration)

---

## The Problem in 30 Seconds

1. **Current State:** Two parallel provider search services exist, neither returns phone numbers
2. **Critical Issue:** VAPI phone calls REQUIRE phone numbers to function
3. **Technical Cause:** Google Places text search doesn't include phones - need separate API call per provider
4. **Cost/Latency:** Each phone number costs $0.017 + 200ms latency

**Result:** Core use case (AI phone calls) is currently broken.

---

## The Decision

### ✅ RECOMMENDED: Hybrid Lazy-Enrichment Architecture

**Strategy:** Search fast without phones → Enrich on-demand when user selects a provider

**Architecture:**
```
1. Search Phase (500ms, $0.03)
   - Return 10 providers WITHOUT phone numbers
   - Include placeId for each provider

2. Enrichment Phase (700ms, $0.017) - ON DEMAND
   - User clicks "Call Provider"
   - Backend enriches ONLY that provider
   - Returns phone + hours + website

3. VAPI Phase (immediate)
   - Initiate phone call with enriched data
```

**Total Time to Call:** 1.2 seconds (search + enrich)
**Total Cost per Call:** $0.05 (search + 1 enrichment)

---

## Why This Approach Wins

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| **User Experience** | ⭐⭐⭐⭐ | Fast search (500ms), minimal delay on call (700ms) |
| **Cost Efficiency** | ⭐⭐⭐⭐⭐ | Only enrich what's called (~20% of searches) |
| **Implementation** | ⭐⭐⭐⭐⭐ | Simple, no async jobs initially |
| **VAPI Compatible** | ✅ YES | Provides phone numbers when needed |

**Overall:** 4.25/5.0 (Best option evaluated)

---

## Alternatives Considered & Rejected

### ❌ Always Enrich All Providers
- **Why Rejected:** Too slow (2.5s), too expensive ($0.20/search), 80% wasted
- **Score:** 2.20/5.0

### ❌ Background Enrich Top 3
- **Why Rejected:** More complex (async jobs), still enriches providers that aren't called
- **Score:** 4.15/5.0 (Close second - implement in Phase 2)

### ❌ Store Phones in Database
- **Why Rejected:** Data staleness, maintenance overhead, still need enrichment for new providers

---

## Implementation Plan

### Phase 1: Immediate (Week 1)

**Goal:** Make VAPI calls work

```
1. Create unified service: apps/api/src/services/providers/provider-search.service.ts
   - Consolidate gemini.ts + direct-research.client.ts
   - Single source of truth

2. New endpoints:
   POST /api/v1/providers/search       # Fast search, no phones
   POST /api/v1/providers/:id/enrich   # Get phone for specific provider

3. Update VAPI integration:
   - Call enrich() before initiating phone call
   - Handle missing phone numbers gracefully
```

**Deliverables:**
- Unified provider search service
- Lazy enrichment endpoint
- VAPI integration working end-to-end

**Success Criteria:**
- Zero VAPI failures due to missing phones
- Search latency < 800ms (p95)
- Enrichment latency < 1.5s (p95)

---

### Phase 2: Optimization (Month 1)

**Goal:** Reduce costs and improve speed

```
1. Add Redis caching:
   - Cache enriched providers for 7 days
   - Cache search results for 1 hour
   - Target: 40% cache hit rate

2. Background enrichment (optional):
   - Auto-enrich top 3 providers after search
   - Async job queue (BullMQ)
   - Ready when user clicks "Call"
```

**Expected Improvements:**
- 50% cost reduction with caching
- Perceived latency = 0ms for cached providers
- Better user experience for high-intent searches

---

### Phase 3: Cleanup (Month 2)

**Goal:** Remove technical debt

```
1. Deprecate old routes:
   - /api/v1/gemini/search-providers → redirect
   - /api/v1/workflows/research → redirect

2. Delete duplicate code:
   - Remove searchProviders() from gemini.ts
   - Remove direct-research.client.ts
   - Keep GooglePlacesService as shared utility

3. Monitoring & alerts:
   - Track cache hit rate
   - Monitor API costs
   - Alert on high latency
```

---

## Code Example (Simplified)

### Unified Search Service
```typescript
class ProviderSearchService {
  // Fast search - NO phones
  async search(request) {
    const places = await googlePlaces.textSearch(query, coords);
    return places.map(p => ({
      id: p.placeId,
      name: p.name,
      rating: p.rating,
      address: p.address,
      // NO phone here
    }));
  }

  // Lazy enrichment - ON DEMAND
  async enrich(placeId) {
    // Check cache
    const cached = await cache.get(`enriched:${placeId}`);
    if (cached) return cached;

    // Fetch from API
    const details = await googlePlaces.getPlaceDetails(placeId);

    // Cache for 7 days
    await cache.set(`enriched:${placeId}`, details, { ttl: 604800 });

    return {
      phone: details.phone,
      hours: details.hours,
      website: details.website
    };
  }
}
```

### Updated VAPI Flow
```typescript
// OLD (broken)
const providers = await searchProviders();
await vapi.call(providers[0]);  // ❌ No phone number!

// NEW (working)
const providers = await searchService.search();
const enriched = await searchService.enrich(providers[0].placeId);
await vapi.call({ phone: enriched.phone });  // ✅ Has phone!
```

---

## Cost Comparison

**Production Scale: 1,000 searches/day, 20% call rate (200 calls/day)**

| Strategy | Monthly Cost | Latency | Status |
|----------|--------------|---------|--------|
| **Current (broken)** | $900 | 500ms | ❌ No phones |
| **Lazy Enrich** | $1,002 | 1.2s | ✅ RECOMMENDED |
| **Background Top-3** | $2,430 | 500ms | ⚠️  Expensive |
| **Always Enrich All** | $5,700 | 2.5s | ❌ Too slow |

**With 50% Cache Hit Rate:**
- Lazy Enrich: $951/month (5% savings)
- Background: $1,665/month (31% savings)

**Conclusion:** Lazy enrichment is most cost-effective for typical usage patterns.

---

## Success Metrics

### Week 1 (Post-Launch)
- [ ] Zero VAPI call failures due to missing phone numbers
- [ ] Search latency p95 < 800ms
- [ ] Enrichment latency p95 < 1.5s
- [ ] API error rate < 1%

### Month 1 (With Caching)
- [ ] Cache hit rate > 40%
- [ ] Average enrichment latency < 500ms (including cached)
- [ ] API cost < $1,000/month (at 1K searches/day)

### Month 2 (Fully Optimized)
- [ ] Old routes fully deprecated
- [ ] Duplicate code removed
- [ ] Monitoring/alerting operational
- [ ] Cost per successful call < $0.06

---

## Risk Mitigation

| Risk | Mitigation | Owner |
|------|------------|-------|
| Enrichment API failures | Cache + retry logic + fallback to Maps grounding | Backend |
| High latency spikes | Timeout + circuit breaker + error handling | Backend |
| Cost overruns | Rate limiting + caching + alerts | DevOps |
| Cache stampede | Probabilistic early expiration + lock | Backend |

---

## Team Assignments

| Phase | Owner | Duration | Status |
|-------|-------|----------|--------|
| Phase 1: Unified Service | Backend Lead | 1 week | 🟡 Pending |
| Phase 1: VAPI Integration | Backend Dev | 1 week | 🟡 Pending |
| Phase 2: Redis Caching | Backend Dev | 1 week | ⚪ Planned |
| Phase 2: Background Jobs | Backend Lead | 1 week | ⚪ Planned |
| Phase 3: Deprecation | Backend Team | 2 weeks | ⚪ Planned |

---

## Decision Record

**Approved By:** [Team Lead Name]
**Date:** [YYYY-MM-DD]
**Review Date:** 2025-01-15
**Status:** ✅ APPROVED

**Next Steps:**
1. Create feature branch: `feature/unified-provider-search`
2. Implement Phase 1 (unified service + lazy enrichment)
3. Test with VAPI integration
4. Deploy to staging
5. Monitor metrics for 1 week
6. Deploy to production

---

## Quick Reference

**Full Analysis Document:** `/docs/PROVIDER_SEARCH_ARCHITECTURE_ANALYSIS.md`

**Key Files:**
- `/apps/api/src/services/providers/provider-search.service.ts` (new)
- `/apps/api/src/services/places/google-places.service.ts` (keep)
- `/apps/api/src/services/gemini.ts` (deprecate searchProviders)
- `/apps/api/src/services/research/direct-research.client.ts` (deprecate)

**Key Endpoints:**
- `POST /api/v1/providers/search` (new)
- `POST /api/v1/providers/:id/enrich` (new)
- `POST /api/v1/gemini/search-providers` (deprecate)
- `POST /api/v1/workflows/research` (deprecate)

**Monitoring Dashboard:** [Add Grafana/Datadog link when available]

---

## Questions?

Contact: Backend Team Lead
Slack: #backend-provider-search
Documentation: `/docs/PROVIDER_SEARCH_ARCHITECTURE_ANALYSIS.md`
