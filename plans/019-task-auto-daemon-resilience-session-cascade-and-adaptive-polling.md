# Plan 019: Task-Auto Daemon Resilience, Full Lifecycle Session Cleanup, and Unified Mobile Adaptive Polling

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 479613b..HEAD -- internal/db/ internal/routes/ internal/server/ internal/ws/ web/src/components/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/017-native-task-auto-engine-and-lifecycle-monitoring.md, plans/018-antigravity-path-resilience-and-task-loop-shortcuts.md
- **Category**: tech-debt | bug | perf
- **Planned at**: commit `479613b`, 2026-09-08

## Why this matters

When an autonomous task is executed via `/auto` or `AutoTaskModal`, it tracks state across SQLite (`task_auto`) and runs a background watcher ticker. However, currently if a session is killed or the server restarts, `task_auto` records can become permanently orphaned zombies with status `running`, locking that task directory from future execution with `HTTP 409 Conflict`. Furthermore, killing a session does not cleanly disconnect active WebSockets or purge orphaned annotations. In the frontend, four components (`AutoTaskModal`, `PlanFileBrowser`, `SessionSidebar`, and `SystemDiagnosticsModal`) use uncoordinated raw `setInterval` timers that continue polling when the tab is backgrounded or the screen is locked, violating AGY Online's core mobile battery and VPS idle conservation principles.

Resolving these issues provides robust daemon crash/restart recovery, clean session deletion cascade, and strictly adaptive background polling across the entire application.

## Current state

- `internal/routes/sessions.go:45-57`: `KillSession` only invokes `terminal.Kill(sessionName)` and `s.db.DeleteDraft(sessionName)`. Active WebSockets remain open, running `task_auto` background watchers continue ticking in goroutines, `task_auto` DB records remain locked, and annotations remain in SQLite.
- `internal/routes/task_auto.go`: Has `StartTaskAuto` and `StopTaskAuto`, but no `RecoverOnStartup()` to resume live tasks or reap dead ones after server restart, and no `CleanupSession(sessionName)` method for session deletion.
- `internal/ws/handler.go`: `Hub` tracks connections in `h.connections`, but lacks a `CloseSession(sessionName)` method to cleanly evict clients on session destruction.
- `internal/db/db.go`: Has `DeleteDraft` and `SaveAnnotation`, but lacks `DeleteAnnotationsForSession(sessionName)`.
- `web/src/components/AutoTaskModal.tsx:69`: Raw `setInterval(pollStatus, 2000)` runs unconditionally when open.
- `web/src/components/PlanFileBrowser.tsx:75`: Raw `setInterval(loadFiles, 5000)` runs unconditionally.
- `web/src/components/SessionSidebar.tsx:589`: Raw `setInterval(fetchSessions, 10000)` runs unconditionally.
- `web/src/components/SystemDiagnosticsModal.tsx:39`: Raw `setInterval(refreshData, 5000)` runs unconditionally.
- Exemplar adaptive hook: `web/src/hooks/useAdaptivePolling.ts` properly pauses or adapts polling upon `document.visibilityState === 'hidden'`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Go test | `go test ./internal/...` | exit 0, all packages pass |
| Vitest | `npm test` | exit 0, all test suites pass |
| Full build | `npm run build` | exit 0, static binary built in `bin/ai-cli-online` |

## Scope

**In scope**:
- `internal/db/db.go` & `internal/db/db_test.go`
- `internal/ws/handler.go`
- `internal/routes/task_auto.go` & `internal/routes/task_auto_test.go`
- `internal/routes/sessions.go` & `internal/routes/routes_test.go`
- `internal/server/server.go`
- `web/src/components/AutoTaskModal.tsx`
- `web/src/components/PlanFileBrowser.tsx`
- `web/src/components/SessionSidebar.tsx`
- `web/src/components/SystemDiagnosticsModal.tsx`

**Out of scope**:
- Direct modifications to SQLite schema migrations or schema altering statements.
- Altering the public REST API request/response contracts for `/api/sessions/{sessionId}/task-auto` or `/api/sessions`.

## Implementation Steps

### Step 1: Add DB and Hub Cleanup Primitives
1. In `internal/db/db.go`, implement:
   ```go
   func (d *DB) DeleteAnnotationsForSession(sessionName string) error {
       _, err := d.db.Exec("DELETE FROM annotations WHERE session_name = ?", sessionName)
       return err
   }
   ```
