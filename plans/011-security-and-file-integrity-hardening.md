# Plan 011: Security & File Integrity Hardening

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b03c93a..HEAD -- internal/routes/files.go internal/routes/system.go internal/routes/editor.go internal/server/server.go web/src/components/MarkdownRenderer.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b03c93a`, 2026-09-06

## Why this matters

The audit identified four high-priority security defects across the file management, markdown rendering, editor, and system introspection subsystems. Most critically, calling `DELETE /api/sessions/:sessionId/rm` with `.` or `./` currently resolves to the session's `cwd` and invokes `os.RemoveAll(cwd)`, completely purging the user's project or home directory from disk. Concurrently, `MarkdownRenderer.tsx` permits the dangerous `'onclick'` attribute in DOMPurify's global configuration to support an inline copy button, exposing users to Cross-Site Scripting (XSS) from LLM output or external tool data. Furthermore, system introspection routes lack authentication, and editor writes rely on flawed string prefix checks. This plan remediates all four vulnerabilities with zero breaking changes to existing client APIs.

## Current state

- `internal/routes/files.go:287-302`: `Rm` handler accepts `req.Path`, resolves via `files.ValidatePath(req.Path, cwd)`, and calls `os.RemoveAll(resolved)`. Since `ValidatePath` permits `targetClean == baseClean`, `.` resolves to `cwd`, allowing total deletion of the workspace root.
- `web/src/components/MarkdownRenderer.tsx:121-144`: HTML string template contains inline `onclick="..."` on `.code-copy-btn`, and DOMPurify config includes `ADD_ATTR: ['onclick', 'data-code', ...]`. This disables DOMPurify's event handler sanitizer for any markdown rendered in the app.
- `internal/routes/system.go:78-201`: `HandleSystemStatus`, `HandleProcessList`, and `HandleSystemLogs` are standalone HTTP handler functions that do not verify `auth.CheckAuth(r)`.
- `internal/server/server.go:96-98`: Routes `GET /api/system/status`, `GET /api/system/processes`, and `GET /api/system/logs` are registered directly without an `AuthHelper` instance.
- `internal/routes/editor.go:196-200`: `WriteFileContent` uses hand-rolled `!strings.HasPrefix(resolved, cwd) && !strings.Contains(resolved, "/AiTasks/")`, permitting sibling prefix collisions and path containment bypasses.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Go Tests | `go test -v ./internal/routes/... ./internal/files/...` | PASS, exit 0 |
| Web Tests | `npm run test --workspace=web` | all pass, exit 0 |
| All Tests | `npm test` | all pass, exit 0 |
| Web Typecheck | `npx tsc --noEmit` (in `web/`) | exit 0, no errors |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `internal/routes/files.go`
- `internal/routes/files_test.go`
- `internal/routes/system.go`
- `internal/routes/editor.go`
- `internal/routes/routes_test.go`
- `internal/server/server.go`
- `web/src/components/MarkdownRenderer.tsx`
- `web/src/components/MarkdownRenderer.test.tsx`

**Out of scope**:
- Direct PTY stream logic (`internal/terminal/...`).
- WebSocket hub framing (`internal/ws/...`).
- Other UI components or store slices.

## Git workflow

- Branch: `advisor/011-security-and-file-integrity-hardening`
- Commit message convention: `fix(security): <description>`

## Steps

### Step 1: Guard Against Workspace and Home Directory Deletion in `files.go`
1. Open `internal/routes/files.go`. In `func (f *FileHandler) Rm(w http.ResponseWriter, r *http.Request)`:
   - Clean and inspect `req.Path`:
     ```go
     cleanReq := filepath.Clean(strings.TrimSpace(req.Path))
     if cleanReq == "" || cleanReq == "." || cleanReq == "/" || cleanReq == "\\" || strings.Contains(req.Path, "..") {
         http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
         return
     }
     ```
   - After `resolved, err := files.ValidatePath(req.Path, cwd)`:
     ```go
     home, _ := os.UserHomeDir()
     if resolved == cwd || resolved == filepath.Clean(cwd) || (home != "" && resolved == filepath.Clean(home)) {
         http.Error(w, `{"error":"Cannot delete workspace or home directory root"}`, http.StatusBadRequest)
         return
     }
     ```
2. Open `internal/routes/files_test.go` (or `routes_test.go`) and add test cases verifying:
   - Calling `Rm` with `.` or `./` returns HTTP 400 with error message.
   - Calling `Rm` with workspace root path returns HTTP 400.
   - Calling `Rm` with a valid subdirectory or file under `cwd` succeeds.

**Verify**: `go test -v ./internal/routes/...` → exits 0.

### Step 2: Remove DOMPurify `'onclick'` Whitelist & Implement Event Delegation in `MarkdownRenderer.tsx`
1. Open `web/src/components/MarkdownRenderer.tsx`:
   - In `renderer.code`, replace the inline `onclick` string on `.code-copy-btn`:
     ```typescript
     <button class="code-copy-btn" data-action="copy" aria-label="Copy code to clipboard">[COPY]</button>
     ```
   - In `DOMPurify.sanitize(raw, ...)`:
     Remove `'onclick'` from `ADD_ATTR`. It should read:
     ```typescript
     return DOMPurify.sanitize(raw, {
       ADD_TAGS: ['button', 'span', 'div'],
       ADD_ATTR: ['data-code', 'data-action', 'class', 'style', 'aria-hidden'],
     });
     ```
   - In `MarkdownRenderer` component, add a `useEffect` hook listening to click events on `containerRef`:
     ```typescript
     useEffect(() => {
       const container = containerRef.current;
       if (!container) return;

       const handleClick = (e: MouseEvent) => {
         const target = e.target as HTMLElement | null;
         const btn = target?.closest<HTMLButtonElement>('.code-copy-btn');
         if (!btn || !container.contains(btn)) return;

         const wrapper = btn.closest<HTMLDivElement>('.code-block-wrapper');
         const rawCode = wrapper?.getAttribute('data-code');
         if (rawCode) {
           const text = decodeURIComponent(rawCode);
           navigator.clipboard.writeText(text).catch(() => {});
           btn.textContent = '✓ COPIED';
           btn.classList.add('copied');
           setTimeout(() => {
             btn.textContent = '[COPY]';
             btn.classList.remove('copied');
           }, 2000);
         }
       };

       container.addEventListener('click', handleClick);
       return () => container.removeEventListener('click', handleClick);
     }, [html]);
     ```
2. Open `web/src/components/MarkdownRenderer.test.tsx`:
   - Add a test: `sanitizes malicious onclick attributes from markdown input`:
     Renders `<span onclick="window.evil=true">test</span>` and asserts `container.querySelector('span')?.getAttribute('onclick')` is null.
   - Add a test: `copies code block content on copy button click via event delegation`:
     Mocks `navigator.clipboard.writeText`, clicks `.code-copy-btn`, and asserts `navigator.clipboard.writeText` was called with the decoded code string.

**Verify**: `npx vitest run src/components/MarkdownRenderer.test.tsx` in `web/` → exits 0.

### Step 3: Enforce Authentication on System Introspection Routes
1. Open `internal/routes/system.go`:
   - Define `type SystemHandler struct { auth *AuthHelper }` and `func NewSystemHandler(auth *AuthHelper) *SystemHandler`.
   - Convert `HandleSystemStatus`, `HandleProcessList`, and `HandleSystemLogs` to methods on `SystemHandler`:
     - `(s *SystemHandler) HandleSystemStatus(w http.ResponseWriter, r *http.Request)`
     - `(s *SystemHandler) HandleProcessList(w http.ResponseWriter, r *http.Request)`
     - `(s *SystemHandler) HandleSystemLogs(w http.ResponseWriter, r *http.Request)`
   - At the beginning of each method, add:
     ```go
     if !s.auth.CheckAuth(r) {
         http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
         return
     }
     ```
   - Keep `HandleHealth` public (it only returns `{"status":"ok"}` for container/uptime liveness probes).
2. Open `internal/server/server.go`:
   - Instantiate `sysH := routes.NewSystemHandler(auth)`.
   - Update registrations:
     ```go
     mux.HandleFunc("GET /api/health", routes.HandleHealth)
     mux.HandleFunc("GET /api/system/status", sysH.HandleSystemStatus)
     mux.HandleFunc("GET /api/system/processes", sysH.HandleProcessList)
     mux.HandleFunc("GET /api/system/logs", sysH.HandleSystemLogs)
     ```
3. Update `internal/routes/routes_test.go` to test that unauthorized requests to `/api/system/status`, `/api/system/processes`, and `/api/system/logs` return HTTP 401 when `AuthToken` is configured.

**Verify**: `go test -v ./internal/routes/... ./internal/server/...` → exits 0.

### Step 4: Strict Path Validation in `WriteFileContent`
1. Open `internal/routes/editor.go`:
   - In `WriteFileContent`:
     Replace lines 189-200 with:
     ```go
     cwd := terminal.GetCwd(sessionName, e.auth.cfg.DefaultWorkingDir)
     resolved, err := files.ValidatePath(req.Path, cwd)
     if err != nil {
         http.Error(w, `{"error":"access denied: path outside workspace"}`, http.StatusForbidden)
         return
     }
     ```
2. Update `internal/routes/routes_test.go` to verify that attempting to write outside `cwd` via `..` or sibling directory paths returns HTTP 403.

**Verify**: `go test -v ./internal/routes/...` → exits 0.

## Test plan

- `internal/routes/files_test.go`:
  - `TestRmRootGuard`: Verify deleting `.` or `./` or `cwd` returns HTTP 400 and preserves directory.
- `web/src/components/MarkdownRenderer.test.tsx`:
  - `TestXssStripped`: Verify `onclick` attribute is stripped from output elements.
  - `TestCopyDelegation`: Verify clicking `.code-copy-btn` triggers clipboard write.
- `internal/routes/routes_test.go`:
  - `TestSystemRoutesAuth`: Verify `/api/system/*` routes reject unauthorized requests.
  - `TestEditorWritePathTraversal`: Verify `WriteFileContent` denies paths outside workspace.

## Done criteria

- [ ] `go test -v ./...` exits 0.
- [ ] `npm test` exits 0.
- [ ] `grep -rn "ADD_ATTR.*onclick" web/src/` returns no matches.
- [ ] `git diff --stat` confirms only in-scope files were modified.

## STOP conditions

- If `ValidatePath` in `files.go` fails existing valid editor workflows, stop and report.
- If removing `onclick` breaks Prism syntax highlighting or KaTeX math rendering, stop and report.
- If any test in `npm test` fails, stop and report.

## Maintenance notes

- Any future file deletion or mutation routes MUST call `files.ValidatePath` and check against `cwd` and `home`.
- Never re-add DOM event attributes (`onclick`, `onload`, `onerror`) to DOMPurify's `ADD_ATTR` list.
