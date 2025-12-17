# Open Source Conversion Plan - AI Concierge

**Date**: 2024-12-16
**Author**: Claude AI
**Status**: In Progress
**Type**: Feature/Infrastructure

## Table of Contents
- [Executive Summary](#executive-summary)
- [Phase 1: Files to Remove/Scrub](#phase-1-files-to-removescrub)
- [Phase 2: Files to Add](#phase-2-files-to-add)
- [Phase 3: Files to Reorganize](#phase-3-files-to-reorganize)
- [Phase 4: Configuration Changes](#phase-4-configuration-changes)
- [Phase 5: CI/CD & Quality](#phase-5-cicd--quality)
- [Phase 6: Third-Party Documentation](#phase-6-third-party-documentation)
- [Implementation Checklist](#implementation-checklist)

---

## Executive Summary

Converting AI Concierge to an MIT-licensed open source GitHub project.

| Category | Current State | Risk Level |
|----------|--------------|------------|
| **Secrets in Git History** | ✅ CLEAN | None |
| **Local .env Files** | ✅ Already gitignored & rotated | None |
| **License** | ❌ MISSING | **BLOCKING** |
| **Contributing Docs** | ❌ MISSING | **BLOCKING** |
| **Tests** | ❌ 0 test files | High |
| **Documentation** | ⚠️ Chaotic (63+ files) | Medium |
| **CI/CD** | ⚠️ Cline-specific only | Medium |

**Confidence Level: 90%**

---

## Phase 1: Files to Remove/Scrub

### Must Scrub (Hardcoded Values)

| File | Issue | Fix |
|------|-------|-----|
| `apps/web/vercel.json` | Hardcoded Railway URL | Remove or use env variable |

### Already Safe
- Git history is **CLEAN** - no secrets ever committed
- `.gitignore` properly configured
- Local .env files already rotated by user

---

## Phase 2: Files to Add

### Critical (Blocking Release)

| File | Purpose | Priority |
|------|---------|----------|
| `LICENSE` | MIT license text | **P0** |
| `CONTRIBUTING.md` | How to contribute | **P0** |
| `CODE_OF_CONDUCT.md` | Community standards | **P0** |
| `SECURITY.md` | Vulnerability reporting | **P0** |
| `apps/web/.env.example` | Frontend env template | **P0** |

### High Priority

| File | Purpose |
|------|---------|
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Structured bug reports |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Feature requests |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist |
| `.github/CODEOWNERS` | Code ownership |
| `.github/workflows/ci.yml` | Standard CI (lint, typecheck, build) |
| `.github/dependabot.yml` | Dependency updates |
| `CHANGELOG.md` | Version history |

### Nice to Have

| File | Purpose |
|------|---------|
| `ROADMAP.md` | Project direction |
| `.github/FUNDING.yml` | Sponsor button |

---

## Phase 3: Files to Reorganize

### Root Level Cleanup (17 → 5 files)

| Action | Files |
|--------|-------|
| **KEEP** | `README.md`, `CLAUDE.md` |
| **MOVE to docs/internal/** | `CLINE_*.md` (5 files) |
| **MOVE to docs/guides/** | `GOOGLE_MAPS_*.md`, `VAPI_*.md`, `WEBHOOK_*.md` |
| **MOVE to docs/internal/** | `UPDATE_*.md`, `QUICK_REFERENCE*.md` |

### docs/ Folder Restructure

```
docs/
├── README.md              # Index/TOC
├── GETTING_STARTED.md     # Step-by-step setup
├── ARCHITECTURE.md        # Keep (consolidate from existing)
├── DEPLOYMENT.md          # Production deployment
├── guides/
│   ├── vapi-setup.md
│   ├── supabase-setup.md
│   └── google-places-setup.md
├── reference/
│   ├── api-endpoints.md
│   └── database-schema.md
└── internal/              # Not deleted, clearly marked
    ├── hackathon/         # Archive hackathon files
    └── feature-plans/     # Move from docs/plans/
```

---

## Phase 4: Configuration Changes

### package.json Updates (Root)

```json
{
  "name": "concierge-ai",
  "private": false,
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_ORG/concierge-ai"
  },
  "keywords": ["ai", "voice-ai", "receptionist", "vapi", "nextjs", "fastify"],
  "author": "Team NexAI"
}
```

### vercel.json Fix

Remove or comment the hardcoded production URL for OSS release.

---

## Phase 5: CI/CD & Quality

### New CI Workflow

Create `.github/workflows/ci.yml` with:
- pnpm install
- Type checking (pnpm check-types)
- Linting (pnpm lint)
- Build verification (pnpm build)

### Dependabot Configuration

Create `.github/dependabot.yml` for automated dependency updates.

---

## Phase 6: Third-Party Documentation

Add to README.md:

| Service | Purpose | Get Started |
|---------|---------|-------------|
| [Supabase](https://supabase.com) | Database & Auth | Free tier available |
| [VAPI](https://vapi.ai) | Voice AI calls | Pay-per-minute |
| [Google AI](https://ai.google.dev) | Gemini API | Free tier |
| [Google Places](https://developers.google.com/maps) | Address autocomplete | Pay-per-request |
| [Twilio](https://twilio.com) | SMS (optional) | Pay-per-message |

---

## Implementation Checklist

### Day 1: Critical Blockers
- [ ] Create `LICENSE` (MIT)
- [ ] Create `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- [ ] Create `CONTRIBUTING.md`
- [ ] Create `SECURITY.md`
- [ ] Create `apps/web/.env.example`
- [ ] Update root `package.json` (private: false, license: MIT)
- [ ] Scrub `vercel.json` hardcoded URL

### Day 2: Documentation & Templates
- [ ] Create `.github/ISSUE_TEMPLATE/bug_report.yml`
- [ ] Create `.github/ISSUE_TEMPLATE/feature_request.yml`
- [ ] Create `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] Create `.github/CODEOWNERS`
- [ ] Create `CHANGELOG.md`
- [ ] Move root .md files to organized locations
- [ ] Restructure docs/ folder

### Day 3: Quality & CI
- [ ] Create `.github/workflows/ci.yml`
- [ ] Create `.github/dependabot.yml`
- [ ] Update README with third-party services table
- [ ] Add badges to README (license, CI status)

---

## Document Metadata

**Last Updated**: 2024-12-16
**Implementation Status**: In Progress
**Related Documents**:
- [CLAUDE.md](/CLAUDE.md)
- [docs/architecture.md](/docs/architecture.md)

**Change Log**:
- 2024-12-16 - Initial creation from multi-agent gap analysis
