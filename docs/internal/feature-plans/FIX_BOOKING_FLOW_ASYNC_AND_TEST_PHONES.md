# Implementation Plan: Async Booking Flow with Test Phone Support

**Date**: 2025-12-12
**Author**: Claude AI
**Status**: Complete
**Type**: Feature / Fix
**Confidence Level**: 95%
**Estimated Files Changed**: 8-10 files

---

## Problem Statement

### Issue 1: Synchronous Blocking UX
After user clicks "Confirm & Book" in the SelectionModal:
- Frontend calls `scheduleBooking()` which blocks for up to 5 minutes
- Backend polls VAPI every 5 seconds (60 attempts max)
- User cannot leave the page - forces them to wait
- **Goal**: Fire-and-forget pattern with toast notification + async updates

### Issue 2: Missing Test Phone Handling in Booking Flow
The initial provider calling flow (`apps/web/app/new/page.tsx`) correctly checks:
- `NEXT_PUBLIC_LIVE_CALL_ENABLED`
- `NEXT_PUBLIC_ADMIN_TEST_PHONES`

But the booking flow (`apps/api/src/routes/bookings.ts`) does NOT check these:
- Always makes real calls to actual provider phone numbers
- No way to test booking flow without calling real providers

### Issue 3: Status Display for Booking
- LiveStatus component has no "BOOKING" status case
- Need to show booking progress and confirmation details
- Must persist to database for when user returns later

---

## Architecture Analysis

### Current Flow
```
User clicks "Confirm & Book"
    ↓
handleConfirmBooking() [BLOCKING]
    ↓
POST /api/v1/bookings/schedule [SYNCHRONOUS]
    ↓
Backend polls VAPI for 5 minutes
    ↓
Returns result → Frontend shows inline message
```

### Target Flow
```
User clicks "Confirm & Book"
    ↓
handleConfirmBooking() [ASYNC]
    ↓
POST /api/v1/bookings/schedule-async [202 Accepted]
    ↓
Close modal immediately
Show toast: "Booking in progress..."
    ↓
Backend (background):
├─ Check LIVE_CALL_ENABLED
├─ Substitute test phone if configured
├─ Make VAPI call (or simulate)
├─ Save result to database
└─ Send SMS confirmation
    ↓
Supabase real-time subscription triggers
    ↓
Frontend updates with booking result
```

---

## Implementation Plan

### Phase 1: Backend - Add Test Phone Support to Booking Route

**File**: `apps/api/src/routes/bookings.ts`

1. **Add environment variable parsing** (top of file):
```typescript
// Configuration for live call vs simulation
const LIVE_CALL_ENABLED = process.env.LIVE_CALL_ENABLED === "true";

// Parse admin test phones (comma-separated E.164 numbers)
const ADMIN_TEST_PHONES_RAW = process.env.ADMIN_TEST_PHONES;
const ADMIN_TEST_PHONES = ADMIN_TEST_PHONES_RAW
  ? ADMIN_TEST_PHONES_RAW.split(",").map((p) => p.trim()).filter(Boolean)
  : [];
const isAdminTestMode = ADMIN_TEST_PHONES.length > 0;
```

2. **Modify `/schedule` endpoint logic**:
- If `LIVE_CALL_ENABLED !== true`: Return simulated success (no VAPI call)
- If `isAdminTestMode`: Substitute provider phone with `ADMIN_TEST_PHONES[0]`
- Log which mode is being used

**Test phone substitution logic**:
```typescript
// Determine actual phone to call
const phoneToCall = isAdminTestMode
  ? ADMIN_TEST_PHONES[0]!  // Use first test phone
  : validated.providerPhone;

fastify.log.info({
  mode: isAdminTestMode ? "TEST" : "PRODUCTION",
  originalPhone: validated.providerPhone,
  phoneToCall,
  liveCallEnabled: LIVE_CALL_ENABLED,
}, "Booking call phone determination");
```

