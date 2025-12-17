# Cline CLI Quick Reference

## Installation

```bash
# One-time setup
./scripts/setup-husky.sh

# Install Cline CLI globally
npm install -g @cline/cli

# Set API key
export CLINE_API_KEY="your-key-here"
```

## Daily Usage

### Committing Code

```bash
# Normal commit (with Cline review)
git add .
git commit -m "feat: add new feature"

# Quick commit (YOLO mode)
CLINE_YOLO_MODE=true git commit -m "feat: quick prototype"

# Skip Cline completely
CLINE_ENABLED=false git commit -m "feat: emergency fix"

# Skip via commit message
git commit -m "feat: hotfix [skip-cline]"
```

### Pushing Code

```bash
# Normal push (comprehensive checks)
git push

# Skip checks (not recommended)
git push --no-verify
```

### Manual Reviews

```bash
# Review staged files
./scripts/cline/review.sh --staged

# Review all changes
./scripts/cline/review.sh --all

# Review specific files
./scripts/cline/review.sh --files src/file1.ts src/file2.ts
```

### Generate Tests

```bash
# Auto-generate tests for changed files
./scripts/cline/generate-tests.sh

# Generate tests for specific files
./scripts/cline/generate-tests.sh --files src/service.ts
```

### Update Documentation

```bash
# Update all documentation
./scripts/cline/update-docs.sh --all

# Update API docs only
./scripts/cline/update-docs.sh --api

# Update web docs only
./scripts/cline/update-docs.sh --web
```

### Security Scanning

```bash
# Quick scan
./scripts/cline/security-scan.sh --quick

# Full scan
./scripts/cline/security-scan.sh --full
```

### Refactoring Analysis

```bash
# Analyze entire project
./scripts/cline/refactor-analysis.sh

# Analyze specific path
./scripts/cline/refactor-analysis.sh --path apps/api
```

## Environment Variables

```bash
# Enable/disable Cline
export CLINE_ENABLED=true          # or false

# YOLO mode (bypass blocking)
export CLINE_YOLO_MODE=false       # or true

# Performance tuning
export CLINE_MAX_FILES=10          # Max files per review
export CLINE_TIMEOUT=60            # Timeout in seconds

# API configuration
export CLINE_API_KEY="your-key"    # Required
```

## Common Workflows

### Feature Development

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Make changes
# ... code changes ...

# 3. Review changes
./scripts/cline/review.sh --all

# 4. Generate tests
./scripts/cline/generate-tests.sh

# 5. Commit (triggers pre-commit hook)
git add .
git commit -m "feat: add new feature"

# 6. Push (triggers pre-push hook)
git push origin feature/new-feature

# 7. Create PR (triggers GitHub Actions)
gh pr create --title "feat: add new feature" --body "Description"
```

### Bug Fix

```bash
# 1. Create bugfix branch
git checkout -b fix/bug-description

# 2. Make fix
# ... code changes ...

# 3. Quick review
./scripts/cline/review.sh --staged

# 4. Commit and push
git add .
git commit -m "fix: resolve bug description"
git push origin fix/bug-description

# 5. Create PR
gh pr create --title "fix: resolve bug" --body "Fixes #123"
```

### Hotfix (Emergency)

```bash
# 1. Create hotfix branch
git checkout -b hotfix/critical-issue

# 2. Make fix
# ... code changes ...

# 3. Skip Cline for speed
git add .
git commit -m "fix: critical issue [skip-cline]"
git push --no-verify

# 4. Create PR with urgent label
gh pr create --title "fix: critical issue" --label urgent
```

### Documentation Update

```bash
# 1. Update code
# ... code changes ...

# 2. Auto-generate docs
./scripts/cline/update-docs.sh --all

# 3. Review and commit
git add .
git commit -m "docs: update documentation"
git push
```

## GitHub Actions

### Workflow Status

```bash
# View workflow runs
gh run list

# View specific run
gh run view <run-id>

# Rerun failed workflow
gh run rerun <run-id>
```

### PR Checks

When you create a PR, these checks run automatically:

1. **Cline Code Review** (2-3 min)
   - Reviews all changed files
   - Posts findings as PR comment
   - Blocks merge on critical issues

2. **Generate Tests** (3-5 min)
   - Auto-generates missing tests
   - Commits tests to PR branch

3. **Update Documentation** (2-3 min)
   - Updates API docs
   - Updates architecture docs
   - Commits to PR branch

4. **Security Scan** (2-3 min)
   - Scans for vulnerabilities
   - Posts security report
   - Blocks merge on critical findings

**Total time**: 9-14 minutes

## Troubleshooting

### Hooks not running

```bash
# Reinstall hooks
pnpm run prepare

# Check hook permissions
ls -la .husky/

# Verify hook content
cat .husky/pre-commit
```

### Cline CLI not found

```bash
# Install globally
npm install -g @cline/cli

# Verify installation
which cline
cline --version
```

### Slow performance

```bash
# Reduce max files
export CLINE_MAX_FILES=5

