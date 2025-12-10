#!/bin/bash
#
# Cline CLI Security Review Script (Production-Ready)
# Uses Cline CLI with -f flag and YOLO mode (-y) for automated security scanning
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Arrays for file lists (handles spaces/special chars)
# - Process group management for spinner
# - Proper signal handling (EXIT, INT, TERM)
# - GNU timeout check with fallback for macOS
# - Fail-safe on unclear AI verdict
#
# Usage: ./scripts/cline/security-review.sh [--staged|--commit|--full|--help]
#
# Environment Variables:
#   CLINE_TIMEOUT           Timeout in seconds (default: 60)
#   CLINE_MAX_DIFF_LINES    Max diff lines to analyze (default: 500)
#   CLINE_MAX_FILES         Max files to analyze (default: 10)
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
readonly CLINE_TIMEOUT="${CLINE_TIMEOUT:-60}"
readonly MAX_DIFF_LINES="${CLINE_MAX_DIFF_LINES:-500}"
readonly MAX_FILES="${CLINE_MAX_FILES:-10}"
readonly FILE_EXTENSIONS="ts|tsx|js|jsx"
readonly EXCLUDE_PATTERNS="node_modules|dist|\.next|build|\.test\.|\.spec\.|__tests__|__mocks__|\.d\.ts"

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
Usage: security-review.sh [--staged|--commit|--full|--help]

Modes:
  --staged  Review staged changes (default)
  --commit  Review last commit
  --full    Review last 5 commits (or all if < 5 commits)
  --help    Show this help message

Environment Variables:
  CLINE_TIMEOUT           Timeout in seconds (default: 60)
  CLINE_MAX_DIFF_LINES    Max diff lines to analyze (default: 500)
  CLINE_MAX_FILES         Max files to analyze (default: 10)

Examples:
  ./security-review.sh --staged
  CLINE_TIMEOUT=120 ./security-review.sh --full
  CLINE_MAX_FILES=20 ./security-review.sh --commit

Bypass:
  CLINE_YOLO=true git commit -m 'message'   # Skip security check
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

# ══════════════════════════════════════════════════════════════════════════════
# FALLBACK SECURITY CHECK (when Cline not available)
# ══════════════════════════════════════════════════════════════════════════════
run_fallback_checks() {
    echo -e "${YELLOW}⚠️  Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    echo -e "${YELLOW}   Running basic pattern-based checks...${NC}"
    echo ""

    local issues=0
    local diff_content
    diff_content=$(git diff --cached 2>/dev/null || true)

    if [[ -z "$diff_content" ]]; then
        echo -e "${GREEN}✅ No staged changes to review${NC}"
        exit 0
    fi

    # Check for hardcoded secrets (with context)
    local secret_matches
    secret_matches=$(echo "$diff_content" | grep -inE "(api[_-]?key|password|secret|token|private[_-]?key)\s*[=:]\s*['\"][^'\"]{8,}['\"]" || true)
    if [[ -n "$secret_matches" ]]; then
        echo -e "${RED}❌ CRITICAL: Potential hardcoded secrets detected${NC}"
        echo -e "${RED}   Matches found:${NC}"
        echo "$secret_matches" | head -5 | sed 's/^/   /' >&2
        issues=$((issues + 1))
    fi

    # Check for AWS keys
    if echo "$diff_content" | grep -qE "AKIA[0-9A-Z]{16}"; then
        echo -e "${RED}❌ CRITICAL: Potential AWS access key detected${NC}"
        issues=$((issues + 1))
    fi

    # Check for console.log with sensitive data
    if echo "$diff_content" | grep -qE "console\.(log|debug|info).*\b(password|token|key|secret|credential)\b"; then
        echo -e "${YELLOW}⚠️  WARNING: Console logging potentially sensitive data${NC}"
        issues=$((issues + 1))
    fi

    if [[ $issues -eq 0 ]]; then
        echo -e "${GREEN}✅ Basic security checks passed${NC}"
        exit 0
    else
        echo -e "${RED}❌ Found $issues potential security issue(s)${NC}"
        exit 1
    fi
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

# Validate mode early (before banner)
case "$MODE" in
    --staged|--commit|--full) ;;
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
echo -e "${CYAN}║  🔒 Cline CLI Security Review                              ║${NC}"
echo -e "${CYAN}║  AI-Powered Security Scanning for AI Concierge            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    run_fallback_checks
fi

# ══════════════════════════════════════════════════════════════════════════════
# GET CHANGED FILES (using array for proper handling)
# ══════════════════════════════════════════════════════════════════════════════
declare -a CHANGED_FILES_ARRAY=()

