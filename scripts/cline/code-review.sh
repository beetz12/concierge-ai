#!/bin/bash
#
# Cline CLI Code Review Script
# Uses ACTUAL Cline CLI with piped input and YOLO mode (-y)
# Prize Requirement: "build capabilities ON TOP of the CLI"
#
# Usage: ./scripts/cline/code-review.sh [--staged|--commit|--pr]
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
CLINE_TIMEOUT="${CLINE_TIMEOUT:-90}"

cd "$PROJECT_ROOT"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🔍 Cline CLI Code Review                                  ║${NC}"
echo -e "${CYAN}║  AI-Powered Code Analysis for AI Concierge                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    echo -e "${YELLOW}⚠️  Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    echo -e "${GREEN}✅ Skipping AI code review (Cline not installed)${NC}"
    exit 0
fi

# Get diff based on mode
case $MODE in
    --staged)
        echo -e "${BLUE}📋 Mode: Reviewing staged changes${NC}"
        DIFF=$(git diff --cached)
        ;;
    --commit)
        echo -e "${BLUE}📋 Mode: Reviewing last commit${NC}"
        DIFF=$(git show HEAD)
        ;;
    --pr)
        echo -e "${BLUE}📋 Mode: Reviewing PR changes${NC}"
        DIFF=$(git diff origin/main...HEAD)
        ;;
    *)
        echo -e "${RED}Unknown mode: $MODE${NC}"
        exit 1
        ;;
esac

# Check if there are changes to review
if [ -z "$DIFF" ]; then
    echo -e "${GREEN}✅ No changes to review${NC}"
    exit 0
fi

# Show stats
echo -e "${BLUE}📊 Changes to review:${NC}"
git diff --cached --stat 2>/dev/null || git diff --stat HEAD~1 2>/dev/null || echo "Unable to get stats"
echo ""

echo -e "${BLUE}🤖 Running Cline AI code review...${NC}"
echo ""

# Create temporary file for results
RESULTS_FILE=$(mktemp)
trap "rm -f $RESULTS_FILE" EXIT

# ══════════════════════════════════════════════════════════════════════════════
# ACTUAL CLINE CLI USAGE - Piped input with YOLO mode (-y)
# ══════════════════════════════════════════════════════════════════════════════

echo "$DIFF" | timeout "$CLINE_TIMEOUT" cline -y "
You are a senior software engineer conducting a code review for the AI Concierge project.

PROJECT CONTEXT:
- Turborepo monorepo: Next.js 16 (apps/web) + Fastify 5 (apps/api)
- TypeScript strict mode throughout
- Supabase for database (PostgreSQL + RLS)
- Google Gemini for AI, VAPI for phone calls
- Zod for API validation, React 19 for frontend

REVIEW THE CODE CHANGES FOR:

## 1. Code Quality
- TypeScript best practices (proper types, no 'any', no type assertions)
- Error handling (try/catch, error boundaries)
- Code organization and readability
- DRY principles (no duplicated code)

## 2. Next.js/React Patterns (apps/web)
- Server vs Client components (use Server by default)
- Proper 'use client' directive placement
- React 19 patterns (hooks, state management)
- App Router conventions

## 3. Fastify/API Patterns (apps/api)
- Zod schema validation on all inputs
- Proper HTTP status codes
- Consistent error response format
- Route organization

## 4. Database/Supabase
- Parameterized queries (prevent SQL injection)
- Proper RLS policy usage
- Efficient queries (no N+1 problems)

## 5. Performance
- Unnecessary re-renders
- Missing memoization
- Large bundle imports
- Async/await best practices

OUTPUT FORMAT:

## Code Review Results

### ✅ What's Good
[List positive aspects]

### ⚠️ Issues Found
[List issues with file:line references where possible]

### 💡 Suggestions
[List improvement suggestions]

### 📊 Summary
- Quality Score: [1-10]
- Recommend: [Approve/Request Changes/Needs Discussion]
" > "$RESULTS_FILE" 2>&1

# Display results
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$RESULTS_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${GREEN}✅ Code review complete${NC}"
exit 0
