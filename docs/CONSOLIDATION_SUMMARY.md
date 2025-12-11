# Service Consolidation Summary

**TL;DR:** Consolidate provider search from `gemini.ts` to `ResearchService`. Keep other gemini functions. Estimated effort: 3 days.

---

## Quick Facts

| Metric | Value |
|--------|-------|
| **Duplicate Lines** | 274 lines in gemini.ts::searchProviders() |
| **Functions to Keep** | 3/4 from gemini.ts (simulateCall, selectBestProvider, scheduleAppointment) |
| **Functions to Deprecate** | 1/4 from gemini.ts (searchProviders) |
| **Winner** | ResearchService + DirectResearchClient (6-0 feature score) |
| **Estimated Effort** | 3 days (24 hours) |
| **Risk Level** | 🟡 Medium (with phased approach) |

---

## The Problem

**Two parallel implementations of provider search:**

1. ❌ `gemini.ts::searchProviders()` - Legacy monolithic approach
2. ✅ `DirectResearchClient::research()` - Modern service-oriented approach

This creates:
- Code duplication (274 lines)
- Maintenance burden (change in 2 places)
- Confusion for developers (which one to use?)
- Missing features in legacy (no Kestra, no triple fallback)

---

## The Solution

**Consolidate on `ResearchService + DirectResearchClient`**

### What to Keep from gemini.ts
```typescript
✅ simulateCall()        → Move to services/vetting/call-simulator.ts
✅ selectBestProvider()  → Move to services/vetting/provider-selector.ts
✅ scheduleAppointment() → Move to services/booking/appointment-scheduler.ts
```

### What to Deprecate from gemini.ts
```typescript
❌ searchProviders() → Use ResearchService.search() instead
```

### Why DirectResearchClient Wins

| Feature | gemini.ts | DirectResearchClient |
|---------|-----------|----------------------|
| Google Places API | ✅ | ✅ |
| Maps Grounding | ✅ | ✅ |
| JSON Fallback | ❌ | ✅ |
| Deduplication | Basic | Advanced |
| Structured Logging | ❌ | ✅ |
| Health Checking | ❌ | ✅ |
| Kestra Integration | ❌ | ✅ |
| Service Request Tracking | ❌ | ✅ |

**Score: 6-0 (with 2 ties)**

---

## Migration Steps

### Phase 1: Prepare (Sprint 1)
```bash
# 1. Audit frontend usage
grep -r "geminiService.searchProviders" apps/web/

# 2. Create new service directories
mkdir -p apps/api/src/services/{vetting,booking}

# 3. Move gemini functions
mv simulateCall() → services/vetting/call-simulator.ts
mv selectBestProvider() → services/vetting/provider-selector.ts
mv scheduleAppointment() → services/booking/appointment-scheduler.ts
```

### Phase 2: Migrate (Sprint 2)
```typescript
// Update frontend
// OLD:
import { searchProviders } from '@/lib/services/geminiService'

// NEW:
import { searchProviders } from '@/lib/services/workflowService'

// Add deprecation warning to API
fastify.post("/search-providers", async (request, reply) => {
  reply.header('X-Deprecated', 'Use /api/v1/workflows/research');
  // ... existing code
});
```

### Phase 3: Cleanup (Sprint 3)
```bash
# After 1 week with no deprecated endpoint usage:

# Remove deprecated route
rm -rf apps/api/src/routes/gemini.ts (search-providers only)

# Remove legacy frontend service
rm apps/web/lib/services/geminiService.ts (or refactor)

# Update docs
update CLAUDE.md with new architecture
```

---

## API Changes

### Before (Dual APIs)
```
Research:
POST /api/v1/gemini/search-providers ⚠️  (Legacy - to deprecate)
POST /api/v1/workflows/research      ✅  (Modern - keep)

Vetting:
POST /api/v1/gemini/simulate-call    ✅  (Keep)
POST /api/v1/gemini/select-best      ✅  (Keep)

Booking:
POST /api/v1/gemini/schedule         ✅  (Keep)
```

