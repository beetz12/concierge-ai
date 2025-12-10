# Bash Script Template Guide

This guide explains how to use the `SCRIPT_TEMPLATE.sh` to create production-ready bash scripts with 2025 best practices.

## Quick Start

1. Copy `SCRIPT_TEMPLATE.sh` to your new script name
2. Replace all `{{PLACEHOLDER}}` markers with your values
3. Make executable: `chmod +x your-script.sh`
4. Test thoroughly

## Placeholder Reference

### Header Placeholders

#### `{{SCRIPT_NAME}}`
**Example:** `Cline CLI Security Review Script`

The human-readable name of your script displayed in the header comments.

#### `{{SCRIPT_DESCRIPTION}}`
**Example:** `Uses Cline CLI with -f flag and YOLO mode (-y) for automated security scanning`

Brief description of what the script does and key features.

#### `{{SCRIPT_FILENAME}}`
**Example:** `security-review.sh`

The actual filename of the script.

#### `{{USAGE_ARGS}}`
**Example:** `[--staged|--commit|--full|--help]`

Command-line argument synopsis.

#### `{{ENV_VARS}}`
**Example:**
```
CLINE_TIMEOUT           Timeout in seconds (default: 60)
CLINE_MAX_DIFF_LINES    Max diff lines to analyze (default: 500)
CLINE_MAX_FILES         Max files to analyze (default: 10)
```

List of environment variables the script uses.

---

### Configuration Placeholders

#### `{{CONFIGURATION_VARS}}`
**Example:**
```bash
readonly CLINE_TIMEOUT="${CLINE_TIMEOUT:-60}"
readonly MAX_DIFF_LINES="${CLINE_MAX_DIFF_LINES:-500}"
readonly MAX_FILES="${CLINE_MAX_FILES:-10}"
readonly FILE_EXTENSIONS="ts|tsx|js|jsx"
readonly EXCLUDE_PATTERNS="node_modules|dist|\.next|build|\.test\.|\.spec\.|__tests__|__mocks__|\.d\.ts"
```

All configuration constants and environment variable defaults.

**Best practices:**
- Use `readonly` for constants
- Use `${VAR:-default}` pattern for environment variables with defaults
- Group related constants together
- Use descriptive names in ALL_CAPS

---

### Usage Text Placeholder

#### `{{USAGE_TEXT}}`
**Example:**
```
Usage: security-review.sh [--staged|--commit|--full|--help]

Modes:
  --staged  Review staged changes (default)
  --commit  Review last commit
  --full    Review last 5 commits (or all if < 5 commits)
  --help    Show this help message

Environment Variables:
  CLINE_TIMEOUT           Timeout in seconds (default: 60)
  CLINE_MAX_DIFF_LINES    Max diff lines to analyze (default: 500)
  CLINE_MAX_FILES         Max files to analyze (default: 10)

Examples:
  ./security-review.sh --staged
  CLINE_TIMEOUT=120 ./security-review.sh --full
  CLINE_MAX_FILES=20 ./security-review.sh --commit

Bypass:
  CLINE_YOLO=true git commit -m 'message'   # Skip security check
```

Full help text displayed with `--help` flag.

---

### Helper Functions Placeholder

#### `{{ADDITIONAL_HELPER_FUNCTIONS}}`
**Example:**
```bash
run_fallback_checks() {
    echo -e "${YELLOW}⚠️  Cline CLI not found. Install with: npm install -g @cline/cli${NC}"
    echo -e "${YELLOW}   Running basic pattern-based checks...${NC}"
    echo ""

    local issues=0
    local diff_content
    diff_content=$(git diff --cached 2>/dev/null || true)

    if [[ -z "$diff_content" ]]; then
        echo -e "${GREEN}✅ No staged changes to review${NC}"
        exit 0
    fi

    # ... additional logic
}
```

Any script-specific helper functions beyond the standard ones (create_temp_file, check_timeout_command, run_with_timeout).

**Leave empty if none needed.**

---

### Argument Parsing Placeholder

