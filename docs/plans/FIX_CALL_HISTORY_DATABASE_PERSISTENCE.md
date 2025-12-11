# Call History Database Persistence - Option B Complete Fix

**Date**: 2025-12-10
**Author**: Claude AI
**Status**: In Progress
**Type**: Fix/Feature

## Table of Contents
- [Executive Summary](#executive-summary)
- [Current State Analysis](#current-state-analysis)
- [Database Schema](#database-schema)
- [Implementation Plan](#implementation-plan)
- [Files to Modify](#files-to-modify)

## Executive Summary

| Component | Current State | Database Ready? | Fix Required |
|-----------|--------------|-----------------|--------------|
| Database Schema | Complete | Yes | None |
| VAPI Webhook → DB | Working | Saves call data | None |
| Frontend → DB (workflow) | Partial | Schema ready | Add `addProviders()` calls |
| History Page | localStorage only | Query helper exists | Convert to Server Component |

**Core Problem:** History page reads from localStorage instead of database, causing data loss across sessions/devices.

## Current State Analysis

### What's Currently Saved to Database

**VAPI Webhook Pipeline** (`call-result.service.ts`) saves to `providers` table:
```typescript
{
  call_status: 'completed' | 'voicemail' | 'error',
  call_result: { availability, estimated_rate, all_criteria_met, ... },
  call_transcript: "Full conversation text",
  call_summary: "AI-generated summary",
  call_duration_minutes: 2.5,
  call_cost: 0.0234,
  call_id: "vapi-uuid",
  called_at: timestamp
}
```

**Server Actions** save to `service_requests`:
- `createServiceRequest()` - Called on form submit
- `updateServiceRequest()` - Called for status changes

### What's NOT Being Saved (localStorage Only)

| Data | Current Location | Target Location |
|------|-----------------|-----------------|
| `providersFound[]` | localStorage | `providers` table |
| `interactions[]` | localStorage | `interaction_logs` table |
| `selectedProvider` | localStorage | `selected_provider_id` column |
| `finalOutcome` | localStorage | `final_outcome` column |

### History Page Current State

```typescript
// CURRENT: Reads from localStorage only
export default function RequestHistory() {
  const { requests } = useAppContext();  // localStorage!
}
```

## Database Schema

### Tables (Already Exist)

**service_requests:**
- `id`, `user_id`, `type`, `title`, `description`, `criteria`, `location`
- `status`, `selected_provider_id`, `final_outcome`, `direct_contact_info`
- `created_at`, `updated_at`

**providers:**
- Core: `id`, `request_id`, `name`, `phone`, `rating`, `address`, `source`
- Call tracking: `call_status`, `call_result`, `call_transcript`, `call_summary`
- `call_duration_minutes`, `call_cost`, `call_method`, `call_id`, `called_at`
- Enrichment: `place_id`, `review_count`, `distance`, `google_maps_uri`
- Booking: `booking_confirmed`, `booking_date`, `booking_time`

**interaction_logs:**
- `id`, `request_id`, `timestamp`, `step_name`, `detail`
- `transcript` (JSONB), `status`

### Existing Query Helper

```typescript
// lib/supabase/queries.ts - ALREADY EXISTS
export async function getServiceRequests(userId?: string) {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("service_requests")
    .select(`*, providers(*), interaction_logs(*)`)
    .order("created_at", { ascending: false });
  return data;
}
```

## Implementation Plan

### Fix 1 (P0): Convert History Page to Server Component

**File:** `apps/web/app/history/page.tsx`

**Changes:**
1. Remove `"use client"` directive
2. Remove `useAppContext()` hook
3. Query database using `getServiceRequests()`
4. Transform DB types to UI types
5. Keep same rendering logic

### Fix 2 (P1): Save Providers During Search Workflow

**File:** `apps/web/app/new/page.tsx`

**Location:** After search completes (~line 198)

**Add:**
```typescript
// After providers found, save to database
await addProviders(
  providers.map(p => ({
    request_id: reqId,
    name: p.name,
    phone: p.phone,
    rating: p.rating,
    address: p.address,
    source: p.source,
    place_id: p.placeId,
    google_maps_uri: p.googleMapsUri,
    distance: p.distance,
    review_count: p.reviewCount,
  }))
);
```

### Fix 3 (P2): Save Interaction Logs (Optional Enhancement)

**File:** `apps/web/app/new/page.tsx`

**Add after key events:**
```typescript
await addInteractionLog({
  request_id: reqId,
  step_name: "Provider Search",
  detail: `Found ${providers.length} providers in ${location}`,
  status: "success"
});
```

## Files to Modify

| File | Change Type | Priority |
|------|-------------|----------|
| `apps/web/app/history/page.tsx` | Major rewrite | P0 |
| `apps/web/app/new/page.tsx` | Add DB saves | P1 |
| `apps/web/lib/actions/service-requests.ts` | Verify actions | P1 |

## Success Criteria

1. History page loads from database (not localStorage)
2. Providers are saved to DB during search workflow
3. History persists across browser sessions
4. Type safety maintained throughout
5. Build passes without errors

---

## Document Metadata

**Last Updated**: 2025-12-10
**Implementation Status**: In Progress
**Related Documents**:
- `/Users/dave/Work/concierge-ai/apps/web/lib/supabase/queries.ts`
- `/Users/dave/Work/concierge-ai/apps/web/lib/actions/service-requests.ts`

**Change Log**:
- 2025-12-10 - Initial creation
