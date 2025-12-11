# Service Consolidation Quick Reference

**One-page cheat sheet for the gemini.ts → ResearchService consolidation**

---

## 🎯 The Goal

Eliminate duplicate provider search code by consolidating `gemini.ts::searchProviders()` into `ResearchService`.

---

## 📊 The Score

| Feature | gemini.ts | ResearchService |
|---------|-----------|-----------------|
| Google Places API | ✅ | ✅ |
| Maps Grounding | ✅ | ✅ |
| JSON Fallback | ❌ | ✅ |
| Deduplication | Basic | ✅ Advanced |
| Logging | ❌ | ✅ Structured |
| Health Checks | ❌ | ✅ |
| Kestra Support | ❌ | ✅ |

**Winner:** ResearchService (6-0)

---

## 📁 What Changes

### Files to Keep (Move to New Locations)
```
gemini.ts::simulateCall()        → vetting/call-simulator.ts
gemini.ts::selectBestProvider()  → vetting/provider-selector.ts
gemini.ts::scheduleAppointment() → booking/appointment-scheduler.ts
```

### Files to Deprecate
```
❌ gemini.ts::searchProviders()   → Use ResearchService.search()
❌ /api/v1/gemini/search-providers → Use /api/v1/workflows/research
```

### Files to Update
```
✏️ apps/api/src/routes/gemini.ts          (add deprecation warnings)
✏️ apps/web/lib/services/geminiService.ts (proxy to workflow API)
```

---

## 🚀 Quick Start Commands

```bash
# 1. Create branch
git checkout -b feature/consolidate-research

# 2. Create directories
mkdir -p apps/api/src/services/{vetting,booking}

# 3. Run tests before changes
pnpm test

# 4. Follow implementation guide
# See: CONSOLIDATION_IMPLEMENTATION_GUIDE.md

# 5. Test locally
pnpm dev

# 6. Deploy to staging
git push origin feature/consolidate-research:staging
```

---

## 🔍 Finding Usage

```bash
# Find geminiService usage
grep -rn "geminiService.searchProviders" apps/web/

# Find direct API calls
grep -rn "/api/v1/gemini/search-providers" apps/

# Check for imports
grep -rn "from.*gemini" apps/api/src/routes/
```

---

## ⏱️ Timeline

| Sprint | Duration | Tasks |
|--------|----------|-------|
| Sprint 1 | 2 weeks | Audit, create structure, move functions |
| Sprint 2 | 2 weeks | Update routes/frontend, add warnings, test |
| Sprint 3 | 2 weeks | Monitor, remove deprecated code |

**Total:** 4-6 weeks (phased approach)

---

## ✅ Pre-Flight Checklist

Before starting implementation:
- [ ] Read CONSOLIDATION_SUMMARY.md
- [ ] Team approval obtained
- [ ] Feature branch created
- [ ] Tests passing locally
- [ ] Backup of gemini.ts created

---

## 🛠️ Implementation Steps (Condensed)

### Step 1: Create Services (2 hours)
```typescript
// vetting/call-simulator.ts
export const simulateCall = async (name, criteria, isDirect) => { ... }

// vetting/provider-selector.ts
export const selectBestProvider = async (title, interactions, providers) => { ... }

// booking/appointment-scheduler.ts
export const scheduleAppointment = async (name, details) => { ... }
```

### Step 2: Update Routes (1 hour)
```typescript
// routes/gemini.ts
import { simulateCall } from "../services/vetting/call-simulator.js";
import { selectBestProvider } from "../services/vetting/provider-selector.js";
import { scheduleAppointment } from "../services/booking/appointment-scheduler.js";

fastify.post("/search-providers", async (request, reply) => {
  reply.header("X-Deprecated", "true");
  reply.header("X-Deprecated-By", "/api/v1/workflows/research");
  // ... existing code
});
```

### Step 3: Update Frontend (1 hour)
```typescript
// lib/services/geminiService.ts
export const searchProviders = async (query, location) => {
  console.warn("Deprecated: Use workflowService.searchProviders()");

  const response = await fetch("/api/v1/workflows/research", {
    method: "POST",
    body: JSON.stringify({ service: query, location }),
  });

  return response.json();
};
```

### Step 4: Test (4 hours)
```bash
# Unit tests
pnpm test

# Integration tests
curl -X POST http://localhost:8000/api/v1/workflows/research

# E2E tests
# Navigate to http://localhost:3000/new and test search
```

