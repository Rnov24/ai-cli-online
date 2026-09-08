# Plan 021: Workspace File Streaming Resilience, Binary Media Preview, and Filesystem Adaptive Sync

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ee6bce3..HEAD -- internal/routes/ web/src/components/WorkspaceFilesPanel.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/020-git-engine-hardening-root-diff-resolution-and-adaptive-sync.md
- **Category**: bug | perf | dx
- **Planned at**: commit `ee6bce3`, 2026-09-08

## Why this matters

The workspace file explorer and archive streaming endpoints allow users to navigate project code, inspect generated artifacts, and download workspace backups. However, `DownloadCwd` contained a critical file descriptor leak where `defer file.Close()` was called inside `filepath.Walk`, causing tarball generation on workspaces with many files to hit Android Termux's file limit (`EMFILE: too many open files`) and abort mid-stream. In addition, `GetFileContent` forced non-PDF binary files (PNG, JPG, WEBP, GIF, ICO) through `string(data)`, corrupting image byte sequences through UTF-8 replacement characters and breaking preview rendering in the UI. Furthermore, the Workspace Files panel lacked both a manual refresh button and adaptive directory polling, leaving file lists stale after terminal or CLI file generation.

Resolving these issues eliminates the tarball file descriptor leak, enables high-fidelity base64 image preview in the UI, and provides real-time adaptive filesystem synchronization.

## Current state

- `internal/routes/files.go:209-215`: `defer file.Close()` inside `filepath.Walk` closure leaks open file descriptors until the entire HTTP request completes.
- `internal/routes/files.go:381-389`: Only `.pdf` is handled as Base64; image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.ico`, `.bmp`) are decoded into UTF-8 strings, corrupting binary payloads.
- `web/src/components/WorkspaceFilesPanel.tsx:474-480`: Attempts to render binary image contents inside a markdown code block.
- `web/src/components/WorkspaceFilesPanel.tsx`: Lacks a Refresh button and does not poll directory state.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Go test | `go test -v ./internal/routes/...` | exit 0, all tests pass |
| Vitest | `npm test` | exit 0, all test suites pass |
| Full build | `npm run build` | exit 0, static binary built in `bin/ai-cli-online` |

## Scope

**In scope**:
- `internal/routes/files.go`
- `internal/routes/files_test.go`
- `web/src/components/WorkspaceFilesPanel.tsx`

**Out of scope**:
- Changing file upload limits or multipart parse mechanics.
- Altering the SQLite annotations or draft storage.

## Implementation Steps

### Step 1: Fix Tarball File Descriptor Leak and Binary Encoding
1. In `internal/routes/files.go`:
   - In `DownloadCwd`, remove `defer file.Close()` inside `filepath.Walk` and explicitly call `file.Close()` immediately after `io.Copy(tw, file)`.
   - In `GetFileContent`:
     - Expand binary extension recognition:
       ```go
       ext := strings.ToLower(filepath.Ext(resolved))
       isBinary := (ext == ".pdf" || ext == ".png" || ext == ".jpg" || ext == ".jpeg" ||
           ext == ".gif" || ext == ".webp" || ext == ".ico" || ext == ".bmp")
       ```
     - If `isBinary`, encode with `base64.StdEncoding.EncodeToString(data)` and set `encoding: "base64"`.
2. Verify: `go test ./internal/routes/...` passes.

### Step 2: Add Unit Tests for Tarball Streaming and Binary Content
1. In `internal/routes/files_test.go`:
   - Add `TestFileHandler_GetFileContent_Binary` testing PNG and PDF base64 encoding vs text UTF-8 encoding.
   - Add `TestFileHandler_DownloadCwd_NoDescriptorLeak` testing tarball generation across 20+ nested files and verifying valid tar.gz decompression.
2. Verify: `go test -v ./internal/routes/...` passes.

### Step 3: Implement Visual Image Preview and Adaptive Polling
1. In `web/src/components/WorkspaceFilesPanel.tsx`:
   - Import `RefreshCwIcon` from `./icons`.
   - Import `useAdaptivePolling` from `../hooks/useAdaptivePolling`.
   - Add a Refresh button in the navigation header toolbar.
   - Wire `useAdaptivePolling` to call `loadDirectory(currentPath)` every 8000ms when no file is actively selected/edited, pausing when tab is hidden.
   - In the file preview section:
     - Check if `selectedFile` has an image extension (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.ico`, `.bmp`).
     - If so, render an inline image element with `data:image/...;base64,...` (or raw SVG if `.svg`) centered with border, dimensions, and download button.
2. Verify with `npm test`.

### Step 4: Full Build and Verification
1. Run `npm test` (Web Vitest + Go tests).
2. Run `npm run build` to compile the frontend and Go static binary.
3. Update `plans/README.md` to mark Plan 021 `DONE`.

## Done criteria

- [ ] `DownloadCwd` explicitly closes file descriptors without leaking.
- [ ] `GetFileContent` returns base64 encoding for image and binary extensions.
- [ ] `internal/routes/files_test.go` has tests covering binary encoding and tarball generation.
- [ ] `WorkspaceFilesPanel.tsx` has image preview, refresh button, and `useAdaptivePolling`.
- [ ] `npm test` passes 100%.
- [ ] `npm run build` succeeds with exit code 0.
