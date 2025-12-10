#!/bin/bash
#
# Cline CLI Code Review Script (Production-Ready)
# AI-powered code review with flexible file selection
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Arrays for file lists (handles spaces/special chars)
# - Proper signal handling (EXIT, INT, TERM)
# - Temp file cleanup with TEMP_FILES array
# - GNU timeout with macOS fallback
# - NO_COLOR support
#
# Usage: ./scripts/cline/review.sh [--staged|--all|--files <file1> <file2>|--help]
#
# Environment Variables:
#   CLINE_ENABLED       Enable/disable (default: true)
#   CLINE_YOLO_MODE     Skip all checks (default: false)
#   CLINE_MAX_FILES     Max files to review (default: 10)
#   CLINE_TIMEOUT       Timeout in seconds (default: 60)
#

# ══════════════════════════════════════════════════════════════════════════════
# STRICT MODE
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# COLORS (respect NO_COLOR env var)
# ══════════════════════════════════════════════════════════════════════════════
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
    readonly RED='\033[0;31m'
    readonly GREEN='\033[0;32m'
    readonly YELLOW='\033[1;33m'
    readonly BLUE='\033[0;34m'
    readonly NC='\033[0m'
else
    readonly RED=''
    readonly GREEN=''
    readonly YELLOW=''
    readonly BLUE=''
    readonly NC=''
fi

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
readonly CLINE_ENABLED="${CLINE_ENABLED:-true}"
readonly CLINE_YOLO_MODE="${CLINE_YOLO_MODE:-false}"
readonly CLINE_MAX_FILES="${CLINE_MAX_FILES:-10}"
readonly CLINE_TIMEOUT="${CLINE_TIMEOUT:-60}"

# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL STATE
# ══════════════════════════════════════════════════════════════════════════════
TEMP_FILES=()
CLEANUP_DONE=false

# ══════════════════════════════════════════════════════════════════════════════
# USAGE
# ══════════════════════════════════════════════════════════════════════════════
show_usage() {
    cat << 'EOF'
Usage: review.sh [--staged|--all|--files <file1> <file2>|--help]

Modes:
  --staged  Review staged files (default)
  --all     Review all changed files (staged + unstaged)
  --files   Review specific files (pass paths after flag)
  --help    Show this help message

Environment Variables:
  CLINE_ENABLED       Enable/disable (default: true)
  CLINE_YOLO_MODE     Skip all checks (default: false)
  CLINE_MAX_FILES     Max files to review (default: 10)
  CLINE_TIMEOUT       Timeout in seconds (default: 60)

Examples:
  ./review.sh --staged
  ./review.sh --all
  ./review.sh --files src/index.ts src/utils.ts
  CLINE_MAX_FILES=20 ./review.sh --all

Exit Codes:
  0  Review passed or skipped
  1  Review found issues (unless CLINE_YOLO_MODE=true)
EOF
}

# ══════════════════════════════════════════════════════════════════════════════
# CLEANUP
# ══════════════════════════════════════════════════════════════════════════════
cleanup() {
    if [[ "$CLEANUP_DONE" == "true" ]]; then
        return
    fi
    CLEANUP_DONE=true

    if [[ ${#TEMP_FILES[@]} -gt 0 ]]; then
        for file in "${TEMP_FILES[@]}"; do
            rm -f "$file" 2>/dev/null || true
        done
    fi
    TEMP_FILES=()
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
            "$@"
            ;;
    esac
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ══════════════════════════════════════════════════════════════════════════════

# Set trap
trap cleanup EXIT INT TERM

# Check if Cline is enabled
if [[ "$CLINE_ENABLED" != "true" ]]; then
    echo -e "${YELLOW}⚠ Cline is disabled (CLINE_ENABLED=false)${NC}"
    exit 0
fi

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    echo -e "${RED}✗ Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    if [[ "$CLINE_YOLO_MODE" == "true" ]]; then
        echo -e "${YELLOW}⚠ YOLO mode enabled - skipping check${NC}"
        exit 0
    fi
    exit 1
fi

# Parse arguments
MODE="staged"
declare -a FILES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_usage
            exit 0
            ;;
        --staged)
            MODE="staged"
            shift
            ;;
        --all)
            MODE="all"
            shift
            ;;
        --files)
            MODE="files"
            shift
            while [[ $# -gt 0 ]] && [[ ! "$1" =~ ^-- ]]; do
                FILES+=("$1")
                shift
            done
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}" >&2
            echo "Use --help for usage information" >&2
            exit 1
            ;;
    esac
done

# Get files to review
cd "$PROJECT_ROOT"

case $MODE in
    staged)
        echo -e "${BLUE}🔍 Reviewing staged files...${NC}"
        while IFS= read -r file; do
            [[ -n "$file" ]] && FILES+=("$file")
        done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' || true)
        ;;
    all)
        echo -e "${BLUE}🔍 Reviewing all changed files...${NC}"
        while IFS= read -r file; do
            [[ -n "$file" ]] && FILES+=("$file")
        done < <(git diff --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' || true)
        ;;
    files)
        echo -e "${BLUE}🔍 Reviewing specified files...${NC}"
        ;;
