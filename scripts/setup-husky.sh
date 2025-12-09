#!/bin/bash
#
# Setup Husky Git Hooks for Cline Integration
# Usage: ./scripts/setup-husky.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}🔧 Setting up Husky for Cline integration...${NC}"

cd "$PROJECT_ROOT"

# Install Husky
echo -e "\n${BLUE}📦 Installing Husky...${NC}"
pnpm add -D -w husky

# Initialize Husky
echo -e "\n${BLUE}🔧 Initializing Husky...${NC}"
pnpm exec husky init

# Create hooks directory
mkdir -p .husky

# Create pre-commit hook
echo -e "\n${BLUE}📝 Creating pre-commit hook...${NC}"
cat > .husky/pre-commit << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Check if CLINE_ENABLED is set
CLINE_ENABLED="${CLINE_ENABLED:-true}"

if [ "$CLINE_ENABLED" != "true" ]; then
    echo "⚠ Cline is disabled (CLINE_ENABLED=false)"
    exit 0
fi

# Run Cline review on staged files
echo "🤖 Running Cline review on staged files..."

if [ -f "./scripts/cline/review.sh" ]; then
    ./scripts/cline/review.sh --staged
else
    echo "⚠ Cline review script not found, skipping..."
    exit 0
fi
EOF

chmod +x .husky/pre-commit

# Create pre-push hook
echo -e "\n${BLUE}📝 Creating pre-push hook...${NC}"
cat > .husky/pre-push << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Check if CLINE_ENABLED is set
CLINE_ENABLED="${CLINE_ENABLED:-true}"

if [ "$CLINE_ENABLED" != "true" ]; then
    echo "⚠ Cline is disabled (CLINE_ENABLED=false)"
    exit 0
fi

# Run more thorough analysis before push
echo "🤖 Running comprehensive Cline analysis..."

# Type check
echo "📝 Type checking..."
pnpm check-types

# Lint
echo "🔍 Linting..."
pnpm lint

# Security scan
if [ -f "./scripts/cline/security-scan.sh" ]; then
    echo "🔒 Running security scan..."
    ./scripts/cline/security-scan.sh --quick
fi

# Review all changed files
if [ -f "./scripts/cline/review.sh" ]; then
    echo "🤖 Running Cline review on all changes..."
    ./scripts/cline/review.sh --all
fi
EOF

chmod +x .husky/pre-push

# Create commit-msg hook
echo -e "\n${BLUE}📝 Creating commit-msg hook...${NC}"
cat > .husky/commit-msg << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Validate commit message format
# Format: type(scope): message
# Types: feat, fix, docs, style, refactor, test, chore

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Allow merge commits and revert commits
if echo "$COMMIT_MSG" | grep -qE "^(Merge|Revert)"; then
    exit 0
fi

# Allow skip patterns
if echo "$COMMIT_MSG" | grep -qE "\[skip-validation\]|\[skip-cline\]"; then
    exit 0
fi

# Validate format
if ! echo "$COMMIT_MSG" | grep -qE "^(feat|fix|docs|style|refactor|test|chore|ci|perf|build)(\(.+\))?: .{1,}"; then
    echo "❌ Invalid commit message format"
    echo ""
    echo "Format: type(scope): message"
    echo ""
    echo "Types:"
    echo "  feat:     New feature"
    echo "  fix:      Bug fix"
    echo "  docs:     Documentation"
    echo "  style:    Formatting"
    echo "  refactor: Code restructuring"
    echo "  test:     Testing"
    echo "  chore:    Maintenance"
    echo "  ci:       CI/CD"
    echo "  perf:     Performance"
    echo "  build:    Build system"
    echo ""
    echo "Examples:"
    echo "  feat(api): add provider search endpoint"
    echo "  fix(web): resolve navigation issue"
    echo "  docs: update API documentation"
    echo ""
    echo "Add [skip-validation] to bypass this check"
    exit 1
fi

exit 0
EOF

chmod +x .husky/commit-msg

# Update package.json with prepare script
echo -e "\n${BLUE}📝 Updating package.json...${NC}"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.prepare = 'husky';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Create .env.example with Cline variables
echo -e "\n${BLUE}📝 Creating .env.example...${NC}"
cat >> .env.example << 'EOF'

