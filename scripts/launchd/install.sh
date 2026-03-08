#!/bin/zsh
set -euo pipefail

REPO_DIR="/Users/dave/Work/concierge-ai"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/concierge-ai"

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

cp "$REPO_DIR/launchd/com.nexai.concierge.api.plist" "$LAUNCH_AGENTS_DIR/"
cp "$REPO_DIR/launchd/com.nexai.concierge.voice-agent.plist" "$LAUNCH_AGENTS_DIR/"
cp "$REPO_DIR/launchd/com.nexai.concierge.voice-agent-worker.plist" "$LAUNCH_AGENTS_DIR/"

launchctl unload "$LAUNCH_AGENTS_DIR/com.nexai.concierge.api.plist" >/dev/null 2>&1 || true
launchctl unload "$LAUNCH_AGENTS_DIR/com.nexai.concierge.voice-agent.plist" >/dev/null 2>&1 || true
launchctl unload "$LAUNCH_AGENTS_DIR/com.nexai.concierge.voice-agent-worker.plist" >/dev/null 2>&1 || true

launchctl load "$LAUNCH_AGENTS_DIR/com.nexai.concierge.api.plist"
launchctl load "$LAUNCH_AGENTS_DIR/com.nexai.concierge.voice-agent.plist"
launchctl load "$LAUNCH_AGENTS_DIR/com.nexai.concierge.voice-agent-worker.plist"

echo "Installed and loaded concierge-ai launch agents."
