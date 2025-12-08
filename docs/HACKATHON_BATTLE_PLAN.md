# AI Concierge Hackathon - Comprehensive Battle Plan

**Date**: 2025-12-07
**Author**: AI Agent (Claude)
**Status**: Draft
**Version**: 1.0
**Related Issues**: N/A

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Target Prizes](#target-prizes)
3. [Current Codebase Status](#current-codebase-status)
4. [Team Allocation Strategy](#team-allocation-strategy)
5. [Task Breakdown by Category](#task-breakdown-by-category)
6. [Recommended Timeline](#recommended-timeline)
7. [Risk Mitigation](#risk-mitigation)
8. [Demo Script](#demo-script)
9. [Key Files to Create/Modify](#key-files-to-createmodify)
10. [Success Criteria Checklist](#success-criteria-checklist)
11. [Immediate Next Steps](#immediate-next-steps)

---

## Executive Summary

Based on parallel analysis of the codebase, hackathon rules, and strategic positioning:

| Category | Current State | Gap to Victory |
|----------|---------------|----------------|
| **Core App** | 60% complete | Persistence + real-time missing |
| **Prize Readiness** | 1/5 (Vercel easy) | Need Kestra + Cline integrations |
| **Demo Readiness** | 40% | Need polish + stability |

---

## Target Prizes

### Recommended Strategy (90% Confidence Path to $12,000)

| Prize | Value | Difficulty | Recommendation |
|-------|-------|------------|----------------|
| **Infinity Build** (Cline) | $5,000 | Medium | ✅ TARGET |
| **Wakanda Data** (Kestra) | $4,000 | Medium-High | ✅ TARGET |
| **Stormbreaker** (Vercel) | $2,000 | Low | ✅ TARGET |
| **Captain Code** (CodeRabbit) | $1,000 | Very Low | ✅ BONUS |
| **Iron Intelligence** (Oumi) | $3,000 | Very High | ❌ SKIP |

**Total Target: $12,000** (vs risking all $15k and failing)

### Rationale for Skipping Oumi ($3k)

- Requires ML/RL expertise team lacks
- Would consume senior dev time with low success probability
- High complexity, uncertain outcome
- Better ROI focusing on Kestra + Cline

---

## Current Codebase Status

### What's Working

- Next.js 16 frontend with polished dark UI
- Gemini AI integration (search, simulate calls, select provider)
- Supabase schema deployed (users, requests, providers, logs)
- Request form + history pages functional
- Client-side workflow execution

### Critical Gaps

- **No database integration** - Frontend uses localStorage only
- **No authentication** - All requests anonymous
- **No real-time updates** - Users can't see progress
- **No workflow orchestration** - Process runs client-side
- **No deployment** - Local only

### File Structure Overview

```
apps/
├── web/                    # Next.js 16 frontend
│   ├── app/               # Pages (dashboard, request form, history, direct, about)
│   ├── components/        # Sidebar, StatusBadge
│   └── lib/
│       ├── providers/     # AppProvider (localStorage context)
│       ├── services/      # geminiService (API client)
│       └── supabase/      # Server client (configured but unused)
│
└── api/                    # Fastify 5 backend
    ├── src/
    │   ├── routes/        # gemini.ts (AI endpoints), users.ts (CRUD)
    │   └── services/      # gemini.ts (Gemini integration logic)

packages/
├── types/                 # Shared TypeScript interfaces
├── ui/                    # Button, Card, Code components (unused)
└── eslint-config/         # ESLint configs

supabase/
└── migrations/            # Database schema
```

---

## Team Allocation Strategy

| Team Member | Focus Area | Sponsor Tools |
|-------------|------------|---------------|
| **Senior Dev** | Kestra + Cline + Architecture | Wakanda + Infinity |
| **Junior 1** | Frontend UI/UX | Stormbreaker |
| **Junior 2** | Backend API + DB | Wakanda support |
| **Junior 3** | DevOps + QA | CodeRabbit + Vercel |

---

## Task Breakdown by Category

### Category 1: DevOps & Infrastructure

**Difficulty: Low | Owner: Junior 3**

| Task | Priority | Time | Status | Details |
|------|----------|------|--------|---------|
| CodeRabbit setup | P0 | 30 min | TODO | Install GitHub app, add `.coderabbit.yaml` |
| Vercel project creation | P0 | 1 hr | TODO | Connect repo, configure monorepo settings |
| Environment variables | P0 | 30 min | TODO | Set Supabase + Gemini keys in Vercel |
| Vercel deployment | P0 | 1 hr | TODO | Initial deploy, verify API rewrites |
| Production Supabase | P1 | 1 hr | TODO | Switch from local to hosted instance |
| GitHub Actions CI | P2 | 2 hrs | TODO | Lint + type-check on PR |

**Deliverable**: Live URL + CodeRabbit reviewing PRs

---

### Category 2: Frontend Improvements

**Difficulty: Low-Medium | Owner: Junior 1**

| Task | Priority | Time | Status | Details |
|------|----------|------|--------|---------|
| Loading states | P0 | 2 hrs | TODO | Add spinners/skeletons during API calls |
| Error handling UI | P0 | 2 hrs | TODO | Toast notifications, error boundaries |
| Real-time progress | P1 | 3 hrs | TODO | WebSocket/SSE for workflow status |
| Conversation animations | P1 | 3 hrs | TODO | Animated chat bubbles for transcripts |
| Mobile responsiveness | P1 | 2 hrs | TODO | Test/fix sidebar, forms on mobile |
| Provider comparison | P2 | 3 hrs | TODO | Side-by-side provider cards |
| Dark mode toggle | P3 | 1 hr | TODO | Optional light theme |

**Deliverable**: Polished, responsive UI with real-time feedback

---

### Category 3: Backend & Database

**Difficulty: Medium | Owner: Junior 2**

| Task | Priority | Time | Status | Details |
|------|----------|------|--------|---------|
| Wire Supabase reads | P0 | 3 hrs | TODO | History page loads from DB |
| Wire Supabase writes | P0 | 3 hrs | TODO | Save requests/providers/logs |
| Request CRUD endpoints | P0 | 3 hrs | TODO | `GET/POST /api/v1/requests` |
| Interaction log endpoints | P1 | 2 hrs | TODO | `GET /api/v1/requests/:id/logs` |
| Real-time subscriptions | P1 | 2 hrs | TODO | Supabase Realtime for logs |
| Batch processing | P2 | 3 hrs | TODO | Process multiple requests |
| Error logging | P2 | 2 hrs | TODO | Structured error tracking |

**Deliverable**: Full persistence layer, data survives refresh

---

### Category 4: Kestra Integration (Wakanda Data Award - $4,000)

**Difficulty: High | Owner: Senior Dev**

| Task | Priority | Time | Status | Details |
|------|----------|------|--------|---------|
| Task | Priority | Time | Status | Details |
|------|----------|------|--------|---------|
| Kestra Docker setup | P0 | 2 hrs | TODO | `docker-compose.yml` with Kestra |
| Research Agent flow | P0 | 3 hrs | TODO | YAML workflow for provider search |
| VAPI.ai Setup | P0 | 1 hr | TODO | Account setup, buy phone number, API keys |
| VAPI Assistant Config | P0 | 2 hrs | TODO | Configure System Prompt, Voice, and Gemini integration |
| Contact Agent (VAPI Trigger) | P0 | 2 hrs | TODO | Kestra Shell Script -> `call-provider.js` to initiate calls |
| VAPI Webhook Handler | P0 | 2 hrs | TODO | `POST /api/webhooks/vapi` to capture transcripts |
| Analysis Agent | P0 | 2 hrs | TODO | Summarize VAPI transcripts + select best provider |
| Booking Agent | P1 | 2 hrs | TODO | Second VAPI call to schedule appointment |
| API trigger endpoint | P0 | 2 hrs | TODO | `POST /api/v1/workflows/trigger` |
| Webhook callbacks | P1 | 2 hrs | TODO | Kestra → API status updates |
| Decision summary UI | P1 | 2 hrs | TODO | Show AI reasoning to user |

**Deliverable**: Server-side orchestration with VAPI.ai handling real voice calls interacting with Gemini.

#### Kestra Architecture

```
[Frontend] --> [API Trigger Endpoint] --> [Kestra Workflow Engine]
                                                  |
                     +----------------------------+----------------------------+
                     |                            |                            |
              [Research Agent]            [Contact Agent]            [Booking Agent]
              (Google Maps)               (Call Simulation)          (Scheduling)
                     |                            |                            |
                     +----------------------------+----------------------------+
                                                  |
                                          [Supabase DB]
                                                  |
                                          [WebSocket/SSE]
                                                  |
                                           [Frontend UI]
```

---

### Category 5: Cline CLI (Infinity Build Award - $5,000)

**Difficulty: High | Owner: Senior Dev**

| Task | Priority | Time | Status | Details |
|------|----------|------|--------|---------|
| CLI package setup | P0 | 1 hr | TODO | `/packages/cli` with commander.js |
| `generate route` command | P0 | 3 hrs | TODO | AI-assisted API route scaffolding |
| `test-flow` command | P1 | 3 hrs | TODO | Test Kestra workflows locally |
| `migrate` command | P1 | 2 hrs | TODO | Run Supabase migrations |
| `deploy` command | P2 | 2 hrs | TODO | Trigger Vercel deployment |
| `.clinerules` file | P0 | 1 hr | TODO | Project-specific AI context |
| CLI documentation | P1 | 1 hr | TODO | Usage examples in README |

**Deliverable**: Working CLI that demonstrates automation capabilities

#### CLI Package Structure

```
packages/cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Entry point
│   ├── commands/
│   │   ├── generate.ts    # Generate new components
│   │   ├── migrate.ts     # Database migrations
│   │   ├── test-flow.ts   # Test Kestra workflows
│   │   └── deploy.ts      # Deployment helpers
│   └── utils/
│       ├── ai.ts          # AI-assisted code generation
│       └── templates.ts   # Code templates
└── templates/
    ├── route.ts.hbs
    ├── component.tsx.hbs
    └── workflow.yaml.hbs
```

---

### Category 6: Demo & Presentation

**Difficulty: Medium | Owner: All Team**

| Task | Priority | Time | Status | Details |
|------|----------|------|--------|---------|
| Demo data seeding | P0 | 2 hrs | TODO | Pre-populated realistic requests |
| 2-minute video script | P0 | 1 hr | TODO | Hook → Demo → Features → Close |
| Video recording | P0 | 2 hrs | TODO | Screen record with voiceover |
| README overhaul | P0 | 2 hrs | TODO | Setup, screenshots, prize mapping |
| Architecture diagram | P1 | 1 hr | TODO | Visual system design |
| Demo backup plan | P1 | 1 hr | TODO | Offline/fallback if live fails |

**Deliverable**: Compelling video + comprehensive documentation

---

## Recommended Timeline

### 7-Day Schedule

#### Days 1-2: Foundation + Quick Wins

```
Senior:  Kestra Docker + Research Agent flow
Junior1: Loading states + error handling
Junior2: Supabase persistence (reads/writes)
Junior3: CodeRabbit + Vercel setup
```

#### Days 3-4: Core Integrations

```
Senior:  Complete Kestra flows + API webhooks
Junior1: Real-time progress UI + animations
Junior2: Request CRUD endpoints + subscriptions
Junior3: CLI package scaffolding
```

#### Days 5-6: Polish + CLI

```
Senior:  Cline CLI commands + refinement
Junior1: Mobile responsiveness + final UI polish
Junior2: Batch processing + error logging
Junior3: Deploy production + test stability
```

#### Day 7: Demo Prep

```
All:     Bug fixes, demo data, video recording
         README finalization, submission prep
```

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Kestra too complex | Medium | Fallback: Keep client-side flow, show YAML as "planned" |
| Vercel API routing | Low | Use `rewrites` or deploy API separately |
| Time overrun | Medium | Feature freeze Day 5, polish only after |
| Demo crashes | Medium | Pre-record video, seed demo data |
| Junior blockers | High | Daily standups, pair programming sessions |

### Fallback Strategies

**If Kestra integration fails (Day 4):**
- Fallback: Build custom data aggregation with Gemini
- Use existing `interaction_logs` table to generate summaries
- Create manual insights dashboard
- Still showcase data-driven decision making

**If Cline CLI is too complex (Day 2):**
- Fallback: Create simpler Node.js scripts
- Focus on automation value, not tool complexity
- Document why automation matters
- Show manual process vs automated comparison

**If time runs short (Day 7):**
- Priority tiers for cutting:
  - KEEP: All 3 prize integrations, core flow, Vercel deploy
  - CUT: Voice input, advanced animations, SMS/email
  - DEFER: Additional service categories, user profiles

---

## Demo Script

### 2-Minute Video Structure

```
[0:00-0:15] HOOK
"Watch AI call plumbers and book an appointment - completely autonomously."

[0:15-0:45] LIVE DEMO
- Submit request: "Leaking toilet, Greenville SC, $300 budget, 4.7+ rating"
- Show Kestra workflow executing (Research → Contact → Analyze → Book)
- Real-time status updates in UI

[0:45-1:15] RESULTS
- Dashboard shows completed request
- AI decision reasoning displayed
- Call transcripts visible

[1:15-1:45] FEATURES
- History with full audit trail
- Direct contact feature demo
- CLI automation demo

[1:45-2:00] CLOSE
"Built with Kestra orchestration, Cline CLI automation,
deployed on Vercel, reviewed by CodeRabbit.
Solving real-world scheduling problems with AI agents."
```

---

## Key Files to Create/Modify

### New Files to Create

| Path | Purpose |
|------|---------|
| `/.coderabbit.yaml` | CodeRabbit config |
| `/.clinerules` | Cline project context |
| `/docker-compose.yml` | Kestra + services |
| `/kestra/flows/concierge-flow.yaml` | Main workflow |
| `/kestra/flows/research-agent.yaml` | Research agent workflow |
| `/kestra/flows/contact-agent.yaml` | Contact agent workflow |
| `/kestra/flows/booking-agent.yaml` | Booking agent workflow |
| `/packages/cli/` | CLI package directory |
| `/apps/web/vercel.json` | Deployment config |
| `/apps/api/src/routes/workflows.ts` | Workflow API |

### Files to Modify

| Path | Changes |
|------|---------|
| `/apps/web/app/new/page.tsx` | Trigger workflow instead of client process |
| `/apps/web/lib/providers/AppProvider.tsx` | Add Supabase real-time |
| `/apps/api/src/index.ts` | Register new routes |
| `/supabase/migrations/` | Any schema updates |
| `/README.md` | Prize documentation |
| `/package.json` | Add CLI workspace |

---

## Success Criteria Checklist

### Minimum Viable Demo

- [ ] User can submit a service request
- [ ] AI searches providers (Google Maps grounding)
- [ ] AI simulates calls to 3+ providers
- [ ] AI selects best provider with reasoning
- [ ] Appointment confirmation displayed
- [ ] History shows past requests

### Prize Requirements

- [ ] **Kestra**: AI agent summarizes data + makes decisions
- [ ] **Vercel**: Live deployment accessible
- [ ] **CodeRabbit**: 5+ PRs with AI reviews visible
- [ ] **Cline**: 3+ CLI automation commands working

### Judging Criteria Alignment

- [ ] **Impact**: Solves real booking problem
- [ ] **Creativity**: Multi-agent orchestration
- [ ] **Technical**: Sponsor tools deeply integrated
- [ ] **UX**: Polished, responsive interface
- [ ] **Presentation**: Clear video + README

---

## Immediate Next Steps

### First 2 Hours Action Items

**Senior Dev:**
1. Review Kestra documentation: https://kestra.io/docs
2. Set up `docker-compose.yml` with Kestra
3. Create first workflow YAML

**Junior 1:**
1. Create loading state components
2. Add react-hot-toast for notifications
3. Test current UI on mobile

**Junior 2:**
1. Review Supabase schema
2. Create `POST /api/v1/requests` endpoint
3. Wire history page to read from DB

**Junior 3:**
1. Install CodeRabbit GitHub app
2. Create Vercel project
3. Create first PR to test CodeRabbit

**Team Standup (30 min):**
- Confirm prize targets
- Assign Day 1 tasks
- Set up Discord/Slack channel
- Schedule daily syncs

---

## Document Metadata

**Last Updated**: 2025-12-07
**Review Status**: Pending
**Implementation Status**: Not Started
**Related Documents**:
- [About Document](./about.md)
- [AI Concierge Gameplan](./AI%20Concierge%20Gameplan.md)
- [Hackathon Rules](./hackathon.md)

**Change Log**:
- 2025-12-07 - Initial creation based on multi-agent analysis
