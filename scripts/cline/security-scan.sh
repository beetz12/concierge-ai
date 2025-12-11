#!/bin/bash
#
# Cline CLI Security Scan Script (Production-Ready)
# Comprehensive security analysis using Cline CLI
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Proper signal handling (EXIT, INT, TERM)
# - Temp file cleanup with TEMP_FILES array
# - GNU timeout with macOS fallback
# - NO_COLOR support
#
# Usage: ./scripts/cline/security-scan.sh [--quick|--full|--help]
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
readonly REPORTS_DIR="$PROJECT_ROOT/security-reports"
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
Usage: security-scan.sh [--quick|--full|--help]

Modes:
  --quick   Fast scan focusing on critical issues (default)
  --full    Comprehensive scan including dependencies
  --help    Show this help message

Environment Variables:
  CLINE_ENABLED     Enable/disable (default: true)
  CLINE_TIMEOUT     Timeout in seconds (default: 120)

Examples:
  ./security-scan.sh
  ./security-scan.sh --quick
  ./security-scan.sh --full
  CLINE_TIMEOUT=180 ./security-scan.sh --full

Checks Performed:
  - Hardcoded secrets and API keys
  - SQL injection vulnerabilities
  - XSS vulnerabilities
  - Authentication/authorization issues
  - CORS configuration
  - Input validation
  - Dependency vulnerabilities (--full mode)
  - OWASP Top 10 compliance

Output:
  security-reports/security_scan_<timestamp>.md
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
SCAN_MODE="quick"

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_usage
            exit 0
            ;;
        --quick)
            SCAN_MODE="quick"
            shift
            ;;
        --full)
            SCAN_MODE="full"
            shift
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

# Create reports directory
if ! mkdir -p "$REPORTS_DIR"; then
    echo -e "${RED}❌ Failed to create reports directory${NC}"
    exit 1
fi

# Generate timestamp and file names
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORTS_DIR/security_scan_$TIMESTAMP.md"

# Display banner
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🔒 Cline CLI Security Scanner                             ║${NC}"
echo -e "${CYAN}║  AI-Powered Security Analysis                              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 Mode: $SCAN_MODE${NC}"
echo -e "${BLUE}📄 Report: $REPORT_FILE${NC}"
echo ""

# Create temp files
SOURCE_FILE=$(create_temp_file)
RESULTS_FILE=$(create_temp_file)

# Collect source files for analysis
echo -e "${BLUE}📊 Collecting source files...${NC}"
{
    echo "# Security Scan Source Files"
    echo ""
    echo "## Project: AI Concierge"
    echo "## Scan Mode: $SCAN_MODE"
    echo "## Date: $(date)"
    echo ""

    # API routes (critical for security)
    if [[ -d "$PROJECT_ROOT/apps/api/src" ]]; then
        echo "### Backend API Files"
        find "$PROJECT_ROOT/apps/api/src" -type f -name "*.ts" \
            -not -path "*/node_modules/*" \
            -not -name "*.test.*" \
            -not -name "*.spec.*" \
            2>/dev/null | head -30 | while read -r file; do
            echo "=== FILE: ${file#$PROJECT_ROOT/} ==="
            cat "$file"
            echo ""
        done
    fi

    # Web app files
    if [[ -d "$PROJECT_ROOT/apps/web" ]] && [[ "$SCAN_MODE" == "full" ]]; then
        echo "### Frontend Web Files"
        find "$PROJECT_ROOT/apps/web" -type f \( -name "*.ts" -o -name "*.tsx" \) \
            -not -path "*/node_modules/*" \
            -not -path "*/.next/*" \
            -not -name "*.test.*" \
            2>/dev/null | head -20 | while read -r file; do
            echo "=== FILE: ${file#$PROJECT_ROOT/} ==="
            cat "$file"
            echo ""
        done
    fi

    # Environment files (check for accidental commits)
    echo "### Environment Configuration"
    for env_file in .env .env.local .env.development .env.production; do
        if [[ -f "$PROJECT_ROOT/$env_file" ]]; then
            echo "=== FILE: $env_file (SENSITIVE - check for secrets) ==="
            echo "[File exists - should be in .gitignore]"
            echo ""
        fi
    done

} > "$SOURCE_FILE"

# Build prompt based on mode
if [[ "$SCAN_MODE" == "full" ]]; then
    PROMPT="Perform a COMPREHENSIVE security audit on this codebase.

PROJECT: AI Concierge (Next.js + Fastify + Supabase)

ANALYZE FOR ALL OWASP TOP 10 VULNERABILITIES:

1. **Injection (A03:2021)**
   - SQL injection in Supabase queries
   - Command injection in shell operations
   - NoSQL injection patterns

2. **Broken Authentication (A07:2021)**
   - JWT handling issues
   - Session management
   - Password storage

3. **Sensitive Data Exposure (A02:2021)**
   - Hardcoded secrets/API keys
   - PII in logs
   - Unencrypted data transmission

4. **XML External Entities (XXE)**
   - XML parsing vulnerabilities

