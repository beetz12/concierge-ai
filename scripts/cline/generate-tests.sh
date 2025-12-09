#!/bin/bash
#
# Cline CLI Test Generation Script
# Automatically generates tests for changed files
# Usage: ./scripts/cline/generate-tests.sh [--files <file1> <file2>]
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

# Parse arguments
FILES=()
if [ "$1" = "--files" ]; then
    shift
    while [[ $# -gt 0 ]]; do
        FILES+=("$1")
        shift
    done
else
    # Auto-detect changed files
    cd "$PROJECT_ROOT"
    FILES=($(git diff --name-only --diff-filter=ACM HEAD | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '\.spec\.' || true))
fi

if [ ${#FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ No files need tests${NC}"
    exit 0
fi

echo -e "${BLUE}🧪 Generating tests for ${#FILES[@]} files...${NC}"

# Process each file
for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${YELLOW}⚠ File not found: $file${NC}"
        continue
    fi

    echo -e "\n${BLUE}Processing: $file${NC}"

    # Determine test file path
    if [[ "$file" =~ apps/web/ ]]; then
        # Next.js: use __tests__ directory
        DIR=$(dirname "$file")
        BASENAME=$(basename "$file" .ts)
        BASENAME=$(basename "$BASENAME" .tsx)
        TEST_FILE="$DIR/__tests__/$BASENAME.test.tsx"
    elif [[ "$file" =~ apps/api/ ]]; then
        # Fastify: use tests directory at root
        RELATIVE_PATH="${file#apps/api/src/}"
        DIR=$(dirname "$RELATIVE_PATH")
        BASENAME=$(basename "$file" .ts)
        TEST_FILE="apps/api/tests/$DIR/$BASENAME.test.ts"
    else
        # Default: same directory
        DIR=$(dirname "$file")
        BASENAME=$(basename "$file" .ts)
        BASENAME=$(basename "$BASENAME" .tsx)
        TEST_FILE="$DIR/$BASENAME.test.ts"
    fi

    # Check if test already exists
    if [ -f "$TEST_FILE" ]; then
        echo -e "${YELLOW}⚠ Test already exists: $TEST_FILE${NC}"
        read -p "Regenerate? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            continue
        fi
    fi

    # Create test directory if needed
    mkdir -p "$(dirname "$TEST_FILE")"

    # Generate test with Cline
    echo -e "${BLUE}🤖 Generating test...${NC}"

    # Determine framework based on location
    if [[ "$file" =~ apps/web/ ]]; then
        FRAMEWORK="React Testing Library + Vitest"
        CONTEXT="Next.js 16, React 19, TypeScript. Test React components, hooks, and utilities."
    elif [[ "$file" =~ apps/api/ ]]; then
        FRAMEWORK="Node.js + Vitest"
        CONTEXT="Fastify 5 API. Test routes, services, and business logic. Mock Supabase and Gemini."
    else
        FRAMEWORK="Vitest"
        CONTEXT="TypeScript utility functions and helpers."
    fi

    # Run Cline to generate tests
    cline generate-test \
        --file "$file" \
        --output "$TEST_FILE" \
        --framework "$FRAMEWORK" \
        --context "$CONTEXT" \
        --coverage-target 80 \
        --include-edge-cases \
        --mock-external-deps

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Generated: $TEST_FILE${NC}"

        # Format the generated test
        if command -v prettier &> /dev/null; then
            prettier --write "$TEST_FILE" > /dev/null 2>&1
        fi
    else
        echo -e "${RED}✗ Failed to generate test${NC}"
    fi
done

echo -e "\n${GREEN}✓ Test generation complete${NC}"

# Run tests to verify they work
echo -e "\n${BLUE}🧪 Running generated tests...${NC}"
cd "$PROJECT_ROOT"

if [ -d "apps/web/__tests__" ] || [ -d "apps/api/tests" ]; then
    pnpm test
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed${NC}"
    else
        echo -e "${YELLOW}⚠ Some tests failed. Review and fix manually.${NC}"
    fi
fi
