# Async Batch Call Flow Implementation Plan

**Date**: 2025-12-11
**Author**: Claude AI
**Status**: Complete
**Type**: Fix/Refactor

## Summary

Fix the timeout issue in the `/new` page call flow by implementing async batch calling following 2025 best practices. The endpoint will return HTTP 202 Accepted immediately with an execution ID, while calls run in the background with real-time updates via Supabase subscriptions.

## Table of Contents
- [Problem Analysis](#problem-analysis)
- [2025 Best Practices Research](#2025-best-practices-research)
- [Implementation Plan](#implementation-plan)
- [Architecture](#architecture)

---

## Problem Analysis

### Root Cause
The `/api/v1/providers/batch-call` endpoint is **synchronous** - it waits for all VAPI calls to complete (up to 5+ minutes) before returning a response.

### What Happens
1. Frontend calls `/batch-call` (fire-and-forget pattern)
2. Backend starts VAPI calls and **blocks** waiting for completion
3. **Vercel proxy times out at 45-60 seconds**
4. Frontend receives timeout error
5. Backend continues running, calls complete, database updated
6. But user already saw error message

### Evidence

| Component | Finding | Issue |
|-----------|---------|-------|
| Backend | Awaits `Promise.allSettled()` for all calls | Blocks 5+ minutes |
| Frontend Timeout | Vercel rewrite: 45-60s | Too short for calls |
| Fire-and-Forget | `fetch()` without await | Still times out |
| Real-time | Supabase subscriptions work | Updates happen after DB write |
| Database Updates | Only at call completion | No progress visibility during call |

---

## 2025 Best Practices Research

Based on Perplexity Deep research:

| Practice | Recommendation | Our Approach |
|----------|----------------|--------------|
| **HTTP Status** | Return `202 Accepted` with job ID | Will implement |
| **Status Endpoint** | Provide `/jobs/{id}/status` for polling fallback | Will add |
| **Background Processing** | Use `setImmediate` for I/O-bound tasks | Appropriate for VAPI calls |
| **Real-time Updates** | Supabase WebSocket subscriptions preferred | Already have this |
| **Idempotency** | Safe retries with unique execution IDs | Will implement |
| **Schema Validation** | Validate input before queuing | Already using Zod |

**Key Insight:** VAPI calls are I/O-bound (waiting for external API), not CPU-bound. `setImmediate` is correct - no worker threads needed.

---

## Implementation Plan

### Phase 1: Backend - Async Batch Call Endpoint

**File:** `apps/api/src/routes/providers.ts`

**New endpoint:** `POST /api/v1/providers/batch-call-async`

- Returns HTTP 202 Accepted immediately
- Includes execution ID and status URL
- Marks providers as "queued" before returning
- Spawns background process with `setImmediate`

### Phase 2: Backend - Status Polling Endpoint

**File:** `apps/api/src/routes/providers.ts`

**New endpoint:** `GET /api/v1/providers/batch-status/:serviceRequestId`

- Returns current state of all provider calls
- Calculates stats: queued, inProgress, completed
- Fallback for clients without WebSocket support

### Phase 3: Backend - Mark In-Progress During Call

**File:** `apps/api/src/services/vapi/call-result.service.ts`

**New method:** `markCallInProgress(providerId, callId)`

- Updates provider with `call_status: 'in_progress'`
- Sets `call_id` and `called_at` immediately
- Triggers Supabase real-time for frontend

**File:** `apps/api/src/services/vapi/direct-vapi.client.ts`

- Call `markCallInProgress()` after VAPI call created, before waiting

### Phase 4: Frontend - Use Async Endpoint

**File:** `apps/web/app/new/page.tsx`

- Call `/batch-call-async` instead of `/batch-call`
- Expect 202 response, navigate immediately
- Let real-time subscriptions handle updates

### Phase 5: Frontend - Enhanced Progress Display

**File:** `apps/web/app/request/[id]/page.tsx`

- Calculate progress from provider `call_status`
- Pass progress to LiveStatus component
- Show: X of Y complete, current provider name

---

## Architecture

```
Frontend                    Backend                     VAPI
   │                           │                          │
   │──POST /batch-call-async──►│                          │
   │◄──202 {executionId}──────│  (returns immediately)   │
   │                           │                          │
   │──Navigate to /request/id  │──Start call #1 (async)──►│
   │                           │──Update DB: in_progress──│
   │◄──Real-time: in_progress─│                          │
   │                           │◄─────Call #1 complete────│
   │                           │──Update DB: completed────│
   │◄──Real-time: completed───│                          │
```

---

## Files To Modify

| File | Action | Key Changes |
|------|--------|-------------|
| `apps/api/src/routes/providers.ts` | MODIFY | Add `/batch-call-async` + `/batch-status` |
| `apps/api/src/services/vapi/call-result.service.ts` | MODIFY | Add `markCallInProgress()` |
| `apps/api/src/services/vapi/direct-vapi.client.ts` | MODIFY | Call `markCallInProgress()` |
| `apps/web/app/new/page.tsx` | MODIFY | Use async endpoint |
| `apps/web/app/request/[id]/page.tsx` | MODIFY | Calculate/display progress |
| `apps/web/components/LiveStatus.tsx` | MODIFY | Show call progress |

---

## Document Metadata

**Last Updated**: 2025-12-11
**Implementation Status**: In Progress
**Related Documents**:
- [3_DAY_HACKATHON_SPRINT.md](../3_DAY_HACKATHON_SPRINT.md)
- [FEATURE_PREFERRED_CONTACT.md](./FEATURE_PREFERRED_CONTACT.md)

**Change Log**:
- 2025-12-11 - Initial creation with 2025 best practices research
