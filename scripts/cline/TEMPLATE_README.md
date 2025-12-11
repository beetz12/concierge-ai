# Bash Script Template System

A production-ready bash script template system extracted from the `security-review.sh` script, following 2025 best practices.

## 📁 Files in This System

| File | Purpose | Use When |
|------|---------|----------|
| **SCRIPT_TEMPLATE.sh** | Base template with placeholders | Creating a new script |
| **TEMPLATE_GUIDE.md** | Comprehensive guide with examples | Learning how to use the template |
| **TEMPLATE_QUICKREF.md** | Quick reference card | Quick lookup while coding |
| **banner-helper.sh** | Banner padding calculator | Designing banner text |

## 🚀 Quick Start (30 seconds)

```bash
# 1. Copy the template
cd /Users/dave/Work/concierge-ai/scripts/cline
cp SCRIPT_TEMPLATE.sh my-new-script.sh

# 2. Edit and replace ALL {{PLACEHOLDERS}}
# Use your editor's find/replace:
#   {{SCRIPT_NAME}} → "My Script Name"
#   {{SCRIPT_DESCRIPTION}} → "What it does"
#   ... (see TEMPLATE_QUICKREF.md for full list)

# 3. Make executable
chmod +x my-new-script.sh

# 4. Test
./my-new-script.sh --help
```

## 📖 Documentation

### For First-Time Users
Start with **TEMPLATE_GUIDE.md** - it contains:
- Detailed explanation of every placeholder
- Complete working example
- Best practices and common patterns
- Testing checklist

### For Experienced Users
Use **TEMPLATE_QUICKREF.md** for:
- Placeholder cheat sheet
- Code snippets ready to copy
- Common patterns
- Banner padding formulas

### Banner Design
Use **banner-helper.sh** to:
```bash
./banner-helper.sh "Your Title" "Your Subtitle" "🚀"
# Outputs padding calculations and preview
```

## 🎯 What You Get

Every script built from this template includes:

### ✅ Safety & Reliability
- Strict mode (`set -euo pipefail`)
- Proper cleanup on exit/interrupt/kill
- Signal handling (EXIT, INT, TERM)
- Array-based file handling (handles spaces)
- Cross-platform timeout support

### ✅ User Experience
- Professional colored output
- Animated spinner for long operations
- Clear help text
- Informative error messages
- Pretty result boxes

### ✅ Developer Experience
- Well-organized sections
- Consistent structure
- Reusable helper functions
- Comprehensive error handling
- Easy to test and debug

## 📋 Template Sections

The template is organized into these sections:

```bash
1. ╔═══ STRICT MODE ═══╗        # Exit on error, undefined vars
2. ╔═══ COLORS ═══╗             # Color constants
3. ╔═══ CONFIGURATION ═══╗      # Constants and env vars
4. ╔═══ GLOBAL STATE ═══╗       # Cleanup tracking
5. ╔═══ USAGE ═══╗              # Help text
6. ╔═══ CLEANUP FUNCTION ═══╗   # Resource cleanup
7. ╔═══ SPINNER FUNCTIONS ═══╗  # Animation
8. ╔═══ HELPER FUNCTIONS ═══╗   # create_temp_file, timeouts
9. ╔═══ MAIN SCRIPT ═══╗        # Your logic here
```

## 🎨 Customization Points

You'll customize these areas:

| Section | Customize? | How Much |
|---------|------------|----------|
| Strict Mode | ❌ Never | Leave as-is |
| Colors | ❌ Never | Leave as-is |
| Configuration | ✅ Always | Add your constants |
| Usage | ✅ Always | Write your help text |
| Cleanup | ⚠️ Rarely | Only if special needs |
| Spinner | ❌ Never | Leave as-is |
| Helpers | ⚠️ Sometimes | Add custom helpers |
| Argument Parsing | ✅ Always | Your arg logic |
| Banner | ✅ Always | Your text/icon |
| Main Logic | ✅ Always | Your code here |
| Results Display | ✅ Always | Your output format |

## 🔧 Common Use Cases