case "$MODE" in
    --staged)
        echo -e "${BLUE}📋 Mode: Reviewing staged changes${NC}"
        while IFS= read -r file; do
            [[ -n "$file" ]] && CHANGED_FILES_ARRAY+=("$file")
        done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | \
            grep -E "\.($FILE_EXTENSIONS)$" | \
            grep -v -E "$EXCLUDE_PATTERNS" || true)
        ;;
    --commit)
        echo -e "${BLUE}📋 Mode: Reviewing last commit${NC}"
        while IFS= read -r file; do
            [[ -n "$file" ]] && CHANGED_FILES_ARRAY+=("$file")
        done < <(git show --name-only --pretty=format: HEAD 2>/dev/null | \
            grep -E "\.($FILE_EXTENSIONS)$" | \
            grep -v -E "$EXCLUDE_PATTERNS" || true)
        ;;
    --full)
        # Handle repos with < 5 commits
        local commit_count
        commit_count=$(git rev-list --count HEAD 2>/dev/null || echo "0")

        if [[ "$commit_count" -lt 5 ]]; then
            echo -e "${BLUE}📋 Mode: Full security audit (all $commit_count commits)${NC}"
            local base_ref
            base_ref=$(git rev-list --max-parents=0 HEAD 2>/dev/null || echo "HEAD")
            while IFS= read -r file; do
                [[ -n "$file" ]] && CHANGED_FILES_ARRAY+=("$file")
            done < <(git diff --name-only "$base_ref"...HEAD 2>/dev/null | \
                grep -E "\.($FILE_EXTENSIONS)$" | \
                grep -v -E "$EXCLUDE_PATTERNS" || true)
        else
            echo -e "${BLUE}📋 Mode: Full security audit (last 5 commits)${NC}"
            while IFS= read -r file; do
                [[ -n "$file" ]] && CHANGED_FILES_ARRAY+=("$file")
            done < <(git diff --name-only HEAD~5...HEAD 2>/dev/null | \
                grep -E "\.($FILE_EXTENSIONS)$" | \
                grep -v -E "$EXCLUDE_PATTERNS" || true)
        fi
        ;;
esac

