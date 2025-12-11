#!/bin/bash
#
# Banner Padding Helper
# Calculates padding for script template banners
#
# Usage: ./banner-helper.sh "Title Text" "Subtitle Text" [Icon]
#

readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 \"Title Text\" \"Subtitle Text\" [Icon]"
    echo ""
    echo "Example:"
    echo "  $0 \"Security Review\" \"AI-Powered Security Scanner\" \"🔒\""
    exit 1
fi

TITLE="$1"
SUBTITLE="$2"
ICON="${3:-🔒}"

# Calculate lengths
TITLE_LEN=${#TITLE}
SUBTITLE_LEN=${#SUBTITLE}

# Title line: ║  ICON TITLE + padding + ║
# Total: 60 chars
# Formula: 60 - 2 (║ + space) - 2 (icon visual width) - 2 (spaces) - TITLE_LEN
TITLE_PADDING=$((60 - 2 - 2 - 2 - TITLE_LEN))

# Subtitle line: ║  SUBTITLE + padding + ║  
# Total: 60 chars
# Formula: 60 - 2 (║ + space) - SUBTITLE_LEN
SUBTITLE_PADDING=$((60 - 2 - SUBTITLE_LEN))

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Banner Padding Calculator                                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Input:"
echo "  Icon: $ICON"
echo "  Title: $TITLE (length: $TITLE_LEN)"
echo "  Subtitle: $SUBTITLE (length: $SUBTITLE_LEN)"
echo ""
echo "Padding:"
echo "  Title padding: $TITLE_PADDING spaces"
echo "  Subtitle padding: $SUBTITLE_PADDING spaces"
echo ""

# Create preview (without strict mode to avoid emoji issues)
echo "Preview:"
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
printf "${CYAN}║  %s %s%${TITLE_PADDING}s║${NC}\n" "$ICON" "$TITLE" ""
printf "${CYAN}║  %s%${SUBTITLE_PADDING}s║${NC}\n" "$SUBTITLE" ""
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo "Template code (replace {{PLACEHOLDERS}}):"
echo ""
echo "# Display banner"
echo "echo -e \"\\\${CYAN}╔════════════════════════════════════════════════════════════╗\\\${NC}\""
echo "echo -e \"\\\${CYAN}║  $ICON $TITLE{{TITLE_PADDING}}║\\\${NC}\""
echo "echo -e \"\\\${CYAN}║  $SUBTITLE{{SUBTITLE_PADDING}}║\\\${NC}\""
echo "echo -e \"\\\${CYAN}╚════════════════════════════════════════════════════════════╝\\\${NC}\""
echo "echo \"\""
echo ""
echo "Where:"
echo "  {{TITLE_PADDING}} = $TITLE_PADDING spaces"
echo "  {{SUBTITLE_PADDING}} = $SUBTITLE_PADDING spaces"