### Case 1: Git Pre-commit Hook
```bash
# Template already has:
- File array from git diff
- Spinner for long operations
- Pass/fail result boxes
- Timeout handling

# You add:
- Specific validation logic
- Custom error patterns
- Tool integration (linter, type checker, etc.)
```

### Case 2: Code Analysis Tool
```bash
# Template already has:
- File finding/filtering
- Cline CLI integration pattern
- Results parsing
- Professional output

# You add:
- Analysis prompts
- File type selection
- Custom reporting
```

### Case 3: Automation Script
```bash
# Template already has:
- Error handling
- Progress feedback
- Resource cleanup
- Cross-platform support

# You add:
- Business logic
- API calls
- Data processing
```

## 📊 Example Scripts

See **TEMPLATE_GUIDE.md** for a complete example:
- **Type Coverage Analyzer** - Full working script showing all features

Reference implementation:
- **security-review.sh** - The original script this template was extracted from

## 🧪 Testing Your Script

Checklist (copy into your script PR):

```markdown
- [ ] `./script.sh --help` shows usage
- [ ] `./script.sh --invalid` fails gracefully
- [ ] Ctrl+C interruption cleans up properly
- [ ] Missing dependencies show clear errors
- [ ] Empty input handled gracefully
- [ ] Maximum input doesn't crash
- [ ] Works on macOS (tested)
- [ ] Works on Linux (tested)
- [ ] Timeout scenarios work
- [ ] No temp files left behind (check /tmp)
- [ ] Spinner stops on completion
- [ ] Exit codes correct (0=success, 1=error)
```

## 🎓 Learning Path

**Beginner** (Never written a bash script):
1. Read TEMPLATE_GUIDE.md fully
2. Study the example script in the guide
3. Copy template and follow along
4. Test each section as you customize

**Intermediate** (Some bash experience):
1. Skim TEMPLATE_GUIDE.md for concepts
2. Use TEMPLATE_QUICKREF.md as you code
3. Copy template and customize
4. Reference guide for specific patterns

**Advanced** (Bash expert):
1. Copy template
2. Keep TEMPLATE_QUICKREF.md open
3. Use banner-helper.sh for banners
4. Done in 5 minutes

## ⚠️ Common Mistakes

### ❌ DON'T
```bash
# Modify the strict mode
set -eo pipefail  # Missing -u!

# Forget to quote variables
cd $PROJECT_ROOT  # Breaks with spaces

# Use bare grep (exits on no match)
MATCHES=$(grep "pattern" file)

# Hardcode paths
cd /Users/dave/Work/project
```

### ✅ DO
```bash
# Keep strict mode intact
set -euo pipefail

# Always quote variables
cd "$PROJECT_ROOT"

# Prevent grep exit
MATCHES=$(grep "pattern" file || true)

# Use dynamic paths
cd "$PROJECT_ROOT"
```

## 🆘 Troubleshooting

**Problem**: Script exits unexpectedly
- **Check**: Are you using `|| true` with commands that might fail?
- **Check**: Are all variables quoted?

**Problem**: Spinner doesn't stop
- **Check**: Is cleanup function being called?
- **Check**: Did you modify the trap setup?

**Problem**: "Unbound variable" error
- **Check**: Are you checking array length with `${#ARRAY[@]}`?
- **Check**: Is the variable set before use?

**Problem**: Temp files not cleaned up
- **Check**: Is `create_temp_file()` used instead of `mktemp`?
- **Check**: Is cleanup function in the trap?

## 📚 Additional Resources

- **2025 Bash Best Practices**: https://mywiki.wooledge.org/BashGuide
- **shellcheck**: https://www.shellcheck.net/ (lint your scripts!)
- **GNU timeout**: `brew install coreutils` (macOS)

## 🤝 Contributing

If you improve the template:
1. Update SCRIPT_TEMPLATE.sh
2. Update TEMPLATE_GUIDE.md with examples
3. Update TEMPLATE_QUICKREF.md cheat sheet
4. Update this README if structure changes

## 📝 License

Same as the parent project.

---

**Happy scripting!** 🎉

For questions: See TEMPLATE_GUIDE.md first, then TEMPLATE_QUICKREF.md
