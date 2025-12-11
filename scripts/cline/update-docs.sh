#!/bin/bash
#
# Cline CLI Documentation Update Script (Production-Ready)
# Auto-generates and updates project documentation using AI
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Proper signal handling (EXIT, INT, TERM)
# - Temp file cleanup with TEMP_FILES array
# - GNU timeout with macOS fallback
# - NO_COLOR support
#
# Usage: ./scripts/cline/update-docs.sh [--api|--web|--all|--help]
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
readonly DOCS_DIR="$PROJECT_ROOT/docs"
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
Usage: update-docs.sh [--api|--web|--architecture|--all|--help]

Modes:
  --api           Generate API endpoint documentation
  --web           Generate frontend/component documentation
  --architecture  Generate architecture overview
  --all           Generate all documentation (default)
  --help          Show this help message

Environment Variables:
  CLINE_ENABLED     Enable/disable (default: true)
  CLINE_TIMEOUT     Timeout in seconds (default: 120)

Examples:
  ./update-docs.sh --all
  ./update-docs.sh --api
  CLINE_TIMEOUT=180 ./update-docs.sh --architecture

Output:
  - docs/API_REFERENCE.md     API endpoint documentation
  - docs/WEB_PAGES.md         Frontend pages documentation
  - docs/ARCHITECTURE.md      Architecture overview
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
# DOCUMENTATION GENERATORS
# ══════════════════════════════════════════════════════════════════════════════

update_api_docs() {
    echo -e "${BLUE}📚 Generating API documentation...${NC}"

    local source_file results_file
    source_file=$(create_temp_file)
    results_file=$(create_temp_file)

    # Collect API route files
    {
        echo "# API Routes Source Files"
        echo ""
        if [[ -d "$PROJECT_ROOT/apps/api/src/routes" ]]; then
            find "$PROJECT_ROOT/apps/api/src/routes" -name "*.ts" -type f | while read -r file; do
                echo "=== FILE: ${file#$PROJECT_ROOT/} ==="
                cat "$file"
                echo ""
            done
        fi
    } > "$source_file"

    start_spinner "Generating API docs..."

    local prompt="Generate comprehensive API documentation in Markdown format.

Analyze the Fastify route files and create documentation including:
1. Overview of all endpoints
2. For each endpoint: method, path, description, request/response schemas
3. Authentication requirements
4. Error responses

Format as a professional API reference document."

    local cline_exit=0
    run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$source_file" "$prompt" > "$results_file" 2>&1 || cline_exit=$?

    stop_spinner

    if [[ $cline_exit -eq 0 ]] && [[ -s "$results_file" ]]; then
        cat "$results_file" > "$DOCS_DIR/API_REFERENCE.md"
        echo -e "${GREEN}✅ Generated: docs/API_REFERENCE.md${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed to generate API docs${NC}"
    fi
}

update_web_docs() {
    echo -e "${BLUE}📚 Generating Web documentation...${NC}"

    local source_file results_file
    source_file=$(create_temp_file)
    results_file=$(create_temp_file)

    # Collect web app files
    {
        echo "# Web App Source Files"
        echo ""
        if [[ -d "$PROJECT_ROOT/apps/web/app" ]]; then
            find "$PROJECT_ROOT/apps/web/app" -name "*.tsx" -type f | head -20 | while read -r file; do
                echo "=== FILE: ${file#$PROJECT_ROOT/} ==="
                cat "$file"
                echo ""
            done
        fi
    } > "$source_file"

    start_spinner "Generating Web docs..."

    local prompt="Generate documentation for the Next.js frontend application.

Analyze the React/Next.js files and create documentation including:
1. Page structure and routing
2. Key components and their props
3. State management approach
4. Data fetching patterns

Format as a developer guide document."

    local cline_exit=0
    run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$source_file" "$prompt" > "$results_file" 2>&1 || cline_exit=$?

    stop_spinner

    if [[ $cline_exit -eq 0 ]] && [[ -s "$results_file" ]]; then
        cat "$results_file" > "$DOCS_DIR/WEB_PAGES.md"
        echo -e "${GREEN}✅ Generated: docs/WEB_PAGES.md${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed to generate Web docs${NC}"
    fi
}

update_architecture_docs() {
    echo -e "${BLUE}📚 Generating Architecture documentation...${NC}"

    local source_file results_file
    source_file=$(create_temp_file)
    results_file=$(create_temp_file)

    # Collect key config files
    {
        echo "# Project Structure"
        echo ""
        echo "## Directory Layout"
        ls -la "$PROJECT_ROOT" 2>/dev/null || true
        echo ""
        echo "## Package.json"
        if [[ -f "$PROJECT_ROOT/package.json" ]]; then
            cat "$PROJECT_ROOT/package.json"
        fi
        echo ""
        echo "## CLAUDE.md (Project Overview)"
        if [[ -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
            cat "$PROJECT_ROOT/CLAUDE.md"
        fi
    } > "$source_file"

    start_spinner "Generating Architecture docs..."

    local prompt="Generate an architecture overview document for this monorepo project.

Based on the project structure, create documentation including:
1. High-level architecture diagram (as ASCII art)
2. Technology stack overview
3. Data flow between components
4. Key integration points
5. Development workflow

Format as a technical architecture document."

    local cline_exit=0
    run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$source_file" "$prompt" > "$results_file" 2>&1 || cline_exit=$?

    stop_spinner

    if [[ $cline_exit -eq 0 ]] && [[ -s "$results_file" ]]; then
        cat "$results_file" > "$DOCS_DIR/ARCHITECTURE.md"
        echo -e "${GREEN}✅ Generated: docs/ARCHITECTURE.md${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed to generate Architecture docs${NC}"
    fi
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
TARGET="${1:---all}"

# Handle --help
if [[ "$TARGET" == "--help" ]] || [[ "$TARGET" == "-h" ]]; then
    show_usage
    exit 0
fi

# Change to project root
cd "$PROJECT_ROOT"

# Display banner
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  📝 Cline CLI Documentation Generator                      ║${NC}"
echo -e "${CYAN}║  AI-Powered Documentation Updates                          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Ensure docs directory exists
if ! mkdir -p "$DOCS_DIR"; then
    echo -e "${RED}❌ Failed to create docs directory${NC}"
    exit 1
fi

# Execute based on target
case $TARGET in
    --api|api)
        update_api_docs
        ;;
    --web|web)
        update_web_docs
        ;;
    --architecture|arch)
        update_architecture_docs
        ;;
    --all|all)
        update_api_docs
        echo ""
        update_web_docs
        echo ""
        update_architecture_docs
        ;;
    *)
        echo -e "${RED}Unknown target: $TARGET${NC}" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
esac

# Format if prettier available
echo ""
if command -v prettier &> /dev/null; then
    echo -e "${BLUE}✨ Formatting documentation...${NC}"
    find "$DOCS_DIR" -name "*.md" -type f -exec prettier --write {} \; 2>/dev/null || true
fi

# Summary
echo ""
echo -e "${GREEN}✅ Documentation updated successfully${NC}"
echo -e "${BLUE}📁 Output directory: docs/${NC}"
echo ""
echo -e "${YELLOW}To commit changes:${NC}"
echo "  git add docs/"
echo "  git commit -m 'docs: update documentation with Cline CLI'"
