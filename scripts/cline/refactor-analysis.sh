#!/bin/bash
#
# Cline CLI Refactoring Analysis Script (Production-Ready)
# Identifies refactoring opportunities and suggests improvements using AI
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Proper signal handling (EXIT, INT, TERM)
# - Temp file cleanup with TEMP_FILES array
# - GNU timeout with macOS fallback
# - NO_COLOR support
#
# Usage: ./scripts/cline/refactor-analysis.sh [--path <directory>|--help]
#
# Environment Variables:
#   CLINE_ENABLED     Enable/disable (default: true)
#   CLINE_TIMEOUT     Timeout in seconds (default: 120)
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
readonly OUTPUT_FILE="$PROJECT_ROOT/docs/REFACTORING_OPPORTUNITIES.md"
readonly CLINE_ENABLED="${CLINE_ENABLED:-true}"
readonly CLINE_TIMEOUT="${CLINE_TIMEOUT:-120}"

# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL STATE
# ══════════════════════════════════════════════════════════════════════════════
SPINNER_PID=""
TEMP_FILES=()
CLEANUP_DONE=false

# ══════════════════════════════════════════════════════════════════════════════
# USAGE
# ══════════════════════════════════════════════════════════════════════════════
show_usage() {
    cat << 'EOF'
Usage: refactor-analysis.sh [--path <directory>|--help]

Options:
  --path <dir>  Analyze a specific directory (default: entire project)
  --help        Show this help message

Environment Variables:
  CLINE_ENABLED     Enable/disable (default: true)
  CLINE_TIMEOUT     Timeout in seconds (default: 120)

Examples:
  ./refactor-analysis.sh
  ./refactor-analysis.sh --path apps/api/src
  ./refactor-analysis.sh --path apps/web/lib
  CLINE_TIMEOUT=180 ./refactor-analysis.sh --path apps/api

Output:
  docs/REFACTORING_OPPORTUNITIES.md

Analysis Includes:
  - Code duplication detection
  - Complexity analysis
  - Type safety issues
  - Performance concerns
  - Best practices violations
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

    # Stop spinner
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

    # Remove temp files
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
    exit 1
fi

# Parse arguments
TARGET_PATH="$PROJECT_ROOT"

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_usage
            exit 0
            ;;
        --path)
            if [[ -n "${2:-}" ]]; then
                TARGET_PATH="$2"
                shift 2
            else
                echo -e "${RED}ERROR: --path requires a directory argument${NC}" >&2
                exit 1
            fi
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}" >&2
            echo "Use --help for usage information" >&2
            exit 1
            ;;
    esac
done

# Validate path
if [[ ! -d "$TARGET_PATH" ]]; then
    echo -e "${RED}❌ Directory not found: $TARGET_PATH${NC}"
    exit 1
fi

# Change to project root
cd "$PROJECT_ROOT"

# Display banner
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🔍 Cline CLI Refactoring Analysis                         ║${NC}"
echo -e "${CYAN}║  AI-Powered Code Quality Analysis                          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}📁 Target: $TARGET_PATH${NC}"
echo ""

# Create temp files
SOURCE_FILE=$(create_temp_file)
RESULTS_FILE=$(create_temp_file)

# Collect source files
echo -e "${BLUE}📊 Collecting source files...${NC}"
{
    echo "# Source Code for Refactoring Analysis"
    echo ""
    echo "## Project: AI Concierge"
    echo "## Path: ${TARGET_PATH#$PROJECT_ROOT/}"
    echo ""

    # Find TypeScript files (limit to 50 to stay within token limits)
    find "$TARGET_PATH" -type f \( -name "*.ts" -o -name "*.tsx" \) \
        -not -path "*/node_modules/*" \
        -not -path "*/.next/*" \
        -not -path "*/dist/*" \
        -not -name "*.test.*" \
        -not -name "*.spec.*" \
        -not -name "*.d.ts" \
        2>/dev/null | head -50 | while read -r file; do
        echo "=== FILE: ${file#$PROJECT_ROOT/} ==="
        head -200 "$file"  # Limit lines per file
        echo ""
        echo "=== END FILE ==="
        echo ""
    done
} > "$SOURCE_FILE"