#### `{{ARGUMENT_PARSING}}`
**Example:**
```bash
# Parse arguments
MODE="${1:---staged}"

# Handle --help
if [[ "$MODE" == "--help" ]] || [[ "$MODE" == "-h" ]]; then
    show_usage
    exit 0
fi

# Validate mode early (before banner)
case "$MODE" in
    --staged|--commit|--full) ;;
    *)
        echo -e "${RED}ERROR: Unknown mode: $MODE${NC}" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
esac
```

Command-line argument parsing and validation logic.

**Best practices:**
- Handle `--help` early
- Validate arguments before showing banner
- Use clear error messages
- Exit with proper codes (0 for success, 1 for errors)

---

### Banner Placeholders

#### `{{BANNER_ICON}}`
**Example:** `🔒`

Emoji icon for the banner (2 characters wide typically).

#### `{{BANNER_TITLE}}`
**Example:** `Cline CLI Security Review`

Main title text (max ~40 chars to fit in box).

#### `{{BANNER_PADDING}}`
**Example:** `                             ` (spaces to reach 60 char total line width)

Padding spaces to align the right border. Calculate as: `60 - 4 (icon) - 2 (leading spaces) - length(BANNER_TITLE)`

#### `{{BANNER_SUBTITLE}}`
**Example:** `AI-Powered Security Scanning for AI Concierge`

Subtitle text (max ~52 chars).

#### `{{BANNER_SUBTITLE_PADDING}}`
**Example:** `           ` (spaces to reach 60 char total line width)

Padding spaces for subtitle. Calculate as: `60 - 2 (leading spaces) - length(BANNER_SUBTITLE)`

---

### Main Logic Placeholder

#### `{{MAIN_LOGIC}}`
**Example:**
```bash
# ══════════════════════════════════════════════════════════════════════════════
# GET CHANGED FILES (using array for proper handling)
# ══════════════════════════════════════════════════════════════════════════════
declare -a CHANGED_FILES_ARRAY=()

case "$MODE" in
    --staged)
        echo -e "${BLUE}📋 Mode: Reviewing staged changes${NC}"
        while IFS= read -r file; do
            [[ -n "$file" ]] && CHANGED_FILES_ARRAY+=("$file")
        done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | \
            grep -E "\.($FILE_EXTENSIONS)$" | \
            grep -v -E "$EXCLUDE_PATTERNS" || true)
        ;;
    # ... more cases
esac

# ... process files, run analysis, etc.
```

The core business logic of your script. This is the meat of what your script does.

**Best practices:**
- Use section headers with `═` dividers
- Use arrays for file lists (handles spaces correctly)
- Always use `|| true` with grep to prevent script exit on no matches
- Quote variables: `"$VAR"` not `$VAR`
- Check for empty results before proceeding

---

### Results Display Placeholder

#### `{{RESULTS_DISPLAY}}`
**Example:**
```bash
# ══════════════════════════════════════════════════════════════════════════════
# DISPLAY RESULTS
# ══════════════════════════════════════════════════════════════════════════════

# Display results
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$RESULTS_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# DETERMINE PASS/FAIL
# ══════════════════════════════════════════════════════════════════════════════
HAS_CRITICAL=$(grep -c "🔴 CRITICAL" "$RESULTS_FILE" 2>/dev/null || echo "0")
HAS_FAILED=$(grep -c "SECURITY_CHECK_FAILED" "$RESULTS_FILE" 2>/dev/null || echo "0")
HAS_PASSED=$(grep -c "SECURITY_CHECK_PASSED" "$RESULTS_FILE" 2>/dev/null || echo "0")

if [[ "$HAS_FAILED" -gt 0 ]] || [[ "$HAS_CRITICAL" -gt 0 ]]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ SECURITY CHECK FAILED - Critical issues found!         ║${NC}"
    echo -e "${RED}║  Please fix the issues above before committing.            ║${NC}"
    echo -e "${RED}║  Bypass: CLINE_YOLO=true git commit -m 'message'           ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
elif [[ "$HAS_PASSED" -gt 0 ]]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ SECURITY CHECK PASSED                                  ║${NC}"
    echo -e "${GREEN}║  No critical security issues detected.                     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    # FAIL-SAFE: If unclear, warn but allow
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠️  REVIEW INCONCLUSIVE                                   ║${NC}"
    echo -e "${YELLOW}║  Please review the output above manually.                 ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
```

