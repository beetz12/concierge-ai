# Preferred Contact Feature Implementation Plan

**Date**: 2025-12-11
**Author**: Claude AI
**Status**: Complete
**Type**: Feature

## Summary

Add "preferred contact" (phone call vs text) feature to `/new` and `/direct` pages with full notification infrastructure including Twilio SMS webhook handling and VAPI user notification calls.

## Table of Contents
- [Current State Analysis](#current-state-analysis)
- [Phase 1: Database Schema](#phase-1-database-schema)
- [Phase 2: Frontend UI](#phase-2-frontend-ui)
- [Phase 3: Backend Notification Logic](#phase-3-backend-notification-logic)
- [Phase 4: Integration & Testing](#phase-4-integration--testing)

---

## Current State Analysis

| Component | Status | Gap |
|-----------|--------|-----|
| Frontend phone validation | Exists | `usePhoneValidation` hook ready |
| Frontend contact preference UI | Missing | No radio buttons, need to create |
| Database schema | Missing | No `preferred_contact` or `user_phone` fields |
| Twilio SMS sending | Exists | `DirectTwilioClient` works |
| Twilio inbound webhook | **CRITICAL** | No handler for user SMS replies |
| VAPI provider calls | Exists | `DirectVapiClient` works |
| VAPI user notification calls | Missing | No assistant config for calling users |

---

## Phase 1: Database Schema

**Confidence: 95%** | **Files: 1 migration**

### Migration: `20250112000001_add_contact_preferences.sql`

```sql
-- Add contact preference fields to service_requests table
ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS preferred_contact TEXT DEFAULT 'text' CHECK (preferred_contact IN ('phone', 'text')),
ADD COLUMN IF NOT EXISTS user_phone TEXT,
ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notification_method TEXT,
ADD COLUMN IF NOT EXISTS user_selection INTEGER,
ADD COLUMN IF NOT EXISTS sms_message_sid TEXT;
```

---

## Phase 2: Frontend UI

**Confidence: 95%** | **Files: 4**

### 2.1 `/apps/web/app/new/page.tsx`

**State Changes (line 51):**
```typescript
preferredContact: "text" as "phone" | "text",
```

**New Phone Validation (after line 63):**
```typescript
const userPhoneValidation = usePhoneValidation();
```

**UI Component:** Radio buttons for phone/text + phone input with validation

### 2.2 `/apps/web/app/direct/page.tsx`

Same pattern - add radio buttons before existing phone input

### 2.3 Type Updates

- `apps/web/lib/types/index.ts` - Add `preferredContact` and `userPhone` to ServiceRequest
- `apps/web/lib/actions/service-requests.ts` - Pass new fields to database

---

## Phase 3: Backend Notification Logic

**Confidence: 90%** | **Files: 4**

### 3.1 Update `/apps/api/src/routes/notifications.ts`

Modify POST `/send` to check `preferredContact` and route to Twilio SMS or VAPI call.

### 3.2 Create `/apps/api/src/services/vapi/user-notification-assistant-config.ts`

VAPI assistant that calls users to present top 3 recommendations and capture selection.

### 3.3 Create `/apps/api/src/services/notifications/user-notification.service.ts`

Service to orchestrate VAPI calls to users.

### 3.4 Create `/apps/api/src/routes/twilio-webhook.ts` (CRITICAL)

Handle inbound SMS when users reply "1", "2", or "3" to select a provider.

---

## Phase 4: Integration & Testing

**Confidence: 85%** | **Files: 3**

### 4.1 Register Routes

Add `twilioWebhookRoutes` to `/apps/api/src/server.ts`

### 4.2 Twilio Configuration

Configure webhook URL in Twilio Console

### 4.3 Frontend Integration

Trigger notification after recommendations in `runConciergeProcess()`

---

## Files Summary

| File | Action | Est. Lines |
|------|--------|------------|
| `supabase/migrations/20250112000001_add_contact_preferences.sql` | CREATE | ~15 |
| `apps/web/app/new/page.tsx` | MODIFY | +60 |
| `apps/web/app/direct/page.tsx` | MODIFY | +50 |
| `apps/web/lib/types/index.ts` | MODIFY | +3 |
| `apps/web/lib/actions/service-requests.ts` | MODIFY | +5 |
| `apps/api/src/routes/notifications.ts` | MODIFY | +40 |
| `apps/api/src/routes/twilio-webhook.ts` | CREATE | ~120 |
| `apps/api/src/services/vapi/user-notification-assistant-config.ts` | CREATE | ~80 |
| `apps/api/src/services/notifications/user-notification.service.ts` | CREATE | ~100 |
| `apps/api/src/server.ts` | MODIFY | +2 |

**Total: ~475 new/modified lines**

---

## Document Metadata

**Last Updated**: 2025-12-11
**Implementation Status**: In Progress
**Related Documents**:
- [3_DAY_HACKATHON_SPRINT.md](../3_DAY_HACKATHON_SPRINT.md)
- [FIX_TWILIO_INTEGRATION_ISSUES.md](./FIX_TWILIO_INTEGRATION_ISSUES.md)

**Change Log**:
- 2025-12-11 - Initial creation from multi-agent analysis
