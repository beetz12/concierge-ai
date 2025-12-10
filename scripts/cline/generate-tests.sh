#!/bin/bash
#
# Cline CLI Test Generation Script (Production-Ready)
# Automatically generates tests for changed files using AI
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Arrays for file lists (handles spaces/special chars)
# - Proper signal handling (EXIT, INT, TERM)
# - Temp file cleanup with TEMP_FILES array
# - GNU timeout with macOS fallback
# - Non-interactive mode for automation
# - NO_COLOR support
#
# Usage: ./scripts/cline/generate-tests.sh [--files <file1> <file2>|--staged|--help]
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
Usage: generate-tests.sh [--files <file1> <file2>|--staged|--help]

Modes:
  --staged    Generate tests for staged files (default)
  --files     Generate tests for specific files
  --help      Show this help message

Environment Variables:
  CLINE_ENABLED     Enable/disable (default: true)
  CLINE_TIMEOUT     Timeout per file in seconds (default: 120)

Examples:
  ./generate-tests.sh --staged
  ./generate-tests.sh --files src/utils.ts src/services/api.ts
  CLINE_TIMEOUT=180 ./generate-tests.sh --staged

Output:
  - apps/web files: __tests__/<filename>.test.tsx
  - apps/api files: tests/<path>/<filename>.test.ts
  - Other files: <filename>.test.ts in same directory

Notes:
  - Skips files that already have tests
  - Only processes .ts and .tsx files (excludes existing tests)
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

get_test_path() {
    local file="$1"
    local test_file=""

    if [[ "$file" =~ apps/web/ ]]; then
        # Next.js: use __tests__ directory
        local dir
        dir=$(dirname "$file")
        local basename
        basename=$(basename "$file" .ts)
        basename=$(basename "$basename" .tsx)
        test_file="$dir/__tests__/$basename.test.tsx"
    elif [[ "$file" =~ apps/api/ ]]; then
        # Fastify: use tests directory at root
        local relative_path="${file#apps/api/src/}"
        local dir
        dir=$(dirname "$relative_path")
        local basename
        basename=$(basename "$file" .ts)
        test_file="apps/api/tests/$dir/$basename.test.ts"
    else
        # Default: same directory
        local dir
        dir=$(dirname "$file")
        local basename
        basename=$(basename "$file" .ts)
        basename=$(basename "$basename" .tsx)
        test_file="$dir/$basename.test.ts"
    fi

    echo "$test_file"
}

get_test_framework() {
    local file="$1"

    if [[ "$file" =~ apps/web/ ]]; then
        echo "React Testing Library + Vitest"
    elif [[ "$file" =~ apps/api/ ]]; then
        echo "Node.js + Vitest"
    else
        echo "Vitest"
    fi
}

get_test_context() {
    local file="$1"

    if [[ "$file" =~ apps/web/ ]]; then
        echo "Next.js 16, React 19, TypeScript. Test React components, hooks, and utilities."
    elif [[ "$file" =~ apps/api/ ]]; then
        echo "Fastify 5 API. Test routes, services, and business logic. Mock Supabase and Gemini."
    else
        echo "TypeScript utility functions and helpers."
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# GENERATE TEST FOR SINGLE FILE
# ══════════════════════════════════════════════════════════════════════════════
generate_test() {
    local file="$1"

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Processing: $file${NC}"

    # Check file exists
    if [[ ! -f "$file" ]] || [[ ! -r "$file" ]]; then
        echo -e "${YELLOW}⚠️  File not found or not readable: $file${NC}"
        return 0
    fi

    # Get test file path
    local test_file
    test_file=$(get_test_path "$file")

    # Check if test already exists
    if [[ -f "$test_file" ]]; then
        echo -e "${YELLOW}⚠️  Test already exists: $test_file (skipping)${NC}"
        return 0
    fi

    # Get framework info
    local framework
    framework=$(get_test_framework "$file")
    local context
    context=$(get_test_context "$file")

    # Create temp files
    local source_file results_file
    source_file=$(create_temp_file)
    results_file=$(create_temp_file)

    # Copy source to temp
    cat "$file" > "$source_file"

    # Start spinner
    start_spinner "Generating test for $(basename "$file")..."

    # Build prompt
    local prompt
    prompt="Generate comprehensive unit tests for the attached TypeScript file.

FRAMEWORK: $framework
CONTEXT: $context

REQUIREMENTS:
1. Test all exported functions/components
2. Include happy path and error cases
3. Mock external dependencies (Supabase, Gemini, fetch)
4. Target 80%+ code coverage
5. Use descriptive test names

OUTPUT FORMAT:
Return ONLY the test file content, no explanations.
Start with imports, then describe blocks with test cases."

    # Execute Cline
    local cline_exit=0
    run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$source_file" "$prompt" > "$results_file" 2>&1 || cline_exit=$?

    # Stop spinner
    stop_spinner

    # Handle errors
    if [[ $cline_exit -eq 124 ]] || [[ $cline_exit -eq 137 ]]; then
        echo -e "${YELLOW}⚠️  Timed out generating test for $file${NC}"
        return 0
    elif [[ $cline_exit -ne 0 ]]; then
        echo -e "${YELLOW}⚠️  Failed to generate test (exit: $cline_exit)${NC}"
        return 0
    fi

    # Check output
    if [[ ! -s "$results_file" ]]; then
        echo -e "${YELLOW}⚠️  No test generated for $file${NC}"
        return 0
    fi

    # Create test directory
    local test_dir
    test_dir=$(dirname "$test_file")
    if ! mkdir -p "$test_dir"; then
        echo -e "${RED}❌ Failed to create directory: $test_dir${NC}"
        return 1
    fi

    # Write test file
    cat "$results_file" > "$test_file"

    # Format if prettier available
    if command -v prettier &> /dev/null; then
        prettier --write "$test_file" > /dev/null 2>&1 || true
    fi

    echo -e "${GREEN}✅ Generated: $test_file${NC}"
    return 0
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

# Change to project root
cd "$PROJECT_ROOT"

# Display banner
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🧪 Cline CLI Test Generator                               ║${NC}"
echo -e "${CYAN}║  AI-Powered Test Generation                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get files based on mode
if [[ "$MODE" == "staged" ]]; then
    echo -e "${BLUE}📋 Mode: Generating tests for staged files${NC}"
    while IFS= read -r file; do
        [[ -n "$file" ]] && FILES+=("$file")
    done < <(git diff --name-only --diff-filter=ACM HEAD 2>/dev/null | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '\.spec\.' || true)
fi

# Check if there are files
if [[ ${#FILES[@]} -eq 0 ]]; then
    echo -e "${GREEN}✅ No files need tests${NC}"
    exit 0
fi

echo -e "${BLUE}📁 Files to process: ${#FILES[@]}${NC}"
for file in "${FILES[@]}"; do
    echo "   - $file"
done
echo ""

# Process each file
GENERATED=0
SKIPPED=0

for file in "${FILES[@]}"; do
    if generate_test "$file"; then
        GENERATED=$((GENERATED + 1))
    else
        SKIPPED=$((SKIPPED + 1))
    fi
done

# Summary
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Test generation complete${NC}"
echo -e "   Generated: $GENERATED"
echo -e "   Skipped: $SKIPPED"
echo ""
echo -e "${BLUE}💡 Run tests with: pnpm test${NC}"
