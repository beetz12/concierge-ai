# Fix Environment Variable Consolidation & Notification DB Updates

**Date**: 2025-12-12
**Author**: Claude AI
**Status**: COMPLETE - Ready for Testing
**Type**: Bug Fix / Refactoring
**Priority**: CRITICAL

## Table of Contents
- [Executive Summary](#executive-summary)
- [Root Causes Identified](#root-causes-identified)
- [Implementation Plan](#implementation-plan)
- [Files to Modify](#files-to-modify)
- [Testing Plan](#testing-plan)

## Executive Summary

Multiple issues preventing notifications and booking calls from working:
1. Environment variable inconsistency between frontend and backend
2. Direct Twilio SMS not updating database
3. Error objects serializing as `{}` hiding recommendation failures

## Root Causes Identified

### Issue 1: Environment Variable Inconsistency (CRITICAL)

**Current State:**
- Frontend uses `NEXT_PUBLIC_LIVE_CALL_ENABLED` and `NEXT_PUBLIC_ADMIN_TEST_NUMBER`
- Backend uses `LIVE_CALL_ENABLED` and `ADMIN_TEST_NUMBER`
- Test phone substitution happens in frontend (security concern)

**Fix:** Move all call-related config to backend-only. Backend handles test mode.

### Issue 2: Direct Twilio SMS Not Updating Database (HIGH)

**Location:** `apps/api/src/routes/notifications.ts` lines 227-252
**Impact:** `notification_sent_at` never set for SMS, can cause duplicate notifications

**Current:** Returns success without database update
**Fix:** Add database update after successful Twilio send

### Issue 3: Booking Confirmation SMS Not Updating Database (HIGH)

**Location:** `apps/api/src/routes/bookings.ts`
**Impact:** No record of confirmation SMS being sent

**Fix:** Add database update after confirmation SMS

### Issue 4: Error Serialization (MEDIUM)

**Location:** `apps/api/src/routes/providers.ts` lines 912-918
**Impact:** Errors serialize as `{}`, hiding actual error messages

**Fix:** Explicitly extract error message and stack

## Implementation Plan

### Phase 1: Move Call Configuration to Backend-Only

#### Step 1.1: Add test mode logic to backend
**File:** `apps/api/src/routes/providers.ts`
**Location:** `/batch-call-async` handler (~line 657)

```typescript
// Load test phone configuration from backend environment
const adminTestPhonesRaw = process.env.ADMIN_TEST_NUMBER;
const adminTestPhones = adminTestPhonesRaw
  ? adminTestPhonesRaw.split(",").map((p) => p.trim()).filter(Boolean)
  : [];
const isAdminTestMode = adminTestPhones.length > 0;

// Apply test phone substitution if in test mode
if (isAdminTestMode) {
  request.log.info({ adminTestPhones, providerCount: validated.providers.length }, "Test mode active - substituting phones");
  validated.providers = validated.providers.map((p, idx) => ({
    ...p,
    originalPhone: p.phone,
    phone: adminTestPhones[idx % adminTestPhones.length],
  }));
}
```

#### Step 1.2: Remove test mode logic from frontend
**File:** `apps/web/app/new/page.tsx`
- DELETE lines 22-43 (test phone parsing)
- SIMPLIFY lines 286-331 (remove phone substitution, just pass provider.phone)
- DELETE lines 545-561 (test mode banner)

**File:** `apps/web/app/direct/page.tsx`
- DELETE lines 31-50 (test phone parsing)
- SIMPLIFY lines 135-137 (remove phone substitution)

#### Step 1.3: Remove frontend environment variables
**File:** `apps/web/.env.local`
- DELETE `NEXT_PUBLIC_LIVE_CALL_ENABLED`
- DELETE `NEXT_PUBLIC_ADMIN_TEST_NUMBER`
- DELETE `NEXT_PUBLIC_ADMIN_TEST_PHONES`

### Phase 2: Add Missing Database Updates

#### Step 2.1: Direct Twilio SMS database update
**File:** `apps/api/src/routes/notifications.ts`
**Location:** After line 243 (after successful Twilio send)

```typescript
// Update database to track notification
await supabase.from("service_requests").update({
  notification_sent_at: new Date().toISOString(),
  notification_method: "sms",
}).eq("id", validated.serviceRequestId);

await supabase.from("interaction_logs").insert({
  request_id: validated.serviceRequestId,
  step_name: "User Notification via SMS",
  detail: `SMS sent successfully via Twilio - Message SID: ${twilioResult.messageSid}`,
  status: "success",
});
```

#### Step 2.2: Booking confirmation SMS database update
**File:** `apps/api/src/routes/bookings.ts`
**Location:** After confirmation SMS sent

```typescript
await supabase.from("service_requests").update({
  notification_sent_at: new Date().toISOString(),
  notification_method: "sms",
}).eq("id", serviceRequest.id);
```

### Phase 3: Add Error Serialization

**File:** `apps/api/src/routes/providers.ts`
**Location:** Lines 912-918

```typescript
} catch (recError) {
  const errorMsg = recError instanceof Error ? recError.message : String(recError);
  const errorStack = recError instanceof Error ? recError.stack : undefined;
  fastify.log.error(
    { errorMessage: errorMsg, errorStack },
    "Error generating recommendations"
  );
}
```

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/routes/providers.ts` | Add test mode logic, fix error serialization |
| `apps/api/src/routes/notifications.ts` | Add DB update for Direct Twilio SMS |
| `apps/api/src/routes/bookings.ts` | Add DB update for confirmation SMS |
| `apps/web/app/new/page.tsx` | Remove test mode logic |
| `apps/web/app/direct/page.tsx` | Remove test mode logic |
| `apps/web/.env.local` | Delete frontend-only call config vars |

## Testing Plan

1. Restart backend server after changes
2. Run TypeScript compilation check
3. Create new service request via `/new`
4. Verify test phone substitution happens on backend (check logs)
5. Verify SMS notification is received
6. Verify `notification_sent_at` is set in database
7. Complete booking flow
8. Verify booking confirmation SMS is received
9. Verify database updates for all notification types

---

## Document Metadata

**Last Updated**: 2025-12-12
**Implementation Status**: COMPLETE
**Related Documents**:
- `/docs/plans/FIX_USER_NOTIFICATION_SYSTEM.md`
- `/docs/architecture.md`

**Change Log**:
- 2025-12-12 - Initial creation from multi-agent analysis
