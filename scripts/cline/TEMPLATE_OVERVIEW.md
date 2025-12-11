# Bash Script Template System - Visual Overview

## 📦 What You Got

```
scripts/cline/
├── SCRIPT_TEMPLATE.sh          # ⭐ The actual template (8.6KB)
├── TEMPLATE_README.md          # 📘 Start here (7.2KB)
├── TEMPLATE_GUIDE.md           # 📚 Complete guide (27KB)
├── TEMPLATE_QUICKREF.md        # ⚡ Quick reference (7.8KB)
├── TEMPLATE_OVERVIEW.md        # 📊 This file
└── banner-helper.sh            # 🎨 Banner calculator (3.0KB)
```

## 🗺️ File Relationship Map

```
                    ┌─────────────────────┐
                    │  START HERE         │
                    │  TEMPLATE_README.md │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
           ┌────────▼────────┐   ┌───────▼────────┐
           │ First Time?     │   │ Experienced?   │
           │ TEMPLATE_       │   │ TEMPLATE_      │
           │ GUIDE.md        │   │ QUICKREF.md    │
           │ (Full Tutorial) │   │ (Cheat Sheet)  │
           └────────┬────────┘   └───────┬────────┘
                    │                    │
                    └──────────┬─────────┘
                               │
                    ┌──────────▼──────────┐
                    │  SCRIPT_TEMPLATE.sh │
                    │  (Copy & Customize) │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  banner-helper.sh   │
                    │  (Calculate Padding)│
                    └─────────────────────┘
```

## 🎯 Usage Flow

### Scenario 1: First Time User
```
1. Read TEMPLATE_README.md (5 min)
   ↓
2. Read TEMPLATE_GUIDE.md (15 min)
   ↓
3. Copy SCRIPT_TEMPLATE.sh
   ↓
4. Follow guide to customize
   ↓
5. Use banner-helper.sh for banner
   ↓
6. Test with checklist from guide
   ↓
7. Done! (30-60 min total)
```

### Scenario 2: Experienced User
```
1. Skim TEMPLATE_README.md (2 min)
   ↓
2. Copy SCRIPT_TEMPLATE.sh
   ↓
3. Keep TEMPLATE_QUICKREF.md open
   ↓
4. Replace placeholders
   ↓
5. Run banner-helper.sh
   ↓
6. Test
   ↓
7. Done! (5-10 min total)
```

## 🔍 Quick File Finder

**I want to...**

| Goal | Use This File |
|------|---------------|
| Learn the system | TEMPLATE_README.md → TEMPLATE_GUIDE.md |
| Look up a placeholder | TEMPLATE_QUICKREF.md |
| Find a code snippet | TEMPLATE_QUICKREF.md |
| Understand best practices | TEMPLATE_GUIDE.md |
| Calculate banner padding | banner-helper.sh |
| Create a new script | SCRIPT_TEMPLATE.sh (copy it) |
| See a working example | TEMPLATE_GUIDE.md (Type Coverage example) |
| Remember emoji meanings | TEMPLATE_QUICKREF.md |
| Check testing checklist | TEMPLATE_README.md or TEMPLATE_GUIDE.md |

## 📋 Placeholder Index

All placeholders in SCRIPT_TEMPLATE.sh:

```bash
# Header Section
{{SCRIPT_NAME}}              # "My Script Name"
{{SCRIPT_DESCRIPTION}}       # "What it does"
{{SCRIPT_FILENAME}}          # "my-script.sh"
{{USAGE_ARGS}}              # "[--flag|--help]"
{{ENV_VARS}}                # "VAR  Description"

# Configuration Section
{{CONFIGURATION_VARS}}       # readonly constants

# Usage Section
{{USAGE_TEXT}}              # Full help text

# Helper Section
{{ADDITIONAL_HELPER_FUNCTIONS}}  # Custom functions (optional)

# Main Section
{{ARGUMENT_PARSING}}        # Arg parsing logic
{{BANNER_ICON}}             # "🚀"
{{BANNER_TITLE}}            # "Title Text"
{{BANNER_PADDING}}          # Spaces to 60 chars
{{BANNER_SUBTITLE}}         # "Subtitle Text"
{{BANNER_SUBTITLE_PADDING}} # Spaces to 60 chars
{{MAIN_LOGIC}}              # Your core code
{{RESULTS_DISPLAY}}         # Output and exit
```

## 🎨 Banner Padding Visual Guide

```
╔════════════════════════════════════════════════════════════╗
║  🚀 Your Title Here                                         ║
   ^^  ^^^^^^^^^^^^^^^^                                       ^
   ||  |               |                                      |
   ||  |               +-- BANNER_TITLE                       |
   ||  +-- 2 char emoji (BANNER_ICON)                        |
   |+-- 2 spaces                                             |
   +-- Border (║)                   BANNER_PADDING ----------+
                                    (fill to 60 chars total)

║  Your Subtitle Here                                        ║
   ^^^^^^^^^^^^^^^^^                                         ^
   |                |                                        |
   |                +-- BANNER_SUBTITLE                      |
   +-- 2 spaces                                             |
                           BANNER_SUBTITLE_PADDING ---------+
                           (fill to 60 chars total)
╚════════════════════════════════════════════════════════════╝
```

