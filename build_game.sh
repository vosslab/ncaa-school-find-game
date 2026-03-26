#!/bin/bash
# build_game.sh - concatenate parts/ into a single self-contained HTML file
# Output: ncaa_school_find_game.html

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
PARTS="${REPO_ROOT}/parts"
OUTPUT="${REPO_ROOT}/ncaa_school_find_game.html"

# Verify parts directory exists
if [ ! -d "${PARTS}" ]; then
	echo "ERROR: parts/ directory not found at ${PARTS}" >&2
	exit 1
fi

# Soft size check on map data
MAP_SIZE=$(wc -c < "${PARTS}/map_data.js" 2>/dev/null || echo 0)
if [ "${MAP_SIZE}" -gt 100000 ]; then
	echo "WARNING: parts/map_data.js is ${MAP_SIZE} bytes (over 100KB guideline)" >&2
fi

# Build the HTML file
cat "${PARTS}/head.html" > "${OUTPUT}"
echo "<style>" >> "${OUTPUT}"
cat "${PARTS}/style.css" >> "${OUTPUT}"
echo "</style>" >> "${OUTPUT}"
echo "</head>" >> "${OUTPUT}"
echo "<body>" >> "${OUTPUT}"
cat "${PARTS}/body.html" >> "${OUTPUT}"
echo "<script>" >> "${OUTPUT}"
cat "${PARTS}/constants.js" \
	"${PARTS}/map_data.js" \
	"${PARTS}/map_projection.js" \
	"${PARTS}/game_state.js" \
	"${PARTS}/game_ui.js" \
	"${PARTS}/game_play.js" \
	"${PARTS}/init.js" >> "${OUTPUT}"
echo "</script>" >> "${OUTPUT}"
cat "${PARTS}/tail.html" >> "${OUTPUT}"

echo "Built: ${OUTPUT}"
echo "Size: $(wc -c < "${OUTPUT}") bytes"
