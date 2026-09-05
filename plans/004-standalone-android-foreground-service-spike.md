# Plan 004: Spike — Standalone Android Foreground Service Companion APK

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 077ca51..HEAD -- cmd/ai-cli-online/main.go internal/config/config.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/003-pty-direct-shell-fallback.md
- **Category**: direction
- **Planned at**: commit `077ca51`, 2026-09-05

## Why this matters

For users seeking a completely Termux-free mobile experience, running AGY Online requires a native Android host mechanism. Without Termux, Android treats background processes as cached and reclaims them aggressively. A native Android companion app (or lightweight wrapper APK) utilizing an Android **Foreground Service** (`startForeground`) with a persistent system notification (`AGY Online Running | [Open] [Stop]`) completely bypasses the Phantom Process Killer and background process limits. This spike prototypes cross-compiling the Go backend for `android/arm64` and specifies the Android Foreground Service architecture.

## Current state

- AGY Online is a pure-Go static executable (`modernc.org/sqlite`, 0 CGO), making cross-compilation to Android ARM64 trivial without NDK:
  ```bash
  CGO_ENABLED=0 GOOS=android GOARCH=arm64 go build ./cmd/ai-cli-online
  # or
  CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build ./cmd/ai-cli-online
  ```
- Current platform detection in [internal/pid/pid.go:L22-25](file:///data/data/com.termux/files/home/ai-cli-online/internal/pid/pid.go#L22-L25) checks for `PREFIX` containing `com.termux`. In a standalone APK, the package ID is e.g. `com.huacheng.agyonline`, and working files live in `/data/data/com.huacheng.agyonline/files`.
- [internal/config/config.go:L42-50](file:///data/data/com.termux/files/home/ai-cli-online/internal/config/config.go#L42-L50) resolves `HOME` via `os.UserHomeDir()`, which falls back to the current user directory.

## Commands you will need

| Purpose         | Command                                                         | Expected on success |
|-----------------|-----------------------------------------------------------------|---------------------|
| Cross-compile   | `CGO_ENABLED=0 GOOS=android GOARCH=arm64 go build -o bin/ai-cli-online-android-arm64 ./cmd/ai-cli-online` | exit 0 |
| Verify binary   | `file bin/ai-cli-online-android-arm64`                          | ELF 64-bit LSB executable, ARM aarch64 |
| Check Go tests  | `go test ./internal/...`                                        | exit 0, all pass    |

## Scope

**In scope** (the only files you should modify):
- `scripts/build-android-arm64.sh` (create)
- `docs/spikes/STANDALONE_ANDROID_SERVICE.md` (create)

**Out of scope** (do NOT touch):
- Modifying production Go server routes or frontend bundles
- Building a multi-megabyte Gradle project in the main repository root

## Git workflow

- Branch: `advisor/004-standalone-android-foreground-service-spike`
- Commit message: `docs(mobile): spike standalone android foreground service and cross-compilation`

## Steps

### Step 1: Create `scripts/build-android-arm64.sh` cross-compilation script

Create `scripts/build-android-arm64.sh`:
```bash
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
  -o "${ROOT_DIR}/dist/ai-cli-online-android-arm64" \
  "${ROOT_DIR}/cmd/ai-cli-online"

echo "✔ Build complete: ${ROOT_DIR}/dist/ai-cli-online-android-arm64"
ls -lh "${ROOT_DIR}/dist/ai-cli-online-android-arm64"
```

**Verify**: `bash -n scripts/build-android-arm64.sh` → exit 0.

### Step 2: Create Spike Architecture Document `docs/spikes/STANDALONE_ANDROID_SERVICE.md`

Document the complete architecture, permissions, and lifecycle of the standalone companion app:
1. **Android Manifest & Permissions**:
   - `RECEIVE_BOOT_COMPLETED`
   - `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_SPECIAL_USE` (Android 14+)
   - `POST_NOTIFICATIONS` (Android 13+)
   - `WAKE_LOCK`
2. **Foreground Service Lifecycle**:
   - `AGYServerService.kt`:
     - Creates NotificationChannel ("AGY Online Server", importance `LOW`).
     - Builds persistent Notification with action buttons: `[ Open UI ]` (PendingIntent launching Chrome to `http://localhost:3001`), and `[ Stop ]` (PendingIntent sending stop broadcast).
     - Calls `startForeground(NOTIFICATION_ID, notification)`.
     - Extracts binary from `assets/` or `lib/arm64-v8a/libagyserver.so` to `/data/data/<pkg>/files/bin/ai-cli-online`.
     - Executes binary via `ProcessBuilder` with `HOME=/data/data/<pkg>/files/home` and `PATH=/data/data/<pkg>/files/bin:/system/bin`.
3. **BootReceiver**:
   - Listens for `Intent.ACTION_BOOT_COMPLETED`.
   - Calls `ContextCompat.startForegroundService(context, Intent(context, AGYServerService::class.java))`.
4. **Toolchain Strategy**:
   - How shell commands run (Direct PTY via `/system/bin/sh` or bundled toybox).
   - How `agy` / node can be installed into app files directory or bundled.

**Verify**: Verify document links, markdown rendering, and absence of secret keys or broken references.

## Test plan

- Test cross-compilation script syntax:
  ```bash
  bash -n scripts/build-android-arm64.sh
  ```
- Run cross-compilation:
  ```bash
  bash scripts/build-android-arm64.sh
  ```
- Verify binary format:
  ```bash
  file dist/ai-cli-online-android-arm64
  ```
  Expected: `ELF 64-bit LSB executable, ARM aarch64`.

## Done criteria

- [ ] `scripts/build-android-arm64.sh` exists, is executable, and successfully builds an Android ARM64 ELF binary.
- [ ] `docs/spikes/STANDALONE_ANDROID_SERVICE.md` provides complete Kotlin/Java code snippets for `AGYServerService`, `BootReceiver`, and `AndroidManifest.xml`.
- [ ] Existing Go test suite passes without regressions (`go test ./internal/...`).
- [ ] No out-of-scope files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- If Go compiler on the host does not support `GOOS=android GOARCH=arm64`, report back with Go version.
- If Android NDK CGO dependencies are accidentally introduced into `internal/`, stop and report.

## Maintenance notes

- When Android API level requirements change (e.g. Android 14+ Foreground Service types), update the spike documentation accordingly.
