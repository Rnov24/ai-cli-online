# Plan 012: Concurrency, Stream Stability, and Tarball Integrity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b03c93a..HEAD -- internal/ws/handler.go internal/terminal/direct.go internal/routes/files.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b03c93a`, 2026-09-06

## Why this matters

The websocket hub currently writes to `*websocket.Conn` concurrently across three goroutines (PTY reader loop, control message ping/pong loop, and background `stream-file` worker). The underlying `coder/websocket` library explicitly mandates that only one write may be in progress at any time; concurrent calls lead to socket errors, frame collisions, and unexpected disconnections. Additionally, direct PTY mode's scrollback trimming contains an index calculation that can panic when reading large buffers, and `DownloadCwd` corrupts tar archives by attempting `io.Copy` on symlinks. This plan stabilizes connection concurrency, bounds-checks scrollback buffering, and repairs tarball generation.

## Current state

- `internal/ws/handler.go:164-175`: `sendJSON` and `sendBinary` directly call `conn.Write(ctx, ...)` without synchronization.
- `internal/ws/handler.go:218-232`: PTY reader goroutine continuously calls `sendBinary(BinTypeOutput, buf[:n])`.
- `internal/ws/handler.go:345`: Main message loop calls `sendJSON(serverMessage{Type: "pong", ...})` concurrently.
- `internal/ws/handler.go:382-416`: `stream-file` goroutine calls `sendBinary(BinTypeFileChunk, ...)` and `sendJSON(...)` concurrently.
- `internal/terminal/direct.go:138-146`: `directSession.Read` calculates `overflow := (s.scrollback.Len() + n) - maxScrollbackBytes` and takes `s.scrollback.Bytes()[overflow:]`, which panics when `overflow > s.scrollback.Len()`, and aliases buffer memory during `s.scrollback.Reset()`.
- `internal/routes/files.go:184-204`: `DownloadCwd` walks files and calls `file, err := os.Open(path)` followed by `io.Copy(tw, file)` even for symlinks, causing `tar.Writer` failure `tar: write too long`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Go Tests | `go test -v ./internal/ws/... ./internal/terminal/... ./internal/routes/...` | PASS, exit 0 |
| All Tests | `npm test` | all pass, exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `internal/ws/handler.go`
- `internal/terminal/direct.go`
- `internal/terminal/terminal_test.go`
- `internal/routes/files.go`
- `internal/routes/files_test.go`

**Out of scope**:
- Frontend UI components.
- SQLite database schema or queries.
- Tmux session command generation.

## Git workflow

- Branch: `advisor/012-concurrency-stream-stability-and-tarball-integrity`
- Commit message convention: `fix(terminal): <description>`

## Steps

### Step 1: Serialize `*websocket.Conn` Writes in `internal/ws/handler.go`
1. Open `internal/ws/handler.go`.
2. In `func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request)`:
   Declare a dedicated write lock:
   ```go
   var writeMu sync.Mutex
   ```
3. Update `sendJSON` to acquire `writeMu`:
   ```go
   sendJSON := func(msg serverMessage) {
       b, err := json.Marshal(msg)
       if err != nil {
           return
       }
       writeMu.Lock()
       defer writeMu.Unlock()
       _ = conn.Write(ctx, websocket.MessageText, b)
   }
   ```
4. Update `sendBinary` to acquire `writeMu`:
   ```go
   sendBinary := func(typePrefix byte, payload []byte) error {
       buf := make([]byte, 1+len(payload))
       buf[0] = typePrefix
       copy(buf[1:], payload)
       writeMu.Lock()
       defer writeMu.Unlock()
       return conn.Write(ctx, websocket.MessageBinary, buf)
   }
   ```
5. Ensure `conn.Close` or control teardowns cleanly handle any pending write.

**Verify**: `go test -v ./internal/ws/...` → exits 0.

### Step 2: Fix Scrollback Memory Safety & Panic in `internal/terminal/direct.go`
1. Open `internal/terminal/direct.go`.
2. In `func (s *directSession) Read(p []byte) (int, error)`:
   Replace lines 136-147 with:
   ```go
   if n > 0 {
       s.mu.Lock()
       s.scrollback.Write(p[:n])
       if s.scrollback.Len() > maxScrollbackBytes {
           data := s.scrollback.Bytes()
           excess := len(data) - maxScrollbackBytes
           tail := make([]byte, maxScrollbackBytes)
           copy(tail, data[excess:])
           s.scrollback.Reset()
           s.scrollback.Write(tail)
       }
       s.mu.Unlock()
   }
   ```
3. Open `internal/terminal/terminal_test.go`:
   Add unit test `TestDirectSessionScrollbackOverflow`:
   - Creates a direct session.
   - Writes `maxScrollbackBytes + 1024` bytes into scrollback.
   - Asserts `len(s.Scrollback()) == maxScrollbackBytes` with no panics.

**Verify**: `go test -v ./internal/terminal/...` → exits 0.

### Step 3: Handle Symlinks Cleanly in `DownloadCwd` Tarball Generation
1. Open `internal/routes/files.go`.
2. In `func (f *FileHandler) DownloadCwd(w http.ResponseWriter, r *http.Request)`:
   Update the filepath walk function:
   ```go
   _ = filepath.Walk(cwd, func(path string, info os.FileInfo, err error) error {
       if err != nil {
           return nil
       }
       rel, err := filepath.Rel(cwd, path)
       if err != nil || rel == "." {
           return nil
       }

       header, err := tar.FileInfoHeader(info, "")
       if err != nil {
           return nil
       }
       header.Name = rel

       // Handle symlinks
       if info.Mode()&os.ModeSymlink != 0 {
           linkTarget, err := os.Readlink(path)
           if err != nil {
               return nil
           }
           header.Linkname = linkTarget
           header.Size = 0
           return tw.WriteHeader(header)
       }

       if err := tw.WriteHeader(header); err != nil {
           return err
       }
       if info.IsDir() {
           return nil
       }

       file, err := os.Open(path)
       if err != nil {
           return nil
       }
       defer file.Close()
       _, _ = io.Copy(tw, file)
       return nil
   })
   ```
3. In `internal/routes/files_test.go`:
   Add a test creating a directory with a symlink, running `DownloadCwd`, and verifying the returned tar.gz parses with `tar.Reader` with zero errors.

**Verify**: `go test -v ./internal/routes/...` → exits 0.

## Test plan

- `internal/terminal/terminal_test.go`:
  - `TestDirectSessionScrollbackOverflow`: Confirms safe buffer truncation without panics or memory corruption.
- `internal/routes/files_test.go`:
  - `TestDownloadCwdWithSymlinks`: Confirms tar archive correctly represents symlink headers and extracts without error.
- Full regression suite:
  - `npm test`: All frontend and backend tests pass.

## Done criteria

- [ ] `go test -v ./internal/ws/... ./internal/terminal/... ./internal/routes/...` exits 0.
- [ ] `npm test` exits 0.
- [ ] Direct PTY buffer truncation handles inputs larger than `maxScrollbackBytes` without panicking.
- [ ] No files outside the in-scope list are modified (`git status`).

## STOP conditions

- If `coder/websocket` write lock introduces deadlocks during client disconnection, stop and report.
- If `tar.FileInfoHeader` fails on Windows symlink targets, stop and report.
- If any existing unit test fails, stop and report.

## Maintenance notes

- Any new routine that writes to `*websocket.Conn` must pass through `sendJSON` or `sendBinary` to maintain mutex serialization.
