# Architecture Comparison: Current vs. Proposed

## Current State (Dual Architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────┐         ┌────────────────────┐         │
│  │  geminiService.ts  │         │ workflowService.ts │         │
│  │  (Legacy)          │         │  (Modern)          │         │
│  └─────────┬──────────┘         └─────────┬──────────┘         │
│            │                               │                     │
└────────────┼───────────────────────────────┼────────────────────┘
             │                               │
             │ HTTP POST                     │ HTTP POST
             │                               │
┌────────────▼───────────────────────────────▼────────────────────┐
│                      BACKEND API                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐      ┌──────────────────────┐        │
│  │ /api/v1/gemini/*     │      │ /api/v1/workflows/*  │        │
│  ├──────────────────────┤      ├──────────────────────┤        │
│  │ search-providers ⚠️  │      │ research ✅          │        │
│  │ simulate-call ✅     │      │ status ✅            │        │
│  │ select-best ✅       │      │                      │        │
│  │ schedule ✅          │      │                      │        │
│  └──────────┬───────────┘      └──────────┬───────────┘        │
│             │                              │                     │
│             │                              │                     │
│  ┌──────────▼───────────┐      ┌──────────▼───────────┐        │
│  │    gemini.ts         │      │  ResearchService     │        │
│  ├──────────────────────┤      ├──────────────────────┤        │
│  │ searchProviders() ❌ │      │ search()             │        │
│  │ simulateCall()       │      │ shouldUseKestra()    │        │
│  │ selectBestProvider() │      │ getSystemStatus()    │        │
│  │ scheduleAppointment()│      └──────────┬───────────┘        │
│  └──────────┬───────────┘                 │                     │
│             │                    ┌─────────┴─────────┐          │
│             │                    │                   │           │
│  ┌──────────▼───────────┐   ┌───▼────────┐   ┌─────▼──────┐   │
│  │ GooglePlacesService  │   │  Kestra    │   │   Direct   │   │
│  │                      │   │  Client    │   │  Research  │   │
│  │ - textSearch()       │   │            │   │  Client    │   │
│  │ - getPlaceDetails()  │   │ (optional) │   │            │   │
│  │ - calculateDistance()│   └────────────┘   └─────┬──────┘   │
│  └──────────────────────┘                          │           │
│             ▲                                      │           │
│             │                                      │           │
│             └──────────────────────────────────────┘           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
             │                                      │
             │                                      │
             ▼                                      ▼
    ┌────────────────┐                   ┌────────────────┐
    │ Google Places  │                   │ Gemini w/ Maps │
    │ API (Primary)  │                   │ Grounding      │
    └────────────────┘                   └────────────────┘

PROBLEM: Duplicate search logic (❌ gemini.ts & DirectResearchClient)
```

---

## Proposed State (Unified Architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│             ┌────────────────────────────────┐                  │
│             │     workflowService.ts         │                  │
│             │     (Single Service)           │                  │
│             └─────────────┬──────────────────┘                  │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                            │ HTTP POST
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                      BACKEND API                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐       ┌─────────────────────┐         │
│  │ /api/v1/workflows/* │       │ /api/v1/gemini/*    │         │
│  ├─────────────────────┤       ├─────────────────────┤         │
│  │ research ✅         │       │ simulate-call ✅    │         │
│  │ status ✅           │       │ select-best ✅      │         │
│  └──────────┬──────────┘       │ schedule ✅         │         │
│             │                  └──────────┬──────────┘         │
│             │                             │                     │
│  ┌──────────▼──────────┐                 │                     │
│  │  ResearchService    │                 │                     │
│  │  (Orchestrator)     │                 │                     │
│  ├─────────────────────┤                 │                     │
│  │ search()            │     ┌───────────▼───────────┐         │
│  │ shouldUseKestra()   │     │  Vetting Service      │         │
│  │ getSystemStatus()   │     ├───────────────────────┤         │
│  └──────────┬──────────┘     │ simulateCall()        │         │
│             │                │ selectBestProvider()  │         │
│    ┌────────┴────────┐       └───────────────────────┘         │
│    │                 │                   │                      │
│ ┌──▼───────┐  ┌──────▼──────┐  ┌────────▼────────┐            │
│ │ Kestra   │  │   Direct    │  │   Booking       │            │
│ │ Client   │  │  Research   │  │   Service       │            │
│ │          │  │  Client     │  ├─────────────────┤            │
│ │(optional)│  ├─────────────┤  │scheduleAppt()   │            │
│ └──────────┘  │Places API ✅│  └─────────────────┘            │
│               │Maps Ground✅│                                  │
│               │JSON Fall ✅ │                                  │
│               │Filter ✅    │                                  │
│               │Dedupe ✅    │                                  │
│               └──────┬──────┘                                  │
│                      │                                          │
└──────────────────────┼──────────────────────────────────────────┘
                       │
                       │
          ┌────────────┴────────────┐
          │                         │
   ┌──────▼────────┐       ┌────────▼───────┐
   │ Google Places │       │ Gemini w/ Maps │
   │ API (Primary) │       │ Grounding      │
   └───────────────┘       └────────────────┘

SOLUTION: Single source of truth (✅ DirectResearchClient only)
```

---

## Service Layer Reorganization

### Current Structure
```
services/
└── gemini.ts (274 lines)
    ├── searchProviders()      ❌ Duplicate
    ├── simulateCall()         ✅ Unique
    ├── selectBestProvider()   ✅ Unique
    └── scheduleAppointment()  ✅ Unique

services/research/
├── research.service.ts        ✅ Orchestrator
├── direct-research.client.ts  ✅ Implementation
├── kestra-research.client.ts  ✅ Optional
└── types.ts                   ✅ Shared types
```

### Proposed Structure
```
services/
├── research/
│   ├── research.service.ts         (Orchestrator)
│   ├── direct-research.client.ts   (Search implementation)
│   ├── kestra-research.client.ts   (Optional orchestration)
│   └── types.ts                    (Shared types)
│
├── vetting/
│   ├── call-simulator.ts           (Moved from gemini.ts)
│   ├── provider-selector.ts        (Moved from gemini.ts)
│   └── types.ts                    (Call & selection types)
│
├── booking/
│   ├── appointment-scheduler.ts    (Moved from gemini.ts)
│   └── types.ts                    (Booking types)
│
└── places/
    └── google-places.service.ts    (Existing - shared utility)
```

---

## API Endpoint Evolution

### Phase 1: Current (Dual APIs)
```
✅ POST /api/v1/workflows/research         (Modern - keep)
✅ GET  /api/v1/workflows/status           (Modern - keep)

⚠️  POST /api/v1/gemini/search-providers  (Legacy - deprecate)
✅ POST /api/v1/gemini/simulate-call      (Keep as-is)
✅ POST /api/v1/gemini/select-best        (Keep as-is)
✅ POST /api/v1/gemini/schedule           (Keep as-is)
```

### Phase 2: Refactored (Clear separation)
```
Research Domain:
POST /api/v1/workflows/research
GET  /api/v1/workflows/status

Vetting Domain:
POST /api/v1/vetting/simulate-call       (Renamed from gemini)
POST /api/v1/vetting/select-best         (Renamed from gemini)

Booking Domain:
POST /api/v1/booking/schedule            (Renamed from gemini)

Deprecated:
[REMOVED] /api/v1/gemini/*
```

---

## Data Flow Comparison

### Current: Dual Flow (Confusing)

```
User Request "Find plumbers in Greenville SC"
    │
    ├─► Old Flow (via geminiService)
    │   └─► /api/v1/gemini/search-providers
    │       └─► gemini.ts::searchProviders()
    │           ├─► Google Places API
    │           └─► Maps Grounding (fallback)
    │
    └─► New Flow (via workflowService)
        └─► /api/v1/workflows/research
            └─► ResearchService::search()
                ├─► Kestra? (if available)
                │   └─► Orchestrated workflow
                │
                └─► DirectResearchClient (fallback)
                    ├─► Google Places API
                    ├─► Maps Grounding (fallback)
                    └─► JSON Parsing (fallback)
```

### Proposed: Unified Flow (Clear)

```
User Request "Find plumbers in Greenville SC"
    │
    └─► Unified Flow (via workflowService only)
        └─► /api/v1/workflows/research
            └─► ResearchService::search()
                │
                ├─► Kestra Client (if configured & healthy)
                │   └─► Distributed workflow execution
                │       └─► Multi-step orchestration
                │
                └─► DirectResearchClient (direct or fallback)
                    ├─► 1st: Google Places API
                    ├─► 2nd: Maps Grounding
                    └─► 3rd: JSON Parsing
```

---

## Key Improvements

### 1. Single Source of Truth
- **Before:** Two search implementations to maintain
- **After:** One search implementation (DirectResearchClient)

### 2. Better Fallback Strategy
- **Before:** Places → Grounding (2 layers)
- **After:** Places → Grounding → JSON (3 layers)

### 3. Orchestration Support
- **Before:** Direct execution only
- **After:** Kestra orchestration with direct fallback

### 4. Clearer API Surface
- **Before:** Mixed `/gemini` and `/workflows` endpoints
- **After:** Domain-driven endpoints (`/workflows`, `/vetting`, `/booking`)

### 5. Better Separation of Concerns
- **Before:** Monolithic `gemini.ts` (274 lines)
- **After:** Modular services by domain
  - Research: Provider search
  - Vetting: Call simulation & selection
  - Booking: Appointment scheduling

---

## Migration Impact Matrix

| Component | Current State | After Migration | Risk | Effort |
|-----------|--------------|-----------------|------|--------|
| Frontend search | Uses both services | Uses workflows only | 🟡 Medium | 4 hrs |
| Backend search | Duplicate logic | Single implementation | 🟢 Low | 2 hrs |
| Call simulation | In gemini.ts | In vetting service | 🟢 Low | 2 hrs |
| Provider selection | In gemini.ts | In vetting service | 🟢 Low | 2 hrs |
| Appointment scheduling | In gemini.ts | In booking service | 🟢 Low | 2 hrs |
| Tests | Split across services | Domain-specific | 🟡 Medium | 8 hrs |
| Documentation | Outdated | Reflects new structure | 🟢 Low | 4 hrs |

**Total Effort:** ~24 hours (3 days)

---

## Success Metrics

### Code Quality
- ✅ Lines of duplicated code: **274 → 0**
- ✅ Service coupling: **High → Low**
- ✅ Test coverage: **Maintain >80%**

### Performance
- ✅ Search latency: **Same or better**
- ✅ Fallback reliability: **67% → 100%** (2 layers → 3 layers)
- ✅ API response time: **<2s maintained**

### Developer Experience
- ✅ Onboarding time: **Reduced** (clearer structure)
- ✅ Code navigation: **Improved** (domain-driven)
- ✅ Maintenance burden: **Reduced** (single implementation)

---

## Rollback Plan

If migration fails:
1. Revert frontend to use `geminiService` for search
2. Keep workflow routes for testing
3. Maintain both services temporarily
4. Investigate root cause
5. Re-plan migration

**Rollback Time:** <1 hour (simple git revert)

---

**Document Version:** 1.0
**Created:** 2025-12-09
**Next Review:** After Phase 1 completion
