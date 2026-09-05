# Plan 003: Implement Direct PTY Shell Fallback when Tmux is Unavailable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 077ca51..HEAD -- internal/pty/pty.go internal/ws/handler.go internal/routes/sessions.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `077ca51`, 2026-09-05

## Why this matters

Currently, AGY Online's terminal subsystem hardcodes an external dependency on `tmux`. In [internal/pty/pty.go:L47](file:///data/data/com.termux/files/home/ai-cli-online/internal/pty/pty.go#L47), PTY attachment directly calls `exec.Command("tmux", "-S", ...)`. If `tmux` is absent—which is the case on stock Android outside Termux, or minimal container environments—the WebSocket terminal handler fails with status 4003 (`PTY attach failed`), rendering the app unusable. Providing a direct PTY shell fallback (`/system/bin/sh` or `$SHELL`) when `tmux` is unavailable decouples AGY Online from Termux, making standalone mobile APKs and containerized deployments possible.

## Current state

- [internal/pty/pty.go:L46-62](file:///data/data/com.termux/files/home/ai-cli-online/internal/pty/pty.go#L46-L62):
  ```go
  func Start(sessionName string, cols, rows int) (*Session, error) {
  	c := exec.Command("tmux", "-S", tmux.SocketPath, "attach-session", "-t", "="+sessionName)
  	c.Env = sanitizedEnv()

  	ptmx, err := pty.StartWithSize(c, &pty.Winsize{
  		Rows: uint16(rows),
  		Cols: uint16(cols),
  	})
  	if err != nil {
  		return nil, fmt.Errorf("failed to attach pty: %w", err)
  	}

  	return &Session{
  		ptmx: ptmx,
  		cmd:  c,
  	}, nil
  }
  ```
- [internal/tmux/tmux.go:L228-231](file:///data/data/com.termux/files/home/ai-cli-online/internal/tmux/tmux.go#L228-L231) already provides an availability check:
  ```go
  func IsTmuxAvailable() bool {
  	_, err := exec.LookPath("tmux")
  	return err == nil
  }
  ```
- [internal/ws/handler.go:L198-203](file:///data/data/com.termux/files/home/ai-cli-online/internal/ws/handler.go#L198-L203) unconditionally attempts `tmux.CreateSession` and `pty.Start(sessionName, cols, rows)`:
  ```go
  if !resumed {
      if err := tmux.CreateSession(sessionName, cols, rows, cwd, h.cfg.StartCommand); err != nil {
          log.Printf("[ws] Failed to create tmux session %s: %v", sessionName, err)
          _ = conn.Close(websocket.StatusCode(4003), "Failed to create session")
          return err
      }
  }
  ```
- If `tmux` is missing, `tmux.CreateSession` fails with command not found, aborting the connection.

## Commands you will need

| Purpose   | Command                     | Expected on success |
|-----------|-----------------------------|---------------------|
| Run tests | `go test -v ./internal/pty` | exit 0, all pass    |
| All tests | `go test ./internal/...`    | exit 0, all pass    |
| Build CLI | `go build -o bin/ai-cli-online ./cmd/ai-cli-online` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `internal/pty/pty.go`
- `internal/pty/pty_test.go` (create)
- `internal/ws/handler.go`
- `internal/routes/sessions.go`

**Out of scope** (do NOT touch):
- `internal/tmux/tmux.go` (already contains `IsTmuxAvailable`)
- `web/*` (frontend receives standard xterm binary stream 0x01 regardless of backend session type)

## Git workflow

- Branch: `advisor/003-pty-direct-shell-fallback`
- Commit message: `feat(terminal): support direct PTY shell fallback when tmux is unavailable`

## Steps

### Step 1: Add `StartDirect()` to `internal/pty/pty.go`

In [internal/pty/pty.go](file:///data/data/com.termux/files/home/ai-cli-online/internal/pty/pty.go):
1. Add a helper function to detect default shell:
   ```go
   func resolveDefaultShell() string {
       if shell := os.Getenv("SHELL"); shell != "" {
           if _, err := exec.LookPath(shell); err == nil {
               return shell
           }
       }
       for _, candidate := range []string{"/system/bin/sh", "/bin/bash", "/bin/sh", "sh"} {
           if p, err := exec.LookPath(candidate); err == nil {
               return p
           }
       }
       return "sh"
   }
   ```
2. Implement `StartDirect`:
   ```go
   func StartDirect(cwd string, cols, rows int, customCmd string) (*Session, error) {
       shell := resolveDefaultShell()
       var c *exec.Cmd
       if customCmd != "" {
           c = exec.Command(shell, "-c", customCmd)
       } else {
           c = exec.Command(shell)
       }
       if cwd != "" {
           c.Dir = cwd
       }
       c.Env = sanitizedEnv()

       ptmx, err := pty.StartWithSize(c, &pty.Winsize{
           Rows: uint16(rows),
           Cols: uint16(cols),
       })
       if err != nil {
           return nil, fmt.Errorf("failed to start direct pty: %w", err)
       }

       return &Session{
           ptmx: ptmx,
           cmd:  c,
       }, nil
   }
   ```

**Verify**: `go test ./internal/pty/...` exits 0.

### Step 2: Write unit tests in `internal/pty/pty_test.go`

Create `internal/pty/pty_test.go`:
- Test `resolveDefaultShell()` returns an existing executable path.
- Test `StartDirect` spawns a process, can read shell output (e.g. prompt or command output), write input, resize, and close cleanly without leaking process handles.

**Verify**: `go test -v ./internal/pty` → PASS.

### Step 3: Integrate Direct PTY fallback into `internal/ws/handler.go`

In [internal/ws/handler.go:L190-225](file:///data/data/com.termux/files/home/ai-cli-online/internal/ws/handler.go#L190-L225):
1. Check `tmux.IsTmuxAvailable()`:
   ```go
   hasTmux := tmux.IsTmuxAvailable()
   ```
2. If `hasTmux`: proceed with existing `tmux.HasSession`, `tmux.CreateSession`, and `pty.Start(sessionName, cols, rows)`.
3. If `!hasTmux`:
   - Skip tmux calls.
   - Send JSON message `connected` with `Resumed: false`.
   - Start direct session:
     ```go
     ps, err := pty.StartDirect(cwd, cols, rows, h.cfg.StartCommand)
     ```
   - If direct PTY start fails, return error cleanly.
   - Write a short notice to terminal output: `\r\n[AGY Online] Running in direct PTY mode (tmux not installed)\r\n\r\n`.

### Step 4: Handle session listing fallback in `internal/routes/sessions.go`

In [internal/routes/sessions.go:L34-38](file:///data/data/com.termux/files/home/ai-cli-online/internal/routes/sessions.go#L34-L38):
If `!tmux.IsTmuxAvailable()`, instead of returning a 500 error from `tmux.ListSessions`:
- Return a synthesized active session list based on `ws.GetHub().ActiveSessionNames()` with `Cwd: s.auth.cfg.DefaultWorkingDir`.

**Verify**: `go test ./internal/...` exits 0.

## Test plan

- Test direct PTY execution without tmux:
  Run `go test -v ./internal/pty`.
- Test WebSocket handler with mock or direct session:
  Verify `go test ./internal/routes/...` and `./internal/server/...`.
- Manual verification:
  Rename or hide `tmux` from PATH in a test shell (`PATH=/bin:/usr/bin`) and start server:
  Verify connecting to Web UI connects to `/bin/sh` or `/bin/bash` without crashing.

## Done criteria

- [ ] `internal/pty/pty.go` exports `StartDirect(cwd string, cols, rows int, customCmd string) (*Session, error)`.
- [ ] `internal/pty/pty_test.go` exists and tests pass.
- [ ] `internal/ws/handler.go` checks `tmux.IsTmuxAvailable()` and falls back gracefully to `pty.StartDirect`.
- [ ] `internal/routes/sessions.go` returns valid JSON without 500 when tmux is unavailable.
- [ ] `go test ./internal/...` exits 0.
- [ ] No out-of-scope files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- If `pty.StartWithSize` fails on specific Android bionic libc ptmx path (`/dev/ptmx`), stop and verify permissions.
- If Windows build tags are broken by direct shell execution, ensure `internal/pty` maintains cross-platform compatibility.

## Maintenance notes

- Direct PTY sessions do not support background disconnect/reconnect persistence like tmux; this trade-off is documented in user-facing logs.
