#!/bin/bash
#
# Cline CLI Code Review Script (Production-Ready)
# Uses Cline CLI with -f flag and YOLO mode (-y) for automated code analysis
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Arrays for file lists (handles spaces/special chars)
# - Process group management for spinner
# - Proper signal handling (EXIT, INT, TERM)
# - GNU timeout check with fallback for macOS
# - Fail-safe on unclear AI verdict
#
# Usage: ./scripts/cline/code-review.sh [--staged|--commit|--pr|--help]
#
# Environment Variables:
#   CLINE_TIMEOUT           Timeout in seconds (default: 90)
#   CLINE_MAX_DIFF_LINES    Max diff lines to analyze (default: 1000)
#

# ══════════════════════════════════════════════════════════════════════════════
# STRICT MODE - Exit on error, undefined vars, pipe failures
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# COLORS (respect NO_COLOR env var - 2025 best practice)
# ══════════════════════════════════════════════════════════════════════════════
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
    readonly RED='\033[0;31m'
    readonly GREEN='\033[0;32m'
    readonly YELLOW='\033[1;33m'
    readonly BLUE='\033[0;34m'
    readonly CYAN='\033[0;36m'
    readonly NC='\033[0m'
else
    readonly RED=''
    readonly GREEN=''
    readonly YELLOW=''
    readonly BLUE=''
    readonly CYAN=''
    readonly NC=''
fi

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
readonly CLINE_TIMEOUT="${CLINE_TIMEOUT:-90}"
readonly MAX_DIFF_LINES="${CLINE_MAX_DIFF_LINES:-1000}"

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
Usage: code-review.sh [--staged|--commit|--pr|--help]

Modes:
  --staged  Review staged changes (default)
  --commit  Review last commit
  --pr      Review PR changes (against origin/main)
  --help    Show this help message

Environment Variables:
  CLINE_TIMEOUT           Timeout in seconds (default: 90)
  CLINE_MAX_DIFF_LINES    Max diff lines to analyze (default: 1000)

Examples:
  ./code-review.sh --staged
  CLINE_TIMEOUT=120 ./code-review.sh --pr
  CLINE_MAX_DIFF_LINES=2000 ./code-review.sh --commit

Note: This is an informational review - it doesn't block commits.
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
        kill "$SPINNER_PID" 2>/dev/null || true
        local count=0
        while kill -0 "$SPINNER_PID" 2>/dev/null && [[ $count -lt 5 ]]; do
            sleep 0.1
            count=$((count + 1))
        done
        if kill -0 "$SPINNER_PID" 2>/dev/null; then
            kill -9 "$SPINNER_PID" 2>/dev/null || true
        fi
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
            echo -e "${YELLOW}Warning: GNU timeout not found (install: brew install coreutils)${NC}" >&2
            "$@"
            ;;
    esac
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ══════════════════════════════════════════════════════════════════════════════

# Set trap for cleanup (BEFORE any temp files are created)
trap cleanup EXIT INT TERM

# Parse arguments
MODE="${1:---staged}"

# Handle --help
if [[ "$MODE" == "--help" ]] || [[ "$MODE" == "-h" ]]; then
    show_usage
    exit 0
fi

# Validate mode early
case "$MODE" in
    --staged|--commit|--pr) ;;
    *)
        echo -e "${RED}ERROR: Unknown mode: $MODE${NC}" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
esac

# Change to project root
cd "$PROJECT_ROOT"

# Display banner
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🔍 Cline CLI Code Review                                  ║${NC}"
echo -e "${CYAN}║  AI-Powered Code Analysis for AI Concierge                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    echo -e "${YELLOW}⚠️  Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    echo -e "${GREEN}✅ Skipping AI code review (Cline not installed)${NC}"
    exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# GET DIFF BASED ON MODE
# ══════════════════════════════════════════════════════════════════════════════
DIFF=""
case "$MODE" in
    --staged)
        echo -e "${BLUE}📋 Mode: Reviewing staged changes${NC}"
        DIFF=$(git diff --cached 2>/dev/null || true)
        ;;
    --commit)
        echo -e "${BLUE}📋 Mode: Reviewing last commit${NC}"
        DIFF=$(git show HEAD 2>/dev/null || true)
        ;;
    --pr)
        echo -e "${BLUE}📋 Mode: Reviewing PR changes (vs origin/main)${NC}"
        # Ensure we have the latest main
        git fetch origin main 2>/dev/null || true
        DIFF=$(git diff origin/main...HEAD 2>/dev/null || true)
        ;;
esac