# Reduce timeout
export CLINE_TIMEOUT=30

# Use YOLO mode
export CLINE_YOLO_MODE=true
```

### Too many false positives

```bash
# Add project context to review script
# Edit: scripts/cline/review.sh
# Update --context and --rules flags

# Temporarily disable
export CLINE_ENABLED=false
```

### GitHub Actions failing

```bash
# Check secrets
gh secret list

# Add missing secret
gh secret set CLINE_API_KEY

# View workflow logs
gh run view --log
```

### Pre-commit hook blocking

```bash
# Bypass for one commit
git commit -m "feat: quick fix [skip-cline]"

# Bypass with flag
git commit --no-verify -m "feat: emergency"

# Enable YOLO mode
CLINE_YOLO_MODE=true git commit -m "feat: prototype"
```

## Configuration Files

### Main Files

```
.husky/
├── pre-commit              # Fast review on commit
├── pre-push               # Comprehensive check before push
└── commit-msg             # Validate commit message format

scripts/cline/
├── review.sh              # Code review
├── generate-tests.sh      # Test generation
├── update-docs.sh         # Documentation
├── security-scan.sh       # Security analysis
└── refactor-analysis.sh   # Refactoring suggestions

.github/workflows/
├── cline-pr.yml           # PR automation
└── cline-security.yml     # Security scanning
```

### Environment Files

```
.env.local              # Local environment variables
.envrc                  # direnv configuration (optional)
.env.example            # Example configuration
```

## Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Testing
- `chore`: Maintenance
- `ci`: CI/CD changes
- `perf`: Performance
- `build`: Build system

### Examples

```bash
# Feature
git commit -m "feat(api): add provider search endpoint"

# Bug fix
git commit -m "fix(web): resolve navigation issue on mobile"

# Documentation
git commit -m "docs: update API reference with new endpoints"

# Refactoring
git commit -m "refactor(api): extract validation logic to service"

# Testing
git commit -m "test(web): add unit tests for authentication"

# Multiple lines
git commit -m "feat(api): add rate limiting

Implement rate limiting for API endpoints using fastify-rate-limit.
Limits are set per endpoint based on sensitivity.

Closes #123"
```

## GitHub Secrets Setup

```bash
# Required secrets
gh secret set CLINE_API_KEY --body "your-key"

# Deployment secrets (if using auto-deploy)
gh secret set VERCEL_TOKEN --body "your-vercel-token"
gh secret set VERCEL_ORG_ID --body "your-org-id"
gh secret set VERCEL_PROJECT_ID --body "your-project-id"
gh secret set RAILWAY_TOKEN --body "your-railway-token"

# Verify
gh secret list
```

## Performance Tips

### Optimize Review Speed

```bash
# Review only TypeScript files
export CLINE_FILE_PATTERN="**/*.{ts,tsx}"

# Limit files per review
export CLINE_MAX_FILES=5

# Reduce timeout
export CLINE_TIMEOUT=30
```

### Cache Configuration

GitHub Actions caches:

- Node modules (pnpm)
- Cline CLI installation
- Build artifacts

Cache invalidation: Changes to `pnpm-lock.yaml`

### Parallel Execution

Pre-push hook runs in sequence:

1. Type check
2. Lint
3. Security scan
4. Cline review

To parallelize (advanced):

```bash
# Edit .husky/pre-push
(pnpm check-types &)
(pnpm lint &)
(./scripts/cline/security-scan.sh --quick &)
wait
```

## Integration with IDEs

### VS Code

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Cline Review",
      "type": "shell",
      "command": "./scripts/cline/review.sh --all",
      "group": "test"
    },
    {
      "label": "Generate Tests",
      "type": "shell",
      "command": "./scripts/cline/generate-tests.sh",
      "group": "test"
    }
  ]
}
```

### Command Palette

Press `Cmd+Shift+P` → "Tasks: Run Task" → Select Cline task

## Cost Monitoring

```bash
# Check API usage (if Cline provides CLI)
cline usage --month current

# Estimate monthly cost
# Reviews per week: 100
# Cost per review: $0.02
# Monthly cost: 100 × 4 × $0.02 = $8
```

## Support

- Documentation: `/CLINE_CICD_ARCHITECTURE.md`
- Implementation: `/CLINE_IMPLEMENTATION_PLAN.md`
- Developer Guide: `/CLINE_DEVELOPER_GUIDE.md`
- Scripts: `/scripts/cline/`

## Cheat Sheet

```bash
# Quick setup
./scripts/setup-husky.sh && export CLINE_API_KEY="key"

# Quick commit (YOLO)
CLINE_YOLO_MODE=true git commit -m "feat: quick change"

# Skip Cline
git commit -m "feat: change [skip-cline]"

# Manual review
./scripts/cline/review.sh --staged

# Generate tests
./scripts/cline/generate-tests.sh

# Update docs
./scripts/cline/update-docs.sh --all

# Security scan
./scripts/cline/security-scan.sh --quick

# Disable for session
export CLINE_ENABLED=false
```
