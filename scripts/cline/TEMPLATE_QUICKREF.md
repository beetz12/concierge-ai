# Bash Script Template - Quick Reference

## Placeholder Cheat Sheet

| Placeholder | Example | Description |
|------------|---------|-------------|
| `{{SCRIPT_NAME}}` | `Cline CLI Security Review Script` | Human-readable script name |
| `{{SCRIPT_DESCRIPTION}}` | `Uses Cline CLI for security scanning` | Brief description |
| `{{SCRIPT_FILENAME}}` | `security-review.sh` | Actual filename |
| `{{USAGE_ARGS}}` | `[--staged\|--commit\|--help]` | Argument synopsis |
| `{{ENV_VARS}}` | `TIMEOUT  Timeout in seconds` | Environment variables list |
| `{{CONFIGURATION_VARS}}` | `readonly TIMEOUT="${TIMEOUT:-60}"` | Config constants |
| `{{USAGE_TEXT}}` | Full help text | Displayed with --help |
| `{{ADDITIONAL_HELPER_FUNCTIONS}}` | Custom functions | Script-specific helpers |
| `{{ARGUMENT_PARSING}}` | Arg parsing logic | Parse/validate args |
| `{{BANNER_ICON}}` | `🔒` | Banner emoji (2 char) |
| `{{BANNER_TITLE}}` | `Security Review` | Banner title (~40 char) |
| `{{BANNER_PADDING}}` | Spaces | Padding to 60 chars |
| `{{BANNER_SUBTITLE}}` | `AI-Powered Scanner` | Subtitle (~52 char) |
| `{{BANNER_SUBTITLE_PADDING}}` | Spaces | Padding to 60 chars |
| `{{MAIN_LOGIC}}` | Core script logic | Main functionality |
| `{{RESULTS_DISPLAY}}` | Results formatting | Output and exit logic |

## Banner Padding Calculator

```bash
# Title line: 60 total chars
# Format: "║  ICON TITLE" + padding + "║"
PADDING_LENGTH = 60 - 4 (icon+space) - 2 (║+spaces) - length(TITLE)

# Subtitle line: 60 total chars  
# Format: "║  SUBTITLE" + padding + "║"
PADDING_LENGTH = 60 - 2 (║+spaces) - length(SUBTITLE)
```

## Essential Code Snippets

### File Array from Git
```bash
declare -a FILES=()
while IFS= read -r file; do
    [[ -n "$file" ]] && FILES+=("$file")
done < <(git diff --cached --name-only 2>/dev/null | \
    grep -E "\.ts$" || true)
```

### File Array from Find
```bash
declare -a FILES=()
while IFS= read -r file; do
    [[ -n "$file" ]] && FILES+=("$file")
done < <(find apps/ -name "*.ts" 2>/dev/null || true)
```

### Run Command with Timeout
```bash
RESULTS=$(create_temp_file)
start_spinner "Processing..."
EXIT_CODE=0
run_with_timeout 60 command --args > "$RESULTS" 2>&1 || EXIT_CODE=$?
stop_spinner

case $EXIT_CODE in
    0)   echo "Success" ;;
    124) echo "Timeout" ;;
    *)   echo "Failed: $EXIT_CODE" ;;
esac
```

### Argument Parsing Pattern
```bash
MODE="${1:---default}"

if [[ "$MODE" == "--help" ]] || [[ "$MODE" == "-h" ]]; then
    show_usage
    exit 0
fi

case "$MODE" in
    --option1|--option2|--option3) ;;
    *)
        echo -e "${RED}ERROR: Unknown mode: $MODE${NC}" >&2
        exit 1
        ;;
esac
```

### Results Box (Success)
```bash
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ SUCCESS MESSAGE                                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
exit 0
```

### Results Box (Failure)
```bash
echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  ❌ FAILURE MESSAGE                                        ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
exit 1
```

### Results Box (Warning)
```bash
echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  ⚠️  WARNING MESSAGE                                       ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
exit 0
```

## Common File Extensions Patterns

```bash
# TypeScript/JavaScript
FILE_EXTENSIONS="ts|tsx|js|jsx"

# All web
FILE_EXTENSIONS="ts|tsx|js|jsx|css|scss|html"

# Config files
FILE_EXTENSIONS="json|yaml|yml|toml"

# Documentation
FILE_EXTENSIONS="md|mdx|txt"
```

