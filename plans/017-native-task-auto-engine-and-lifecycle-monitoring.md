# Plan 017: Native Task Auto Engine and Lifecycle Monitoring

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 954114f..HEAD -- internal/db/ internal/routes/ internal/server/ web/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `954114f`, 2026-09-08

## Why this matters

The core architectural promise of AGY Online (`AGENTS.md` and `GEMINI.md`) is autonomous AI task execution via the `ai-cli-task` lifecycle. The specification defines a backend daemon engine with a dedicated SQLite `task_auto` table, signal-file monitoring (`.auto-signal`), stop triggers (`.auto-stop`), and REST endpoints (`/api/sessions/:id/task-auto` and `/api/task-auto/lookup`).

Currently, the native Go server lacks this engine and routes entirely, and the frontend simply sends raw text without configuration or progress observability. Implementing this engine delivers a fully operational autonomous loop with timeout limits, iteration caps, graceful stop requests, and real-time frontend monitoring.

## Current state

- `internal/db/db.go:72-138`: Defines SQLite schema for drafts, settings, annotations, workspaces, and turn journal, but lacks `task_auto`.
- `internal/server/server.go:65-146`: Routes registry has no `task-auto` routes.
- `web/src/components/TaskPipelineBar.tsx:154-171`: Clicking AUTO // LOOP simply executes `onRunSkill('/auto')` without allowing parameter configuration (`maxIterations`, `timeoutMinutes`) or showing progress.
- `web/src/components/PlanPanel.tsx:623-637`: Has basic display for `autoSignal` if read from file, but lacks stop controls and daemon status polling.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Go Tests | `go test -v ./internal/db ./internal/routes` | all pass, exit 0 |
| Frontend Tests | `npm run test --workspace=web` | all pass, exit 0 |
| All Tests | `npm test` | all pass, exit 0 |
| Web Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `internal/db/db.go`
- `internal/db/task_auto.go`
- `internal/db/task_auto_test.go`
- `internal/routes/task_auto.go`
- `internal/routes/task_auto_test.go`
- `internal/server/server.go`
- `web/src/api/taskAuto.ts`
- `web/src/components/AutoTaskModal.tsx`
- `web/src/components/AutoTaskModal.test.tsx`
- `web/src/components/TaskPipelineBar.tsx`
- `web/src/components/PlanPanel.tsx`
- `plans/README.md`

**Out of scope**:
- Direct modifications to external Antigravity CLI binary `agy`.
- Modifying `ai-cli-task` skill definitions in `~/.gemini/config/plugins/ai-cli-task`.

## Git workflow

- Branch: `main`
- Commit message convention: `feat(task-auto): implement native task-auto engine and web lifecycle monitoring`

## Steps

### Step 1: SQLite Schema & CRUD in `internal/db`
1. In `internal/db/db.go`, add table `task_auto`:
   ```sql
   CREATE TABLE IF NOT EXISTS task_auto (
     session_name TEXT PRIMARY KEY,
     task_dir TEXT NOT NULL UNIQUE,
     status TEXT DEFAULT 'running',
     max_iterations INTEGER DEFAULT 20,
     timeout_minutes INTEGER DEFAULT 30,
     iteration_count INTEGER DEFAULT 0,
     recovery_count_step INTEGER DEFAULT 0,
     recovery_count_total INTEGER DEFAULT 0,
     last_capture_hash TEXT DEFAULT '',
     stall_count INTEGER DEFAULT 0,
     quota_wait_since TEXT DEFAULT '',
     started_at TEXT,
     last_signal_at TEXT
   );
   ```
2. Implement DB methods in `internal/db/task_auto.go`:
   - `UpsertTaskAuto(entry *TaskAutoRecord) error`
   - `GetTaskAuto(sessionName string) (*TaskAutoRecord, error)`
   - `GetTaskAutoByDir(taskDir string) (*TaskAutoRecord, error)`
   - `UpdateTaskAutoSignal(sessionName string, iteration int, timestamp string) error`
   - `DeleteTaskAuto(sessionName string) error`
   - `DeleteTaskAutoByDir(taskDir string) error`
3. Add unit test `internal/db/task_auto_test.go` verifying all CRUD operations.
**Verify**: `go test -v ./internal/db` -> PASS.

### Step 2: Backend REST Handler in `internal/routes/task_auto.go`
1. Implement `TaskAutoHandler`:
   - `POST /api/sessions/{sessionId}/task-auto`:
     - Accepts JSON `{ "taskDir": string, "maxIterations": number, "timeoutMinutes": number }`.
     - Validates session and task directory exist.
     - Checks for conflict (session or directory already has active auto task).
     - Inserts `task_auto` row.
     - Dispatches command `agy "/auto <taskDir>"` to the session's PTY.
     - Starts background watcher that monitors `.auto-signal` and enforces `maxIterations` & `timeoutMinutes`.
   - `DELETE /api/sessions/{sessionId}/task-auto`:
     - Writes `.auto-stop` into `taskDir` with `reason: "user_stop"`.
     - Deletes `task_auto` row.
   - `GET /api/sessions/{sessionId}/task-auto`:
     - Returns active status, elapsed seconds, current signal, and progress.
   - `GET /api/task-auto/lookup`:
     - Queries session running auto for `taskDir` query parameter.
2. Register endpoints in `internal/server/server.go`.
3. Add unit test suite in `internal/routes/task_auto_test.go`.
**Verify**: `go test -v ./internal/routes` -> PASS.

### Step 3: Frontend API & AutoTaskModal in React
1. Create `web/src/api/taskAuto.ts`:
   - `startTaskAuto(token, sessionId, params)`
   - `stopTaskAuto(token, sessionId)`
   - `getTaskAutoStatus(token, sessionId)`
   - `lookupTaskAuto(token, taskDir)`
2. Create `web/src/components/AutoTaskModal.tsx`:
   - Modal dialog for configuring `maxIterations` (default 20) and `timeoutMinutes` (default 30).
   - Shows task directory, current lifecycle state, iteration limits.
   - If running, displays active iteration count, elapsed time, current step indicator, and "Stop Auto Loop" button.
3. Connect `TaskPipelineBar.tsx` and `PlanPanel.tsx` to open `AutoTaskModal`.
4. Add unit test in `web/src/components/AutoTaskModal.test.tsx`.
**Verify**: `npm run test --workspace=web` -> PASS.

### Step 4: Verification, Full Build & Status Update
1. Run full test suite: `npm test`.
2. Build web assets and Go binary: `npm run build`.
3. Update `plans/README.md` setting Plan 017 to `DONE`.

## Done criteria

- [ ] `go test -v ./internal/db ./internal/routes` exits 0 with new tests passing
- [ ] `npm run test --workspace=web` exits 0 with `AutoTaskModal` tests passing
- [ ] `npm run build` exits 0 and produces single static executable `./bin/ai-cli-online`
- [ ] `plans/README.md` status table updated with Plan 017 marked DONE
- [ ] No git drift outside specified scope

## STOP conditions

- If SQLite `task_auto` schema violates modernc pure-Go SQLite constraints.
- If existing terminal session dispatch mechanism is incompatible with tmux / direct PTY sessions.
