# Plan 027: Task Pipeline Lifecycle Synchronization, Mobile Responsiveness, and Task Auto Session Termination Recovery

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cffa382..HEAD -- web/src/components/TaskPipelineBar.tsx web/src/components/TerminalPane.tsx internal/routes/task_auto.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/026-interactive-clarify-ux-dual-schema-and-modal-accessibility.md
- **Category**: correctness | ui | mobile | resilience
- **Planned at**: commit `cffa382`, 2026-09-08

## Why this matters

1. **State Desynchronization in Task Pipeline**: In `web/src/components/TaskPipelineBar.tsx`, `moduleInput` is initialized from `currentModule` via `useState(currentModule)` but never updates when the `currentModule` prop changes. When the active module changes from outside (e.g. task selection, switching branches, or `AutoTaskModal`), the input retains stale data.
2. **Missing Mobile Access to Lifecycle Skills**: In `web/src/components/TerminalPane.tsx`, `TaskPipelineBar` is wrapped in `className="desktop-only"`, completely hiding the 8-step lifecycle toolbar (`INIT`, `PLAN`, `RES`, `CHK`, `EXEC`, `VRFY`, `MRG`, `REPT`, `LIST`, `CANCEL`, `AUTO`) on mobile screens (< 768px). Because AGY Online is designed specifically for mobile and VPS workflows (including Android/Termux), mobile users should have touch-friendly access to the lifecycle pipeline bar.
3. **Ghost Task Lock on Session Crash / Termination**: In `internal/routes/task_auto.go`, `watchAutoLoop` polls every 2 seconds for `.auto-signal` and checks timeout, but never checks if `terminal.Exists(sessionName)` is still true. If a session crashes, exits, or is terminated by the OS / Android phantom process killer, the watcher runs for up to 30 minutes in the background, keeping the SQLite `task_auto` table locked in `running` status. Subsequent attempts to restart the task auto loop on that directory or session fail with HTTP 409 Conflict.
4. **Non-Atomic Stop File Writes**: `internal/routes/task_auto.go` writes `.auto-stop` via raw `os.WriteFile`, which can produce race conditions or partial reads. Upgrading to `files.AtomicWriteFile` guarantees clean writes across all termination triggers.

## Current state

- `web/src/components/TaskPipelineBar.tsx:22`:
```tsx
const [moduleInput, setModuleInput] = useState(currentModule);
```
No `useEffect` syncing `currentModule` when changed.
- `web/src/components/TaskPipelineBar.tsx:72-94`: The input field lacks an `onKeyDown` handler to submit on `Enter`.
- `web/src/components/TaskPipelineBar.tsx:48-66`: Lacks ARIA roles `role="toolbar"`, `role="group"`, and explicit touch target padding.
- `web/src/components/TerminalPane.tsx:418-422`:
```tsx
<div className="desktop-only">
  <TaskPipelineBar
    onRunSkill={(cmd) => setExternalCommand({ cmd, id: Date.now() })}
  />
</div>
```
- `internal/routes/task_auto.go:342-393`: `watchAutoLoop` lacks session existence check (`!terminal.Exists(sessionName)`) and directory existence check (`os.Stat(taskDir)`).
- `internal/routes/task_auto.go`: Writes `.auto-stop` with `os.WriteFile` instead of `files.AtomicWriteFile`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Unit test | `npm test`               | All Vitest and Go tests PASS |
| Build     | `npm run build`          | Exit code 0, TypeScript + Vite + Go binary compiled |

## Steps

### Step 1: Synchronize props, handle Enter, and enhance accessibility in `TaskPipelineBar.tsx`

1. Add `useEffect` to synchronize `moduleInput` when `currentModule` changes:
```tsx
useEffect(() => {
  setModuleInput(currentModule);
}, [currentModule]);
```
2. Add `onKeyDown` to the module input to trigger `handleAutoClick()` when `e.key === 'Enter'`.
3. Add accessibility attributes:
   - Root container: `role="toolbar"` and `aria-label="Task lifecycle pipeline"`.
   - Stepper container: `role="group"` and `aria-label="Lifecycle steps"`.
   - Actions container: `role="group"` and `aria-label="Task quick actions"`.
4. Refine styling for touch friendliness:
   - Ensure `touchAction: 'pan-x'`, `-webkit-overflow-scrolling: 'touch'`.
   - Ensure minimum 28px touch target heights.

### Step 2: Enable responsive mobile pipeline access in `TerminalPane.tsx`

1. In `web/src/components/TerminalPane.tsx`, replace `<div className="desktop-only">` around `TaskPipelineBar` with `<div style={{ flexShrink: 0, minWidth: 0, width: '100%' }}>`.
2. Ensure that on narrow screens, the horizontal scroll container allows smooth side-scrolling across the stepper and action buttons without clipping.

### Step 3: Implement session death and directory removal recovery in `task_auto.go`

1. In `internal/routes/task_auto.go`, update `watchAutoLoop`:
   - At each tick, check `if !terminal.Exists(sessionName)`:
     - Write `.auto-stop` with `reason: "session_terminated"` using `files.AtomicWriteFile`.
     - Remove `.auto-signal`.
     - Delete record from database.
     - Exit goroutine.
   - Check `if _, err := os.Stat(taskDir); os.IsNotExist(err)`:
     - Delete record from database and exit goroutine.
2. In `StopTaskAuto`, `CleanupSession`, and `RecoverOnStartup`, replace `os.WriteFile(stopPath, ...)` with `files.AtomicWriteFile(stopPath, ...)`.

### Step 4: Add comprehensive unit tests

1. Expand `web/src/components/TaskPipelineBar.test.tsx`:
   - Verify `currentModule` prop change updates input value.
   - Verify Enter key on input triggers auto loop command.
   - Verify `role="toolbar"` and `role="group"` accessibility roles.
2. Expand `internal/routes/task_auto_test.go`:
   - Test session termination recovery in `watchAutoLoop` or dead session unregistering.
   - Test atomic write of `.auto-stop`.

### Step 5: Verify all test gates and production build

1. Run `npm test` to ensure all 20+ web test suites (200+ tests) and all Go package tests pass cleanly.
2. Run `npm run build` to ensure clean Vite bundle and single Go static executable compilation.
3. Update `plans/README.md` row 027 to `DONE`.
4. Commit changes cleanly.

## STOP conditions

- If `npm test` fails any existing test suites, stop and investigate.
- If `npm run build` fails with TypeScript or Go compilation errors, stop and resolve before proceeding.
