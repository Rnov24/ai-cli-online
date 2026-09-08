# Plan 030: Terminal PTY Zombie Process Reaping, Auto-Cleanup on Exit, and Window Size Clamping

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b49cad2..HEAD -- internal/terminal/direct.go internal/terminal/tmux.go internal/terminal/terminal.go internal/terminal/terminal_test.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/029-git-history-commit-search-and-filter-ergonomics.md
- **Category**: reliability | performance | mobile | system
- **Planned at**: commit `b49cad2`, 2026-09-08

## Why this matters

1. **Zombie Process Accumulation**: In `internal/terminal/direct.go` and `internal/terminal/tmux.go`, processes spawned via `pty.StartWithSize` (`directSession.cmd` and `tmuxSession.cmd`) are never reaped via `cmd.Wait()`. When a client disconnects, `Close()` invokes `cmd.Process.Kill()`, but without `Wait()`, the terminated child process remains as a defunct zombie in the kernel process table (`<defunct>`). On long-running servers and resource-constrained environments (Android Termux, low-spec VPS), this leaks kernel PIDs and task structures.
2. **Lingering Dead Sessions on Shell Exit**: In direct mode (`directSession`), if the user types `exit` or the shell crashes, `s.closed` remains `false` and the dead session lingers indefinitely in the `directRegistry` because no exit handler unregisters it or closes the master PTY.
3. **Terminal Geometry Sanitization (0x0 Winsize)**: When a client connects before layout measurement or provides uninitialized geometry, `cols` or `rows` may be zero or negative. Passing 0x0 to `pty.StartWithSize` or `pty.Setsize` can cause shell engines and CLI tools (e.g. bash, readline, ncurses, agy) to divide by zero or emit distorted terminal sequences.

## Current state

- `internal/terminal/direct.go:136-166`: `startDirect` starts shell via `pty.StartWithSize`, registers in `registry`, but never launches a goroutine to wait on `cmd.Wait()` or handle natural shell exit.
- `internal/terminal/direct.go:221-234`: `Close()` kills process without `cmd.Wait()`, leaving zombie.
- `internal/terminal/tmux.go:240-257`: `attachTmux` starts `tmux attach-session`, but never reaps the process via `cmd.Wait()`.
- `internal/terminal/tmux.go:297-309`: `Close()` kills `tmux attach-session` process without `cmd.Wait()`, leaving zombie.
- `internal/terminal/terminal.go:35-60`: `Open` accepts raw `cols, rows` without bounds validation or fallback defaults.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Unit test | `go test -v ./internal/terminal/...` | Exit code 0, all tests PASS including zombie reaping & winsize sanitization |
| Full test | `npm test`               | All Vitest and Go tests PASS |
| Build     | `npm run build`          | Exit code 0, single Go static binary compiled |

## Steps

### Step 1: Add `SanitizeWinsize` helper in `internal/terminal/terminal.go`

1. Define `SanitizeWinsize(cols, rows int) (int, int)`:
   - Clamps `cols`: if `<= 0`, default to `80`; if `< 10`, clamp to `10`; if `> 1000`, clamp to `1000`.
   - Clamps `rows`: if `<= 0`, default to `24`; if `< 4`, clamp to `4`; if `> 1000`, clamp to `1000`.
2. In `terminal.Open`, sanitize `cols, rows = SanitizeWinsize(cols, rows)`.

### Step 2: Implement process reaping, thread-safe idempotent close, and auto-cleanup in `internal/terminal/direct.go`

1. In `directSession`:
   - Add `closeOnce sync.Once`.
   - In `startDirect`, sanitize `cols, rows = SanitizeWinsize(cols, rows)`.
   - In `startDirect`, launch asynchronous reaper:
     ```go
     go func() {
         _ = c.Wait()
         _ = ds.Close()
     }()
     ```
2. In `directSession.Close()`:
   - Wrap teardown in `s.closeOnce.Do(...)`.
   - Mark `s.closed = true`.
   - Unregister from `registry`.
   - Close `ptmx`.
   - Kill process if active.
3. In `directSession.Resize(cols, rows)`:
   - Sanitize `cols, rows = SanitizeWinsize(cols, rows)` before `pty.Setsize`.

### Step 3: Implement process reaping and winsize sanitization in `internal/terminal/tmux.go`

1. In `tmuxSession`:
   - Add `closeOnce sync.Once`.
   - In `attachTmux`, sanitize `cols, rows = SanitizeWinsize(cols, rows)`.
   - In `attachTmux`, launch asynchronous reaper:
     ```go
     go func() {
         _ = c.Wait()
         _ = ts.Close()
     }()
     ```
2. In `tmuxSession.Close()`:
   - Wrap teardown in `s.closeOnce.Do(...)`.
   - Mark `s.closed = true`.
   - Close `ptmx`.
   - Kill process if active.
3. In `tmuxSession.Resize(cols, rows)`:
   - Sanitize `cols, rows = SanitizeWinsize(cols, rows)` before `pty.Setsize`.

### Step 4: Add comprehensive unit tests in `internal/terminal/terminal_test.go`

1. Add `TestSanitizeWinsize`:
   - Test `(0, 0) -> (80, 24)`.
   - Test `(-5, -10) -> (80, 24)`.
   - Test `(2, 2) -> (10, 4)`.
   - Test `(2000, 2000) -> (1000, 1000)`.
   - Test `(120, 40) -> (120, 40)`.
2. Add `TestDirectSessionAutoReapOnExit`:
   - Launch a short-lived command `exit 0`.
   - Wait up to 3 seconds for session to automatically close and be unregistered from `registry`.
   - Verify `sess.IsAlive()` becomes `false` and `registry.get(sessName)` returns `nil`.

### Step 5: Verify all test gates and production build

1. Run `go test -v ./internal/terminal/...`.
2. Run `npm test`.
3. Run `npm run build`.
4. Update `plans/README.md` row 030 to `DONE`.
5. Commit changes cleanly.

## STOP conditions

- If any existing tests fail, stop and resolve before proceeding.
- If Vite or TypeScript build fails, stop and resolve.