### Step 5: Deploy (1 hour)
```bash
git add .
git commit -m "feat: consolidate research service"
git push origin feature/consolidate-research:staging
```

### Step 6: Monitor (1 week)
```bash
# Check logs daily
grep "deprecated_endpoint_usage" logs/*.log | wc -l

# If 0 for 7 days, proceed with removal
```

### Step 7: Remove (2 hours)
```typescript
// Delete searchProviders from gemini.ts
// Delete search-providers route
// Update documentation
```

---

## 🧪 Test Commands

```bash
# Run all tests
pnpm test

# Test specific service
pnpm --filter api test vetting

# Test deprecated endpoint
curl -X POST http://localhost:8000/api/v1/gemini/search-providers \
  -H "Content-Type: application/json" \
  -d '{"query":"plumber","location":"Greenville SC"}' \
  -v | grep "X-Deprecated"

# Test new endpoint
curl -X POST http://localhost:8000/api/v1/workflows/research \
  -H "Content-Type: application/json" \
  -d '{"service":"plumber","location":"Greenville SC"}' \
  | jq '.data.providers | length'
```

---

## 🚨 Troubleshooting

### Issue: Frontend not working
```bash
# Check API endpoint
curl -X POST http://localhost:8000/api/v1/workflows/research \
  -H "Content-Type: application/json" \
  -d '{"service":"test","location":"Greenville SC"}'

# Check frontend console for errors
# Verify workflowService is imported correctly
```

### Issue: Types mismatch
```typescript
// Use shared types
import type { Provider } from "../research/types.js";
```

### Issue: Environment variables missing
```bash
# Check .env exists
ls -la apps/api/.env

# Verify GEMINI_API_KEY
grep GEMINI_API_KEY apps/api/.env

# Restart server
pnpm --filter api dev
```

---

## 🔄 Rollback Procedure

If something goes wrong:

```bash
# Option 1: Git revert
git revert HEAD
git push origin main

# Option 2: Restore from backup
cp apps/api/src/services/gemini.ts.backup apps/api/src/services/gemini.ts

# Option 3: Checkout previous commit
git checkout main~1
git push origin main

# Redeploy
# Monitor stability
```

---

## 📈 Success Metrics

Track these metrics:

| Metric | Target |
|--------|--------|
| Duplicate lines removed | 274 |
| Deprecated endpoint calls/day | 0 |
| Test coverage | >80% |
| Search latency | <2s |
| Error rate | <1% |

---

## 📚 Documentation Links

- **Start here:** [CONSOLIDATION_INDEX.md](./CONSOLIDATION_INDEX.md)
- **5 min read:** [CONSOLIDATION_SUMMARY.md](./CONSOLIDATION_SUMMARY.md)
- **Deep dive:** [CONSOLIDATION_ANALYSIS.md](./CONSOLIDATION_ANALYSIS.md)
- **Visual guide:** [ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md)
- **Step-by-step:** [CONSOLIDATION_IMPLEMENTATION_GUIDE.md](./CONSOLIDATION_IMPLEMENTATION_GUIDE.md)

---

## 🎯 Decision Summary

**Problem:** 274 lines of duplicate provider search code

**Solution:** Consolidate on ResearchService + DirectResearchClient

**Effort:** 3 days (24 hours) over 2-3 sprints

**Risk:** 🟡 Medium (with phased approach)

**Recommendation:** ✅ **Proceed with consolidation**

---

## 📞 Key Contacts

| Role | Responsible For |
|------|-----------------|
| Tech Lead | Architecture approval, code review |
| Backend Engineer | Service implementation, testing |
| Frontend Engineer | Frontend updates, testing |
| DevOps | Deployment, monitoring |
| Product Manager | Timeline, prioritization |

---

## 📝 Quick Notes Section

```
Sprint 1 Start Date: ___________
Sprint 1 Complete:   ___________

Sprint 2 Start Date: ___________
Sprint 2 Complete:   ___________

Sprint 3 Start Date: ___________
Sprint 3 Complete:   ___________

Deployed to Staging: ___________
Deployed to Production: ________
Deprecated Code Removed: _______

Issues Encountered:
1. _________________________________
2. _________________________________
3. _________________________________

Lessons Learned:
1. _________________________________
2. _________________________________
3. _________________________________
```

---

**Print this page and keep it at your desk during implementation!**

**Document Version:** 1.0
**Created:** 2025-12-09
**Last Updated:** 2025-12-09
