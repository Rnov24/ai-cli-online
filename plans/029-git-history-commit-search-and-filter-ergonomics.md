# Plan 029: Git History Commit Message Search, Query Injection Guard, and Filter Ergonomics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 63748ca..HEAD -- internal/routes/git.go web/src/components/GitHistoryPanel.tsx web/src/api/git.ts web/src/components/MarkdownRenderer.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/028-workspace-files-breadcrumbs-filter-and-save-shortcut.md
- **Category**: correctness | ui | git | accessibility
- **Planned at**: commit `63748ca`, 2026-09-08

## Why this matters

1. **Inability to Search Git Commit Messages**: In `internal/routes/git.go:112-145`, `GitLog` only accepts a `file` query parameter (`git log -- <file>`), completely lacking support for commit message searching (`--grep=<term> -i`). When developers search in git history, they frequently look for feature names, bug IDs, or commit descriptions (e.g. "auth", "fix login", "revert").
2. **Missing Search Dismiss and Clear Ergonomics**: In `web/src/components/GitHistoryPanel.tsx:708-725`, the search input has no clear button (`×`) when text is typed, and pressing `Escape` while focused does not clear the filter. If a search yields zero results, the panel displays a generic "No commits found" message without naming the query or providing a one-tap clear button.
3. **Smart Search Routing**: When users type a file path (containing `/` or file extensions), it should filter by file path; when typing general terms or keywords, it should search commit messages.
4. **DOMPurify Accessible Attribute Stripping**: In `web/src/components/MarkdownRenderer.tsx:135-138`, `aria-label` is omitted from `ADD_ATTR`, causing DOMPurify to strip the accessible label from code copy buttons.

## Current state

- `internal/routes/git.go:112`: Only checks `fileFilter := r.URL.Query().Get("file")`.
- `web/src/api/git.ts:8`: `GitLogOptions` only has `page`, `limit`, `file`, `all`, `branch`.
- `web/src/components/GitHistoryPanel.tsx:708-725`: Search input has no clear button or Escape key listener.
- `web/src/components/MarkdownRenderer.tsx:137`: `ADD_ATTR: ['data-code', 'data-action', 'class', 'style', 'aria-hidden']` omits `aria-label`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Unit test | `npm test`               | All Vitest and Go tests PASS |
| Build     | `npm run build`          | Exit code 0, TypeScript + Vite + Go binary compiled |

## Steps

### Step 1: Add commit message search and query injection guard in `internal/routes/git.go`

1. In `GitLog`, parse `queryFilter := r.URL.Query().Get("q")`:
   - Reject queries with control characters (null bytes or newlines).
   - If `queryFilter != ""`, append `args = append(args, "--grep="+queryFilter, "-i")`.
2. Ensure `queryFilter` and `fileFilter` can be used individually or combined.

### Step 2: Update TypeScript API in `web/src/api/git.ts`

1. Add `q?: string;` to `GitLogOptions`.
2. In `fetchGitLog`, include `q: options.q` in query parameters when present.

### Step 3: Enhance `web/src/components/GitHistoryPanel.tsx` search ergonomics

1. Update search routing in `loadPage`:
   - If `search` contains `/` or matches a file extension (`\.(ts|tsx|js|jsx|go|md|json|css|html|yml|yaml|py|sh)$`), pass as `file: search`.
   - Otherwise pass as `q: search`.
2. Add a clear button `×` in the search input when `searchInput` is non-empty.
3. Add `onKeyDown` on the search input to clear search when `Escape` is pressed.
4. Update empty state:
   - When `commits.length === 0 && searchInput`, show: `"No commits matching \"{searchInput}\""` with a "Clear search" button.
5. In `web/src/components/MarkdownRenderer.tsx`, add `'aria-label'` to `ADD_ATTR`.

### Step 4: Add comprehensive unit tests

1. In `internal/routes/git_test.go`, add unit tests verifying:
   - `GitLog` with `?q=initial` returns only commits matching the message.
   - `GitLog` with `?q=nonexistent` returns 0 commits.
2. In `web/src/components/GitHistoryPanel.test.tsx`, add unit tests verifying:
   - Search input dispatches `q` or `file` to `fetchGitLog`.
   - Clear button resets search input and reloads log.
   - Escape key in search input resets search.
   - Empty search state displays query and "Clear search" button.

### Step 5: Verify all test gates and production build

1. Run `npm test` to verify all Vitest and Go tests pass.
2. Run `npm run build` to verify clean production compilation.
3. Update `plans/README.md` row 029 to `DONE`.
4. Commit changes cleanly.

## STOP conditions

- If any existing tests fail, stop and resolve before proceeding.
- If Vite or TypeScript build fails, stop and resolve.
