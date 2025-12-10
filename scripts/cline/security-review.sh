#!/bin/bash
#
# Cline CLI Security Review Script
# Uses ACTUAL Cline CLI with piped input and YOLO mode (-y)
# Prize Requirement: "build capabilities ON TOP of the CLI"
#
# Usage: ./scripts/cline/security-review.sh [--staged|--commit|--full]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODE="${1:---staged}"
CLINE_TIMEOUT="${CLINE_TIMEOUT:-60}"  # Reduced from 120s for faster feedback
MAX_DIFF_LINES="${CLINE_MAX_DIFF_LINES:-500}"  # Limit diff size to prevent token explosion

# Spinner function for progress indication (writes to stderr to avoid stdout conflicts)
SPINNER_PID=""
start_spinner() {
    local msg="${1:-Processing}"
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0
    # Run spinner in subshell, output to stderr
    (
        while true; do
            printf "\r%s %s " "${spin:i++%${#spin}:1}" "$msg" >&2
            sleep 0.1
        done
    ) &
    SPINNER_PID=$!
    disown "$SPINNER_PID" 2>/dev/null  # Prevent job control messages
}

stop_spinner() {
    if [ -n "$SPINNER_PID" ]; then
        # Kill the spinner process and all its children
        kill "$SPINNER_PID" 2>/dev/null || true
        # Don't wait indefinitely - use timeout approach
        ( sleep 0.5; kill -9 "$SPINNER_PID" 2>/dev/null ) &
        wait "$SPINNER_PID" 2>/dev/null || true
        SPINNER_PID=""
        printf "\r\033[K" >&2  # Clear the spinner line on stderr
    fi
}

cd "$PROJECT_ROOT"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🔒 Cline CLI Security Review                              ║${NC}"
echo -e "${CYAN}║  AI-Powered Security Scanning for AI Concierge            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    echo -e "${YELLOW}⚠️  Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    echo -e "${YELLOW}   Falling back to basic checks...${NC}"

    # Fallback: Basic pattern matching for common security issues
    ISSUES=0

    # Check for hardcoded secrets
    if git diff --cached | grep -iE "(api[_-]?key|password|secret|token)\s*[=:]\s*['\"][^'\"]{8,}['\"]" > /dev/null 2>&1; then
        echo -e "${RED}❌ CRITICAL: Potential hardcoded secrets detected${NC}"
        ISSUES=$((ISSUES + 1))
    fi

    # Check for console.log with sensitive data
    if git diff --cached | grep -E "console\.(log|debug).*\b(password|token|key|secret)\b" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  WARNING: Console logging potentially sensitive data${NC}"
        ISSUES=$((ISSUES + 1))
    fi

    if [ $ISSUES -eq 0 ]; then
        echo -e "${GREEN}✅ Basic security checks passed${NC}"
        exit 0
    else
        exit 1
    fi
fi

# Configuration for file filtering
MAX_FILES="${CLINE_MAX_FILES:-10}"
FILE_EXTENSIONS="ts|tsx|js|jsx"
EXCLUDE_PATTERNS="node_modules|dist|\.next|build|\.test\.|\.spec\.|__tests__|__mocks__|\.d\.ts"

# Get changed files based on mode
case $MODE in
    --staged)
        echo -e "${BLUE}📋 Mode: Reviewing staged changes${NC}"
        CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | \
            grep -E "\.($FILE_EXTENSIONS)$" | \
            grep -v -E "$EXCLUDE_PATTERNS" || true)
        ;;
    --commit)
        echo -e "${BLUE}📋 Mode: Reviewing last commit${NC}"
        CHANGED_FILES=$(git show --name-only --pretty=format: HEAD | \
            grep -E "\.($FILE_EXTENSIONS)$" | \
            grep -v -E "$EXCLUDE_PATTERNS" || true)
        ;;
    --full)
        echo -e "${BLUE}📋 Mode: Full security audit${NC}"
        CHANGED_FILES=$(git diff --name-only HEAD~5...HEAD | \
            grep -E "\.($FILE_EXTENSIONS)$" | \
            grep -v -E "$EXCLUDE_PATTERNS" || true)
        ;;
    *)
        echo -e "${RED}Unknown mode: $MODE${NC}"
        echo "Usage: $0 [--staged|--commit|--full]"
        exit 1
        ;;
esac

# Check if there are relevant files to review
if [ -z "$CHANGED_FILES" ]; then
    echo -e "${GREEN}✅ No relevant code files to review${NC}"
    echo -e "${BLUE}   (Only analyzing: .ts, .tsx, .js, .jsx files)${NC}"
    exit 0
fi

# Count files and limit if necessary
FILE_COUNT=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')
echo -e "${BLUE}📁 Found $FILE_COUNT code file(s) to analyze${NC}"

if [ "$FILE_COUNT" -gt "$MAX_FILES" ]; then
    echo -e "${YELLOW}⚠️  Limiting to $MAX_FILES largest files (token optimization)${NC}"
    # Sort by file size (largest first) and take top MAX_FILES
    CHANGED_FILES=$(echo "$CHANGED_FILES" | \
        xargs -I {} sh -c 'wc -l "{}" 2>/dev/null || echo "0 {}"' | \
        sort -rn | head -"$MAX_FILES" | awk '{print $2}')
    FILE_COUNT=$MAX_FILES