## Common Exclude Patterns

```bash
# Build artifacts
EXCLUDE="node_modules|dist|\.next|build|out"

# Tests
EXCLUDE="\.test\.|\.spec\.|__tests__|__mocks__"

# Type definitions
EXCLUDE="\.d\.ts"

# Git/IDE
EXCLUDE="\.git|\.vscode|\.idea"

# Combined
EXCLUDE="node_modules|dist|\.next|build|\.test\.|\.spec\.|__tests__|\.d\.ts"
```

## Standard Exit Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| `0` | Success | Operation completed successfully |
| `1` | General error | Validation failed, critical issues found |
| `124` | Timeout (GNU) | Command exceeded time limit |
| `137` | Killed (SIGKILL) | Process was force-killed |

## Color Usage Guidelines

| Color | When to Use | Example |
|-------|-------------|---------|
| `${GREEN}` | Success, passing checks | "✅ All checks passed" |
| `${RED}` | Errors, critical issues | "❌ Critical security issue" |
| `${YELLOW}` | Warnings, non-critical | "⚠️  Missing type annotation" |
| `${BLUE}` | Informational messages | "📋 Analyzing 5 files..." |
| `${CYAN}` | Headers, banners | Banner borders |
| `${NC}` | Reset color | Always end colored strings |

## Emoji Guide

| Emoji | Usage | Example |
|-------|-------|---------|
| 🔒 | Security | Security review scripts |
| 📊 | Analysis/Reports | Type coverage, metrics |
| 🚀 | Deployment/Build | Build/deploy scripts |
| 🧪 | Testing | Test runners |
| 📝 | Documentation | Doc generators |
| 🔍 | Search/Find | Code search tools |
| ⚡ | Performance | Performance optimization |
| 🔧 | Tools/Utils | General utilities |
| 📦 | Packages | Package management |
| 🌲 | Git/VCS | Git utilities |

## Template Workflow

1. **Copy template**
   ```bash
   cp SCRIPT_TEMPLATE.sh my-script.sh
   chmod +x my-script.sh
   ```

2. **Replace header placeholders**
   - {{SCRIPT_NAME}}
   - {{SCRIPT_DESCRIPTION}}
   - {{USAGE_ARGS}}
   - {{ENV_VARS}}

3. **Configure constants**
   - {{CONFIGURATION_VARS}}

4. **Write usage text**
   - {{USAGE_TEXT}}

5. **Add custom helpers** (if needed)
   - {{ADDITIONAL_HELPER_FUNCTIONS}}

6. **Implement argument parsing**
   - {{ARGUMENT_PARSING}}

7. **Design banner**
   - {{BANNER_ICON}}
   - {{BANNER_TITLE}} + {{BANNER_PADDING}}
   - {{BANNER_SUBTITLE}} + {{BANNER_SUBTITLE_PADDING}}

8. **Write main logic**
   - {{MAIN_LOGIC}}

9. **Format results**
   - {{RESULTS_DISPLAY}}

10. **Test thoroughly**
    - Help flag
    - Invalid args
    - Ctrl+C
    - Empty input
    - Max input

## Common Gotchas

### ❌ Wrong
```bash
# Unquoted variable with spaces
for file in $FILES; do

# Exit on grep no match
grep "pattern" file.txt

# Bare variable
cd $PROJECT_ROOT
```

### ✅ Right
```bash
# Array iteration
for file in "${FILES[@]}"; do

# Prevent exit
grep "pattern" file.txt || true

# Quoted variable
cd "$PROJECT_ROOT"
```

## Testing Commands

```bash
# Help works
./script.sh --help

# Invalid arg fails gracefully
./script.sh --invalid

# Ctrl+C cleanup
./script.sh  # then Ctrl+C

# Environment override
TIMEOUT=30 ./script.sh

# Verify cleanup
./script.sh && ls /tmp/tmp.* | wc -l  # Should be 0
```

## Quick Start Example

```bash
# 1. Copy template
cp SCRIPT_TEMPLATE.sh lint-check.sh

# 2. Edit with your values
# Replace all {{PLACEHOLDERS}}

# 3. Make executable
chmod +x lint-check.sh

# 4. Test
./lint-check.sh --help
./lint-check.sh

# 5. Commit
git add lint-check.sh
git commit -m "Add lint-check script"
```