## 🔧 Standard Components (Included, Don't Modify)

| Component | Lines | What It Does | Modify? |
|-----------|-------|--------------|---------|
| Strict Mode | ~3 | Exit on errors | ❌ Never |
| Colors | ~6 | Color constants | ❌ Never |
| Global State | ~3 | Cleanup tracking | ❌ Never |
| Cleanup Function | ~30 | Resource cleanup | ⚠️ Rarely |
| Spinner Functions | ~25 | Animation | ❌ Never |
| create_temp_file | ~8 | Temp file helper | ❌ Never |
| check_timeout_command | ~11 | Detect timeout | ❌ Never |
| run_with_timeout | ~16 | Cross-platform timeout | ❌ Never |
| Trap Setup | ~1 | Signal handling | ❌ Never |

## 🎓 Learning Resources Inside Files

**TEMPLATE_GUIDE.md contains:**
- Detailed placeholder explanations with examples
- Complete working script (Type Coverage Analyzer)
- Best practices section
- Common patterns library
- Testing checklist
- Troubleshooting tips

**TEMPLATE_QUICKREF.md contains:**
- Placeholder cheat sheet table
- Code snippets ready to copy
- Common file extension patterns
- Exclude pattern examples
- Color usage guide
- Emoji reference
- Quick workflow steps

**TEMPLATE_README.md contains:**
- System overview
- Quick start guide
- Customization matrix
- Common use cases
- Testing checklist
- Common mistakes
- Troubleshooting

## 🚦 Color Coding System

```bash
GREEN   = Success, pass, OK        ✅
RED     = Error, fail, critical    ❌
YELLOW  = Warning, caution         ⚠️
BLUE    = Information, progress    📋
CYAN    = Headers, banners, boxes  ═══
NC      = Reset (use after color)  
```

## 📊 Template Size Guide

**Minimal Script** (using template):
- Template overhead: ~150 lines
- Your logic: ~50 lines
- Total: ~200 lines
- Features: All safety/UX features included

**Typical Script** (using template):
- Template overhead: ~150 lines
- Your logic: ~100-200 lines
- Custom helpers: ~50 lines
- Total: ~300-400 lines
- Features: Full-featured, production-ready

## 🎯 Success Criteria

Your script is ready when:

```bash
✅ All {{PLACEHOLDERS}} replaced
✅ ./script.sh --help works
✅ ./script.sh with no args shows help or runs default
✅ Invalid args show error and exit 1
✅ Ctrl+C cleanup works (no leftover temp files)
✅ Banner displays correctly (60 char width)
✅ Colors work (test in terminal)
✅ Exit codes correct (0=success, 1=error)
✅ Spinner starts and stops cleanly
✅ ShellCheck passes (optional but recommended)
```

## 🔗 Cross-References

| In This File | See Also | For |
|--------------|----------|-----|
| Placeholder list | TEMPLATE_QUICKREF.md | Examples |
| Components table | TEMPLATE_GUIDE.md | Detailed explanations |
| Success criteria | TEMPLATE_README.md | Testing checklist |
| Color coding | TEMPLATE_QUICKREF.md | Color usage guide |
| Banner visual | banner-helper.sh | Auto-calculate |

## 🎁 Bonus Tools

**ShellCheck** (optional but recommended):
```bash
# Install
brew install shellcheck  # macOS
apt install shellcheck   # Linux

# Use
shellcheck my-script.sh

# Ignore specific warnings in script
# shellcheck disable=SC2001
```

**Banner Helper**:
```bash
# Calculate padding automatically
./banner-helper.sh "My Title" "My Subtitle" "🎯"

# Output includes:
# - Padding calculations
# - Visual preview
# - Code to copy/paste
```

## 📈 Template Evolution

This template was extracted from `security-review.sh` which represents:
- Multiple iterations of refinement
- Real-world production usage
- 2025 best practices
- Cross-platform testing
- Battle-tested error handling

Reference `security-review.sh` for:
- Advanced patterns
- Complex logic examples
- Integration with Cline CLI
- Git integration
- Robust error handling

## 🎯 Next Steps

1. **Right now**: Read TEMPLATE_README.md (5 min)
2. **If new to bash**: Read TEMPLATE_GUIDE.md (15 min)
3. **Start coding**: Copy SCRIPT_TEMPLATE.sh
4. **While coding**: Keep TEMPLATE_QUICKREF.md open
5. **For banner**: Run banner-helper.sh
6. **Before commit**: Use testing checklist
7. **Optional**: Run shellcheck

---

**Remember**: The template handles all the hard stuff (cleanup, signals, errors, cross-platform). You just write your business logic! 🎉