# Cline CLI Configuration
CLINE_API_KEY=your_cline_api_key_here
CLINE_ENABLED=true
CLINE_YOLO_MODE=false
CLINE_MAX_FILES=10
CLINE_TIMEOUT=60
EOF

# Create .envrc for direnv users (optional)
echo -e "\n${BLUE}📝 Creating .envrc (optional)...${NC}"
cat > .envrc << 'EOF'
# Cline CLI defaults
export CLINE_ENABLED=true
export CLINE_YOLO_MODE=false
export CLINE_MAX_FILES=10
export CLINE_TIMEOUT=60

# Load local overrides if present
if [ -f .env.local ]; then
    source .env.local
fi
EOF

# Create developer guide
echo -e "\n${BLUE}📝 Creating developer guide...${NC}"
cat > CLINE_DEVELOPER_GUIDE.md << 'EOF'
# Cline Integration Developer Guide

## Overview

This project uses Cline CLI for automated code review, test generation, and documentation.

## Installation

Husky hooks are automatically installed when you run:

```bash
pnpm install
```

## Git Hooks

### Pre-commit Hook
- Runs fast Cline review on staged files
- Takes 5-10 seconds
- Non-blocking in YOLO mode

### Pre-push Hook
- Comprehensive analysis before pushing
- Type checking, linting, security scan
- Takes 30-60 seconds
- More thorough validation

### Commit-msg Hook
- Validates commit message format
- Enforces conventional commits

## YOLO Mode

When you need to commit quickly (during rapid prototyping):

```bash
# Temporary bypass
CLINE_YOLO_MODE=true git commit -m "feat: quick prototype"

# Or disable for session
export CLINE_YOLO_MODE=true
git commit -m "feat: quick changes"
```

## Disabling Cline

```bash
# Disable temporarily
CLINE_ENABLED=false git commit -m "feat: without cline"

# Disable for session
export CLINE_ENABLED=false
```

## Skip Validation

Add to commit message:

```bash
git commit -m "feat: emergency fix [skip-cline]"
```

## Manual Commands

Run Cline manually:

```bash
# Review specific files
./scripts/cline/review.sh --files src/file1.ts src/file2.ts

# Generate tests
./scripts/cline/generate-tests.sh

# Update documentation
./scripts/cline/update-docs.sh --all

# Security scan
./scripts/cline/security-scan.sh --full

# Refactoring analysis
./scripts/cline/refactor-analysis.sh
```

## Environment Variables

Create `.env.local`:

```bash
CLINE_API_KEY=your_key_here
CLINE_ENABLED=true
CLINE_YOLO_MODE=false
CLINE_MAX_FILES=10
CLINE_TIMEOUT=60
```

## Troubleshooting

### Hooks not running
```bash
# Reinstall hooks
pnpm run prepare
```

### Cline CLI not found
```bash
npm install -g @cline/cli
```

### Slow hooks
```bash
# Reduce max files
export CLINE_MAX_FILES=5

# Use YOLO mode
export CLINE_YOLO_MODE=true
```

## CI/CD Integration

GitHub Actions automatically:
- Reviews PRs
- Generates tests
- Updates docs
- Runs security scans
- Blocks merges on critical issues

See `.github/workflows/cline-pr.yml`

## Best Practices

1. **Commit often**: Small commits are faster to review
2. **Use YOLO mode wisely**: Don't skip for production code
3. **Review Cline suggestions**: Treat as helpful teammate
4. **Keep scripts updated**: Pull latest from main
5. **Report issues**: File issues if Cline gives false positives

## Support

- Documentation: `/docs/CLINE_CICD_ARCHITECTURE.md`
- Scripts: `/scripts/cline/`
- Workflows: `/.github/workflows/`
EOF

echo -e "\n${GREEN}✓ Husky setup complete!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo "  1. Set CLINE_API_KEY in your environment"
echo "  2. Run: source .envrc (if using direnv)"
echo "  3. Test: git commit (will trigger pre-commit hook)"
echo "  4. Read: CLINE_DEVELOPER_GUIDE.md"
echo ""
echo -e "${YELLOW}To disable Cline:${NC}"
echo "  export CLINE_ENABLED=false"
echo ""
echo -e "${YELLOW}For YOLO mode (quick commits):${NC}"
echo "  export CLINE_YOLO_MODE=true"
