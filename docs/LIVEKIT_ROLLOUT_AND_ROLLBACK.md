# LiveKit Rollout and Rollback

This project now defaults to `CALL_RUNTIME_PROVIDER=livekit`, but rollout should stay reversible through configuration only.

## Goal

- move new provider-calling traffic onto the LiveKit-first voice runtime
- keep the existing VAPI path deployable as a compatibility fallback
- avoid schema rollback during runtime changes

## Prerequisites

- deploy `apps/api` and `apps/voice-agent`
- set the same `VOICE_AGENT_SHARED_SECRET` in both services
- ensure the API can reach `VOICE_AGENT_SERVICE_URL`
- keep valid VAPI credentials available even when `VAPI_ENABLED=false`

## Staged Rollout

### Stage 1: Local and Demo Validation

- run `pnpm --filter api test`
- run `pnpm --filter voice-agent test`
- run `pnpm --filter api check-types`
- run `pnpm --filter voice-agent check-types`
- start the API with `CALL_RUNTIME_PROVIDER=livekit`
- start the voice-agent and confirm:
  - `GET /health` returns `status: ok`
  - `GET /diagnostics` returns recent events
  - `GET /diagnostics/failures` is empty or only contains expected test failures

### Stage 2: Internal / Low-Risk Traffic

- deploy with:
  - `CALL_RUNTIME_PROVIDER=livekit`
  - `LIVEKIT_ENABLED=true`
  - `VAPI_ENABLED=false`
- keep `VAPI_API_KEY` and `VAPI_PHONE_NUMBER_ID` present in secrets storage
- monitor:
  - API startup logs for runtime selection
  - voice-agent `/diagnostics`
  - API `voice-tools/diagnostics/recent-events`
  - persisted `voice_call_sessions` and `voice_call_events`

### Stage 3: Wider Production Rollout

- keep LiveKit as the selected provider
- watch for:
  - rising `fallback_triggered` events
  - repeated `dispatch_failed` or `batch_dispatch_failed`
  - missing `session_completed` events for dispatched sessions
  - divergence between provider outcome persistence and session history

## Rollback

Rollback is configuration-only. Do not revert migrations.

### Immediate Rollback Procedure

1. update API runtime env:
   - `CALL_RUNTIME_PROVIDER=vapi`
   - `VAPI_ENABLED=true`
2. confirm VAPI credentials are present:
   - `VAPI_API_KEY`
   - `VAPI_PHONE_NUMBER_ID`
3. redeploy `apps/api`
4. optionally leave `apps/voice-agent` running, but it is no longer on the hot path
5. verify:
   - `GET /api/v1/providers/call/status` reports `runtimeProvider: "vapi"`
   - `pnpm --filter api test` still passes

## Why No Schema Rollback

- `voice_call_sessions` and `voice_call_events` are additive tables
- they do not change the legacy provider or booking schema
- VAPI fallback continues to work even if the LiveKit persistence tables remain deployed

## Re-enable LiveKit Later

To return to LiveKit after rollback:

1. set `CALL_RUNTIME_PROVIDER=livekit`
2. set `LIVEKIT_ENABLED=true`
3. set `VAPI_ENABLED=false`
4. redeploy `apps/api`
5. confirm the voice-agent is healthy before routing production traffic back
