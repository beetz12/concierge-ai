#!/bin/bash
#
# Cline CLI Documentation Update Script
# Auto-generates and updates project documentation
# Usage: ./scripts/cline/update-docs.sh [--api|--web|--all]
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
DOCS_DIR="$PROJECT_ROOT/docs"
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
TARGET="${1:-all}"

echo -e "${BLUE}📝 Updating documentation for: $TARGET${NC}"

cd "$PROJECT_ROOT"

# Ensure docs directory exists
mkdir -p "$DOCS_DIR"

# Function to update API docs
update_api_docs() {
    echo -e "\n${BLUE}📚 Updating API documentation...${NC}"

    # Generate API endpoint documentation
    cline document \
        --path "apps/api/src/routes" \
        --output "$DOCS_DIR/API_REFERENCE.md" \
        --format markdown \
        --include-types \
        --include-examples \
        --context "Fastify 5 API with Zod validation. Document all endpoints, request/response schemas, and error codes."

    # Generate service documentation
    cline document \
        --path "apps/api/src/services" \
        --output "$DOCS_DIR/API_SERVICES.md" \
        --format markdown \
        --include-types \
        --context "Business logic services. Document Gemini AI integration, Supabase operations, and VAPI webhook handling."

    echo -e "${GREEN}✓ API docs updated${NC}"
}

# Function to update Web docs
update_web_docs() {
    echo -e "\n${BLUE}📚 Updating Web documentation...${NC}"

    # Generate component documentation
    cline document \
        --path "apps/web/app" \
        --output "$DOCS_DIR/WEB_PAGES.md" \
        --format markdown \
        --include-types \
        --context "Next.js 16 app router pages. Document routes, server actions, and data fetching."

    # Generate hooks and utilities documentation
    cline document \
        --path "apps/web/lib" \
        --output "$DOCS_DIR/WEB_UTILITIES.md" \
        --format markdown \
        --include-types \
        --context "React hooks, Supabase client, and utility functions."

    echo -e "${GREEN}✓ Web docs updated${NC}"
}

# Function to update architecture docs
update_architecture_docs() {
    echo -e "\n${BLUE}📚 Updating architecture documentation...${NC}"

    # Generate architecture overview
    cline analyze-architecture \
        --output "$DOCS_DIR/ARCHITECTURE_GENERATED.md" \
        --include-data-flow \
        --include-dependencies \
        --context "Monorepo with Next.js frontend, Fastify backend, Supabase database, Gemini AI, and Kestra workflows."

    # Generate database schema documentation
    if [ -d "supabase/migrations" ]; then
        cline document \
            --path "supabase/migrations" \
            --output "$DOCS_DIR/DATABASE_SCHEMA.md" \
            --format markdown \
            --context "Supabase PostgreSQL schema with RLS policies."
    fi

    echo -e "${GREEN}✓ Architecture docs updated${NC}"
}

# Function to update README
update_readme() {
    echo -e "\n${BLUE}📚 Updating README...${NC}"

    # Ensure key sections are present
    cline enhance-readme \
        --file "$PROJECT_ROOT/README.md" \
        --sections "installation,development,deployment,architecture,contributing" \
        --context "AI Concierge project: monorepo with Next.js, Fastify, Supabase, Gemini AI."

    echo -e "${GREEN}✓ README updated${NC}"
}

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
    --readme)
        update_readme
        ;;
    --all|all)
        update_api_docs
        update_web_docs
        update_architecture_docs
        update_readme
        ;;
    *)
        echo -e "${RED}Unknown target: $TARGET${NC}"
        echo "Usage: $0 [--api|--web|--architecture|--readme|--all]"
        exit 1
        ;;
esac

# Format all markdown files
echo -e "\n${BLUE}✨ Formatting documentation...${NC}"
if command -v prettier &> /dev/null; then
    prettier --write "$DOCS_DIR/**/*.md" > /dev/null 2>&1
fi

# Summary
echo -e "\n${GREEN}✓ Documentation updated successfully${NC}"
echo -e "${BLUE}Updated files:${NC}"
ls -lh "$DOCS_DIR"/*.md | awk '{print "  - " $9 " (" $5 ")"}'

# Suggest adding to git
echo -e "\n${YELLOW}To commit changes:${NC}"
echo "  git add docs/"
echo "  git commit -m 'docs: update documentation with Cline CLI'"