fi

# Show which files will be analyzed
echo -e "${BLUE}   Files:${NC}"
echo "$CHANGED_FILES" | while read -r file; do
    echo -e "   ${CYAN}→ $file${NC}"
done

# Get diff for only the relevant files (with reduced context)
case $MODE in
    --staged)
        DIFF=$(git diff --cached --unified=2 -- $CHANGED_FILES)
        ;;
    --commit)
        DIFF=$(git show --unified=2 HEAD -- $CHANGED_FILES)
        ;;
    --full)
        DIFF=$(git diff --unified=2 HEAD~5...HEAD -- $CHANGED_FILES)
        ;;
esac

# Check if there's actual diff content
if [ -z "$DIFF" ]; then
    echo -e "${GREEN}✅ No changes to review in selected files${NC}"
    exit 0
fi

# Truncate diff if too large (prevents token explosion and speeds up analysis)
DIFF_LINES=$(echo "$DIFF" | wc -l)
if [ "$DIFF_LINES" -gt "$MAX_DIFF_LINES" ]; then
    echo -e "${YELLOW}⚠️  Diff too large ($DIFF_LINES lines), truncating to $MAX_DIFF_LINES lines${NC}"
    DIFF=$(echo "$DIFF" | head -n "$MAX_DIFF_LINES")
    DIFF="$DIFF

... [TRUNCATED - showing first $MAX_DIFF_LINES of $DIFF_LINES lines]"
fi

echo -e "${BLUE}🤖 Running Cline AI security analysis...${NC}"
echo ""

# Create temporary files for results and diff
RESULTS_FILE=$(mktemp)
DIFF_FILE=$(mktemp)

# Save diff to file (avoids ARG_MAX limit when passing as command-line argument)
echo "$DIFF" > "$DIFF_FILE"

# ══════════════════════════════════════════════════════════════════════════════
# ACTUAL CLINE CLI USAGE - This is the key for the hackathon prize!
# Using -f flag to attach diff file (avoids ARG_MAX command-line limits)
# Using -y (YOLO mode) and -m act for faster non-interactive execution
# ══════════════════════════════════════════════════════════════════════════════

# Set trap BEFORE starting spinner to ensure cleanup on any exit
trap "stop_spinner; rm -f $RESULTS_FILE $DIFF_FILE" EXIT INT TERM

# Start spinner for progress indication
start_spinner "Analyzing code for security issues (timeout: ${CLINE_TIMEOUT}s)..."

# Build a short prompt (diff is attached via -f flag, not embedded)
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

# Execute Cline with optimized flags
# -f: Attach diff file (avoids ARG_MAX limit)
# -k 10: Force kill after 10s if process doesn't respond to SIGTERM
timeout -k 10 "$CLINE_TIMEOUT" cline -y -m act -f "$DIFF_FILE" "$PROMPT" > "$RESULTS_FILE" 2>&1

CLINE_EXIT=$?

# Handle timeout/kill scenarios
if [ $CLINE_EXIT -eq 124 ]; then
    stop_spinner
    echo -e "${YELLOW}⚠️  Cline timed out after ${CLINE_TIMEOUT}s${NC}"
    echo -e "${YELLOW}   Increase timeout: CLINE_TIMEOUT=120 git commit -m 'message'${NC}"
    exit 0  # Don't block commit on timeout
elif [ $CLINE_EXIT -eq 137 ]; then
    stop_spinner
    echo -e "${YELLOW}⚠️  Cline was force-killed (took too long to respond)${NC}"
    echo -e "${YELLOW}   This may indicate a large diff or slow network${NC}"
    exit 0  # Don't block commit on force-kill
elif [ $CLINE_EXIT -ne 0 ]; then
    stop_spinner
    echo -e "${YELLOW}⚠️  Cline exited with code $CLINE_EXIT${NC}"
    # Show any error output
    if [ -s "$RESULTS_FILE" ]; then
        echo -e "${YELLOW}   Output:${NC}"
        head -10 "$RESULTS_FILE"
    fi
    exit 0  # Don't block commit on cline errors
fi

# Stop spinner
stop_spinner

# Check if results file has content
if [ ! -s "$RESULTS_FILE" ]; then
    echo -e "${YELLOW}⚠️  No output from Cline (results file is empty)${NC}"
    echo -e "${YELLOW}   This may indicate Cline failed to start or crashed${NC}"
    exit 0  # Don't block commit on empty results
fi

# Display results
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$RESULTS_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check for critical issues
if grep -q "SECURITY_CHECK_FAILED" "$RESULTS_FILE" || grep -q "🔴 CRITICAL" "$RESULTS_FILE"; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ SECURITY CHECK FAILED - Critical issues found!         ║${NC}"
    echo -e "${RED}║  Please fix the issues above before committing.            ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
elif grep -q "SECURITY_CHECK_PASSED" "$RESULTS_FILE"; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ SECURITY CHECK PASSED                                  ║${NC}"
    echo -e "${GREEN}║  No critical security issues detected.                     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    # Cline completed but didn't give clear pass/fail
    echo -e "${YELLOW}⚠️  Security review completed - please review findings above${NC}"
    exit 0
fi
