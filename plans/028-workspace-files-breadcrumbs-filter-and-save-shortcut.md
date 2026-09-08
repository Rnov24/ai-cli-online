# Plan 028: Workspace File Explorer Breadcrumb Navigation, Quick Filter, and Save Shortcut Hardening

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ec75528..HEAD -- web/src/components/WorkspaceFilesPanel.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/027-task-pipeline-sync-mobile-responsiveness-and-auto-engine-recovery.md
- **Category**: correctness | ui | accessibility | ergonomics
- **Planned at**: commit `ec75528`, 2026-09-08

## Why this matters

1. **Static Non-Clickable Breadcrumbs**: In `web/src/components/WorkspaceFilesPanel.tsx:232-245`, navigating through nested directories renders the directory path as a monolithic static string (`/{currentPath}`). When inspecting deeply nested folders (e.g. `web/src/components/modals`), returning to an intermediate directory requires repeated manual "Up" button presses rather than clicking the desired path segment.
2. **Missing Real-Time File Filtering**: In codebases with tens or hundreds of files per folder, finding a specific file requires linear visual scanning and manual scrolling. A real-time filter bar with case-insensitive matching dramatically speeds up workspace navigation.
3. **Missing `Ctrl+S` / `Cmd+S` and `Escape` Keyboard Handlers in File Editor**: When editing documents in the file preview pane, pressing `Ctrl+S` or `Cmd+S` invokes the browser's default "Save Page As" dialog rather than saving the active file buffer. Adding keyboard shortcut handling for save (`Ctrl+S`/`Cmd+S`) and dismiss/revert (`Escape`) is essential developer ergonomics.
4. **Missing Test Coverage**: `WorkspaceFilesPanel.tsx` currently has zero dedicated unit tests, leaving directory navigation, file preview, editing, and error recovery untested against regressions.

## Current state

- `web/src/components/WorkspaceFilesPanel.tsx:232-245`: Renders single monolithic string `/{currentPath}`.
- `web/src/components/WorkspaceFilesPanel.tsx`: No filter input or file search mechanism.
- `web/src/components/WorkspaceFilesPanel.tsx:522-542`: The edit `textarea` has no `onKeyDown` handler for `Ctrl+S` or `Escape`.
- `web/src/components/WorkspaceFilesPanel.test.tsx`: Does not exist.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Unit test | `npm test`               | All Vitest and Go tests PASS |
| Build     | `npm run build`          | Exit code 0, TypeScript + Vite + Go binary compiled |

## Steps

### Step 1: Implement interactive segmented breadcrumb navigation

1. In `web/src/components/WorkspaceFilesPanel.tsx`, parse `currentPath` into segments:
   - Root segment: label `~` or `/`, clicking navigates to `""`.
   - Subsequent segments: clicking segment at index `i` navigates to `parts.slice(0, i + 1).join('/')`.
   - Highlight the leaf directory with bright text.
   - Retain the quick "⮤ Up" button when `currentPath` is non-empty.

### Step 2: Implement quick filter bar for directory entries

1. Add state `filterText` (`string`, defaults to `''`). Reset `filterText` when navigating between directories (`loadDirectory`).
2. Add a search/filter input in the subheader:
   - Placeholder: `"Filter files..."`
   - ARIA label: `"Filter files in current directory"`
   - Clear button `×` when `filterText` is non-empty.
3. Compute filtered entries:
   ```ts
   const filteredEntries = filterText.trim()
     ? entries.filter(e => e.name.toLowerCase().includes(filterText.trim().toLowerCase()))
     : entries;
   ```
4. Render empty filter state when entries match 0 items: `"No matching files for '<filterText>'"` with a "Clear filter" button.

### Step 3: Implement `Ctrl+S` / `Cmd+S` save and `Escape` dismiss shortcuts

1. In the editor `textarea`, attach `onKeyDown`:
   - If `(e.ctrlKey || e.metaKey) && e.key === 's'`, call `e.preventDefault(); handleSaveFile();`.
   - If `e.key === 'Escape'`, call `e.preventDefault(); setIsEditing(false); setEditContent(fileContent || '');`.
2. Add global keydown listener when preview is open:
   - If `selectedFile && !isEditing && e.key === 'Escape'`, close the preview (`setSelectedFile(null); setFileContent(null);`).

### Step 4: Author comprehensive unit test suite in `WorkspaceFilesPanel.test.tsx`

1. Create `web/src/components/WorkspaceFilesPanel.test.tsx` testing:
   - Renders file entries and directory indicators.
   - Navigates to subdirectories and updates breadcrumb segments.
   - Clicks intermediate breadcrumb to jump directly to parent directory.
   - Filters files in real-time with case-insensitive matching and clears filter.
   - Opens file preview and enters edit mode.
   - Saves file with `Ctrl+S` keydown.
   - Reverts and cancels edit on `Escape`.

### Step 5: Verify test suites, build, and commit

1. Run `npm test` to ensure all 21 web test suites and Go packages pass.
2. Run `npm run build` to verify clean bundle and binary generation.
3. Update `plans/README.md` row 028 to `DONE`.
4. Stage and commit changes cleanly.

## STOP conditions

- If any existing tests fail in `npm test`, stop and resolve before proceeding.
- If TypeScript compilation or Vite build fails, stop and resolve.