# Check if we have content
if [[ ! -s "$SOURCE_FILE" ]]; then
    echo -e "${YELLOW}⚠️  No source files found in $TARGET_PATH${NC}"
    exit 0
fi

# Start analysis
start_spinner "Analyzing code for refactoring opportunities..."

# Build prompt
PROMPT="Perform a comprehensive refactoring analysis on the attached TypeScript codebase.

PROJECT CONTEXT:
- AI Concierge: AI receptionist/scheduler application
- Tech stack: Next.js 16, Fastify 5, Supabase, Google Gemini, VAPI
- Architecture: Turborepo monorepo (apps/web, apps/api)

ANALYZE FOR:

## 1. Code Duplication
- Identify repeated code patterns
- Suggest extraction into reusable functions/components
- Look for copy-paste across files

## 2. Complexity Issues
- Functions over 50 lines
- Deeply nested conditionals (>3 levels)
- Cyclomatic complexity concerns

## 3. Type Safety
- Use of 'any' type
- Missing type annotations
- Unsafe type assertions

## 4. Performance Concerns
- Unnecessary re-renders (React)
- Missing memoization
- N+1 query patterns
- Large bundle imports

## 5. Best Practices
- Missing error handling
- Inconsistent patterns
- Security concerns
- Code organization

OUTPUT FORMAT:

# Refactoring Analysis Report

## Executive Summary
[Brief overview of findings]

## Critical Issues (High Priority)
[Issues that should be fixed immediately]

## Recommended Improvements (Medium Priority)
[Improvements that would benefit codebase]

## Minor Suggestions (Low Priority)
[Nice-to-have improvements]

## Metrics
- Files Analyzed: [X]
- Critical Issues: [X]
- Warnings: [X]
- Suggestions: [X]

## Action Items
[Prioritized list of specific refactoring tasks]"

# Execute Cline
CLINE_EXIT=0
run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$SOURCE_FILE" "$PROMPT" > "$RESULTS_FILE" 2>&1 || CLINE_EXIT=$?

# Stop spinner
stop_spinner

# Handle errors
if [[ $CLINE_EXIT -eq 124 ]] || [[ $CLINE_EXIT -eq 137 ]]; then
    echo -e "${YELLOW}⚠️  Analysis timed out after ${CLINE_TIMEOUT}s${NC}"
    echo -e "${YELLOW}   Try increasing timeout: CLINE_TIMEOUT=180 ./refactor-analysis.sh${NC}"
    exit 1
elif [[ $CLINE_EXIT -ne 0 ]]; then
    echo -e "${RED}❌ Analysis failed (exit: $CLINE_EXIT)${NC}"
    if [[ -s "$RESULTS_FILE" ]]; then
        echo -e "${YELLOW}Output:${NC}"
        head -20 "$RESULTS_FILE"
    fi
    exit 1
fi

# Check results
if [[ ! -s "$RESULTS_FILE" ]]; then
    echo -e "${RED}❌ No analysis generated${NC}"
    exit 1
fi

# Ensure docs directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Write results
cat "$RESULTS_FILE" > "$OUTPUT_FILE"

# Format if prettier available
if command -v prettier &> /dev/null; then
    prettier --write "$OUTPUT_FILE" > /dev/null 2>&1 || true
fi

# Display results
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$OUTPUT_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

# Summary
echo ""
echo -e "${GREEN}✅ Refactoring analysis complete${NC}"
echo -e "${BLUE}📄 Report saved to: $OUTPUT_FILE${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review the report above"
echo "  2. Prioritize refactoring tasks"
echo "  3. Create GitHub issues for high-priority items"
