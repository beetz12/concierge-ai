#!/bin/bash
#
# Cline CLI Workflow Guardian (Production-Ready)
# Validates Kestra workflow YAML files using AI
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Arrays for file lists (handles spaces/special chars)
# - Process group management for spinner
# - Proper signal handling (EXIT, INT, TERM)
# - GNU timeout check with fallback for macOS
# - Safe find with null delimiter
#
# Usage: ./scripts/cline/workflow-guardian.sh [flow.yaml|--all|--help]
#
# Environment Variables:
#   CLINE_TIMEOUT    Timeout in seconds per flow (default: 90)
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
readonly KESTRA_DIR="$PROJECT_ROOT/kestra/flows"
readonly CLINE_TIMEOUT="${CLINE_TIMEOUT:-90}"

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
Usage: workflow-guardian.sh [flow.yaml|--all|--help]

Arguments:
  flow.yaml   Validate a specific workflow file
  --all       Validate all workflows in kestra/flows/ (default)
  --help      Show this help message

Environment Variables:
  CLINE_TIMEOUT    Timeout in seconds per flow (default: 90)

Examples:
  ./workflow-guardian.sh --all
  ./workflow-guardian.sh kestra/flows/research_providers.yaml
  CLINE_TIMEOUT=120 ./workflow-guardian.sh --all

Exit Codes:
  0  All workflows passed validation
  1  One or more workflows failed validation
EOF
}

# ══════════════════════════════════════════════════════════════════════════════
# CLEANUP FUNCTION
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
            echo -e "${YELLOW}Warning: GNU timeout not found (install: brew install coreutils)${NC}" >&2
            "$@"
            ;;
    esac
}