2. In `internal/db/db_test.go`, add unit test verifying saving multiple annotations and deleting them by session.
3. In `internal/ws/handler.go`, implement:
   ```go
   func (h *Hub) CloseSession(sessionName string) {
       h.mu.Lock()
       defer h.mu.Unlock()
       if conn, ok := h.connections[sessionName]; ok {
           _ = conn.Close(websocket.StatusCode(4004), "Session terminated")
           delete(h.connections, sessionName)
           idle.GetManager().OnConnectionCountChange(len(h.connections))
       }
   }
   ```
4. Verify: `go test ./internal/db/... ./internal/ws/...` passes.

### Step 2: Implement TaskAuto Startup Recovery and Session Cleanup
1. In `internal/routes/task_auto.go`:
   - Implement `CleanupSession(sessionName string)`:
     - Cancel any active watcher context.
     - If record exists in DB: write `.auto-stop` with `reason: "session_killed"`, remove `.auto-signal`, and delete record from DB.
   - Implement `RecoverOnStartup()`:
     - Query `h.db.ListRunningTaskAuto()`.
     - For each record:
       - Check `terminal.Exists(rec.SessionName)`.
       - If session does not exist: write `.auto-stop` with `reason: "server_restart_session_dead"`, remove `.auto-signal`, delete `task_auto` record.
       - If session exists: check elapsed time against `rec.TimeoutMinutes`. If timed out, write `.auto-stop` and delete. If still within timeout, spawn `ctx, cancel := context.WithCancel(context.Background())`, register watcher, and start `watchAutoLoop(ctx, rec.SessionName, rec.TaskDir, rec.MaxIterations, rec.TimeoutMinutes, parsedStartedAt)`.
2. In `internal/routes/task_auto_test.go`, add tests for `CleanupSession` and `RecoverOnStartup`.
3. Verify: `go test ./internal/routes/...` passes.

### Step 3: Cascade Session Deletion in SessionHandler & Wire Startup Recovery in Server
1. In `internal/routes/sessions.go`:
   - Update `SessionHandler` struct to accept `taskAuto *TaskAutoHandler`.
   - In `KillSession`:
     - If `s.taskAuto != nil`, call `s.taskAuto.CleanupSession(sessionName)`.
     - Call `ws.GetHub().CloseSession(sessionName)`.
     - Call `s.db.DeleteDraft(sessionName)`.
     - Call `s.db.DeleteAnnotationsForSession(sessionName)`.
     - Call `terminal.Kill(sessionName)`.
2. In `internal/server/server.go`:
   - Update `routes.NewSessionHandler(auth, s.db, autoH)`.
   - Call `autoH.RecoverOnStartup()` after database and workspace initialization.
3. Verify: `go test ./internal/...` passes.

### Step 4: Unify Mobile Adaptive Polling in Web Components
1. In `web/src/components/AutoTaskModal.tsx`:
   - Replace raw `setInterval` with `useAdaptivePolling(pollStatus, { intervalMs: 2000, enabled: isOpen })`.
2. In `web/src/components/PlanFileBrowser.tsx`:
   - Replace raw `setInterval` with `useAdaptivePolling(loadFiles, { intervalMs: 5000 })`.
3. In `web/src/components/SessionSidebar.tsx`:
   - Replace raw `setInterval` with `useAdaptivePolling(fetchSessions, { intervalMs: 10000, enabled: sidebarOpen })`.
4. In `web/src/components/SystemDiagnosticsModal.tsx`:
   - Replace raw `setInterval` with `useAdaptivePolling(refreshData, { intervalMs: 5000, enabled: isOpen })`.
5. Run Vitest: `npm test` to verify all components and mock timers pass without regression.

### Step 5: Full Build and Verification
1. Run `npm test` (Vitest suites + Go tests).
2. Run `npm run build` to compile the frontend and Go static binary.
3. Update `plans/README.md` to mark Plan 019 `DONE`.

## Done criteria

- [ ] `internal/db/db.go` has `DeleteAnnotationsForSession` covered by unit tests.
- [ ] `internal/ws/handler.go` has `CloseSession` cleanly disconnecting clients.
- [ ] `internal/routes/task_auto.go` has `RecoverOnStartup` and `CleanupSession`.
- [ ] `internal/routes/sessions.go` cascade deletes terminal, task auto, annotations, drafts, and websocket connections.
- [ ] `internal/server/server.go` invokes startup recovery.
- [ ] Four frontend components (`AutoTaskModal`, `PlanFileBrowser`, `SessionSidebar`, `SystemDiagnosticsModal`) use `useAdaptivePolling`.
- [ ] `npm test` passes 100%.
- [ ] `npm run build` succeeds with exit code 0.
