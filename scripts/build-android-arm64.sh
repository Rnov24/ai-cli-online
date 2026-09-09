#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Building embedded web UI assets..."
(cd "$ROOT_DIR" && npm run build --workspace=web)

echo "Compiling AGY Online for Android ARM64..."
mkdir -p "${ROOT_DIR}/dist"
CGO_ENABLED=0 GOOS=android GOARCH=arm64 go build \
  -ldflags="-s -w" \
  -o "${ROOT_DIR}/dist/agy-online-android-arm64" \
  "${ROOT_DIR}/cmd/agy-online"

echo "✔ Build complete: ${ROOT_DIR}/dist/agy-online-android-arm64"
ls -lh "${ROOT_DIR}/dist/agy-online-android-arm64"
