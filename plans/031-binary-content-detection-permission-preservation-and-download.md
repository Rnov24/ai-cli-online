# Plan 031: Content-Based Binary Detection, File Permission Preservation, and Binary Download UX

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 527826c..HEAD -- internal/routes/files.go internal/routes/editor.go web/src/components/WorkspaceFilesPanel.tsx internal/routes/files_test.go internal/routes/routes_test.go web/src/components/WorkspaceFilesPanel.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/030-terminal-pty-zombie-reaping-and-winsize-sanitization.md
- **Category**: correctness | security | ui | dx
- **Planned at**: commit `527826c`, 2026-09-08

## Why this matters

1. **JSON Corruption & Prism Crashes on Non-Image Binary Files**: In `internal/routes/files.go:381-390`, `GetFileContent` only checks image extensions (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.ico`, `.bmp`) and `.pdf`. If a developer opens a binary database (`.sqlite`, `.db`), WebAssembly module (`.wasm`), archive (`.zip`, `.tar.gz`), compiled binary, or arbitrary data file containing null bytes, the backend treats it as UTF-8 (`content = string(data)`). This generates invalid UTF-8 in JSON responses and causes `WorkspaceFilesPanel.tsx` to attempt syntax highlighting on binary gibberish, freezing or crashing the UI.
2. **Loss of Executable Permissions on Save**: In `internal/routes/editor.go:208`, `WriteFileContent` hardcodes file permissions to `0644` in `files.AtomicWriteFile(resolved, []byte(req.Content), 0644)`. When a developer edits a script (`start.sh`, build script, git hook) in the workspace editor, the executable bit (`+x` / `0755`) is silently stripped, breaking builds and terminal execution.
3. **Missing Binary Download Action in Preview**: When `WorkspaceFilesPanel.tsx` displays the binary file preview message ("Binary file preview is not supported for this file type"), it does not offer a direct download button. Users must navigate back to the file list to download the file.

## Current state

- `internal/routes/files.go:381-390`: Only detects 8 image/pdf extensions; does not check binary signatures or extended binary extensions.
- `internal/routes/editor.go:208`: Hardcodes `0644` in `files.AtomicWriteFile`, ignoring `fi.Mode().Perm()`.
- `web/src/components/WorkspaceFilesPanel.tsx:738-753`: Binary file preview card has no download button.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Unit test | `npm test`               | All Vitest and Go tests PASS |
| Build     | `npm run build`          | Exit code 0, single Go static binary compiled |

## Steps

### Step 1: Add content-based binary detection in `internal/routes/files.go`

1. Define `isBinaryContent(data []byte) bool`:
   - Inspect up to the first 512 bytes for null bytes (`0x00`).
2. Update `GetFileContent` in `internal/routes/files.go`:
   - Expand binary extension set to include archives, databases, compiled binaries, and media.
   - Combine with `isBinaryContent(data)`.
   - Encode binary payload as base64 and set `encoding = "base64"`.

### Step 2: Preserve original file permissions in `internal/routes/editor.go`

1. In `WriteFileContent`:
   - Read `perm := fi.Mode().Perm()`.
   - If `perm == 0`, fallback to `0644`.
   - Pass `perm` to `files.AtomicWriteFile(resolved, []byte(req.Content), perm)`.

### Step 3: Enhance binary file preview and download in `web/src/components/WorkspaceFilesPanel.tsx`

1. Import `DownloadIcon` from `./icons`.
2. In preview header, when `fileEncoding === 'base64'`, add a download button.
3. Inside the unsupported binary preview placeholder card, add a "Download File" button invoking `handleDownloadItem(selectedFile)`.

### Step 4: Add unit tests

1. In `internal/routes/files_test.go`:
   - Add test case in `TestFileHandler_GetFileContent` verifying that binary files (with null bytes or `.bin` extension) are returned with `encoding: "base64"`.
2. In `internal/routes/routes_test.go`:
   - Add test case in `TestWriteFileContent_PathValidation` verifying that writing to a `0755` executable file preserves `0755` permissions.
3. In `web/src/components/WorkspaceFilesPanel.test.tsx`:
   - Add test case verifying binary file rendering with "Download File" button and action trigger.

### Step 5: Verify all test gates and production build

1. Run `npm test`.
2. Run `npm run build`.
3. Update `plans/README.md` row 031 to `DONE`.
4. Commit changes cleanly.

## STOP conditions

- If any existing tests fail, stop and resolve before proceeding.
- If Vite or TypeScript build fails, stop and resolve.
