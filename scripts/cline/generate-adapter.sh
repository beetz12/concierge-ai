#!/bin/bash
#
# Cline CLI Service Adapter Generator (Production-Ready)
# Auto-generates TypeScript service adapters from API documentation
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Proper signal handling (EXIT, INT, TERM)
# - Temp file cleanup with TEMP_FILES array
# - GNU timeout with macOS fallback
# - Input validation for URLs
# - NO_COLOR support
#
# Usage: ./scripts/cline/generate-adapter.sh <ProviderName> [API_DOCS_URL] [--help]
#
# Environment Variables:
#   CLINE_TIMEOUT    Timeout in seconds (default: 180)
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
    readonly MAGENTA='\033[0;35m'
    readonly NC='\033[0m'
else
    readonly RED=''
    readonly GREEN=''
    readonly YELLOW=''
    readonly BLUE=''
    readonly CYAN=''
    readonly MAGENTA=''
    readonly NC=''
fi

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
readonly CLINE_TIMEOUT="${CLINE_TIMEOUT:-180}"

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
Usage: generate-adapter.sh <ProviderName> [API_DOCS_URL] [--help]

Arguments:
  ProviderName    Name of the service provider (e.g., Calendly, Square)
  API_DOCS_URL    Optional URL to API documentation

Options:
  --help          Show this help message

Environment Variables:
  CLINE_TIMEOUT   Timeout in seconds (default: 180)

Examples:
  ./generate-adapter.sh Calendly https://developer.calendly.com/api-docs
  ./generate-adapter.sh Square https://developer.squareup.com/reference/square
  ./generate-adapter.sh OpenTable
  CLINE_TIMEOUT=300 ./generate-adapter.sh Stripe

Output:
  Generates TypeScript files in apps/api/src/services/<provider>/
    - types.ts      TypeScript interfaces
    - client.ts     Service client class
    - schemas.ts    Zod validation schemas
    - index.ts      Barrel export
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
            echo -e "${YELLOW}Warning: timeout not available${NC}" >&2
            "$@"
            ;;
    esac
}