Final output display and exit status determination.

**Best practices:**
- Use colored box borders for visual impact
- Provide clear success/failure indicators
- Include bypass instructions if applicable
- Use fail-safe logic (when in doubt, warn but don't block)

---

## Standard Components (Already Included)

The template includes these battle-tested components:

### 1. **Strict Mode**
```bash
set -euo pipefail
```
- `-e`: Exit on error
- `-u`: Error on undefined variables
- `-o pipefail`: Catch errors in pipes

### 2. **Color Constants**
```bash
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'
```

### 3. **Cleanup Function**
Handles:
- Spinner process termination (graceful then forced)
- Temporary file removal
- Prevents recursive cleanup
- Works with `set -u` (empty array handling)

### 4. **Spinner Functions**
- **start_spinner**: Non-blocking animation
- **stop_spinner**: Clean termination with line clearing
- Uses subshell with trap for reliable cleanup

### 5. **Helper Functions**

**create_temp_file()**
- Creates temp file with mktemp
- Adds to TEMP_FILES array for cleanup
- Returns file path

**check_timeout_command()**
- Detects GNU timeout vs basic vs none
- Handles macOS vs Linux differences

**run_with_timeout()**
- Cross-platform timeout wrapper
- Graceful degradation on macOS without coreutils
- Uses `-k` flag on GNU timeout for kill timeout

### 6. **Trap Setup**
```bash
trap cleanup EXIT INT TERM
```
Ensures cleanup runs on:
- Normal exit (EXIT)
- Ctrl+C (INT)
- Kill signal (TERM)

---

## Complete Example

Let's create a script that analyzes TypeScript types:

```bash
#!/bin/bash
#
# Cline CLI Type Coverage Analyzer (Production-Ready)
# Analyzes TypeScript code to identify missing type annotations using Cline AI
#
# 2025 Best Practices Applied:
# - Strict mode (set -euo pipefail)
# - Arrays for file lists (handles spaces/special chars)
# - Process group management for spinner
# - Proper signal handling (EXIT, INT, TERM)
# - GNU timeout check with fallback for macOS
# - Fail-safe error handling
#
# Usage: ./scripts/cline/type-coverage.sh [--apps|--packages|--all|--help]
#
# Environment Variables:
#   CLINE_TIMEOUT           Timeout in seconds (default: 90)
#   CLINE_MAX_FILES         Max files to analyze (default: 20)
#

# ══════════════════════════════════════════════════════════════════════════════
# STRICT MODE - Exit on error, undefined vars, pipe failures
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# COLORS
# ══════════════════════════════════════════════════════════════════════════════
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
readonly CLINE_TIMEOUT="${CLINE_TIMEOUT:-90}"
readonly MAX_FILES="${CLINE_MAX_FILES:-20}"
readonly FILE_EXTENSIONS="ts|tsx"
readonly EXCLUDE_PATTERNS="\.test\.|\.spec\.|\.d\.ts|__tests__|__mocks__"

# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL STATE (for cleanup)
# ══════════════════════════════════════════════════════════════════════════════
SPINNER_PID=""
TEMP_FILES=()
CLEANUP_DONE=false

# ══════════════════════════════════════════════════════════════════════════════
# USAGE
# ══════════════════════════════════════════════════════════════════════════════
show_usage() {
    cat << 'EOF'
Usage: type-coverage.sh [--apps|--packages|--all|--help]

Modes:
  --apps      Analyze apps/ directory only (default)
  --packages  Analyze packages/ directory only
  --all       Analyze entire codebase
  --help      Show this help message

Environment Variables:
  CLINE_TIMEOUT    Timeout in seconds (default: 90)
  CLINE_MAX_FILES  Max files to analyze (default: 20)

Examples:
  ./type-coverage.sh --apps
  CLINE_TIMEOUT=120 ./type-coverage.sh --all
  CLINE_MAX_FILES=50 ./type-coverage.sh --packages
EOF
}

# ══════════════════════════════════════════════════════════════════════════════
# CLEANUP FUNCTION
# ══════════════════════════════════════════════════════════════════════════════
cleanup() {
    # Prevent recursive cleanup
    if [[ "$CLEANUP_DONE" == "true" ]]; then
        return
    fi
    CLEANUP_DONE=true

    # Stop spinner if running
    if [[ -n "$SPINNER_PID" ]] && kill -0 "$SPINNER_PID" 2>/dev/null; then
        # Try graceful kill first
        kill "$SPINNER_PID" 2>/dev/null || true
        # Wait briefly
        local count=0
        while kill -0 "$SPINNER_PID" 2>/dev/null && [[ $count -lt 5 ]]; do
            sleep 0.1
            count=$((count + 1))
        done
        # Force kill if still running
        if kill -0 "$SPINNER_PID" 2>/dev/null; then
            kill -9 "$SPINNER_PID" 2>/dev/null || true
        fi
        # Clear spinner line
        printf "\r\033[K" >&2
    fi
    SPINNER_PID=""

    # Remove temp files (handle empty array with set -u)
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

    # Start spinner in subshell with trap for clean exit
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
        # Check if it supports -k flag (GNU timeout)
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
            # macOS without coreutils - run without timeout
            echo -e "${YELLOW}⚠️  GNU timeout not found (install: brew install coreutils)${NC}" >&2
            "$@"
            ;;
    esac
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ══════════════════════════════════════════════════════════════════════════════

# Set trap for cleanup (BEFORE any temp files are created)
trap cleanup EXIT INT TERM

# Parse arguments
MODE="${1:---apps}"

# Handle --help
if [[ "$MODE" == "--help" ]] || [[ "$MODE" == "-h" ]]; then
    show_usage
    exit 0
fi

# Validate mode early (before banner)
case "$MODE" in
    --apps|--packages|--all) ;;
    *)
        echo -e "${RED}ERROR: Unknown mode: $MODE${NC}" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
esac

# Change to project root
cd "$PROJECT_ROOT"

# Display banner
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  📊 TypeScript Type Coverage Analyzer                      ║${NC}"
echo -e "${CYAN}║  AI-Powered Type Safety Analysis                           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Determine search path based on mode
SEARCH_PATH=""
case "$MODE" in
    --apps)
        SEARCH_PATH="apps/"
        echo -e "${BLUE}📂 Analyzing: apps/ directory${NC}"
        ;;
    --packages)
        SEARCH_PATH="packages/"
        echo -e "${BLUE}📂 Analyzing: packages/ directory${NC}"
        ;;
    --all)
        SEARCH_PATH="."
        echo -e "${BLUE}📂 Analyzing: entire codebase${NC}"
        ;;
esac

# Find TypeScript files
declare -a TS_FILES=()
while IFS= read -r file; do
    [[ -n "$file" ]] && TS_FILES+=("$file")
done < <(find "$SEARCH_PATH" -type f \( -name "*.ts" -o -name "*.tsx" \) | \
    grep -v -E "$EXCLUDE_PATTERNS" | \
    head -n "$MAX_FILES" || true)

if [[ ${#TS_FILES[@]} -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  No TypeScript files found${NC}"
    exit 0
fi

FILE_COUNT=${#TS_FILES[@]}
echo -e "${BLUE}📁 Found $FILE_COUNT TypeScript file(s)${NC}"
echo ""

# Create results file
RESULTS_FILE=$(create_temp_file)

# Start spinner and run analysis
start_spinner "Running type coverage analysis (timeout: ${CLINE_TIMEOUT}s)..."

PROMPT="Analyze these TypeScript files for type coverage.
Report:
1. Functions/methods missing return types
2. Variables missing explicit types (where not obvious)
3. Any usage

 parameters
4. Use of 'unknown' instead of proper types

OUTPUT format:
## Type Coverage Report
### Missing Return Types: [count or None]
### Missing Variable Types: [count or None]
### Any Usage: [count or None]
### Summary: [Overall/Good/Needs Work]"

CLINE_EXIT=0
run_with_timeout "$CLINE_TIMEOUT" cline -y -m act "$(printf '%s\n' "${TS_FILES[@]}")" "$PROMPT" > "$RESULTS_FILE" 2>&1 || CLINE_EXIT=$?

stop_spinner

# Handle exit codes
if [[ $CLINE_EXIT -eq 124 ]] || [[ $CLINE_EXIT -eq 137 ]]; then
    echo -e "${YELLOW}⚠️  Analysis timed out after ${CLINE_TIMEOUT}s${NC}"
    exit 0
elif [[ $CLINE_EXIT -ne 0 ]]; then
    echo -e "${YELLOW}⚠️  Cline exited with code $CLINE_EXIT${NC}"
    exit 0
fi

# Display results
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
cat "$RESULTS_FILE"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ TYPE COVERAGE ANALYSIS COMPLETE                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
```

---

## Best Practices Summary

### ✅ DO:
- Use `set -euo pipefail` at the top
- Always quote variables: `"$VAR"`
- Use arrays for file lists
- Check command exit codes
- Use `|| true` with grep/commands that may not match
- Provide help text with `--help`
- Use color constants for consistent output
- Clean up temp files
- Handle empty arrays with `set -u`
- Use `readonly` for constants
- Provide environment variable defaults
- Show clear error messages

### ❌ DON'T:
- Use unquoted variables with spaces
- Forget to clean up temp files/processes
- Block on tool failures (fail-safe approach)
- Use bare `echo` without `-e` for colors
- Forget to handle Ctrl+C interruption
- Use hardcoded paths (use `$SCRIPT_DIR`, `$PROJECT_ROOT`)
- Exit with `set -e` on expected failures (use `|| true`)
- Assume GNU tools on macOS

---

## Testing Checklist

Before deploying your script:

- [ ] Test with `--help` flag
- [ ] Test with invalid arguments
- [ ] Test with Ctrl+C interruption
- [ ] Test with missing dependencies
- [ ] Test with empty input
- [ ] Test with maximum input
- [ ] Test on macOS and Linux
- [ ] Test with and without GNU coreutils
- [ ] Test timeout scenarios
- [ ] Verify temp files are cleaned up
- [ ] Verify spinner stops cleanly
- [ ] Check exit codes (0 for success, 1 for errors)

---

## Common Patterns

### Pattern 1: Processing Git Changes
```bash
declare -a CHANGED_FILES=()
while IFS= read -r file; do
    [[ -n "$file" ]] && CHANGED_FILES+=("$file")
done < <(git diff --cached --name-only 2>/dev/null | \
    grep -E "\.($FILE_EXTENSIONS)$" | \
    grep -v -E "$EXCLUDE_PATTERNS" || true)
```

### Pattern 2: Running External Command with Timeout
```bash
RESULTS_FILE=$(create_temp_file)
start_spinner "Processing..."
TOOL_EXIT=0
run_with_timeout "$TIMEOUT" some-command arg1 arg2 > "$RESULTS_FILE" 2>&1 || TOOL_EXIT=$?
stop_spinner

if [[ $TOOL_EXIT -eq 124 ]]; then
    echo "Timed out"
elif [[ $TOOL_EXIT -ne 0 ]]; then
    echo "Failed with code $TOOL_EXIT"
fi
```

### Pattern 3: Conditional Exit Based on Results
```bash
CRITICAL_COUNT=$(grep -c "CRITICAL" "$RESULTS_FILE" 2>/dev/null || echo "0")
if [[ "$CRITICAL_COUNT" -gt 0 ]]; then
    echo -e "${RED}Found $CRITICAL_COUNT critical issues${NC}"
    exit 1
else
    echo -e "${GREEN}All checks passed${NC}"
    exit 0
fi
```

---

## Quick Reference Card

```bash
# Standard boilerplate
set -euo pipefail
trap cleanup EXIT INT TERM
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# File array from find/git
declare -a FILES=()
while IFS= read -r file; do
    [[ -n "$file" ]] && FILES+=("$file")
done < <(find . -name "*.ts" || true)

# Temp file
TEMP=$(create_temp_file)

# Spinner
start_spinner "Message..."
# ... long operation
stop_spinner

# Timeout wrapper
run_with_timeout 60 some-command

# Color output
echo -e "${GREEN}Success${NC}"
echo -e "${RED}Error${NC}"
echo -e "${YELLOW}Warning${NC}"
```

---

## Support

For questions or issues with the template:
1. Check this guide thoroughly
2. Review `security-review.sh` as the reference implementation
3. Test incrementally as you build your script

Happy scripting! 🚀
