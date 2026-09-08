# Plan 018: Antigravity Path Resilience, Environment Ingestion, and Global Task Loop Shortcuts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e5b840d..HEAD -- internal/agy/ internal/terminal/ internal/routes/ web/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 017
- **Category**: dx
- **Planned at**: commit `e5b840d`, 2026-09-08

## Why this matters

1. On Android Termux and non-standard Linux VPS environments, Google Antigravity CLI (`agy`) is installed in either `$HOME/.gemini/antigravity-cli/bin` or `$PREFIX/bin`. In daemon mode or when background services spawn without a login shell PATH, `IsAgyAvailable()` and `ResolveAgyBinary()` fall back to looking only in standard PATH, resulting in false negatives ("Antigravity: Not Found") and failing terminal executions.
2. Terminal session PTYs need `PATH` to include these directories so running `agy` from any terminal or automated task works out of the box.
3. Conversation list summaries in the chat sidebar currently display raw XML tags when requests contain `<SKILL>` or `<ADDITIONAL_METADATA>` blocks.
4. Developers need a rapid global shortcut (`Alt+A`) and Command Palette entry to trigger and inspect the Autonomous Task Lifecycle Loop from anywhere in the app.

## Current state

- `internal/agy/runner.go:70-96`: `ResolveAgyBinary()` checks some paths but misses `$HOME/.gemini/antigravity-cli/bin` and `$PREFIX/bin`.
- `internal/terminal/tmux.go:206-209`: `IsAgyAvailable()` does a bare `exec.LookPath("agy")`, failing when PATH lacks user-specific bin dirs.
- `internal/terminal/direct.go:17-38`: `sanitizedEnv()` copies system PATH as-is without ensuring Antigravity bin paths are included.
- `internal/routes/conversations.go:78-92`: `extractUserPrompt()` extracts `<USER_REQUEST>`, but if raw text contains metadata blocks or XML headers, noise appears in the conversation title.
- `web/src/components/CommandPalette.tsx`: Missing an action for Autonomous Task Lifecycle Loop.
- `web/src/App.tsx`: Missing `Alt+A` shortcut to toggle AutoTaskModal.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Go Tests | `go test -v ./internal/agy ./internal/terminal ./internal/routes` | all pass, exit 0 |
| Frontend Tests | `npm run test --workspace=web` | all pass, exit 0 |
| Full Test Suite | `npm test` | all pass, exit 0 |
| Full Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `internal/agy/runner.go`
- `internal/agy/runner_test.go`
- `internal/terminal/tmux.go`
- `internal/terminal/direct.go`
- `internal/routes/conversations.go`
- `internal/routes/conversations_test.go`
- `web/src/components/CommandPalette.tsx`
- `web/src/components/CommandPalette.test.tsx`
- `web/src/App.tsx`
- `plans/README.md`

**Out of scope**:
- Changing SQLite schema or migration logic.
- Modifying xterm WebGL canvas rendering.

## Git workflow

- Branch: `main`
- Commit message convention: `feat(dx): antigravity path resilience, clean conversation titles, and global auto loop shortcut`

## Steps

### Step 1: Antigravity Path Resolution & Environment Ingestion in Go
1. In `internal/agy/runner.go`, update `ResolveAgyBinary()` to include:
   - `$HOME/.gemini/antigravity-cli/bin/agy` (and `.exe`)
   - `$PREFIX/bin/agy`
2. In `internal/terminal/tmux.go`, update `IsAgyAvailable()` to verify if `ResolveAgyBinary()` exists.
3. In `internal/terminal/direct.go`, update `sanitizedEnv()` to ensure `$HOME/.gemini/antigravity-cli/bin` and `$PREFIX/bin` are prepended to `PATH` if not already present.
4. Verify with Go tests.
**Verify**: `go test -v ./internal/agy ./internal/terminal` -> PASS.

### Step 2: Clean Conversation Prompt Extraction
1. In `internal/routes/conversations.go`, refine `extractUserPrompt`:
   - Strip leading/trailing XML tags and metadata blocks like `<SKILL>...</SKILL>` or `<ADDITIONAL_METADATA>...</ADDITIONAL_METADATA>`.
   - Trim whitespace and return clean first non-tag prose.
2. Add test cases in `internal/routes/conversations_test.go`.
**Verify**: `go test -v ./internal/routes` -> PASS.

### Step 3: Command Palette & Global Alt+A Shortcut
1. In `web/src/components/CommandPalette.tsx`:
   - Add `open-auto-task` to `items` with title "Autonomous Task Lifecycle Loop (/auto)", category `TASKS`, and shortcut hint `Alt+A`.
2. In `web/src/App.tsx`:
   - Add keyboard listener for `Alt+A` / `Alt+a`: opens `AutoTaskModal`.
3. Update `CommandPalette.test.tsx` and run web tests.
**Verify**: `npm run test --workspace=web` -> PASS.

### Step 4: Verification, Full Build & Status Update
1. Run `npm test`.
2. Run `npm run build`.
3. Mark Plan 018 as `DONE` in `plans/README.md`.

## Done criteria

- [ ] `go test -v ./...` exits 0 with all Go tests passing
- [ ] `npm run test --workspace=web` exits 0 with all Web tests passing
- [ ] `npm run build` exits 0 producing static binary `./bin/ai-cli-online`
- [ ] `plans/README.md` updated with Plan 018 marked DONE