3. **Add simulated booking mode**:
```typescript
if (!LIVE_CALL_ENABLED) {
  // Simulate successful booking without VAPI call
  const simulatedResult = {
    booking_confirmed: true,
    confirmed_date: validated.preferredDate || "TBD",
    confirmed_time: validated.preferredTime || "TBD",
    confirmation_number: `SIM-${Date.now()}`,
  };

  // Update database with simulated result
  // ... (same DB update logic)

  return reply.send({
    success: true,
    data: {
      bookingInitiated: true,
      bookingStatus: "confirmed",
      method: "simulated",
      message: "Simulated booking (LIVE_CALL_ENABLED=false)",
    },
  });
}
```

---

### Phase 2: Backend - Create Async Booking Endpoint

**File**: `apps/api/src/routes/bookings.ts`

1. **Add new endpoint**: `POST /schedule-async`
   - Same validation as `/schedule`
   - Returns `202 Accepted` immediately
   - Uses `setImmediate()` to process in background

```typescript
fastify.post("/schedule-async", {
  schema: { /* same as /schedule */ }
}, async (request, reply) => {
  const validated = scheduleBookingSchema.parse(request.body);

  // Update status to BOOKING immediately
  const supabase = createSupabaseClient(/*...*/);
  await supabase
    .from("service_requests")
    .update({ status: "BOOKING" })
    .eq("id", validated.serviceRequestId);

  // Generate execution ID for tracking
  const executionId = `booking-${Date.now()}-${validated.providerId.slice(0, 8)}`;

  // Start background processing
  setImmediate(async () => {
    try {
      // Determine phone to call (test mode vs real)
      const phoneToCall = isAdminTestMode
        ? ADMIN_TEST_PHONES[0]!
        : validated.providerPhone;

      if (!LIVE_CALL_ENABLED) {
        // Simulated booking
        await handleSimulatedBooking(validated, supabase);
      } else {
        // Real VAPI booking call
        await handleRealBookingCall(validated, phoneToCall, supabase);
      }
    } catch (error) {
      // Log error and update status to failed
      fastify.log.error({ error, executionId }, "Background booking failed");
      await supabase
        .from("service_requests")
        .update({ status: "RECOMMENDED" })  // Return to recommendations
        .eq("id", validated.serviceRequestId);
    }
  });

  // Return 202 immediately
  return reply.status(202).send({
    success: true,
    data: {
      bookingInitiated: true,
      executionId,
      status: "accepted",
      message: "Booking call started. You will be notified when complete.",
    },
  });
});
```

2. **Extract helper functions**:
   - `handleSimulatedBooking()` - Simulate and persist
   - `handleRealBookingCall()` - VAPI call with polling and persistence
   - Both call `sendConfirmationSMS()` on success

---

### Phase 3: Frontend - Add Toast Notification System

**File**: `apps/web/package.json`

Add dependency:
```json
"sonner": "^1.7.0"
```

**File**: `apps/web/app/layout.tsx` or appropriate layout

Add Toaster component:
```tsx
import { Toaster } from "sonner";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          closeButton
        />
      </body>
    </html>
  );
}
```

---

### Phase 4: Frontend - Convert Booking to Fire-and-Forget

**File**: `apps/web/app/request/[id]/page.tsx`

1. **Modify `handleConfirmBooking()`**:

```typescript
import { toast } from "sonner";

const handleConfirmBooking = async () => {
  if (!selectedProvider || !request) return;

  // Close modal immediately - don't wait for result
  setShowModal(false);

  // Show toast notification
  toast.loading("Scheduling your appointment...", {
    id: "booking-toast",
    description: `Calling ${selectedProvider.providerName}`,
  });

  try {
    // Fire-and-forget: Use new async endpoint
    const response = await fetch("/api/v1/bookings/schedule-async", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceRequestId: id,
        providerId: selectedProvider.providerId,
        providerPhone: selectedProvider.phone,
        providerName: selectedProvider.providerName,
        serviceDescription: request.title,
        preferredDate: selectedProvider.earliestAvailability,
        customerName: request.directContactInfo?.name,
        customerPhone: request.userPhone,
        location: request.location,
      }),
    });

    const result = await response.json();

    if (response.status === 202 && result.success) {
      // Update toast to success state
      toast.success("Booking call started!", {
        id: "booking-toast",
        description: "You'll receive a notification when your appointment is confirmed.",
      });
    } else {
      throw new Error(result.error || "Failed to initiate booking");
    }
  } catch (error) {
    console.error("Error initiating booking:", error);
    toast.error("Failed to start booking call", {
      id: "booking-toast",
      description: error instanceof Error ? error.message : "Please try again",
    });
  }

  // Real-time subscription will handle updating the UI when booking completes
};
```

