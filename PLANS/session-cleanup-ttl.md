# Plan: Session TTL & Heartbeat Cleanup

## Problem

When calls end without the agent calling `finishCall` (callee hangs up, timeout, network drop), sessions remain "active" in the in-memory `VoiceSessionManager` indefinitely. Stale sessions consume worker resources and cause audio quality degradation (choppiness) on subsequent calls.

## Root Cause

Three components hold session state independently:
1. **VoiceSessionManager** (voice-agent server, port 8787) — in-memory, no TTL
2. **ActiveSessionRegistry** (voice-agent worker) — in-memory, no TTL
3. **API backend** (port 9000) — demo mode uses in-memory Maps, no cleanup

The `ParticipantDisconnected` handler in `worker.ts` triggers finalization, but:
- It only fires if the LiveKit room event reaches the worker
- Network issues can prevent the event from firing
- The voice-agent server's session manager is never notified to remove the session

## Solution: Two-Layer Cleanup

### Layer 1: Session TTL (Simple, High Impact)

Add a maximum lifetime to every session. After the TTL expires, force-close regardless of state.

**Files to modify:**
- `apps/voice-agent/src/session-manager.ts`

**Implementation:**

```typescript
// In VoiceSessionManager
private readonly SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes max
private cleanupInterval: NodeJS.Timeout;

constructor() {
  // Sweep every 60 seconds
  this.cleanupInterval = setInterval(() => this.sweepExpiredSessions(), 60_000);
}

private sweepExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of this.sessions) {
    const age = now - new Date(session.createdAt).getTime();
    if (age > this.SESSION_TTL_MS && session.status !== 'completed') {
      console.error(`[session-manager] TTL expired for ${id} (age=${Math.round(age/1000)}s), forcing cleanup`);
      session.status = 'failed';
      session.closedAt = new Date().toISOString();
      // Keep in map briefly for status queries, then remove
      setTimeout(() => this.sessions.delete(id), 60_000);
    }
  }
}

shutdown() {
  clearInterval(this.cleanupInterval);
}
```

**Estimated effort:** 30 minutes

### Layer 2: Heartbeat Check (Robust, Catches Edge Cases)

The worker periodically checks if the LiveKit room still has participants. If the room is empty or gone, finalize the session.

**Files to modify:**
- `apps/voice-agent/src/worker.ts`
- `apps/voice-agent/src/session-control.ts` (ActiveSessionRegistry)

**Implementation:**

```typescript
// In worker.ts, after session.start()
const HEARTBEAT_INTERVAL_MS = 30_000; // Check every 30s
const heartbeat = setInterval(async () => {
  try {
    const participants = await roomServiceClient.listParticipants(roomName);
    const hasRemoteParticipant = participants.some(
      p => p.identity === participant.identity
    );
    
    if (!hasRemoteParticipant && !finalizationTriggered) {
      console.error(`[heartbeat] No remote participant in ${roomName}, triggering cleanup`);
      finalizationTriggered = true;
      clearInterval(heartbeat);
      
      outcomeState.latest = buildFallbackCallOutcome({
        transcript: transcriptLines.join("\n\n"),
        disconnectReason: "heartbeat_no_participant",
      });
      
      session.shutdown({ reason: "heartbeat_cleanup", drain: false });
      void finalizeSession({
        closeReason: "heartbeat_cleanup",
        disconnectReason: "no_remote_participant",
        waitMs: 2000,
      });
    }
  } catch (error) {
    // Room may have been deleted — that's also a cleanup trigger
    if (!finalizationTriggered) {
      console.error(`[heartbeat] Room ${roomName} unreachable, triggering cleanup`);
      finalizationTriggered = true;
      clearInterval(heartbeat);
      void finalizeSession({
        closeReason: "heartbeat_room_gone",
        disconnectReason: "room_unreachable",
        waitMs: 0,
      });
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// Clear heartbeat on normal close
session.on(voice.AgentSessionEventTypes.Close, () => {
  clearInterval(heartbeat);
});
```

**Estimated effort:** 1 hour

### Layer 3: Cross-Service Sync (Nice-to-Have)

When the worker finalizes a session, notify the voice-agent server to remove it from `VoiceSessionManager`. Currently the worker persists to the API backend but the voice-agent server's in-memory map is orphaned.

**Files to modify:**
- `apps/voice-agent/src/server.ts` — add `DELETE /sessions/:sessionId` endpoint
- `apps/voice-agent/src/worker.ts` — call the endpoint during finalization

**Estimated effort:** 30 minutes

## Implementation Order

| Phase | What | Impact | Effort |
|-------|------|--------|--------|
| 1 | Session TTL in VoiceSessionManager | Prevents infinite session accumulation | 30 min |
| 2 | Heartbeat check in worker | Catches disconnects the event system misses | 1 hour |
| 3 | Cross-service sync DELETE endpoint | Keeps all components in agreement | 30 min |

## Testing

1. Dispatch a call, let the callee hang up → verify session moves to completed/failed within 30s
2. Dispatch a call, kill the worker mid-call → verify session TTL cleans up within 15 min
3. Dispatch 3 calls in sequence → verify `activeSessions` returns to 0 after all complete
4. Check `/health` endpoint shows correct session counts throughout

## Success Criteria

- `activeSessions` in health check accurately reflects reality
- No stale sessions after 15 minutes regardless of how the call ended
- No audio quality degradation from accumulated sessions
- `/concierge-restart` skill becomes unnecessary for routine use (only for code deploys)
