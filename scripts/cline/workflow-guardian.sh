#!/bin/bash
#
# Cline CLI Workflow Guardian
# Validates Kestra workflow YAML files using AI
# Prize Requirement: "build capabilities ON TOP of the CLI"
#
# Usage: ./scripts/cline/workflow-guardian.sh [flow.yaml|--all]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KESTRA_DIR="$PROJECT_ROOT/kestra/flows"
CLINE_TIMEOUT="${CLINE_TIMEOUT:-90}"
MODE="${1:---all}"

cd "$PROJECT_ROOT"

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
if [ ! -d "$KESTRA_DIR" ]; then
    echo -e "${YELLOW}⚠️  No Kestra flows directory found at $KESTRA_DIR${NC}"
    exit 0
fi

# Get flows to validate
if [ "$MODE" = "--all" ]; then
    FLOWS=($(find "$KESTRA_DIR" -name "*.yaml" -o -name "*.yml" 2>/dev/null))
else
    if [ -f "$MODE" ]; then
        FLOWS=("$MODE")
    elif [ -f "$KESTRA_DIR/$MODE" ]; then
        FLOWS=("$KESTRA_DIR/$MODE")
    else
        echo -e "${RED}❌ Flow file not found: $MODE${NC}"
        exit 1
    fi
fi

if [ ${#FLOWS[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No workflow files found${NC}"
    exit 0
fi

echo -e "${BLUE}📋 Flows to validate: ${#FLOWS[@]}${NC}"
for flow in "${FLOWS[@]}"; do
    echo -e "   - $(basename "$flow")"
done
echo ""

TOTAL_ISSUES=0
CRITICAL_ISSUES=0

# Validate each flow
for FLOW_FILE in "${FLOWS[@]}"; do
    FLOW_NAME=$(basename "$FLOW_FILE")
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🔍 Validating: ${FLOW_NAME}${NC}"

    # Read flow content
    FLOW_CONTENT=$(cat "$FLOW_FILE")

    # Create temp file for results
    RESULTS_FILE=$(mktemp)

    # ══════════════════════════════════════════════════════════════════════════
    # ACTUAL CLINE CLI USAGE - Piped input with YOLO mode (-y)
    # ══════════════════════════════════════════════════════════════════════════

    echo "$FLOW_CONTENT" | timeout "$CLINE_TIMEOUT" cline -y "
You are a Kestra workflow expert validating a workflow for the AI Concierge project.

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

## 3. AI Agent Configuration (if present)
- Prompt clarity and specificity
- Proper tool/grounding configuration
- Temperature and model settings
- Output structure definition

## 4. Security Issues
- NO hardcoded secrets (should use {{ secret('KEY') }})
- NO exposed API keys
- NO unsafe shell commands
- Proper environment variable usage

## 5. Error Handling & Reliability
- Retry configuration present
- Timeout settings defined
- Error handling (allowFailure, errors block)
- Proper task dependencies

## 6. Performance & Best Practices
- Parallel execution where possible
- No unnecessary sequential tasks
- Efficient data passing
- Proper logging configuration

OUTPUT FORMAT (use exactly):

## Workflow Validation: [FLOW_NAME]

### 🔴 Critical Issues (Must Fix)
[List or 'None']

### 🟠 Warnings (Should Fix)
[List or 'None']

### 🟢 Passed Checks
[List what's good]

### 💡 Optimization Suggestions
[List suggestions]

### Summary
- Valid YAML: [Yes/No]
- Security Issues: [X]
- Performance Issues: [X]
- Overall: [PASS/FAIL]

If critical issues found: ❌ WORKFLOW_VALIDATION_FAILED
If no critical issues: ✅ WORKFLOW_VALIDATION_PASSED
" > "$RESULTS_FILE" 2>&1

    # Display results
    cat "$RESULTS_FILE"
    echo ""

    # Check for issues
    if grep -q "WORKFLOW_VALIDATION_FAILED" "$RESULTS_FILE"; then
        echo -e "${RED}❌ ${FLOW_NAME}: FAILED${NC}"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    elif grep -q "WORKFLOW_VALIDATION_PASSED" "$RESULTS_FILE"; then
        echo -e "${GREEN}✅ ${FLOW_NAME}: PASSED${NC}"
    else
        echo -e "${YELLOW}⚠️  ${FLOW_NAME}: Review manually${NC}"
    fi

    # Count issues mentioned
    FLOW_ISSUES=$(grep -c "🔴\|🟠" "$RESULTS_FILE" 2>/dev/null || echo "0")
    TOTAL_ISSUES=$((TOTAL_ISSUES + FLOW_ISSUES))

    rm -f "$RESULTS_FILE"
done

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}                    WORKFLOW GUARDIAN SUMMARY                 ${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "   Flows Validated: ${#FLOWS[@]}"
echo -e "   Total Issues: $TOTAL_ISSUES"
echo -e "   Critical Failures: $CRITICAL_ISSUES"
echo ""

if [ $CRITICAL_ISSUES -gt 0 ]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ WORKFLOW GUARDIAN FAILED                               ║${NC}"
    echo -e "${RED}║  $CRITICAL_ISSUES flow(s) have critical issues                          ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
else
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ WORKFLOW GUARDIAN PASSED                               ║${NC}"
    echo -e "${GREEN}║  All Kestra flows validated successfully                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
