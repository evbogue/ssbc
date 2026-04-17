#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor/scuttlebot.io"
TARGET_DIR="$ROOT_DIR/docs/scuttlebot.io"

if [ ! -d "$VENDOR_DIR" ]; then
  echo "Missing vendored source at $VENDOR_DIR" >&2
  exit 1
fi

cd "$VENDOR_DIR"
npm install
npm run build

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -a "$VENDOR_DIR/build/." "$TARGET_DIR/"

echo "Synced scuttlebot.io docs from vendor source into $TARGET_DIR"