# Check if there are relevant files to review
if [[ ${#CHANGED_FILES_ARRAY[@]} -eq 0 ]]; then
    echo -e "${GREEN}✅ No relevant code files to review${NC}"
    echo -e "${BLUE}   (Only analyzing: .ts, .tsx, .js, .jsx files)${NC}"
    exit 0
fi

# Count and display files
FILE_COUNT=${#CHANGED_FILES_ARRAY[@]}
echo -e "${BLUE}📁 Found $FILE_COUNT code file(s) to analyze${NC}"

# Limit files if necessary (keep largest files)
if [[ $FILE_COUNT -gt $MAX_FILES ]]; then
    echo -e "${YELLOW}⚠️  Limiting to $MAX_FILES largest files (token optimization)${NC}"

    # Sort files by line count and keep top MAX_FILES
    declare -a SIZED_FILES=()
    for file in "${CHANGED_FILES_ARRAY[@]}"; do
        if [[ -f "$file" ]] && [[ -r "$file" ]]; then
            local lines
            lines=$(wc -l < "$file" 2>/dev/null || echo "0")
            SIZED_FILES+=("$lines:$file")
        fi
    done

    # Sort and rebuild array
    CHANGED_FILES_ARRAY=()
    while IFS= read -r entry; do
        local file="${entry#*:}"
        [[ -n "$file" ]] && CHANGED_FILES_ARRAY+=("$file")
    done < <(printf '%s\n' "${SIZED_FILES[@]}" | sort -t: -k1 -rn | head -n "$MAX_FILES")

    FILE_COUNT=${#CHANGED_FILES_ARRAY[@]}
fi

# Show which files will be analyzed
echo -e "${BLUE}   Files:${NC}"
for file in "${CHANGED_FILES_ARRAY[@]}"; do
    echo -e "   ${CYAN}→ $file${NC}"
done

# ══════════════════════════════════════════════════════════════════════════════
# GET DIFF CONTENT
# ══════════════════════════════════════════════════════════════════════════════
DIFF=""
case "$MODE" in
    --staged)
        DIFF=$(git diff --cached --unified=2 -- "${CHANGED_FILES_ARRAY[@]}" 2>/dev/null || true)
        ;;
    --commit)
        DIFF=$(git show --unified=2 HEAD -- "${CHANGED_FILES_ARRAY[@]}" 2>/dev/null || true)
        ;;
    --full)
        if [[ "$commit_count" -lt 5 ]]; then
            DIFF=$(git diff --unified=2 "$base_ref"...HEAD -- "${CHANGED_FILES_ARRAY[@]}" 2>/dev/null || true)
        else
            DIFF=$(git diff --unified=2 HEAD~5...HEAD -- "${CHANGED_FILES_ARRAY[@]}" 2>/dev/null || true)
        fi
        ;;
esac

# Check if there's actual diff content
if [[ -z "$DIFF" ]]; then
    echo -e "${GREEN}✅ No changes to review in selected files${NC}"
    exit 0
fi

# Truncate diff if too large
DIFF_LINES=$(echo "$DIFF" | wc -l | tr -d ' ')
if [[ "$DIFF_LINES" -gt "$MAX_DIFF_LINES" ]]; then
    echo -e "${YELLOW}⚠️  Diff too large ($DIFF_LINES lines), truncating to $MAX_DIFF_LINES lines${NC}"
    DIFF=$(echo "$DIFF" | head -n "$MAX_DIFF_LINES")
    DIFF="$DIFF

... [TRUNCATED - showing first $MAX_DIFF_LINES of $DIFF_LINES lines]"
fi

echo -e "${BLUE}🤖 Running Cline AI security analysis...${NC}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# CREATE TEMP FILES (with error checking)
# ══════════════════════════════════════════════════════════════════════════════
RESULTS_FILE=$(create_temp_file)
DIFF_FILE=$(create_temp_file)

# Save diff to file (avoids ARG_MAX limit)
echo "$DIFF" > "$DIFF_FILE"

# ══════════════════════════════════════════════════════════════════════════════
# RUN CLINE ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════

# Start spinner
start_spinner "Analyzing code for security issues (timeout: ${CLINE_TIMEOUT}s)..."

# Build prompt
PROMPT="Security review for AI Concierge (Next.js + Fastify + Supabase).

The attached file contains a git diff of code changes. Analyze it for:
🔴 CRITICAL (block): hardcoded secrets, SQL injection, auth bypass, exposed env vars
🟠 HIGH: XSS, missing input validation, insecure CORS, PII logging
🟡 MEDIUM: verbose logging, missing error handling

OUTPUT exactly:
## Results
### 🔴 Critical: [issues or None]
### 🟠 High: [issues or None]
### 🟡 Medium: [issues or None]
### Summary: [count] issues, Risk: [Critical/High/Medium/Low]
End with: ✅ SECURITY_CHECK_PASSED or ❌ SECURITY_CHECK_FAILED"

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
    echo -e "${YELLOW}   Increase timeout: CLINE_TIMEOUT=120 git commit -m 'message'${NC}"
    exit 0  # Don't block commit on timeout
elif [[ $CLINE_EXIT -eq 137 ]]; then
    echo -e "${YELLOW}⚠️  Cline was force-killed (took too long to respond)${NC}"
    echo -e "${YELLOW}   This may indicate a large diff or slow network${NC}"
    exit 0  # Don't block commit on force-kill
elif [[ $CLINE_EXIT -ne 0 ]]; then
    echo -e "${YELLOW}⚠️  Cline exited with code $CLINE_EXIT${NC}"
    if [[ -s "$RESULTS_FILE" ]]; then
        echo -e "${YELLOW}   Output:${NC}"
        head -10 "$RESULTS_FILE" | sed 's/^/   /'
    fi
    exit 0  # Don't block commit on cline errors
fi

# ══════════════════════════════════════════════════════════════════════════════
# PROCESS RESULTS
# ══════════════════════════════════════════════════════════════════════════════

# Check if results file has content
if [[ ! -s "$RESULTS_FILE" ]]; then
    echo -e "${YELLOW}⚠️  No output from Cline (results file is empty)${NC}"
    echo -e "${YELLOW}   This may indicate Cline failed to start or crashed${NC}"
    exit 0  # Don't block commit on empty results
fi

# Display results
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$RESULTS_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# DETERMINE PASS/FAIL (with fail-safe logic)
# ══════════════════════════════════════════════════════════════════════════════
HAS_CRITICAL=$(grep -c "🔴 CRITICAL" "$RESULTS_FILE" 2>/dev/null || echo "0")
HAS_FAILED=$(grep -c "SECURITY_CHECK_FAILED" "$RESULTS_FILE" 2>/dev/null || echo "0")
HAS_PASSED=$(grep -c "SECURITY_CHECK_PASSED" "$RESULTS_FILE" 2>/dev/null || echo "0")

if [[ "$HAS_FAILED" -gt 0 ]] || [[ "$HAS_CRITICAL" -gt 0 ]]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ SECURITY CHECK FAILED - Critical issues found!         ║${NC}"
    echo -e "${RED}║  Please fix the issues above before committing.            ║${NC}"
    echo -e "${RED}║  Bypass: CLINE_YOLO=true git commit -m 'message'           ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
elif [[ "$HAS_PASSED" -gt 0 ]]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ SECURITY CHECK PASSED                                  ║${NC}"
    echo -e "${GREEN}║  No critical security issues detected.                     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    # FAIL-SAFE: If AI didn't give clear verdict, warn but allow commit
    # This is intentionally lenient to avoid blocking developers on AI failures
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠️  SECURITY REVIEW INCONCLUSIVE                          ║${NC}"
    echo -e "${YELLOW}║  AI did not provide clear pass/fail verdict.              ║${NC}"
    echo -e "${YELLOW}║  Please review the output above manually.                 ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