5. **Broken Access Control (A01:2021)**
   - Missing authorization checks
   - IDOR vulnerabilities
   - Privilege escalation

6. **Security Misconfiguration (A05:2021)**
   - CORS issues
   - Debug endpoints
   - Default credentials

7. **Cross-Site Scripting XSS (A03:2021)**
   - Reflected XSS
   - Stored XSS
   - DOM XSS

8. **Insecure Deserialization (A08:2021)**
   - Unsafe JSON parsing
   - Object injection

9. **Using Components with Known Vulnerabilities (A06:2021)**
   - Outdated dependencies
   - Known CVEs

10. **Insufficient Logging & Monitoring (A09:2021)**
    - Missing audit logs
    - Error disclosure

OUTPUT FORMAT:

# Security Audit Report

## Executive Summary
[Critical findings overview]

## Critical Vulnerabilities (P0)
[Immediate action required]

## High Risk Issues (P1)
[Fix within 24 hours]

## Medium Risk Issues (P2)
[Fix within 1 week]

## Low Risk Issues (P3)
[Fix in next sprint]

## Recommendations
[Prioritized action items]

## Verdict
SECURITY_SCAN_PASSED or SECURITY_SCAN_FAILED"

else
    # Quick scan
    PROMPT="Perform a QUICK security scan focusing on critical issues.

PROJECT: AI Concierge (Next.js + Fastify + Supabase)

FOCUS ON CRITICAL ISSUES ONLY:

1. **Hardcoded Secrets**
   - API keys in code
   - Passwords in source
   - Tokens/credentials

2. **SQL/Command Injection**
   - Unsafe query construction
   - Shell command injection

3. **Authentication Bypass**
   - Missing auth checks
   - Broken authorization

4. **Sensitive Data Exposure**
   - PII logging
   - Unprotected endpoints

OUTPUT FORMAT:

# Quick Security Scan

## Critical Issues Found
[List with severity and location]

## Recommendations
[Top 3 action items]

## Verdict
SECURITY_SCAN_PASSED or SECURITY_SCAN_FAILED"
fi

# Start scan
start_spinner "Running $SCAN_MODE security scan..."

# Execute Cline
CLINE_EXIT=0
run_with_timeout "$CLINE_TIMEOUT" cline -y -m act -f "$SOURCE_FILE" "$PROMPT" > "$RESULTS_FILE" 2>&1 || CLINE_EXIT=$?

# Stop spinner
stop_spinner

# Handle errors
if [[ $CLINE_EXIT -eq 124 ]] || [[ $CLINE_EXIT -eq 137 ]]; then
    echo -e "${YELLOW}⚠️  Scan timed out after ${CLINE_TIMEOUT}s${NC}"
    echo -e "${YELLOW}   Try: CLINE_TIMEOUT=180 ./security-scan.sh${NC}"
    exit 1
elif [[ $CLINE_EXIT -ne 0 ]]; then
    echo -e "${RED}❌ Scan failed (exit: $CLINE_EXIT)${NC}"
    exit 1
fi

# Check results
if [[ ! -s "$RESULTS_FILE" ]]; then
    echo -e "${RED}❌ No scan results generated${NC}"
    exit 1
fi

# Write report
cat "$RESULTS_FILE" > "$REPORT_FILE"

# Run dependency audit in full mode
if [[ "$SCAN_MODE" == "full" ]]; then
    echo ""
    echo -e "${BLUE}📦 Running dependency audit...${NC}"
    AUDIT_FILE="$REPORTS_DIR/npm_audit_$TIMESTAMP.json"
    if pnpm audit --json > "$AUDIT_FILE" 2>&1; then
        echo -e "${GREEN}✅ No dependency vulnerabilities found${NC}"
    else
        echo -e "${YELLOW}⚠️  Dependency vulnerabilities found - see $AUDIT_FILE${NC}"
        echo "" >> "$REPORT_FILE"
        echo "## Dependency Vulnerabilities" >> "$REPORT_FILE"
        echo "See: npm_audit_$TIMESTAMP.json" >> "$REPORT_FILE"
    fi
fi

# Display results
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$REPORT_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

# Determine pass/fail
if grep -q "SECURITY_SCAN_FAILED" "$REPORT_FILE" 2>/dev/null; then
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ SECURITY SCAN FAILED                                   ║${NC}"
    echo -e "${RED}║  Critical security issues found - review report above      ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
elif grep -q "SECURITY_SCAN_PASSED" "$REPORT_FILE" 2>/dev/null; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ SECURITY SCAN PASSED                                   ║${NC}"
    echo -e "${GREEN}║  No critical security issues detected                      ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠️  SECURITY SCAN INCONCLUSIVE                            ║${NC}"
    echo -e "${YELLOW}║  Review the report above manually                         ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi

# Cleanup old reports (keep last 10)
find "$REPORTS_DIR" -name "security_scan_*.md" -type f | sort -r | tail -n +11 | xargs rm -f 2>/dev/null || true
