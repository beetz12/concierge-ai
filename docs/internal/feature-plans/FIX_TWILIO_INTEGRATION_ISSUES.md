# Fix Twilio Integration Issues

**Date**: 2025-12-10
**Author**: Claude AI
**Status**: Phase 1 Complete
**Type**: Integration Fix

## Summary

This plan addresses critical issues discovered during code review of Hasan's Twilio integration (notify_user.yaml, schedule_service.yaml). The fixes ensure production readiness, unified handler patterns, and database compatibility.

## Table of Contents
- [Phase 1: Critical Fixes](#phase-1-critical-fixes)
- [Phase 2: Service Layer](#phase-2-service-layer)
- [Phase 3: Polish](#phase-3-polish)

---

## Phase 1: Critical Fixes ✅ COMPLETE

> **Completed**: 2025-12-11
> All Phase 1 items implemented and type-checked successfully.

### 1.1 Fix Hardcoded Paths in Kestra Workflows ✅

**Issue**: Both `notify_user.yaml` and `schedule_service.yaml` contain hardcoded paths to developer machine.

**Files**:
- `kestra/flows/notify_user.yaml` (line 41)
- `kestra/flows/schedule_service.yaml` (line 61)

**Fix**: Use `namespaceFiles` pattern like `contact_providers.yaml`:
```yaml
# BEFORE (WRONG):
docker:
  image: node:22-alpine
  volumes:
    - /Users/hasan/Documents/projects/concierge-ai/kestra/scripts:/scripts

# AFTER (CORRECT):
docker:
  image: node:22-alpine
namespaceFiles:
  enabled: true
```

### 1.2 Fix Property Name Mismatch in schedule-booking.js ✅

**Issue**: Property names don't match `BookingRequest` interface.

**File**: `kestra/scripts/schedule-booking.js`

**Current (Wrong)**:
```javascript
const bookingRequest = {
    serviceDescription: SERVICE_DESCRIPTION,
    customerName: CUSTOMER_NAME,
    customerPhone: CUSTOMER_PHONE,
    preferredDate: PREFERRED_DATE,
    preferredTime: PREFERRED_TIME,
};
```

**Expected (BookingRequest interface)**:
```typescript
interface BookingRequest {
  serviceNeeded: string;
  clientName?: string;
  clientPhone?: string;
  preferredDateTime?: string;
}
```

**Fix**: Align property names with interface.

### 1.3 Add Config Loading Fallback ✅

**Issue**: `schedule-booking.js` lacks config fallback for Kestra Cloud.

**File**: `kestra/scripts/schedule-booking.js`

**Fix**: Copy pattern from `call-provider.js`:
```javascript
let bookingAssistantConfig;
try {
    const configModule = await import('../apps/api/dist/services/vapi/booking-assistant-config.js');
    bookingAssistantConfig = configModule.createBookingAssistantConfig;
} catch (importError) {
    // Fallback for Kestra Cloud
    bookingAssistantConfig = (options) => ({ /* inline config */ });
}
```

### 1.4 Implement Database Updates in bookings.ts ✅

**Issue**: Database updates marked as TODO (lines 184-188).

**File**: `apps/api/src/routes/bookings.ts`

**Fix**: Copy existing pattern from `/providers/book` endpoint.

### 1.5 Add Direct API Fallbacks ✅

**Issue**: Routes return 503/skip when Kestra unavailable.

**Files**:
- `apps/api/src/routes/notifications.ts` (lines 118-132)
- `apps/api/src/routes/bookings.ts` (lines 142-152)

**Fix**: Add direct Twilio/VAPI API calls as fallback.

---

## Phase 2: Service Layer (Partially Complete)

### 2.1 Create NotificationService ✅

**Location**: `apps/api/src/services/notifications/`

**Components**:
- `DirectTwilioClient` - Direct Twilio SMS API ✅ Created
- `NotificationService` - Unified interface (Kestra → Direct fallback) - Implemented inline in route

### 2.2 Create BookingService ✅

**Location**: Implemented inline in `apps/api/src/routes/bookings.ts`

**Components**:
- `DirectBookingClient` - Direct VAPI booking calls ✅ Implemented inline using existing pattern from `/providers/book`
- `BookingService` - Unified interface (Kestra → Direct fallback) ✅ Implemented inline in route

### 2.3 Update Routes to Use Services ✅

Both `notifications.ts` and `bookings.ts` now have direct API fallbacks implemented inline.
Future refactoring could extract these to dedicated service classes.

---

## Phase 3: Polish

### 3.1 Add Retry Logic to SMS Sending

Add exponential backoff for transient Twilio failures.

### 3.2 Add Output Extraction to Kestra Workflows

Extract SMS SID and delivery status from workflow outputs.

### 3.3 Remove Excessive Defaults

Remove defaults from required fields in `schedule_service.yaml`.

### 3.4 Add Rate Limiting

Add rate limiting for SMS and booking endpoints.

---

## Document Metadata

**Last Updated**: 2025-12-11
**Implementation Status**: Phase 1 & 2 Complete, Phase 3 Pending
**Related Documents**:
- [3_DAY_HACKATHON_SPRINT.md](../3_DAY_HACKATHON_SPRINT.md)
- [VAPI_WEBHOOK_ARCHITECTURE.md](../VAPI_WEBHOOK_ARCHITECTURE.md)

**Change Log**:
- 2025-12-11 - Phase 1 & 2 completed: Fixed hardcoded paths, added config fallback, fixed property name mismatch, implemented database updates, added direct API fallbacks
- 2025-12-10 - Initial creation from code review analysis
