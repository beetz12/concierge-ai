# Fix: Kestra Database Persistence Audit & Fixes

**Date**: 2025-12-12
**Author**: Claude AI
**Status**: In Progress
**Type**: Bug Fix / Architecture Alignment

## Table of Contents
- [Executive Summary](#executive-summary)
- [Audit Findings](#audit-findings)
- [Critical Gap: Booking Flow](#critical-gap-booking-flow)
- [Implementation Plan](#implementation-plan)
- [Files to Modify](#files-to-modify)
- [Testing Checklist](#testing-checklist)

---

## Executive Summary

Comprehensive audit of all Kestra workflows vs Direct API paths revealed database persistence gaps. The `contact_providers` workflow was previously fixed, but the `schedule_service` (booking) workflow has the same critical issue - results are lost and never persisted to the database.

### Workflows Audited

| Workflow | Kestra File | Direct API | Status |
|----------|-------------|------------|--------|
| `contact_providers` | `contact_providers.yaml` | `DirectVapiClient` + webhook | ✅ FIXED |
| `research_providers` | `research_agent.yaml` | `DirectResearchClient` | ✅ OK (frontend persists) |
| `recommend_providers` | `recommend_providers.yaml` | `RecommendationService` | ✅ OK (returns JSON) |
| `schedule_service` | `schedule_service.yaml` | `bookings.ts:150-392` | 🚨 **CRITICAL GAP** |
| `notify_user` | `notify_user.yaml` | `DirectTwilioClient` | ✅ OK (SMS is action) |

### Orphaned Files

| File | Status | Action |
|------|--------|--------|
| `kestra/scripts/call-provider.js` | Not used by any workflow | Delete or mark deprecated |

---

## Audit Findings

### 1. `contact_providers` - ✅ FIXED

**Kestra Path**: `contact_providers.yaml` inline script now calls `/api/v1/providers/save-call-result`

**Direct API Path**: `DirectVapiClient` → webhook handler → `saveCallResult()`

**Parity**: ✅ Both paths now persist to database

### 2. `research_providers` - ✅ OK

**Kestra Path**: `research_agent.yaml` → AI Agent plugin → returns JSON

**Direct API Path**: `DirectResearchClient` → returns JSON

**Parity**: ✅ Both return JSON, frontend persists via `addProviders()` server action

**Note**: This is intentional design - research results go to frontend which persists them.

### 3. `recommend_providers` - ✅ OK

**Kestra Path**: `recommend_providers.yaml` → AI Agent plugin → returns JSON

**Direct API Path**: `RecommendationService` → returns JSON

**Parity**: ✅ Both return JSON to API caller

### 4. `schedule_service` - 🚨 CRITICAL GAP

**Direct API Flow** (`bookings.ts:150-392`):
```
1. Create VAPI booking call
2. Poll for completion
3. ✅ Update providers table (booking_confirmed, booking_date, booking_time, etc.)
4. ✅ Update service_requests (status=COMPLETED, selected_provider_id, final_outcome)
5. ✅ Create interaction_log ("Booking Confirmed" or "Booking Failed")
6. ✅ Send confirmation SMS via Twilio
```

**Kestra Flow** (`bookings.ts:405-478` + `schedule_service.yaml`):
```
1. Call kestraClient.triggerScheduleServiceFlow()
2. Update service_requests status to "BOOKING" ✅
3. Update providers call_status to "booking_in_progress" ✅
4. Create interaction_log ("Booking Call Started") ✅
5. Kestra executes schedule_service.yaml
6. schedule-booking.js makes VAPI call
7. Script outputs result to console with [KESTRA_OUTPUT]
8. ❌ NO PARSING of booking result from Kestra output
9. ❌ NO database update with booking outcome
10. ❌ Status stays "booking_in_progress" FOREVER
11. ❌ No confirmation SMS sent
```

**Root Cause**: `schedule-booking.js` outputs to console but never calls back to API. The `triggerScheduleServiceFlow()` method returns but doesn't parse or persist the booking result.

### 5. `notify_user` - ✅ OK

**Kestra Path**: `notify_user.yaml` → `send-notification.js` → Twilio SMS

**Direct API Path**: `DirectTwilioClient.sendConfirmation()`

**Parity**: ✅ SMS sending is the action itself, no DB persistence needed

---

## Critical Gap: Booking Flow

### Current Broken Flow

```
User clicks "Book" on recommended provider
    ↓
Frontend → POST /api/v1/bookings/schedule
    ↓
bookings.ts checks Kestra health
    ↓
If Kestra healthy → triggerScheduleServiceFlow()
    ↓
Kestra runs schedule_service.yaml
    ↓
schedule-booking.js makes VAPI call
    ↓
Call completes, script outputs JSON to console
    ↓
❌ RESULT LOST - Never saved to database
    ↓
User sees "booking_in_progress" forever
```

### Fixed Flow (Target State)

```
User clicks "Book" on recommended provider
    ↓
Frontend → POST /api/v1/bookings/schedule
    ↓
bookings.ts checks Kestra health
    ↓
If Kestra healthy → triggerScheduleServiceFlow()
    ↓
Kestra runs schedule_service.yaml
    ↓
schedule-booking.js makes VAPI call
    ↓
Call completes → script calls /api/v1/bookings/save-booking-result
    ↓
✅ providers table updated (booking_confirmed, dates, etc.)
✅ service_requests updated (status=COMPLETED)
✅ interaction_log created
✅ Confirmation SMS sent
    ↓
User sees booking confirmation
```

---

## Implementation Plan

### Phase 1: Create Save Booking Result Endpoint

**File**: `apps/api/src/routes/bookings.ts`

Create `POST /api/v1/bookings/save-booking-result` that:
1. Accepts booking result from Kestra script
2. Updates `providers` table with booking outcome
3. Updates `service_requests` status and outcome
4. Creates `interaction_logs` entry
5. Sends confirmation SMS if booking confirmed

### Phase 2: Update schedule-booking.js

**File**: `kestra/scripts/schedule-booking.js`

Add API callback after call completes:
1. Add `BACKEND_URL` environment variable support
2. Add `node-fetch` to dependencies
3. Call `/api/v1/bookings/save-booking-result` with booking result
4. Handle success/error/timeout cases

### Phase 3: Update schedule_service.yaml

**File**: `kestra/flows/schedule_service.yaml`

1. Add `BACKEND_URL` environment variable
2. Add `service_request_id` and `provider_id` inputs (needed for DB linking)

### Phase 4: Cleanup (Optional)

**File**: `kestra/scripts/call-provider.js`

Either:
- Delete (not used by any workflow)
- Or add deprecation notice

---

## Files to Modify

| File | Action | Priority |
|------|--------|----------|
| `apps/api/src/routes/bookings.ts` | Add `/save-booking-result` endpoint | 🚨 Critical |
| `kestra/scripts/schedule-booking.js` | Add API callback | 🚨 Critical |
| `kestra/flows/schedule_service.yaml` | Add env vars and inputs | 🚨 Critical |
| `kestra/scripts/call-provider.js` | Delete or deprecate | ⚠️ Low |

---

## Testing Checklist

### Booking Flow Tests

- [ ] Direct API booking (Kestra disabled) - should work (existing)
- [ ] Kestra booking - confirmed appointment
  - [ ] providers.booking_confirmed = true
  - [ ] providers.booking_date populated
  - [ ] providers.booking_time populated
  - [ ] service_requests.status = "COMPLETED"
  - [ ] service_requests.final_outcome populated
  - [ ] interaction_log created with "Booking Confirmed"
  - [ ] SMS sent to user
- [ ] Kestra booking - failed/declined
  - [ ] providers.booking_confirmed = false
  - [ ] service_requests.status updated appropriately
  - [ ] interaction_log created with "Booking Failed"
- [ ] Kestra booking - timeout
  - [ ] Appropriate error state saved
  - [ ] interaction_log created
- [ ] Kestra booking - VAPI error
  - [ ] Error state saved
  - [ ] interaction_log created

### Regression Tests

- [ ] contact_providers still works (already fixed)
- [ ] research_providers still works
- [ ] recommend_providers still works
- [ ] Direct VAPI booking still works

---

## Document Metadata

**Last Updated**: 2025-12-12
**Implementation Status**: In Progress
**Related Documents**:
- `docs/plans/FIX_KESTRA_FRONTEND_INTEGRATION.md`
- `docs/fixes/KESTRA_DATABASE_PERSISTENCE.md`
- `kestra/flows/schedule_service.yaml`
- `kestra/scripts/schedule-booking.js`

**Change Log**:
- 2025-12-12 - Initial creation with comprehensive audit