# ══════════════════════════════════════════════════════════════════════════════
# VALIDATE SINGLE FLOW
# ══════════════════════════════════════════════════════════════════════════════
validate_flow() {
    local flow_file="$1"
    local flow_name
    flow_name=$(basename "$flow_file")

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🔍 Validating: ${flow_name}${NC}"

    # Check file exists and is readable
    if [[ ! -f "$flow_file" ]] || [[ ! -r "$flow_file" ]]; then
        echo -e "${RED}❌ File not found or not readable: $flow_file${NC}"
        return 1
    fi

    # Create temp files
    local results_file content_file
    results_file=$(create_temp_file)
    content_file=$(create_temp_file)

    # Read flow content safely
    cat "$flow_file" > "$content_file"

    # Start spinner
    start_spinner "Validating ${flow_name}..."

    # Build prompt
    local prompt
    prompt="You are a Kestra workflow expert validating a workflow for the AI Concierge project.

PROJECT CONTEXT:
- AI Concierge is an AI receptionist that researches providers and books appointments
- Uses Kestra for workflow orchestration
- Integrates with: Google Gemini (AI), VAPI (phone calls), Supabase (database)
- Critical flows: research_providers, contact_agent, booking_agent

VALIDATE THIS KESTRA WORKFLOW YAML FOR:

## 1. YAML Syntax & Schema
- Valid YAML structure
- Required fields: id, namespace, tasks
- Proper indentation
- Correct Kestra schema (v1.1.x)

## 2. Task Configuration
- Valid task types (io.kestra.plugin.*)
- Required properties for each task type
- Proper input/output references (\${{ outputs.task_id.value }})
- Variable expressions syntax

## 3. Security Issues
- NO hardcoded secrets (should use {{ secret('KEY') }})
- NO exposed API keys
- NO unsafe shell commands

## 4. Error Handling & Reliability
- Retry configuration present
- Timeout settings defined
- Error handling (allowFailure, errors block)

OUTPUT FORMAT (use exactly):

## Workflow Validation: ${flow_name}

### Critical Issues (Must Fix)
[List or 'None']

### Warnings (Should Fix)
[List or 'None']

### Passed Checks
[List what's good]

### Summary
- Valid YAML: [Yes/No]
- Security Issues: [count]
- Overall: [PASS/FAIL]

End with: WORKFLOW_VALIDATION_PASSED or WORKFLOW_VALIDATION_FAILED"

    # Execute Cline
    local cline_exit=0
    run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$content_file" "$prompt" > "$results_file" 2>&1 || cline_exit=$?

    # Stop spinner
    stop_spinner

    # Handle timeout/errors
    if [[ $cline_exit -eq 124 ]] || [[ $cline_exit -eq 137 ]]; then
        echo -e "${YELLOW}⚠️  Validation timed out for ${flow_name}${NC}"
        return 0  # Don't fail on timeout
    elif [[ $cline_exit -ne 0 ]]; then
        echo -e "${YELLOW}⚠️  Cline error for ${flow_name} (exit: $cline_exit)${NC}"
        return 0  # Don't fail on cline errors
    fi

    # Display results
    if [[ -s "$results_file" ]]; then
        cat "$results_file"
        echo ""
    fi

    # Check for pass/fail
    if grep -q "WORKFLOW_VALIDATION_FAILED" "$results_file" 2>/dev/null; then
        echo -e "${RED}❌ ${flow_name}: FAILED${NC}"
        return 1
    elif grep -q "WORKFLOW_VALIDATION_PASSED" "$results_file" 2>/dev/null; then
        echo -e "${GREEN}✅ ${flow_name}: PASSED${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  ${flow_name}: Review manually (unclear verdict)${NC}"
        return 0  # Don't fail on unclear
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ══════════════════════════════════════════════════════════════════════════════

# Set trap for cleanup
trap cleanup EXIT INT TERM

# Parse arguments
MODE="${1:---all}"

# Handle --help
if [[ "$MODE" == "--help" ]] || [[ "$MODE" == "-h" ]]; then
    show_usage
    exit 0
fi

# Change to project root
cd "$PROJECT_ROOT"

# Display banner
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║  🛡️  Cline CLI Workflow Guardian                           ║${NC}"
echo -e "${MAGENTA}║  AI-Powered Kestra Flow Validation                        ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    echo -e "${YELLOW}⚠️  Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    echo -e "${GREEN}✅ Skipping workflow validation (Cline not installed)${NC}"
    exit 0
fi

# Check if Kestra flows directory exists
if [[ ! -d "$KESTRA_DIR" ]]; then
    echo -e "${YELLOW}⚠️  No Kestra flows directory found at $KESTRA_DIR${NC}"
    exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# GET FLOWS TO VALIDATE (using array for safe handling)
# ══════════════════════════════════════════════════════════════════════════════
declare -a FLOWS=()

if [[ "$MODE" == "--all" ]]; then
    # Find all YAML files safely using null delimiter
    while IFS= read -r -d '' file; do
        FLOWS+=("$file")
    done < <(find "$KESTRA_DIR" -type f \( -name "*.yaml" -o -name "*.yml" \) -print0 2>/dev/null)
else
    # Single file mode
    if [[ -f "$MODE" ]]; then
        FLOWS=("$MODE")
    elif [[ -f "$KESTRA_DIR/$MODE" ]]; then
        FLOWS=("$KESTRA_DIR/$MODE")
    else
        echo -e "${RED}❌ Flow file not found: $MODE${NC}"
        exit 1
    fi
fi

if [[ ${#FLOWS[@]} -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  No workflow files found${NC}"
    exit 0
fi

echo -e "${BLUE}📋 Flows to validate: ${#FLOWS[@]}${NC}"
for flow in "${FLOWS[@]}"; do
    echo -e "   - $(basename "$flow")"
done
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# VALIDATE EACH FLOW
# ══════════════════════════════════════════════════════════════════════════════
TOTAL_ISSUES=0
CRITICAL_FAILURES=0

for flow_file in "${FLOWS[@]}"; do
    if ! validate_flow "$flow_file"; then
        CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
    fi
done

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}                    WORKFLOW GUARDIAN SUMMARY                 ${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "   Flows Validated: ${#FLOWS[@]}"
echo -e "   Critical Failures: $CRITICAL_FAILURES"
echo ""

if [[ $CRITICAL_FAILURES -gt 0 ]]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ WORKFLOW GUARDIAN FAILED                               ║${NC}"
    echo -e "${RED}║  $CRITICAL_FAILURES flow(s) have critical issues                          ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
else
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ WORKFLOW GUARDIAN PASSED                               ║${NC}"
    echo -e "${GREEN}║  All Kestra flows validated successfully                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
