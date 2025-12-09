#!/bin/bash
#
# Cline CLI Code Review Script
# Usage: ./scripts/cline/review.sh [--staged|--all|--files <file1> <file2>]
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLINE_ENABLED="${CLINE_ENABLED:-true}"
CLINE_YOLO_MODE="${CLINE_YOLO_MODE:-false}"
CLINE_MAX_FILES="${CLINE_MAX_FILES:-10}"
CLINE_TIMEOUT="${CLINE_TIMEOUT:-60}"

# Check if Cline is enabled
if [ "$CLINE_ENABLED" != "true" ]; then
    echo -e "${YELLOW}⚠ Cline is disabled (CLINE_ENABLED=false)${NC}"
    exit 0
fi

# Check if Cline CLI is installed
if ! command -v cline &> /dev/null; then
    echo -e "${RED}✗ Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    if [ "$CLINE_YOLO_MODE" = "true" ]; then
        echo -e "${YELLOW}⚠ YOLO mode enabled - skipping check${NC}"
        exit 0
    fi
    exit 1
fi

# Parse arguments
MODE="staged"
FILES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --staged)
            MODE="staged"
            shift
            ;;
        --all)
            MODE="all"
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
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Get files to review
cd "$PROJECT_ROOT"

case $MODE in
    staged)
        echo -e "${BLUE}🔍 Reviewing staged files...${NC}"
        FILES=($(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' || true))
        ;;
    all)
        echo -e "${BLUE}🔍 Reviewing all changed files...${NC}"
        FILES=($(git diff --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' || true))
        ;;
    files)
        echo -e "${BLUE}🔍 Reviewing specified files...${NC}"
        ;;
esac

# Check if there are files to review
if [ ${#FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ No files to review${NC}"
    exit 0
fi

# Limit number of files
if [ ${#FILES[@]} -gt $CLINE_MAX_FILES ]; then
    echo -e "${YELLOW}⚠ Too many files (${#FILES[@]}). Reviewing first $CLINE_MAX_FILES${NC}"
    FILES=("${FILES[@]:0:$CLINE_MAX_FILES}")
fi

echo -e "${BLUE}Files to review (${#FILES[@]}):${NC}"
printf '%s\n' "${FILES[@]}" | sed 's/^/  - /'

# Create temporary file for results
RESULTS_FILE=$(mktemp)
trap "rm -f $RESULTS_FILE" EXIT

# Run Cline review
echo -e "\n${BLUE}🤖 Running Cline analysis...${NC}"

# Build Cline command
CLINE_CMD="cline review"

# Add context about the project
CLINE_CMD="$CLINE_CMD --context 'AI Concierge monorepo: Next.js 16 (web), Fastify 5 (api), Supabase DB, Gemini AI integration'"

# Add specific rules
CLINE_CMD="$CLINE_CMD --rules 'Check TypeScript types, ensure proper error handling, verify API schema validation with Zod, check Supabase RLS policies'"

# Add timeout
CLINE_CMD="$CLINE_CMD --timeout $CLINE_TIMEOUT"

# Add files
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        CLINE_CMD="$CLINE_CMD $file"
    fi
done

# Execute with timeout
if timeout "$CLINE_TIMEOUT" bash -c "$CLINE_CMD" > "$RESULTS_FILE" 2>&1; then
    CLINE_EXIT_CODE=0
else
    CLINE_EXIT_CODE=$?
fi

# Parse results
if [ $CLINE_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Cline review passed${NC}\n"
    cat "$RESULTS_FILE"
    exit 0
else
    echo -e "${RED}✗ Cline found issues${NC}\n"
    cat "$RESULTS_FILE"

    # Check if YOLO mode is enabled
    if [ "$CLINE_YOLO_MODE" = "true" ]; then
        echo -e "\n${YELLOW}⚠ YOLO mode enabled - allowing commit despite issues${NC}"
        exit 0
    fi

    echo -e "\n${YELLOW}Fix the issues above or use CLINE_YOLO_MODE=true to bypass${NC}"
    exit 1
fi
