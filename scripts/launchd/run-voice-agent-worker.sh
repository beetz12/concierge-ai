#!/bin/zsh
set -euo pipefail

REPO_DIR="/Users/dave/Work/concierge-ai"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "$REPO_DIR"
exec pnpm --filter voice-agent start:worker
