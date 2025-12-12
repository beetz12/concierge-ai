# StatusBadge Consistency Fix

## Problem

The UI showed conflicting status information:
- **StatusBadge** (header): "Analyzing" (database status)
- **LiveStatus** (details): "Calling Providers" (derived from call progress)

This occurred when the status transitioned to `ANALYZING` while VAPI calls were still in progress.

## Root Cause

StatusBadge was displaying the raw database status without considering the actual call progress, while LiveStatus was deriving the display status based on real-time call data.

## Decision: Option A - Add Derived Status Logic

**Chosen Approach**: Add the same derived status logic to StatusBadge for consistency.

**Reasoning**:
1. **User-Facing Consistency**: Both components are visible simultaneously and should tell the same story
2. **Header Context**: Users glance at the header to understand "what's happening now" - not "what the database says"
3. **Trust & Transparency**: Conflicting statuses create confusion and distrust
4. **Single Source of Truth**: Call progress calculation logic should drive BOTH visual representations

## Implementation

### StatusBadge.tsx Changes

Added optional `callProgress` prop and derived display status logic:

```typescript
interface Props {
  status: RequestStatus;
  size?: "sm" | "md";
  callProgress?: {
    total: number;
    queued: number;
    inProgress: number;
    completed: number;
    currentProviderName: string | null;
    percent: number;
  } | null;
}

const StatusBadge: React.FC<Props> = ({ status, size = "md", callProgress }) => {
  // CRITICAL FIX: Derive display status from call progress to match LiveStatus
  // When status is ANALYZING but calls are still running, show CALLING instead
  const displayStatus = (() => {
    if (status === RequestStatus.ANALYZING && callProgress) {
      const hasActiveCalls = callProgress.inProgress > 0;
      const hasQueuedCalls = callProgress.queued > 0;
      const callsNotFinished = callProgress.completed < callProgress.total;

      // If any calls are still running or queued, show CALLING status
      if (hasActiveCalls || hasQueuedCalls || callsNotFinished) {
        return RequestStatus.CALLING;
      }
    }
    return status;
  })();

  const current = config[displayStatus] || fallback;
  // ... rest of component
}
```

### Usage Update

Updated `/app/request/[id]/page.tsx` to pass `callProgress`:

```typescript
<StatusBadge status={request.status} callProgress={callProgress} />
```

## Behavior

| Database Status | Call Progress | StatusBadge Display | LiveStatus Display |
|----------------|---------------|---------------------|-------------------|
| ANALYZING | Calls in progress | **CALLING** ✅ | **CALLING** ✅ |
| ANALYZING | Calls queued | **CALLING** ✅ | **CALLING** ✅ |
| ANALYZING | Calls complete | ANALYZING | ANALYZING |
| CALLING | Any | CALLING | CALLING |

## Backward Compatibility

The `callProgress` prop is optional, so existing usages without the prop (e.g., in history/dashboard lists) continue to work and show the database status.

## Benefits

1. **Consistent User Experience**: Header badge and detailed status always match
2. **Accurate Real-Time Feedback**: Users see what's actually happening, not just database state
3. **No Breaking Changes**: Optional prop maintains backward compatibility
4. **Shared Logic**: Same derived status calculation as LiveStatus

## Files Modified

- `/apps/web/components/StatusBadge.tsx` - Added derived status logic
- `/apps/web/app/request/[id]/page.tsx` - Passed callProgress prop

## Testing Recommendations

1. Verify status badge changes from "Analyzing" to "Calling Providers" when calls are running
2. Verify status badge changes from "Calling Providers" to "Analyzing" when all calls complete
3. Verify backward compatibility - badges without callProgress prop still work
4. Verify concurrent calls show correct status in both badge and LiveStatus
