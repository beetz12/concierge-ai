# Launchd And MCP

This repository uses two separate layers for agent access and uptime:

- `launchd` keeps the core services running on macOS
- `apps/voice-mcp` exposes the voice-call API as MCP tools

## Recommended Architecture

Always-on services:

- `apps/api`
- `apps/voice-agent`
- `apps/voice-agent` worker

Agent-facing interface:

- `apps/voice-mcp`

The MCP server is intentionally thin. It depends on the API being reachable.

## Build First

Before installing `launchd` services, build the runnable artifacts:

```bash
pnpm build
```

## Install launchd Services

```bash
chmod +x scripts/launchd/*.sh
./scripts/launchd/install.sh
```

This installs user agents into:

- `~/Library/LaunchAgents/com.nexai.concierge.api.plist`
- `~/Library/LaunchAgents/com.nexai.concierge.voice-agent.plist`
- `~/Library/LaunchAgents/com.nexai.concierge.voice-agent-worker.plist`

Logs go to:

- `~/Library/Logs/concierge-ai/`

## Manage launchd

Unload:

```bash
launchctl unload ~/Library/LaunchAgents/com.nexai.concierge.api.plist
launchctl unload ~/Library/LaunchAgents/com.nexai.concierge.voice-agent.plist
launchctl unload ~/Library/LaunchAgents/com.nexai.concierge.voice-agent-worker.plist
```

Load:

```bash
launchctl load ~/Library/LaunchAgents/com.nexai.concierge.api.plist
launchctl load ~/Library/LaunchAgents/com.nexai.concierge.voice-agent.plist
launchctl load ~/Library/LaunchAgents/com.nexai.concierge.voice-agent-worker.plist
```

## MCP Usage

Run locally:

```bash
pnpm --filter voice-mcp dev
```

Or:

```bash
pnpm --filter voice-mcp build
pnpm --filter voice-mcp start
```

Default API target:

- `http://127.0.0.1:8000/api/v1/voice`

Override with:

- `VOICE_MCP_API_BASE_URL`

## MCP Client Configuration

The MCP adapter is meant to be launched by each agent client over `stdio`.
It does not need its own `launchd` service.

Example config shape:

```json
{
  "mcpServers": {
    "concierge-voice": {
      "command": "pnpm",
      "args": ["--filter", "voice-mcp", "start"],
      "cwd": "/Users/dave/Work/concierge-ai",
      "env": {
        "VOICE_MCP_API_BASE_URL": "http://127.0.0.1:8000/api/v1/voice"
      }
    }
  }
}
```

Use the equivalent format required by each client, but keep the same command,
args, and `cwd`.

## MCP Tools

- `preview_call`
- `dispatch_call`
- `get_call_status`
- `get_call_artifacts`
- `create_browser_monitor`
- `join_supervisor_call`
- `pause_call`
- `resume_call`