### After (Clean APIs)
```
Research:
POST /api/v1/workflows/research      ✅  (Primary)
GET  /api/v1/workflows/status        ✅  (Health check)

Vetting:
POST /api/v1/vetting/simulate-call   ✅  (Renamed)
POST /api/v1/vetting/select-best     ✅  (Renamed)

Booking:
POST /api/v1/booking/schedule        ✅  (Renamed)
```

---

## Breaking Changes

### Will Break
1. Frontend calls to `/api/v1/gemini/search-providers`
2. Direct API calls from external clients (if any)

### Will NOT Break
1. Other gemini endpoints (simulateCall, selectBestProvider, scheduleAppointment)
2. Workflow endpoints (already using ResearchService)
3. Database operations
4. Type definitions (Provider type is compatible)

---

## Benefits

### Immediate
- ✅ Eliminate 274 lines of duplicate code
- ✅ Single source of truth for provider search
- ✅ Gain triple-layer fallback (Places → Grounding → JSON)
- ✅ Gain structured logging

### Long-term
- ✅ Better scalability (can add more execution engines)
- ✅ Easier maintenance (one implementation to update)
- ✅ Clearer API boundaries (domain-driven endpoints)
- ✅ Better onboarding (clearer architecture)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Frontend breaks | Phased rollout with deprecation period |
| Missing functionality | Feature parity analysis completed ✅ |
| Performance regression | DirectResearch has same/better performance |
| External API consumers | Deprecation headers + grace period |

---

## Checklist

### Pre-Migration
- [ ] Audit all uses of `geminiService.searchProviders()`
- [ ] Check for direct calls to `/api/v1/gemini/search-providers`
- [ ] Review and update test suite
- [ ] Create backup branch

### Migration
- [ ] Create vetting/ and booking/ service directories
- [ ] Move simulateCall() to call-simulator.ts
- [ ] Move selectBestProvider() to provider-selector.ts
- [ ] Move scheduleAppointment() to appointment-scheduler.ts
- [ ] Update frontend to use workflowService
- [ ] Add deprecation warnings
- [ ] Test all workflows end-to-end

### Post-Migration
- [ ] Monitor logs for deprecated endpoint usage (1 week)
- [ ] Remove deprecated `/api/v1/gemini/search-providers` route
- [ ] Update API documentation
- [ ] Update CLAUDE.md
- [ ] Announce changes to team

---

## Timeline

```
Sprint 1 (Week 1-2): Preparation
├── Week 1: Audit, create directories, plan
└── Week 2: Move supporting functions (vetting, booking)

Sprint 2 (Week 3-4): Migration
├── Week 3: Update frontend, add deprecation warnings
└── Week 4: Test thoroughly, fix issues

Sprint 3 (Week 5-6): Cleanup
├── Week 5: Monitor usage, ensure stability
└── Week 6: Remove deprecated code, update docs
```

**Total: 2-3 sprints (4-6 weeks)**

---

## Decision

**✅ RECOMMENDED: Proceed with consolidation**

**Reason:**
- Clear technical superiority (DirectResearchClient wins 6-0)
- Manageable risk with phased approach
- Significant long-term benefits
- Low effort (3 days of focused work)

**Next Steps:**
1. Get team approval
2. Create migration branch
3. Start Sprint 1 (preparation)

---

## Questions?

**Q: Why not just keep both?**
A: Code duplication doubles maintenance burden and confuses developers.

**Q: What if the new service has bugs?**
A: We can keep deprecated endpoint temporarily during grace period.

**Q: Will this affect performance?**
A: No - DirectResearchClient has same/better performance with more fallback layers.

**Q: What about external API consumers?**
A: Deprecation headers will warn them, grace period allows migration time.

---

**Created:** 2025-12-09
**Author:** Claude Code
**Status:** ✅ Ready for team review
