#!/bin/bash
#
# Cline CLI Security Scan Script
# Comprehensive security analysis using Cline CLI
# Usage: ./scripts/cline/security-scan.sh [--quick|--full]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLINE_ENABLED="${CLINE_ENABLED:-true}"
SCAN_MODE="${1:-quick}"

# Check if Cline is enabled
if [ "$CLINE_ENABLED" != "true" ]; then
    echo -e "${YELLOW}⚠ Cline is disabled${NC}"
    exit 0
fi

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    echo -e "${RED}✗ Cline CLI not found${NC}"
    exit 1
fi

echo -e "${BLUE}🔒 Running security scan (mode: $SCAN_MODE)...${NC}"

cd "$PROJECT_ROOT"

# Create reports directory
REPORTS_DIR="$PROJECT_ROOT/security-reports"
mkdir -p "$REPORTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORTS_DIR/security_scan_$TIMESTAMP.md"

# Initialize report
cat > "$REPORT_FILE" << EOF
# Security Scan Report

**Date**: $(date)
**Mode**: $SCAN_MODE

---

EOF

ISSUES_FOUND=0

# 1. Environment Variable Leaks
echo -e "\n${BLUE}🔍 Checking for exposed secrets...${NC}"
if cline scan-secrets \
    --path "$PROJECT_ROOT" \
    --exclude "node_modules,.git,.next,dist" \
    --output "$REPORT_FILE" \
    --append; then
    echo -e "${GREEN}✓ No secrets exposed${NC}"
else
    echo -e "${RED}✗ Potential secrets found${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 2. SQL Injection Vulnerabilities
echo -e "\n${BLUE}🔍 Checking for SQL injection risks...${NC}"
if cline scan-sql-injection \
    --path "apps/api/src" \
    --context "Supabase client with parameterized queries" \
    --output "$REPORT_FILE" \
    --append; then
    echo -e "${GREEN}✓ No SQL injection risks${NC}"
else
    echo -e "${YELLOW}⚠ Potential SQL injection risks found${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 3. XSS Vulnerabilities
echo -e "\n${BLUE}🔍 Checking for XSS vulnerabilities...${NC}"
if cline scan-xss \
    --path "apps/web" \
    --framework "react" \
    --output "$REPORT_FILE" \
    --append; then
    echo -e "${GREEN}✓ No XSS vulnerabilities${NC}"
else
    echo -e "${YELLOW}⚠ Potential XSS vulnerabilities found${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 4. Authentication/Authorization Issues
echo -e "\n${BLUE}🔍 Checking authentication/authorization...${NC}"
if cline scan-auth \
    --path "$PROJECT_ROOT" \
    --context "Supabase RLS, JWT tokens" \
    --output "$REPORT_FILE" \
    --append; then
    echo -e "${GREEN}✓ No auth issues${NC}"
else
    echo -e "${YELLOW}⚠ Potential auth issues found${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 5. Dependency Vulnerabilities (full mode only)
if [ "$SCAN_MODE" = "--full" ] || [ "$SCAN_MODE" = "full" ]; then
    echo -e "\n${BLUE}🔍 Checking dependencies...${NC}"

    # Run pnpm audit
    if pnpm audit --json > "$REPORTS_DIR/npm_audit_$TIMESTAMP.json" 2>&1; then
        echo -e "${GREEN}✓ No dependency vulnerabilities${NC}"
    else
        echo -e "${YELLOW}⚠ Dependency vulnerabilities found${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))

        # Append to report
        echo -e "\n## Dependency Vulnerabilities\n" >> "$REPORT_FILE"
        echo '```json' >> "$REPORT_FILE"
        cat "$REPORTS_DIR/npm_audit_$TIMESTAMP.json" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
    fi
fi

# 6. CORS Configuration
echo -e "\n${BLUE}🔍 Checking CORS configuration...${NC}"
if cline scan-cors \
    --path "apps/api/src" \
    --output "$REPORT_FILE" \
    --append; then
    echo -e "${GREEN}✓ CORS properly configured${NC}"
else
    echo -e "${YELLOW}⚠ CORS configuration issues found${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 7. Rate Limiting
echo -e "\n${BLUE}🔍 Checking rate limiting...${NC}"
if cline scan-rate-limit \
    --path "apps/api/src" \
    --output "$REPORT_FILE" \
    --append; then
    echo -e "${GREEN}✓ Rate limiting implemented${NC}"
else
    echo -e "${YELLOW}⚠ Missing rate limiting${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 8. Input Validation
echo -e "\n${BLUE}🔍 Checking input validation...${NC}"
if cline scan-validation \
    --path "apps/api/src" \
    --context "Zod schema validation" \
    --output "$REPORT_FILE" \
    --append; then
    echo -e "${GREEN}✓ Input validation present${NC}"
else
    echo -e "${YELLOW}⚠ Missing input validation${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 9. Error Handling (full mode only)
if [ "$SCAN_MODE" = "--full" ] || [ "$SCAN_MODE" = "full" ]; then
    echo -e "\n${BLUE}🔍 Checking error handling...${NC}"
    if cline scan-error-handling \
        --path "$PROJECT_ROOT" \
        --output "$REPORT_FILE" \
        --append; then
        echo -e "${GREEN}✓ Proper error handling${NC}"
    else
        echo -e "${YELLOW}⚠ Error handling issues found${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# 10. OWASP Top 10 Check (full mode only)
if [ "$SCAN_MODE" = "--full" ] || [ "$SCAN_MODE" = "full" ]; then
    echo -e "\n${BLUE}🔍 Running OWASP Top 10 check...${NC}"
    if cline scan-owasp \
        --path "$PROJECT_ROOT" \
        --output "$REPORT_FILE" \
        --append; then
        echo -e "${GREEN}✓ OWASP Top 10 compliance${NC}"
    else
        echo -e "${YELLOW}⚠ OWASP Top 10 issues found${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# Generate summary
cat >> "$REPORT_FILE" << EOF

---

## Summary

**Total Issues Found**: $ISSUES_FOUND

**Severity Breakdown**:
- Critical: TBD
- High: TBD
- Medium: TBD
- Low: TBD

**Recommendations**:
1. Address all critical and high severity issues immediately
2. Plan remediation for medium severity issues
3. Document low severity issues for future sprints

---

**Next Steps**:
1. Review this report with the security team
2. Create GitHub issues for each finding
3. Prioritize fixes based on severity
4. Re-run scan after fixes

EOF

# Format the output
if command -v prettier &> /dev/null; then
    prettier --write "$REPORT_FILE" > /dev/null 2>&1
fi

# Display results
echo -e "\n${BLUE}════════════════════════════════════════${NC}"
if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ Security scan passed - no issues found${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}✗ Security scan found $ISSUES_FOUND issue(s)${NC}"
    EXIT_CODE=1
fi
echo -e "${BLUE}════════════════════════════════════════${NC}"

echo -e "\n${BLUE}Report saved to: $REPORT_FILE${NC}"

# Show latest findings
echo -e "\n${BLUE}Latest Findings:${NC}"
if command -v tail &> /dev/null; then
    tail -n 20 "$REPORT_FILE"
fi

# Cleanup old reports (keep last 10)
echo -e "\n${BLUE}Cleaning up old reports...${NC}"
ls -t "$REPORTS_DIR"/security_scan_*.md | tail -n +11 | xargs rm -f 2>/dev/null || true

exit $EXIT_CODE
