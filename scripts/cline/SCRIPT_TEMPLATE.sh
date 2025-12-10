#!/bin/bash
#
# {{SCRIPT_NAME}} (Production-Ready)
# {{SCRIPT_DESCRIPTION}}
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Arrays for file lists (handles spaces/special chars)
# - Process group management for spinner
# - Proper signal handling (EXIT, INT, TERM)
# - GNU timeout check with fallback for macOS
# - Fail-safe error handling
#
# Usage: ./scripts/cline/{{SCRIPT_FILENAME}} {{USAGE_ARGS}}
#
# Environment Variables:
#   {{ENV_VARS}}
#

# ══════════════════════════════════════════════════════════════════════════════
# STRICT MODE - Exit on error, undefined vars, pipe failures
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# COLORS
# ══════════════════════════════════════════════════════════════════════════════
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
{{CONFIGURATION_VARS}}

# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL STATE (for cleanup)
# ══════════════════════════════════════════════════════════════════════════════
SPINNER_PID=""
TEMP_FILES=()
CLEANUP_DONE=false

# ══════════════════════════════════════════════════════════════════════════════
# USAGE
# ══════════════════════════════════════════════════════════════════════════════
show_usage() {
    cat << 'EOF'
{{USAGE_TEXT}}
EOF
}

# ══════════════════════════════════════════════════════════════════════════════
# CLEANUP FUNCTION
# ══════════════════════════════════════════════════════════════════════════════
cleanup() {
    # Prevent recursive cleanup
    if [[ "$CLEANUP_DONE" == "true" ]]; then
        return
    fi
    CLEANUP_DONE=true

    # Stop spinner if running
    if [[ -n "$SPINNER_PID" ]] && kill -0 "$SPINNER_PID" 2>/dev/null; then
        # Try graceful kill first
        kill "$SPINNER_PID" 2>/dev/null || true
        # Wait briefly
        local count=0
        while kill -0 "$SPINNER_PID" 2>/dev/null && [[ $count -lt 5 ]]; do
            sleep 0.1
            count=$((count + 1))
        done
        # Force kill if still running
        if kill -0 "$SPINNER_PID" 2>/dev/null; then
            kill -9 "$SPINNER_PID" 2>/dev/null || true
        fi
        # Clear spinner line
        printf "\r\033[K" >&2
    fi
    SPINNER_PID=""

    # Remove temp files (handle empty array with set -u)
    if [[ ${#TEMP_FILES[@]} -gt 0 ]]; then
        for file in "${TEMP_FILES[@]}"; do
            rm -f "$file" 2>/dev/null || true
        done
    fi
    TEMP_FILES=()
}

# ══════════════════════════════════════════════════════════════════════════════
# SPINNER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════
start_spinner() {
    local msg="${1:-Processing}"
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

    # Start spinner in subshell with trap for clean exit
    (
        trap 'exit 0' TERM INT
        local i=0
        while true; do
            printf "\r%s %s " "${spin:i++%${#spin}:1}" "$msg" >&2
            sleep 0.1
        done
    ) &
    SPINNER_PID=$!
}

stop_spinner() {
    if [[ -n "$SPINNER_PID" ]] && kill -0 "$SPINNER_PID" 2>/dev/null; then
        kill "$SPINNER_PID" 2>/dev/null || true
        wait "$SPINNER_PID" 2>/dev/null || true
        printf "\r\033[K" >&2
    fi
    SPINNER_PID=""
}

# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════
create_temp_file() {
    local temp_file
    temp_file=$(mktemp) || {
        echo -e "${RED}ERROR: Failed to create temporary file${NC}" >&2
        exit 1
    }
    TEMP_FILES+=("$temp_file")
    echo "$temp_file"
}

check_timeout_command() {
    if command -v timeout >/dev/null 2>&1; then
        # Check if it supports -k flag (GNU timeout)
        if timeout --help 2>&1 | grep -q '\-k'; then
            echo "gnu"
        else
            echo "basic"
        fi
    else
        echo "none"
    fi
}

run_with_timeout() {
    local timeout_secs="$1"
    shift
    local timeout_type
    timeout_type=$(check_timeout_command)

    case "$timeout_type" in
        gnu)
            timeout -k 10 "$timeout_secs" "$@"
            ;;
        basic)
            timeout "$timeout_secs" "$@"
            ;;
        none)
            # macOS without coreutils - run without timeout
            echo -e "${YELLOW}⚠️  GNU timeout not found (install: brew install coreutils)${NC}" >&2
            "$@"
            ;;
    esac
}

{{ADDITIONAL_HELPER_FUNCTIONS}}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ══════════════════════════════════════════════════════════════════════════════

# Set trap for cleanup (BEFORE any temp files are created)
trap cleanup EXIT INT TERM

{{ARGUMENT_PARSING}}

# Change to project root
cd "$PROJECT_ROOT"

# Display banner
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  {{BANNER_ICON}} {{BANNER_TITLE}}{{BANNER_PADDING}}║${NC}"
echo -e "${CYAN}║  {{BANNER_SUBTITLE}}{{BANNER_SUBTITLE_PADDING}}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

{{MAIN_LOGIC}}

{{RESULTS_DISPLAY}}
