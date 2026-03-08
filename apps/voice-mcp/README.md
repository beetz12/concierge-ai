# Voice MCP

Thin MCP adapter for the concierge voice-call API.

## Purpose

This package exposes the existing voice-call HTTP API as MCP tools so other local agents can:

- preview a contractor call
- dispatch a live call
- poll call status
- fetch transcript and artifact paths
- create a browser monitor token
- dial a supervisor into the live call
- pause or resume the agent

The MCP server is intentionally thin. It does not contain business logic. The always-on runtime remains:

- `apps/api`
- `apps/voice-agent`
- `apps/voice-agent` worker

## Run

```bash
pnpm --filter voice-mcp dev
```

Or after build:

```bash
pnpm --filter voice-mcp build
pnpm --filter voice-mcp start
```

## Environment

- `VOICE_MCP_API_BASE_URL`
  - default: `http://127.0.0.1:8000/api/v1/voice`

## Tools

- `preview_call`
- `dispatch_call`
- `get_call_status`
- `get_call_artifacts`
- `create_browser_monitor`
- `join_supervisor_call`
- `pause_call`
- `resume_call`
