# Plan 001: Fix Termux Boot Script and Mitigate Android Phantom Process Killer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 077ca51..HEAD -- scripts/install-termux-boot.sh cmd/ai-cli-online/main.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `077ca51`, 2026-09-05

## Why this matters

When running AGY Online on Android via Termux, users expect the server to start silently at boot and run reliably in the background without needing to manually launch the Termux terminal UI. However, `scripts/install-termux-boot.sh` still references obsolete Node.js files (`ai-cli-online.mjs`, `NODE_OPTIONS`) from prior versions, causing script failures. Furthermore, Android 12+ introduces the **Phantom Process Killer**, which terminates background child processes (both `ai-cli-online` and `tmux`) within minutes unless monitor limits are relaxed and wake-locks are held. Fixing the boot scripts and adding phantom process killer diagnostics enables true, hands-off background execution on mobile.

## Current state

- `scripts/install-termux-boot.sh` contains stale references to Node.js ([scripts/install-termux-boot.sh:L33-35,53](file:///data/data/com.termux/files/home/ai-cli-online/scripts/install-termux-boot.sh#L33-L53)):
  ```bash
  NODE_BIN="$(which node 2>/dev/null || echo "/data/data/com.termux/files/usr/bin/node")"
  CLI_BIN="${ROOT_DIR}/bin/ai-cli-online.mjs"
  ...
  export NODE_OPTIONS="--expose-gc --max-old-space-size=256"
  ```
- `cmd/ai-cli-online/main.go:L282-320` generates a minimal boot script for `~/.termux/boot/start-ai-cli-online.sh`:
  ```go
  func runInstallBoot() {
  	if !pid.IsTermux() {
  		fmt.Println("install-boot is currently tailored for Termux on Android.")
  		fmt.Println("For Linux VPS systemd service, see install-service.sh.")
  		return
  	}

  	home, _ := os.UserHomeDir()
  	bootDir := filepath.Join(home, ".termux", "boot")
  	_ = os.MkdirAll(bootDir, 0755)
  	bootScript := filepath.Join(bootDir, "start-ai-cli-online.sh")
  ```
- The generated script checks for `termux-wake-lock`, but does not verify binary existence before starting, does not log error exits, and does not provide warnings or automated setup instructions for Android 12+ Phantom Process Killer (`settings_enable_monitor_phantom_procs` / `max_phantom_processes`).

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Verify Go | `go test ./cmd/ai-cli-online/... ./internal/...` | exit 0, all pass |
| Build CLI | `go build -o bin/ai-cli-online ./cmd/ai-cli-online` | exit 0 |
| Syntax    | `bash -n scripts/install-termux-boot.sh` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `scripts/install-termux-boot.sh`
- `cmd/ai-cli-online/main.go`

**Out of scope** (do NOT touch):
- `install-service.sh` (systemd installer for Linux VPS, unrelated to Android Termux)
- `internal/server/*` or `web/*`

## Git workflow

- Branch: `advisor/001-fix-termux-boot-and-phantom-killer`
- Commit message: `fix(mobile): update termux boot script for Go binary and add phantom killer checks`

## Steps

### Step 1: Update `scripts/install-termux-boot.sh` to target compiled Go binary

In [scripts/install-termux-boot.sh](file:///data/data/com.termux/files/home/ai-cli-online/scripts/install-termux-boot.sh):
1. Remove lines 33–35 (`NODE_BIN`, `CLI_BIN`).
2. Point `CLI_BIN` to `"${ROOT_DIR}/bin/ai-cli-online"`.
3. Ensure the script checks for the existence of `"${ROOT_DIR}/bin/ai-cli-online"` and prompts to build it if missing:
   ```bash
   if [[ ! -x "${ROOT_DIR}/bin/ai-cli-online" ]]; then
     echo "Building AGY Online Go binary..."
     (cd "$ROOT_DIR" && go build -o bin/ai-cli-online ./cmd/ai-cli-online)
   fi
   ```
4. Remove line 53 (`export NODE_OPTIONS=...`).
5. Add Android 12+ Phantom Process Killer guidance and diagnostic check to the post-installation output:
   - Check if device is Android 12+ (`getprop ro.build.version.release` >= 12).
   - Display the recommended command to disable phantom process killing:
     `adb shell "/system/bin/device_config put activity_manager max_phantom_processes 2147483647"` or
     `adb shell "settings put global settings_enable_monitor_phantom_procs false"`.

**Verify**: `bash -n scripts/install-termux-boot.sh` → exit 0, no syntax errors.

### Step 2: Synchronize `runInstallBoot()` in `cmd/ai-cli-online/main.go`

In [cmd/ai-cli-online/main.go:L282-320](file:///data/data/com.termux/files/home/ai-cli-online/cmd/ai-cli-online/main.go#L282-L320):
1. Ensure the generated boot script acquires `termux-wake-lock`, validates that `self` executable is runnable, and sets up pathing for `agy` (`${HOME}/.gemini/antigravity-cli/bin`).
2. Add helpful output to `runInstallBoot()`:
   - Remind the user to open Termux:Boot app once.
   - Print Android 12+ Phantom Process Killer notice and command.
   - Explain that Termux:Boot runs completely headlessly without launching the Termux terminal UI.

**Verify**: `go build -o bin/ai-cli-online ./cmd/ai-cli-online` → exit 0.

## Test plan

- Test shell script syntax:
  ```bash
  bash -n scripts/install-termux-boot.sh
  ```
- Run Go unit tests:
  ```bash
  go test ./cmd/ai-cli-online/... ./internal/...
  ```
- Dry-run `ai-cli-online install-boot`:
  Run `./bin/ai-cli-online install-boot` and verify that the created script in `~/.termux/boot/start-ai-cli-online.sh` contains the Go binary path and contains no Node.js flags.

## Done criteria

- [ ] `scripts/install-termux-boot.sh` contains zero occurrences of `node`, `NODE_OPTIONS`, or `.mjs`.
- [ ] `scripts/install-termux-boot.sh` passes `bash -n`.
- [ ] `cmd/ai-cli-online/main.go` builds cleanly with `go build ./cmd/ai-cli-online`.
- [ ] `go test ./...` exits 0.
- [ ] No files outside in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

- If `~/.termux/boot` cannot be created due to permission denied outside Termux, report back.
- If `cmd/ai-cli-online/main.go` has breaking changes in CLI flag parser, stop and report.

## Maintenance notes

- Any changes to binary compilation paths or default port flags in `cmd/ai-cli-online/main.go` must be mirrored in `scripts/install-termux-boot.sh`.