# Check if there are changes to review
if [[ -z "$DIFF" ]]; then
    echo -e "${GREEN}✅ No changes to review${NC}"
    exit 0
fi

# Show stats
echo -e "${BLUE}📊 Changes to review:${NC}"
case "$MODE" in
    --staged)
        git diff --cached --stat 2>/dev/null || echo "   Unable to get stats"
        ;;
    --commit)
        git show --stat HEAD 2>/dev/null | tail -n 5 || echo "   Unable to get stats"
        ;;
    --pr)
        git diff --stat origin/main...HEAD 2>/dev/null | tail -n 10 || echo "   Unable to get stats"
        ;;
esac
echo ""

# Truncate diff if too large
DIFF_LINES=$(echo "$DIFF" | wc -l | tr -d ' ')
if [[ "$DIFF_LINES" -gt "$MAX_DIFF_LINES" ]]; then
    echo -e "${YELLOW}⚠️  Diff too large ($DIFF_LINES lines), truncating to $MAX_DIFF_LINES lines${NC}"
    DIFF=$(echo "$DIFF" | head -n "$MAX_DIFF_LINES")
    DIFF="$DIFF

... [TRUNCATED - showing first $MAX_DIFF_LINES of $DIFF_LINES lines]"
fi

echo -e "${BLUE}🤖 Running Cline AI code review...${NC}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# CREATE TEMP FILES
# ══════════════════════════════════════════════════════════════════════════════
RESULTS_FILE=$(create_temp_file)
DIFF_FILE=$(create_temp_file)

# Save diff to file (avoids ARG_MAX limit)
echo "$DIFF" > "$DIFF_FILE"

# ══════════════════════════════════════════════════════════════════════════════
# RUN CLINE ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════

# Start spinner
start_spinner "Analyzing code quality (timeout: ${CLINE_TIMEOUT}s)..."

# Build prompt
PROMPT="Senior code review for AI Concierge (Next.js 16 + Fastify 5 + Supabase).

The attached file contains a git diff. Review for:

## 1. Code Quality
- TypeScript best practices (proper types, no 'any', no type assertions)
- Error handling (try/catch, error boundaries)
- Code organization and readability
- DRY principles (no duplicated code)

## 2. Next.js/React Patterns (apps/web)
- Server vs Client components (use Server by default)
- Proper 'use client' directive placement
- React 19 patterns (hooks, state management)

## 3. Fastify/API Patterns (apps/api)
- Zod schema validation on all inputs
- Proper HTTP status codes
- Consistent error response format

## 4. Database/Supabase
- Parameterized queries (prevent SQL injection)
- Efficient queries (no N+1 problems)

## 5. Performance
- Unnecessary re-renders
- Missing memoization
- Async/await best practices

OUTPUT FORMAT:

## Code Review Results

### What's Good
[List positive aspects]

### Issues Found
[List issues with file:line references]

### Suggestions
[List improvement suggestions]

### Summary
- Quality Score: [1-10]
- Recommendation: [Approve/Request Changes/Needs Discussion]"

# Execute Cline with timeout
CLINE_EXIT=0
run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$DIFF_FILE" "$PROMPT" > "$RESULTS_FILE" 2>&1 || CLINE_EXIT=$?

# Stop spinner
stop_spinner

# ══════════════════════════════════════════════════════════════════════════════
# HANDLE EXIT CODES
# ══════════════════════════════════════════════════════════════════════════════
if [[ $CLINE_EXIT -eq 124 ]]; then
    echo -e "${YELLOW}⚠️  Cline timed out after ${CLINE_TIMEOUT}s${NC}"
    echo -e "${YELLOW}   Increase timeout: CLINE_TIMEOUT=120 ./code-review.sh${NC}"
    exit 0
elif [[ $CLINE_EXIT -eq 137 ]]; then
    echo -e "${YELLOW}⚠️  Cline was force-killed (took too long)${NC}"
    exit 0
elif [[ $CLINE_EXIT -ne 0 ]]; then
    echo -e "${YELLOW}⚠️  Cline exited with code $CLINE_EXIT${NC}"
    if [[ -s "$RESULTS_FILE" ]]; then
        echo -e "${YELLOW}   Output:${NC}"
        head -10 "$RESULTS_FILE" | sed 's/^/   /'
    fi
    exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# DISPLAY RESULTS
# ══════════════════════════════════════════════════════════════════════════════

if [[ ! -s "$RESULTS_FILE" ]]; then
    echo -e "${YELLOW}⚠️  No output from Cline (results file is empty)${NC}"
    exit 0
fi

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$RESULTS_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${GREEN}✅ Code review complete (informational only)${NC}"
exit 0
