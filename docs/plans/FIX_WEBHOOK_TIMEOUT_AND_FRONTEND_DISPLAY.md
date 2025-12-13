# Fix: Webhook Timeout & Frontend Display Issues

**Date**: 2025-12-12
**Author**: Claude AI
**Status**: In Progress
**Type**: Fix

## Table of Contents
- [Executive Summary](#executive-summary)
- [Root Cause Analysis](#root-cause-analysis)
- [Current Architecture](#current-architecture)
- [Issues Identified](#issues-identified)
- [Fix Plan - Option A (Quick Fix)](#fix-plan---option-a-quick-fix)
- [Implementation Details](#implementation-details)
- [Testing Plan](#testing-plan)

---

## Executive Summary

**Root Cause Found**: The 5-minute webhook timeout is caused by **incomplete status handling** in the polling logic. When VAPI analysis isn't ready within the 16-second enrichment window, the status becomes `"fetch_failed"`, but the polling code only exits on `"complete"` status - causing it to wait the full 5 minutes before falling back to direct VAPI polling.

**Additional Issues**:
1. Race condition in frontend provider updates (only 1 of 2 calls showing)
2. `recommendationsChecked` flag blocks recommendation display
3. 5-minute webhook timeout too long

---

## Root Cause Analysis

### Evidence from Error Logs

```
[00:33:56-00:36:06] GET /api/v1/vapi/calls/... → 200 OK (every 2 seconds)
[00:36:06] WARN: Webhook result timeout (timeoutMs: 300000)
[00:36:07] INFO: Call data complete, returning (via VAPI polling fallback)
```

**Key Observations:**
1. **200 OK responses** (not 404) → Cache entry EXISTS
2. **No "complete" status** reached → Polling waited full 5 minutes
3. **Fallback worked immediately** → VAPI had the data all along

### The Bug in direct-vapi.client.ts

```typescript
// Current code only handles 2 statuses:
if (data && data.dataStatus === "complete") {
  return data;  // ✅ Exit
}

if (data && data.dataStatus === "partial") {
  // Just log, keep waiting
}

// MISSING: No handling for "fetch_failed" or "fetching"!
// Result: Polls for 5 minutes before timeout fallback
```

### Why Enrichment Fails

1. Webhook received → dataStatus = `"partial"`
2. Background enrichment starts → dataStatus = `"fetching"`
3. Enrichment waits 3s, 5s, 8s (16s total) and checks VAPI API
4. VAPI analysis often takes 20-30+ seconds to complete
5. Enrichment exhausts retries → dataStatus = `"fetch_failed"`
6. Polling code doesn't recognize `"fetch_failed"` → waits 5 minutes

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT HYBRID WEBHOOK FLOW                         │
└─────────────────────────────────────────────────────────────────────────────┘

1. CALL INITIATION (DirectVapiClient.initiateCall)
   - Check VAPI_WEBHOOK_URL env var
   - If set: Add server.url + serverMessages to assistant config
   - Create VAPI call with webhook config

2. PARALLEL PATHS START

   PATH A: VAPI Sends Webhook (async)
   - VAPI POST → /api/v1/vapi/webhook
   - Store in cache with dataStatus = "partial"
   - Trigger background enrichment (async)
   - Background tries 3x (3s, 5s, 8s = 16s total)
   - If analysis ready: dataStatus = "complete"
   - If not ready after 3 attempts: dataStatus = "fetch_failed" ← BUG

   PATH B: Client Polls Cache (waitForWebhookResult)
   - Every 2 seconds: GET /api/v1/vapi/calls/:callId
   - Check dataStatus:
     - "complete" → Return result ✅
     - "partial" → Log, wait
     - "fetching" → Wait ← BUG: Not handled!
     - "fetch_failed" → Wait ← BUG: Should fall back!
     - 30x 404s → Fall back
     - 5min timeout → Fall back ← Too long!

3. FALLBACK PATH
   - pollCallCompletion() - Direct VAPI API polling
   - Works immediately because VAPI has the data!
```

---

## Issues Identified

| # | Issue | Root Cause | File | Line |
|---|-------|------------|------|------|
| 1 | Only 1 of 2 calls shows | Race condition in provider UPDATE subscription | `page.tsx` | 596-618 |
| 2 | Recommendations never display | `recommendationsChecked` flag blocks checks | `page.tsx` | 254, 808-822 |
| 3 | 5-minute webhook timeout | Hardcoded 300000ms + missing status handling | `direct-vapi.client.ts` | 192, 225 |
| 4 | Enrichment window too short | 16 seconds not enough for VAPI analysis | `vapi-webhook.ts` | 110 |

---

## Fix Plan - Option A (Quick Fix)

**Confidence: 95%** - Minimal changes, fixes the immediate issues.

### Fix 1: Handle All dataStatus Values (Backend)

**File:** `apps/api/src/services/vapi/direct-vapi.client.ts`
**Location:** Lines 225-239

Add handling for "fetch_failed" status to trigger immediate fallback.

### Fix 2: Reduce Timeout from 5 Minutes to 90 Seconds (Backend)

**File:** `apps/api/src/services/vapi/direct-vapi.client.ts`
**Location:** Line 192

Change default timeout from 300000ms to 90000ms.

### Fix 3: Increase Enrichment Window (Backend)

**File:** `apps/api/src/routes/vapi-webhook.ts`
**Location:** Line 110

Increase retry delays from [3000, 5000, 8000] to [5000, 10000, 15000, 20000].

### Fix 4: Fix Race Condition in Provider Updates (Frontend)

**File:** `apps/web/app/request/[id]/page.tsx`
**Location:** Lines 596-618

Remove optimized single-provider update path, always do full refetch.

### Fix 5: Fix Recommendations Flag Timing (Frontend)

**File:** `apps/web/app/request/[id]/page.tsx`
**Location:** Lines 252-257

Only set `recommendationsChecked` flag AFTER confirming RECOMMENDED status.

---

## Implementation Details

### Backend Fix 1: Handle fetch_failed Status

```typescript
// After line 230 in direct-vapi.client.ts:

// Handle failed enrichment - fall back immediately
if (data && data.dataStatus === "fetch_failed") {
  this.logger.info(
    { callId, dataStatus: "fetch_failed" },
    "Webhook enrichment failed, falling back to VAPI polling",
  );
  return null;  // Triggers VAPI polling fallback
}

// If fetching for too long, also fall back
if (data && data.dataStatus === "fetching" && data.fetchAttempts && data.fetchAttempts > 5) {
  this.logger.info(
    { callId, dataStatus: "fetching", attempts: data.fetchAttempts },
    "Enrichment taking too long, falling back to VAPI polling",
  );
  return null;
}
```

### Backend Fix 2: Reduce Timeout

```typescript
// Line 192 in direct-vapi.client.ts:
// BEFORE:
timeoutMs: number = 300000, // 5 minutes

// AFTER:
timeoutMs: number = 90000, // 90 seconds
```

### Backend Fix 3: Increase Enrichment Window

```typescript
// Line 110 in vapi-webhook.ts:
// BEFORE:
const FETCH_DELAYS_MS = [3000, 5000, 8000]; // 16 seconds total

// AFTER:
const FETCH_DELAYS_MS = [5000, 10000, 15000, 20000]; // 50 seconds total
const MAX_FETCH_ATTEMPTS = 4;
```

### Frontend Fix 4: Remove Race Condition

Remove the optimized UPDATE path at lines 596-618 to always do full refetch for provider updates.

### Frontend Fix 5: Fix Recommendations Flag

```typescript
// Lines 252-257 in page.tsx:
// BEFORE:
useEffect(() => {
  if (recommendationsChecked) return;
  setRecommendationsChecked(true);  // Set BEFORE checking status
  // ...
}, [request?.status, ...]);

// AFTER:
useEffect(() => {
  if (recommendationsChecked) return;

  if (request?.status === "RECOMMENDED") {
    checkAndGenerateRecommendations();
    setRecommendationsChecked(true);  // Set AFTER confirming status
  }
}, [request?.status, ...]);
```

---

## Testing Plan

1. **Backend Changes**:
   - Verify TypeScript compilation passes
   - Test webhook timeout falls back in < 90 seconds
   - Test enrichment has enough time to complete

2. **Frontend Changes**:
   - Verify both provider calls show in UI
   - Verify recommendations display after RECOMMENDED status
   - Verify no race conditions with multiple providers

3. **Integration Test**:
   - Full flow: research → call → recommend → display

---

## Document Metadata

**Last Updated**: 2025-12-12
**Implementation Status**: In Progress
**Related Documents**:
- [VAPI_WEBHOOK_ARCHITECTURE.md](../VAPI_WEBHOOK_ARCHITECTURE.md)
- [VAPI_FALLBACK_ARCHITECTURE.md](../VAPI_FALLBACK_ARCHITECTURE.md)

**Change Log**:
- 2025-12-12 - Initial creation with comprehensive root cause analysis
