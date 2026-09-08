#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
INDEX_PATH="$BUILD_DIR/index.html"
TEMP_INDEX=""

cleanup() {
  if [ -n "$TEMP_INDEX" ] && [ -e "$TEMP_INDEX" ]; then
    rm -f "$TEMP_INDEX"
  fi
}
trap cleanup EXIT

node "$ROOT_DIR/scripts/style.js"
mkdir -p "$BUILD_DIR"
TEMP_INDEX="$(mktemp "$BUILD_DIR/.index.html.XXXXXX")"

"$ROOT_DIR/../node_modules/.bin/browserify" "$ROOT_DIR/src/main.js" |
  "$ROOT_DIR/../node_modules/.bin/indexhtmlify" --title "Decent SSB" > "$TEMP_INDEX"

node "$ROOT_DIR/scripts/postprocess-index.js" "$TEMP_INDEX"
mv "$TEMP_INDEX" "$INDEX_PATH"
TEMP_INDEX=""

echo "Built $INDEX_PATH ($(wc -c < "$INDEX_PATH" | tr -d ' ') bytes)"