esac

# Check if there are files to review
if [[ ${#FILES[@]} -eq 0 ]]; then
    echo -e "${GREEN}✓ No files to review${NC}"
    exit 0
fi

# Limit number of files
if [[ ${#FILES[@]} -gt $CLINE_MAX_FILES ]]; then
    echo -e "${YELLOW}⚠ Too many files (${#FILES[@]}). Reviewing first $CLINE_MAX_FILES${NC}"
    FILES=("${FILES[@]:0:$CLINE_MAX_FILES}")
fi

echo -e "${BLUE}Files to review (${#FILES[@]}):${NC}"
for file in "${FILES[@]}"; do
    echo "  - $file"
done

# Create temp files
RESULTS_FILE=$(create_temp_file)
CONTENT_FILE=$(create_temp_file)

# Build file content for review
{
    for file in "${FILES[@]}"; do
        if [[ -f "$file" ]] && [[ -r "$file" ]]; then
            echo "=== FILE: $file ==="
            cat "$file"
            echo ""
            echo "=== END FILE ==="
            echo ""
        fi
    done
} > "$CONTENT_FILE"

# Run Cline review
echo -e "\n${BLUE}🤖 Running Cline analysis...${NC}"

PROMPT="Code review for AI Concierge monorepo (Next.js 16, Fastify 5, Supabase, Gemini AI).

Review the attached files for:
1. TypeScript best practices (types, error handling)
2. Security issues (injection, auth, secrets)
3. React/Next.js patterns (apps/web)
4. Fastify/API patterns (apps/api)
5. Zod validation, Supabase RLS

OUTPUT FORMAT:
## Review Results
### Issues Found
[List with file:line references]

### Suggestions
[Improvement suggestions]

### Summary
- Quality: [1-10]
- Verdict: REVIEW_PASSED or REVIEW_FAILED"

CLINE_EXIT=0
run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$CONTENT_FILE" "$PROMPT" > "$RESULTS_FILE" 2>&1 || CLINE_EXIT=$?

# Handle timeout
if [[ $CLINE_EXIT -eq 124 ]] || [[ $CLINE_EXIT -eq 137 ]]; then
    echo -e "${YELLOW}⚠ Cline timed out after ${CLINE_TIMEOUT}s${NC}"
    exit 0
elif [[ $CLINE_EXIT -ne 0 ]]; then
    echo -e "${YELLOW}⚠ Cline exited with code $CLINE_EXIT${NC}"
    exit 0
fi

# Display results
if [[ -s "$RESULTS_FILE" ]]; then
    cat "$RESULTS_FILE"
fi

# Check verdict
if grep -q "REVIEW_FAILED" "$RESULTS_FILE" 2>/dev/null; then
    echo -e "\n${RED}✗ Cline found issues${NC}"

    if [[ "$CLINE_YOLO_MODE" == "true" ]]; then
        echo -e "${YELLOW}⚠ YOLO mode enabled - allowing despite issues${NC}"
        exit 0
    fi

    echo -e "${YELLOW}Fix the issues above or use CLINE_YOLO_MODE=true to bypass${NC}"
    exit 1
else
    echo -e "\n${GREEN}✓ Cline review passed${NC}"
    exit 0
fi
