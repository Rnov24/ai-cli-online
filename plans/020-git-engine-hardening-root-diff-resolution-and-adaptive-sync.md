# Plan 020: Git Engine Hardening, Root Commit Diff Resolution, and Git History Adaptive Sync

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 51b333a..HEAD -- internal/routes/ web/src/components/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug | perf | dx
- **Planned at**: commit `51b333a`, 2026-09-08

## Why this matters

The Git History panel is a centerpiece of AGY Online's development environment, allowing users to inspect commits, branches, and diffs alongside the terminal. However, the backend git route had several critical flaws: viewing an initial root commit invoked `git diff --root <commit>`, which does not exist in git and mistakenly diffed the commit against the user's uncommitted working directory; `GitLog` used an unsafe slice re-slicing idiom (`append(args[:1], ...)`) that risked memory aliasing; and git command outputs were read into unbounded buffers risking OOM on mobile/low-spec VPS. Furthermore, `internal/routes/git.go` had zero test coverage, and the frontend `GitHistoryPanel` had no refresh button or adaptive sync, forcing users to switch tabs or re-type queries to see newly created terminal commits.

Resolving these issues ensures accurate diff generation for all commit types (root, normal, merge), protects memory with bounded output streaming, covers git routes with unit tests, and adds interactive refresh and adaptive synchronization to the visualizer.

## Current state

- `internal/routes/git.go:248-254`: When `commit~1` fails on an initial root commit, it runs `git diff --root <commit>`, which compares against the working directory instead of displaying the files created in that commit.
- `internal/routes/git.go:49`: `validHashRe = regexp.MustCompile("^[a-f0-9]{7,40}$")` rejects SHA-256 commit hashes (64 chars) and `HEAD` references.
- `internal/routes/git.go:117-119`: `args = append(args[:1], append([]string{"--all"}, args[1:]...)...)` performs unsafe slice mutation sharing backing capacity.
- `internal/routes/git.go:53-64`: `runGit` uses unbounded `bytes.Buffer` without size capping.
- `internal/routes/git_test.go`: Does not exist (0% coverage).
- `web/src/components/GitHistoryPanel.tsx`: Lacks a refresh button in the toolbar and does not poll or sync newly committed git state.
- `web/src/components/icons/index.tsx`: Lacks `RefreshCwIcon`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Go test | `go test -v ./internal/routes/...` | exit 0, all tests pass |
| Vitest | `npm test` | exit 0, 100% tests pass |
| Full build | `npm run build` | exit 0, static binary built in `bin/ai-cli-online` |

## Scope

**In scope**:
- `internal/routes/git.go`
- `internal/routes/git_test.go` (create)
- `web/src/components/icons/index.tsx` & `web/src/components/icons/Icons.test.tsx`
- `web/src/components/GitHistoryPanel.tsx`

**Out of scope**:
- Altering the git visualizer lane layout algorithms in `web/src/utils/gitGraph.ts`.
- Writing or committing files to user git repositories.

## Implementation Steps

### Step 1: Harden Git Engine and Fix Diff Generation
1. In `internal/routes/git.go`:
   - Update `validHashRe` to support 7 to 64 character hex hashes as well as `HEAD` and `HEAD~N`:
     ```go
     validHashRe = regexp.MustCompile(`^([a-f0-9]{7,64}|HEAD(~[0-9]+)?)$`)
     ```
   - In `runGit`, add an output limit (e.g. 5MB):
     - Read stdout with `io.LimitReader(stdoutPipe, maxBytes+1)`. If length exceeds `maxBytes`, append `"\n\n[Diff truncated: exceeds size limit]"`.
   - In `GitLog`:
     - Cleanly append `--all` without slice re-slicing tricks:
       ```go
       if all {
           args = append(args, "--all")
       } else if branch != "" {
           args = append(args, branch)
       }
       ```
   - In `GitDiff`:
     - Use `git show --format= --patch <commit>` which universally produces the correct patch for normal commits, root commits, and merge commits:
       ```go
       args := []string{"show", "--format=", "--patch", commit}
       if fileFilter != "" {
           args = append(args, "--", fileFilter)
       }
       ```
2. Verify with `go test ./internal/routes/...`.

### Step 2: Add Comprehensive Unit Tests for Git Routes
1. Create `internal/routes/git_test.go`:
   - Initialize a temporary Git repository using `exec.Command("git", "init")`.
   - Configure user identity (`user.name`, `user.email`).
   - Create initial commit (root commit).
   - Create a second commit with file modification.
   - Create a branch.
   - Test `GitLog`:
     - Test pagination, limit, branch filtering.
     - Test unauthorized request returns 401.
   - Test `GitDiff`:
     - Test diff of second commit against first commit.
     - Test diff of initial root commit (verifies files created in root commit are returned, NOT working dir diff).
     - Test fileFilter query parameter.
     - Test invalid commit hash returns 400.
   - Test `GitBranches`:
     - Test listing current branch and branch list.
2. Verify: `go test -v ./internal/routes/...` passes with all tests green.

### Step 3: Add RefreshCwIcon and Wire Interactive/Adaptive Sync in GitHistoryPanel
1. In `web/src/components/icons/index.tsx`:
   - Add `RefreshCwIcon`:
     ```tsx
     export const RefreshCwIcon = createIcon('RefreshCwIcon', (
       <>
         <polyline points="23 4 23 10 17 10" />
         <polyline points="1 20 1 14 7 14" />
         <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
       </>
     ));
     ```
2. In `web/src/components/icons/Icons.test.tsx`:
   - Add test case verifying `RefreshCwIcon` renders correctly.
3. In `web/src/components/GitHistoryPanel.tsx`:
   - Import `RefreshCwIcon` and `useAdaptivePolling`.
   - Add `handleRefresh` callback that reloads branches and page 1.
   - Add a Refresh icon button in the toolbar next to the file search filter.
   - Add `useAdaptivePolling` with 15-second interval (paused when tab hidden, auto-refreshed when tab focused).
4. Verify: `npm test` passes all tests.

### Step 4: Full Build and Verification
1. Run `npm test` (Vitest suites + Go tests).
2. Run `npm run build` to compile the frontend and Go static binary.
3. Update `plans/README.md` to mark Plan 020 `DONE`.

## Done criteria

- [ ] `internal/routes/git.go` safely generates diffs for root commits using `git show`.
- [ ] `internal/routes/git.go` enforces output byte limit and fixes slice mutation.
- [ ] `internal/routes/git_test.go` exists and tests all git endpoints.
- [ ] `RefreshCwIcon` is exported and tested.
- [ ] `GitHistoryPanel.tsx` has manual refresh button and `useAdaptivePolling`.
- [ ] `npm test` passes 100%.
- [ ] `npm run build` succeeds with exit code 0.