2. **Remove `bookingLoading` state dependency from modal** - modal closes immediately

3. **Enhance real-time subscription handling**:
   - Already subscribes to `providers` table changes
   - Add check for `booking_confirmed` field updates
   - Show toast when booking confirmation received

```typescript
// In the providers subscription handler
if (payload.new.booking_confirmed !== payload.old?.booking_confirmed) {
  if (payload.new.booking_confirmed) {
    toast.success("Appointment Confirmed!", {
      description: `${payload.new.name} - ${payload.new.booking_date} at ${payload.new.booking_time}`,
      duration: 10000,
    });
  }
}
```

---

### Phase 5: Update LiveStatus Component for BOOKING Status

**File**: `apps/web/components/LiveStatus.tsx`

Add BOOKING status case:

```typescript
case "booking":
  return {
    icon: Calendar,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    borderColor: "border-amber-500/30",
    label: "Scheduling appointment...",
    animated: true,
  };
```

Add detailed BOOKING status rendering (after ANALYZING case):

```typescript
// BOOKING status - show appointment scheduling progress
if (safeStatus === "booking") {
  return (
    <div className={`px-5 py-4 rounded-xl border bg-amber-500/20 border-amber-500/30 animate-fadeIn`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <Calendar className="w-6 h-6 text-amber-400 animate-pulse" />
          <Phone className="w-3 h-3 text-amber-300 absolute -top-1 -right-1" />
        </div>
        <div>
          <p className="text-base font-bold text-amber-400">
            Scheduling Your Appointment
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Our AI is calling the provider to book your appointment
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 bg-amber-500/20 border-amber-500/50 animate-pulse">
            <Phone className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-sm text-amber-300 font-medium">
            Connecting to provider...
          </span>
        </div>
      </div>
    </div>
  );
}
```

---

### Phase 6: Display Booking Confirmation on Request Details Page

**File**: `apps/web/app/request/[id]/page.tsx`

Add booking confirmation display section (after recommendations):

```tsx
{/* Booking Confirmation - Show when appointment is confirmed */}
{request.status === "COMPLETED" && selectedProviderData?.booking_confirmed && (
  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mb-6">
    <div className="flex items-center gap-3 mb-4">
      <CheckCircle className="w-8 h-8 text-emerald-400" />
      <div>
        <h3 className="text-xl font-bold text-emerald-300">
          Appointment Confirmed!
        </h3>
        <p className="text-sm text-slate-400">
          Your appointment has been successfully scheduled
        </p>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4 mt-4">
      <div className="bg-surface rounded-lg p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
          Provider
        </div>
        <div className="text-slate-200 font-medium">
          {selectedProviderData.name}
        </div>
      </div>

      <div className="bg-surface rounded-lg p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
          Date & Time
        </div>
        <div className="text-slate-200 font-medium">
          {selectedProviderData.booking_date} at {selectedProviderData.booking_time}
        </div>
      </div>

      {selectedProviderData.confirmation_number && (
        <div className="bg-surface rounded-lg p-4 col-span-2">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
            Confirmation Number
          </div>
          <div className="text-slate-200 font-mono text-lg">
            {selectedProviderData.confirmation_number}
          </div>
        </div>
      )}
    </div>
  </div>
)}
```

---