validate_url() {
    local url="$1"
    # Basic URL validation - must start with http:// or https://
    if [[ ! "$url" =~ ^https?:// ]]; then
        echo -e "${RED}ERROR: Invalid URL format. Must start with http:// or https://${NC}" >&2
        return 1
    fi
    return 0
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ══════════════════════════════════════════════════════════════════════════════

# Set trap
trap cleanup EXIT INT TERM

# Handle --help anywhere in args
for arg in "$@"; do
    if [[ "$arg" == "--help" ]] || [[ "$arg" == "-h" ]]; then
        show_usage
        exit 0
    fi
done

# Parse arguments
PROVIDER_NAME="${1:-}"
API_DOCS_URL="${2:-}"

# Change to project root
cd "$PROJECT_ROOT"

# Display banner
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║  🏗️  Cline CLI Service Adapter Generator                   ║${NC}"
echo -e "${MAGENTA}║  Auto-Generate TypeScript Integrations                     ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Validate provider name
if [[ -z "$PROVIDER_NAME" ]]; then
    echo -e "${RED}❌ Error: Provider name is required${NC}"
    echo ""
    show_usage
    exit 1
fi

# Validate provider name format (alphanumeric only)
if [[ ! "$PROVIDER_NAME" =~ ^[a-zA-Z][a-zA-Z0-9]*$ ]]; then
    echo -e "${RED}❌ Error: Provider name must be alphanumeric and start with a letter${NC}"
    exit 1
fi

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    echo -e "${RED}❌ Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    exit 1
fi

# Validate URL if provided
if [[ -n "$API_DOCS_URL" ]]; then
    if ! validate_url "$API_DOCS_URL"; then
        exit 1
    fi
fi

# Convert provider name to lowercase for directories
PROVIDER_LOWER=$(echo "$PROVIDER_NAME" | tr '[:upper:]' '[:lower:]')
readonly OUTPUT_DIR="$PROJECT_ROOT/apps/api/src/services/${PROVIDER_LOWER}"

echo -e "${BLUE}📦 Provider: ${PROVIDER_NAME}${NC}"
echo -e "${BLUE}📁 Output: apps/api/src/services/${PROVIDER_LOWER}/${NC}"
if [[ -n "$API_DOCS_URL" ]]; then
    echo -e "${BLUE}📚 API Docs: ${API_DOCS_URL}${NC}"
fi
echo ""

# Create output directory
if ! mkdir -p "$OUTPUT_DIR"; then
    echo -e "${RED}❌ Failed to create output directory${NC}"
    exit 1
fi

# Fetch API docs if URL provided
API_CONTEXT=""
if [[ -n "$API_DOCS_URL" ]]; then
    echo -e "${BLUE}🌐 Fetching API documentation...${NC}"
    # Use curl with proper error handling
    if API_CONTEXT=$(curl -sL --max-time 30 "$API_DOCS_URL" 2>/dev/null | head -c 50000); then
        echo -e "${GREEN}✅ Documentation fetched${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not fetch documentation, proceeding without it${NC}"
        API_CONTEXT=""
    fi
fi

# Create temp files
RESULTS_FILE=$(create_temp_file)
PROMPT_FILE=$(create_temp_file)

# Build prompt
cat > "$PROMPT_FILE" << PROMPT_EOF
You are generating a production-ready TypeScript service adapter for the AI Concierge project.

PROVIDER: ${PROVIDER_NAME}
${API_CONTEXT:+API DOCUMENTATION (excerpt):
$API_CONTEXT}

PROJECT CONTEXT:
- Monorepo: Turborepo with pnpm
- Backend: Fastify 5 + TypeScript
- Database: Supabase
- Validation: Zod schemas
- Existing pattern: apps/api/src/services/vapi/

GENERATE THE FOLLOWING FILES:

## 1. types.ts (apps/api/src/services/${PROVIDER_LOWER}/types.ts)
TypeScript interfaces for:
- Configuration (API keys, endpoints)
- Request/Response objects
- Error types
- Booking/Availability types

## 2. client.ts (apps/api/src/services/${PROVIDER_LOWER}/client.ts)
Service client class with:
- Constructor accepting config
- searchAvailability(query) method
- bookAppointment(details) method
- cancelAppointment(id) method
- getProviderDetails(id) method
- Proper error handling with try/catch
- Logging

## 3. schemas.ts (apps/api/src/services/${PROVIDER_LOWER}/schemas.ts)
Zod validation schemas for:
- Request validation
- Response validation
- Configuration validation

## 4. index.ts (apps/api/src/services/${PROVIDER_LOWER}/index.ts)
Barrel export file

OUTPUT FORMAT:
For each file, output:

=== FILE: [filename] ===
[complete file content]
=== END FILE ===

Make sure code is:
- TypeScript strict mode compatible
- Well-commented
- Production-ready quality
PROMPT_EOF

echo -e "${BLUE}🤖 Generating service adapter with Cline...${NC}"
echo ""

# Start spinner
start_spinner "Generating adapter (timeout: ${CLINE_TIMEOUT}s)..."

# Execute Cline
CLINE_EXIT=0
run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$PROMPT_FILE" "Generate the service adapter as specified" > "$RESULTS_FILE" 2>&1 || CLINE_EXIT=$?

# Stop spinner
stop_spinner

# Handle timeout/errors
if [[ $CLINE_EXIT -eq 124 ]] || [[ $CLINE_EXIT -eq 137 ]]; then
    echo -e "${YELLOW}⚠️  Cline timed out after ${CLINE_TIMEOUT}s${NC}"
    echo -e "${YELLOW}   Try increasing timeout: CLINE_TIMEOUT=300 ./generate-adapter.sh ${PROVIDER_NAME}${NC}"
    exit 1
elif [[ $CLINE_EXIT -ne 0 ]]; then
    echo -e "${RED}❌ Cline failed with exit code $CLINE_EXIT${NC}"
    if [[ -s "$RESULTS_FILE" ]]; then
        echo -e "${YELLOW}Output:${NC}"
        head -20 "$RESULTS_FILE"
    fi
    exit 1
fi

# Check results
if [[ ! -s "$RESULTS_FILE" ]]; then
    echo -e "${RED}❌ No output generated${NC}"
    exit 1
fi

# Display results
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$RESULTS_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Service Adapter Generated                              ║${NC}"
echo -e "${GREEN}║  Review the output above and copy to appropriate files     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📁 Output directory: ${OUTPUT_DIR}${NC}"
echo -e "${BLUE}📋 Next steps:${NC}"
echo "   1. Review the generated code above"
echo "   2. Create the files in ${OUTPUT_DIR}"
echo "   3. Add environment variables to .env"
echo "   4. Run tests: pnpm --filter api test"
echo "   5. Register routes in apps/api/src/index.ts"
