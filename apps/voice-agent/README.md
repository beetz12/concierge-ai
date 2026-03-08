# Voice Agent Service

`apps/voice-agent` is the standalone runtime boundary for the LiveKit-based call agent. It stays separate from `apps/api` so realtime voice orchestration can evolve without collapsing business logic and telephony/session control into one service.

## Current Scope

- starts independently via `pnpm --filter voice-agent dev`
- runs a separate LiveKit worker via `pnpm --filter voice-agent dev:worker`
- exposes `GET /health`, `GET /diagnostics`, and `GET /diagnostics/failures`
- dispatches provider and booking sessions through `/dispatch/*`
- creates a LiveKit agent dispatch plus outbound SIP participant for real phone calls
- persists session snapshots and event history through the API's internal `voice-tools` routes
- builds call wording through scenario templates under `src/prompts/` instead of inline runtime strings
- reads `VOICE_AGENT_HOST`, `VOICE_AGENT_PORT`, `CALL_RUNTIME_PROVIDER`, `VOICE_AGENT_API_BASE_URL`, `VOICE_AGENT_SHARED_SECRET`, and LiveKit telephony env vars
- supports `openai-realtime`, `gemini-live`, and `pipeline` worker modes via `VOICE_AGENT_MODEL_PROVIDER`

## Environment

Recommended local defaults:

```bash
VOICE_AGENT_HOST=0.0.0.0
VOICE_AGENT_PORT=8787
CALL_RUNTIME_PROVIDER=livekit
VOICE_AGENT_API_BASE_URL=http://127.0.0.1:8000/api/v1/voice-tools
VOICE_AGENT_SHARED_SECRET=choose-a-shared-secret
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_AGENT_NAME=concierge-outbound-agent
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=ST_...
LIVEKIT_SIP_FROM_NUMBER=+15551234567 # optional, falls back to trunk default
VOICE_AGENT_MODEL_PROVIDER=openai-realtime
OPENAI_API_KEY=...
OPENAI_REALTIME_VOICE=marin
# or use Gemini Live instead:
# GOOGLE_API_KEY=...
# GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
# GEMINI_LIVE_VOICE=Puck
```

Recommended default:

- `VOICE_AGENT_MODEL_PROVIDER=openai-realtime` for the most natural first pass
- `VOICE_AGENT_MODEL_PROVIDER=gemini-live` when you want Gemini-native audio behavior
- `VOICE_AGENT_MODEL_PROVIDER=pipeline` only as a fallback/debug path

## Service Boundary

- `apps/api` owns request persistence, provider records, recommendations, booking flows, and runtime selection
- `apps/voice-agent` owns live call session state, agent handoffs, observability, and the internal tool contract
- `VAPI` remains a compatibility fallback selected through `CALL_RUNTIME_PROVIDER=vapi`

## Prompt Templates

Realtime call behavior now comes from dedicated prompt templates in `src/prompts/`:

- `qualification-template.ts` for outbound provider screening
- `booking-template.ts` for callback scheduling and exact appointment confirmation
- `direct-task-template.ts` for future task-oriented calls that need a different tone and goal structure

The worker runtime only selects the template and model settings. Scenario wording, fixed openers, question ordering, edge-case handling, and closing rules live in the template layer.

## Local Startup

From the repository root:

```bash
# terminal 1
pnpm --filter api dev

# terminal 2
VOICE_AGENT_API_BASE_URL=http://127.0.0.1:8000/api/v1/voice-tools \
VOICE_AGENT_SHARED_SECRET=dev-voice-agent-secret \
pnpm --filter voice-agent dev

# terminal 3
LIVEKIT_URL=wss://your-project.livekit.cloud \
LIVEKIT_API_KEY=... \
LIVEKIT_API_SECRET=... \
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=ST_... \
pnpm --filter voice-agent dev:worker
```

Useful local checks:

```bash
curl http://127.0.0.1:8787/health
curl -H 'x-voice-agent-key: dev-voice-agent-secret' http://127.0.0.1:8787/diagnostics
curl -H 'x-voice-agent-key: dev-voice-agent-secret' http://127.0.0.1:8787/diagnostics/failures
```

## Live Calling Requirements

To place a real outbound call, all of the following must be true:

- `CALL_RUNTIME_PROVIDER=livekit` in the API runtime
- the HTTP voice-agent service is running
- the LiveKit worker is running with the same `LIVEKIT_AGENT_NAME`
- `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` points to a valid outbound trunk in LiveKit Cloud
- the trunk is configured with a working telephony provider and caller ID
- the selected realtime provider key is configured:
  - `OPENAI_API_KEY` for `openai-realtime`
  - `GOOGLE_API_KEY` for `gemini-live`

Runtime flow:

1. `apps/api` posts a provider call request to `apps/voice-agent`
2. `apps/voice-agent` creates a unique LiveKit room
3. `apps/voice-agent` dispatches the named worker into that room
4. `apps/voice-agent` creates the outbound SIP participant on the same room
5. the LiveKit worker handles the conversation using the selected realtime model
6. when the model calls `finishCall`, the worker persists the final outcome and deletes the room to hang up the PSTN leg cleanly

## Graceful Shutdown Contract

The API and voice-agent services must both support controlled shutdown on `SIGINT` and `SIGTERM`.

- stop accepting new work immediately after the signal is received
- mark the process as shutting down for health/readiness reporting where applicable
- drain and close active listeners before exiting
- exit `0` on a clean shutdown and non-zero if the drain fails

For local verification:

1. start the service with `pnpm --filter voice-agent dev`
2. hit `http://localhost:8787/health`
3. send `Ctrl+C`
4. confirm the process logs the shutdown path and exits cleanly
