# Fix User Notification System

**Date**: 2025-12-12
**Author**: Claude AI
**Status**: Complete - Ready for Testing
**Type**: Bug Fix

## Table of Contents
- [Executive Summary](#executive-summary)
- [Root Causes Identified](#root-causes-identified)
- [Implementation Plan](#implementation-plan)
- [Files to Modify](#files-to-modify)
- [Testing Plan](#testing-plan)

## Executive Summary

User notifications (SMS/phone calls) are not being sent when recommendations are displayed. Three critical issues were identified through multi-agent analysis.

## Root Causes Identified

### Issue 1: Database Storage Bug (CRITICAL)

**Location:** `apps/web/app/new/page.tsx`
**Impact:** `user_phone` column is NULL, notification condition fails

**Current (Wrong):**
```typescript
const dbRequest = await createServiceRequest({
  ...
  direct_contact_info: {  // Storing in JSONB
    preferred_contact: formData.preferredContact,
    user_phone: userPhoneValidation.normalized,
  },
});
```

**Database Result:**
```json
{
  "user_phone": null,              // Empty - notification check fails
  "preferred_contact": "text",     // Has default value
  "direct_contact_info": {         // Data is stuck here
    "user_phone": "+13106992541",
    "preferred_contact": "text"
  }
}
```

**Fix:** Save to dedicated columns instead of JSONB

```typescript
const dbRequest = await createServiceRequest({
  ...
  user_phone: userPhoneValidation.normalized,      // Dedicated column
  preferred_contact: formData.preferredContact,    // Dedicated column
});
```

### Issue 2: Twilio Environment Variable Mismatch (CRITICAL)

**Location:** `apps/api/.env`
**Impact:** Twilio appears "unconfigured", SMS never sent

**Current (Wrong):**
```bash
TWILIO_PHONE_NO=+18032683618
```

**Backend expects:**
```typescript
// direct-twilio.client.ts
this.fromNumber = process.env.TWILIO_PHONE_NUMBER || "";
```

**Result:** `fromNumber = ""` → `isConfigured = false` → SMS skipped

**Fix:** Rename environment variable
```bash
TWILIO_PHONE_NUMBER=+18032683618
```

### Issue 3: Notification State Not Synced with Database (HIGH)

**Location:** `apps/web/app/request/[id]/page.tsx`
**Impact:** Can trigger duplicate notifications on page refresh

**Current:**
```typescript
const [notificationSent, setNotificationSent] = useState(false);
```

**Fix:**
```typescript
// Initialize from database to prevent duplicates
const [notificationSent, setNotificationSent] = useState(
  !!dbRequest?.notification_sent_at
);
```

## Implementation Plan

### Phase 1: Fix Database Storage
1. Modify `apps/web/app/new/page.tsx` to use dedicated columns
2. Update `createServiceRequest` call to pass `user_phone` and `preferred_contact` directly

### Phase 2: Fix Environment Variable
1. Update `apps/api/.env` to rename `TWILIO_PHONE_NO` to `TWILIO_PHONE_NUMBER`
2. Restart backend server

### Phase 3: Sync Notification State
1. Modify `apps/web/app/request/[id]/page.tsx` to initialize `notificationSent` from database
2. Add debug logging for notification conditions

### Phase 4: Verification
1. TypeScript compilation check
2. Create new test request
3. Verify notification is sent

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/app/new/page.tsx` | Fix database storage - use dedicated columns |
| `apps/api/.env` | Rename `TWILIO_PHONE_NO` → `TWILIO_PHONE_NUMBER` |
| `apps/web/app/request/[id]/page.tsx` | Sync notificationSent with database |

## Testing Plan

1. Create new service request with phone number
2. Wait for recommendations to display
3. Verify SMS is received
4. Verify `notification_sent_at` is set in database
5. Refresh page and verify no duplicate notification

---

## Document Metadata

**Last Updated**: 2025-12-12
**Implementation Status**: In Progress
**Related Documents**:
- `/docs/architecture.md`
- `/docs/VAPI_WEBHOOK_ARCHITECTURE.md`

**Change Log**:
- 2025-12-12 - Initial creation from multi-agent analysis
