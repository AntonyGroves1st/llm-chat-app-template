#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/android/app/src/main/assets"
mkdir -p "$DEST"
find "$DEST" -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +
cp -R "$ROOT/public/." "$DEST/"
echo "Synced web assets to android/app/src/main/assets"
