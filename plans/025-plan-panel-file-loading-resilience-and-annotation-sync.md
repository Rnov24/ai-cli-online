# Plan 025: Plan Panel File Loading Resilience, REST Fallback, and Task Annotation Synchronization

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 900bf51..HEAD -- web/src/components/PlanPanel.tsx web/src/components/TerminalPane.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/024-atomic-file-replacement-symlink-guard-and-workspace-fallback.md
- **Category**: correctness | bug | ui
- **Planned at**: commit `900bf51`, 2026-09-08

## Why this matters

The Plan panel is a cornerstone of AGY Online, enabling developers to review AI task plans, annotate edits, diff suggestions, and track the `ai-cli-task` lifecycle. However, `PlanPanel.tsx` currently relies solely on `onRequestFileStream` via WebSocket and the `fileStreamBus` event bus. Because `TerminalPane.tsx` does not supply `onRequestFileStream` and no active subsystem dispatches to `fileStreamBus`, selecting any `.plan.md` or task file traps the user in an indefinite "Loading <file>..." spinner with no document displayed. Furthermore, the adaptive polling hook requires `planMarkdown` to already be non-empty, preventing it from ever recovering. Supplying resilient REST loading via `fetchFileContent`, error/retry states, adaptive polling synchronization, and unit test coverage restores full Plan panel functionality.

## Current state

- `web/src/components/PlanPanel.tsx:178-197`: Initiates streaming and waits for `fileStream.state.status === 'complete'`, which never arrives because `onRequestFileStream` is undefined:
```tsx
  // Request file stream once WS is connected and planSelectedFile is known
  useEffect(() => {
    if (!planSelectedFile || !connected) return;
    if (planStreamedRef.current === planSelectedFile && planMarkdown) return;
    planStreamedRef.current = planSelectedFile;
    fileStream.reset();
    fileStream.startStream('content');
    onRequestFileStream?.(planSelectedFile);
  }, [planSelectedFile, connected]);
```
- `web/src/components/PlanPanel.tsx:200-213`: Polling aborts if `!planMarkdown`, preventing background recovery:
```tsx
  useAdaptivePolling(
    useCallback(async () => {
      if (!planSelectedFile || !connected || !planMarkdown || !planMtimeRef.current) return;
      try {
        const result = await fetchFileContent(token, sessionId, planSelectedFile, planMtimeRef.current);
        if (result) {
          setPlanMarkdown(result.content);
          planMtimeRef.current = result.mtime;
        }
      } catch { /* ignore network errors */ }
    }, [planSelectedFile, connected, planMarkdown, token, sessionId]),
    { intervalMs: 3000, backgroundIntervalMs: 0, enabled: Boolean(planSelectedFile && connected && planMarkdown) },
  );
```
- `web/src/components/PlanPanel.tsx:570-572`: Renders persistent `CenteredLoading` when `!planMarkdown` and `status === 'streaming'`:
```tsx
  ) : planSelectedFile && (!planMarkdown && (fileStream.state.status === 'streaming' || fileStream.state.status === 'idle')) ? (
    <CenteredLoading label={`Loading ${planSelectedFile.split('/').pop()}...`} ... />
```
- `web/src/components/PlanPanel.test.tsx`: Missing entirely; no automated tests verify Plan panel file loading or lifecycle display.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Unit test | `npm test`               | All Vitest and Go tests PASS |
| Build     | `npm run build`          | Exit code 0, TypeScript + Vite + Go binary compiled |

## Steps

### Step 1: Implement direct REST file loading and error/retry state in `PlanPanel.tsx`

Add an explicit `loadSelectedPlanFile` function in `web/src/components/PlanPanel.tsx` that:
1. Calls `fetchFileContent(token, sessionId, planSelectedFile)` directly.
2. Updates `planMarkdown` and `planMtimeRef.current` with the returned content and mtime.
3. Maintains `fileLoadError: string | null` and `fileLoading: boolean` state.
4. If `onRequestFileStream` is provided, invokes it; if not provided, relies cleanly on `fetchFileContent`.
5. When file loading fails, displays an error message with a "Retry" button.

### Step 2: Unblock adaptive polling in `PlanPanel.tsx`

Update the `useAdaptivePolling` hook for file content in `PlanPanel.tsx` to:
1. Check `if (!planSelectedFile || !connected) return;`.
2. Pass `planMtimeRef.current || undefined` so that if `planMarkdown` is empty, it still fetches the file.
3. On successful fetch, update `planMarkdown`, `planMtimeRef.current`, and clear `fileLoadError`.

### Step 3: Implement refresh handler resilience in `PlanPanel.tsx`

Update `handlePlanRefresh` in `PlanPanel.tsx` to:
1. Re-invoke `loadSelectedPlanFile(planSelectedFile)` directly.
2. Clear any stale errors and re-sync `planMtimeRef.current`.

### Step 4: Add comprehensive tests in `PlanPanel.test.tsx`

Create `web/src/components/PlanPanel.test.tsx` using `@testing-library/react` and Vitest:
1. Test auto-detection of `AiTasks/` directory from `fetchFiles`.
2. Test selecting a file loads content via `fetchFileContent` and displays the annotation renderer / markdown.
3. Test handling file fetch error and clicking Retry to reload.
4. Test task meta `.index.json` and `.auto-signal` status rendering in the bottom status bar.

### Step 5: Verification and Build Gate

1. Run `npm test` — all web tests and Go tests must pass.
2. Run `npm run build` — full compile must succeed.
3. Update `plans/README.md` row 025 to `DONE`.

## Out of scope

- Rewriting `PlanAnnotationRenderer.tsx` internal parsing (already solid and functional).
- Altering the backend `GET /api/sessions/:sessionId/file-content` endpoint.
- Changing `PlanFileBrowser.tsx` tree navigation logic.

## STOP conditions

- If `fetchFileContent` signature or return type is altered.
- If existing test suites fail unexpectedly.
