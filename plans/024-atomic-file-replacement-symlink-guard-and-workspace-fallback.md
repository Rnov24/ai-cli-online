# Plan 024: Atomic File Replacement, Symlink Traversal Protection for New Paths, and Workspace Fallback Hardening

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0461668..HEAD -- internal/files/ internal/routes/editor.go internal/pid/pid.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/023-chat-stream-throttle-linear-turn-indexing-and-quota-resilience.md
- **Category**: security | bug | dx
- **Planned at**: commit `0461668`, 2026-09-08

## Why this matters

Directly writing to destination files with `os.WriteFile` truncates existing content before writing new bytes. If a write operation is interrupted by a power failure, network termination, or the Android Phantom Process Killer, the destination file is left zero-byte truncated or corrupted. Implementing `AtomicWriteFile` ensures data is written to a temporary sibling file, flushed, and swapped atomically via `os.Rename`. In addition, `ValidateNewPath` currently checks lexical containment without evaluating parent directory symlinks, which could allow path traversal if an ancestor directory is a symlink pointing outside the workspace. Finally, adding user home directory fallback to `WriteFileContent` aligns it with `GetFileContent`, allowing seamless document editing in both home and project workspaces.

## Current state

- `internal/routes/editor.go:159, 202`: Direct `os.WriteFile` calls over destination files:
```go
if err := os.WriteFile(targetFile, data, 0644); err != nil {
// ...
if err := os.WriteFile(resolved, []byte(req.Content), 0644); err != nil {
```
- `internal/files/files.go:130-146`: `ValidateNewPath` does not evaluate parent directory symlinks:
```go
func ValidateNewPath(requested, baseCwd string) (string, error) {
	target := requested
	if !filepath.IsAbs(target) {
		target = filepath.Join(baseCwd, target)
	}
	target = filepath.Clean(target)

	realBase, err := filepath.EvalSymlinks(baseCwd)
	if err != nil {
		realBase = baseCwd
	}

	if !isContainedIn(target, realBase) {
		return "", errors.New("path traversal forbidden")
	}
	return target, nil
}
```
- `internal/routes/editor.go:189-195`: Only validates against `cwd` without checking `os.UserHomeDir()`, unlike `GetFileContent` in `internal/routes/files.go`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `go test -v ./internal/...` | all pass         |
| Build     | `npm run build`          | exit 0              |

## Scope

**In scope**:
- `internal/files/files.go`
- `internal/files/files_test.go`
- `internal/routes/editor.go`
- `internal/routes/routes_test.go`
- `internal/pid/pid.go`
- `plans/README.md`

**Out of scope**:
- Changing binary archive streaming in `DownloadCwd` (`tar.gz`).
- Modifying SQLite database persistence logic in `internal/db/`.

## Step-by-step implementation

### Step 1: Implement `AtomicWriteFile` in `internal/files/files.go`
1. Add `AtomicWriteFile(filePath string, data []byte, perm os.FileMode) error`:
   - Determine `dir := filepath.Dir(filePath)`.
   - Create sibling temporary file via `os.CreateTemp(dir, ".tmp-"+filepath.Base(filePath)+"-*")`.
   - Set permissions, write bytes, call `.Sync()`, and close before `os.Rename`.
   - On any failure prior to rename, clean up the temporary file via `defer os.Remove(tmpName)`.
   - If `os.CreateTemp` fails (e.g. read-only parent or restriction), gracefully fall back to `os.WriteFile`.

### Step 2: Harden `ValidateNewPath` against parent directory symlinks
1. In `internal/files/files.go`:
   - In `ValidateNewPath`, evaluate `realParent, err := filepath.EvalSymlinks(filepath.Dir(target))`.
   - If parent directory exists, verify `isContainedIn(realParent, realBase)`.
   - Return error if the parent symlink escapes `realBase`.

### Step 3: Upgrade `WriteFileContent` and `SaveTaskAnnotations`
1. In `internal/routes/editor.go`:
   - Replace `os.WriteFile` with `files.AtomicWriteFile`.
   - In `WriteFileContent`, if `files.ValidatePath(req.Path, cwd)` fails, attempt fallback against `os.UserHomeDir()`.

### Step 4: Upgrade PID file writing in `internal/pid/pid.go`
1. In `internal/pid/pid.go`:
   - Write PID files using atomic temporary write and rename pattern to prevent partial PID records.

### Step 5: Unit testing, build, and documentation
1. Add unit tests in `internal/files/files_test.go` for `AtomicWriteFile` and `ValidateNewPath` with symlinks.
2. Add tests in `internal/routes/routes_test.go` for home directory fallback in `WriteFileContent`.
3. Run `npm test` and `npm run build`.
4. Update `plans/README.md` marking Plan 024 as `DONE`.
5. Commit with message: `feat(files): atomic write replacement, symlink traversal guard, and workspace fallback`.

## Verification gates

```bash
# Gate 1: Go unit tests pass
go test -v ./internal/files/... ./internal/routes/... ./internal/pid/...

# Gate 2: Full build succeeds
npm run build
```

## STOP conditions

- If `os.Rename` fails across mount boundaries on Termux `/data` vs `/sdcard`, verify temp directory uses `filepath.Dir(filePath)`.