### Phase 7: Database Persistence (Already Exists)

The existing code already persists booking results to the database:

**Provider table updates** (`apps/api/src/routes/bookings.ts:270-288`):
- `booking_confirmed`: boolean
- `booking_date`: string
- `booking_time`: string
- `confirmation_number`: string
- `last_call_at`: timestamp
- `call_transcript`: text

**Service request updates** (`apps/api/src/routes/bookings.ts:291-298`):
- `selected_provider_id`: UUID
- `status`: "COMPLETED"
- `final_outcome`: string

**No changes needed** - just ensure the async endpoint uses the same persistence logic.

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/api/src/routes/bookings.ts` | Add test phone handling, create async endpoint |
| `apps/web/package.json` | Add `sonner` dependency |
| `apps/web/app/layout.tsx` | Add `<Toaster />` component |
| `apps/web/app/request/[id]/page.tsx` | Fire-and-forget booking, toast notifications, confirmation display |
| `apps/web/components/LiveStatus.tsx` | Add BOOKING status case |
| `apps/web/lib/services/bookingService.ts` | Add `scheduleBookingAsync()` function |

---

## Environment Variables

**Backend** (`apps/api/.env`):
```bash
# Enable real VAPI calls for booking (default: false = simulated)
LIVE_CALL_ENABLED=true

# Test phones for booking (comma-separated E.164)
# When set, booking calls go to test phone instead of provider
ADMIN_TEST_PHONES=+13105551234
```

**Note**: Backend reads from `process.env` directly, not `NEXT_PUBLIC_*` prefixed vars.

---

## Testing Checklist

1. **Simulated Mode** (`LIVE_CALL_ENABLED=false`):
   - [ ] Modal closes immediately on confirm
   - [ ] Toast shows "Booking in progress..."
   - [ ] Status updates to BOOKING
   - [ ] Simulated result persisted to database
   - [ ] Status updates to COMPLETED
   - [ ] Toast shows confirmation
   - [ ] Confirmation details displayed on page

2. **Test Phone Mode** (`LIVE_CALL_ENABLED=true`, `ADMIN_TEST_PHONES=+1...`):
   - [ ] Call goes to test phone, not provider
   - [ ] All other flows work as above

3. **Production Mode** (`LIVE_CALL_ENABLED=true`, no test phones):
   - [ ] Call goes to actual provider phone
   - [ ] All other flows work as above

4. **Real-time Updates**:
   - [ ] User can navigate away after confirming
   - [ ] Returning to page shows current status
   - [ ] Completion triggers real-time update
   - [ ] Data persists across page refreshes

---

## Risk Mitigation

1. **VAPI Call Failures**: Background process catches errors, updates status to RECOMMENDED (allows retry)

2. **Database Update Failures**: Logged but don't break flow; SMS still attempted

3. **SMS Failures**: Best-effort, logged but don't affect booking status

4. **Network Interruption**: User sees toast immediately; real-time subscription reconnects automatically

---

## Success Criteria

1. User clicks "Confirm & Book" → modal closes in <500ms
2. Toast notification appears immediately
3. User can navigate away; returning shows booking status
4. Test mode calls test phone, not provider
5. Booking confirmation persisted and displayed on return
6. SMS sent to user on successful booking

---

## Document Metadata

**Last Updated**: 2025-12-12
**Implementation Status**: Complete

**Files Modified**:
- `apps/api/src/routes/bookings.ts` - Added LIVE_CALL_ENABLED, ADMIN_TEST_PHONES, /schedule-async endpoint
- `apps/web/package.json` - Added sonner dependency
- `apps/web/app/layout.tsx` - Added Toaster component
- `apps/web/app/request/[id]/page.tsx` - Fire-and-forget booking, confirmation display, real-time toast
- `apps/web/components/LiveStatus.tsx` - Added BOOKING status case

**Related Documents**:
- Session log: `.claude/sessions/deep-work-20251212-async-booking.md`

**Change Log**:
- 2025-12-12 - Initial creation and full implementation
