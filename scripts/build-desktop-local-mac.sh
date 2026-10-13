#!/usr/bin/env bash
# Local unsigned macOS arm64 desktop build for manual testing. Not the release path: no Apple
# identity, no notarization. Output is always
# packages/desktop/release/mac-arm64/mac-arm64/Zekoder.app (electron-builder adds the inner arch dir).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="release/mac-arm64"
APP="$ROOT_DIR/packages/desktop/$OUT_DIR/mac-arm64/Zekoder.app"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "This script builds the macOS arm64 app and needs an Apple Silicon Mac." >&2
  exit 1
fi

cd "$ROOT_DIR"
rm -rf "$ROOT_DIR/packages/desktop/$OUT_DIR"

CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:desktop -- \
  --publish never --mac --arm64 --dir \
  -c.mac.identity=null -c.mac.notarize=false \
  "-c.directories.output=$OUT_DIR"

# Apple Silicon refuses unsigned binaries; an ad-hoc signature is enough to run locally.
codesign --force --deep --sign - "$APP"
xattr -cr "$APP"

echo "Built: $APP"
