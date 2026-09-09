# Plan 034: Integrate skills.sh Registry, Skill Discovery, and 1-Click Download/Setup Engine

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 901adfb..HEAD -- internal/routes/skills.go internal/routes/skills_test.go internal/server/server.go web/src/api/skills.ts web/src/components/SkillsManagementModal.tsx web/src/components/SkillsManagementModal.test.tsx web/src/components/icons/index.tsx web/src/components/CommandPalette.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/033-account-switch-and-auth-setup.md
- **Category**: dx
- **Planned at**: commit `901adfb`, 2026-09-09
- **Issue**: none

## Why this matters

Antigravity CLI (`agy`) relies on modular agent skills (`SKILL.md` bundles containing prompt instructions, metadata, scripts, and references) placed in `.agents/skills/` (project-level) or `~/.agents/skills/` (global user-level). The open `skills.sh` registry (developed by Vercel Labs and open-source contributors) catalogs over 600,000 community skills, searchable via `https://skills.sh/api/search` and tracked locally via `skills-lock.json`.
Currently in AGY Online, the Skills Hub (`SkillsManagementModal.tsx`) only scans and displays pre-existing local directories and provides blank markdown scaffolding. Users cannot discover, search, download, or install skills from `skills.sh` or GitHub repositories without leaving the browser, and running `npx skills` directly inside Termux or low-spec VPS shells often fails due to Android `/bin/sh` shebang missing or interactive npm prompts.
This plan introduces a native Go proxy and resilient downloader for `skills.sh` and GitHub repositories, 1-click install/uninstall/sync endpoints, and an interactive "Explore Skills.sh" marketplace in the Web UI.

## Current state

- Relevant files:
  - `internal/routes/skills.go` — Go handler for `/api/skills` (currently handles `ListSkills`, `GetSkillContent`, `ScaffoldSkill`).
  - `internal/routes/skills_test.go` — Unit tests for skill listing, frontmatter parsing, and scaffolding.
  - `internal/server/server.go` — HTTP route registration for skills endpoints (lines 50, 81–83).
  - `web/src/api/skills.ts` — TypeScript API client for skills (currently has `fetchSkills`, `fetchSkillContent`, `scaffoldSkill`).
  - `web/src/components/SkillsManagementModal.tsx` — React modal displaying local skills list, filter tabs, and SKILL.md inspector.
  - `web/src/components/SkillsManagementModal.test.tsx` — Test suite for `SkillsManagementModal`.
  - `web/src/components/icons/index.tsx` — SVG icon definitions (`createIcon`).
  - `web/src/components/CommandPalette.tsx` — Command palette integration (`/skills` action).
  - `skills-lock.json` — Lockfile in project root tracking installed skills, their sources, and computed hashes.

- Existing route registration in `internal/server/server.go:81-83`:
```go
	mux.HandleFunc("GET /api/skills", skillsH.ListSkills)
	mux.HandleFunc("GET /api/skills/content", skillsH.GetSkillContent)
	mux.HandleFunc("POST /api/skills/scaffold", skillsH.ScaffoldSkill)
```

- Existing skills API in `web/src/api/skills.ts:34-45`:
```typescript
export async function fetchSkills(token: string, cwd?: string): Promise<SkillsPayload> {
  const url = cwd ? `/api/skills?cwd=${encodeURIComponent(cwd)}` : '/api/skills';
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch skills: ${res.statusText}`);
  }
  return res.json();
}
```

- Existing `skills-lock.json` structure in root:
```json
{
  "version": 1,
  "skills": {
    "antislop": {
      "source": "miqdadbadjuber/anti-slop",
      "sourceType": "github",
      "skillPath": "skills/antislop/SKILL.md",
      "computedHash": "356fa6c622400958bcb83549a4a8bab5bb000a0a8b1a6f6b8ac15b4183ad6f09"
    }
  }
}
```

- Live `skills.sh` search API behavior (`https://skills.sh/api/search?q=<query>&limit=<limit>`):
```json
{
  "query": "antislop",
  "searchType": "fuzzy",
  "skills": [
    {
      "id": "miqdadbadjuber/anti-slop/antislop",
      "skillId": "antislop",
      "name": "antislop",
      "installs": 946,
      "source": "miqdadbadjuber/anti-slop"
    }
  ],
  "count": 1
}
```

- Conventions:
  - Error responses in Go routes return JSON: `http.Error(w, `{"error":"..."}`, statusCode)`.
  - Pure Go (0 CGO), cross-platform path handling (`filepath.Clean`, `filepath.Join`).
  - Strict authentication: every endpoint validates `h.auth.CheckAuth(r)` or returns 401.
  - UI colors match CSS design tokens: `var(--bg-primary)`, `var(--bg-secondary)`, `var(--border)`, `var(--accent-purple)`, `var(--accent-cyan)`, `var(--accent-green)`, `var(--accent-amber-bright)`, `var(--accent-red)`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npm run build --workspace=web` | exit 0, no errors |
| Web Tests | `npx vitest run web/src/components/SkillsManagementModal.test.tsx` | all tests pass |
| Go Tests  | `go test -v ./internal/routes -run TestSkillsHandler` | PASS |
| All Tests | `npm test`               | exit 0, 100% pass   |
| Go Build  | `go build -o bin/ai-cli-online ./cmd/ai-cli-online` | exit 0 |

## Scope

**In scope**:
- `internal/routes/skills.go` — Add `SearchSkills`, `InstallSkill`, `DeleteSkill`, `SyncSkills`, and lockfile helper functions.
- `internal/routes/skills_test.go` — Add test coverage for search proxy, skill installation, deletion guards, and lockfile sync.
- `internal/server/server.go` — Register `GET /api/skills/search`, `POST /api/skills/install`, `DELETE /api/skills`, `POST /api/skills/sync`.
- `web/src/api/skills.ts` — Add `searchSkills`, `installSkill`, `uninstallSkill`, `syncSkills` typed functions and payloads.
- `web/src/components/icons/index.tsx` — Add `SyncIcon`.
- `web/src/components/SkillsManagementModal.tsx` — Add "INSTALLED" vs "EXPLORE SKILLS.SH" view switcher, search bar with debounced API queries, category chips, direct repository installer, 1-click install/uninstall actions, and lockfile restore sync.
- `web/src/components/SkillsManagementModal.test.tsx` — Add unit test cases for exploring, installing, uninstalling, and syncing skills.
- `web/src/components/CommandPalette.tsx` — Add `/skills-find` action to open modal directly in Explore tab.

**Out of scope**:
- Direct binary downloads outside GitHub or `skills.sh` registry.
- Modifying `ai-cli-task` core plugin files.
- Introducing external CGO dependencies or requiring Node.js in Go binary runtime.

## Git workflow

- Branch: `advisor/034-skills-sh-integration`
- Commit message style: Conventional Commits, matching `feat(skills): skills.sh registry integration, 1-click download, and lockfile sync`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend `internal/routes/skills.go` with Search, Install, Delete, and Sync Endpoints

1. Define data structures in `internal/routes/skills.go`:
```go
type RemoteSkillItem struct {
	ID       string `json:"id"`
	SkillID  string `json:"skillId"`
	Name     string `json:"name"`
	Source   string `json:"source"`
	Installs int    `json:"installs"`
}

type SkillsSearchResponse struct {
	Query  string            `json:"query"`
	Skills []RemoteSkillItem `json:"skills"`
	Count  int               `json:"count"`
}

type InstallSkillRequest struct {
	Source    string `json:"source"`    // e.g. "miqdadbadjuber/anti-slop" or "shadcn/improve"
	SkillName string `json:"skillName"` // e.g. "antislop", or empty to infer
	Scope     string `json:"scope"`     // "workspace" or "global"
	Cwd       string `json:"cwd"`
}

type SkillLockEntry struct {
	Source       string `json:"source"`
	SourceType   string `json:"sourceType"`
	SkillPath    string `json:"skillPath"`
	ComputedHash string `json:"computedHash"`
}

type SkillLockFile struct {
	Version int                       `json:"version"`
	Skills  map[string]SkillLockEntry `json:"skills"`
}

type SyncSkillsResponse struct {
	Synced   int      `json:"synced"`
	Restored []string `json:"restored"`
	Errors   []string `json:"errors,omitempty"`
}
```

2. Implement `SearchSkills(w http.ResponseWriter, r *http.Request)`:
   - Validate auth token.
   - Extract query `q` and optional `limit` (default `"20"`).
   - If `q == ""`, default `q` to `"agent"` or `""` to surface top popular skills.
   - Query `https://skills.sh/api/search?q=<query>&limit=<limit>` with 5-second `http.Client` timeout.
   - On network or remote error, return curated fallback list of top skills (`anti-slop`, `improve`, `prd`, `to-tickets`, `git-commit`).
   - Decode remote JSON and return `SkillsSearchResponse` with `application/json`.

3. Implement `InstallSkill(w http.ResponseWriter, r *http.Request)`:
   - Validate auth token.
   - Decode `InstallSkillRequest`. Sanitize source and skill name (alphanumeric, hyphens, slashes).
   - Normalize target directory:
     - If `req.Scope == "global"`: target parent is `~/.agents/skills/`.
     - Else: target parent is `<cwd>/.agents/skills/`.
   - Download mechanism:
     - If `git` is available in PATH: run `git clone --depth 1 https://github.com/<owner>/<repo>.git <tmpDir>`.
     - Alternatively, fetch GitHub tarball `https://github.com/<owner>/<repo>/archive/refs/heads/main.tar.gz` (or `master.tar.gz`).
     - Scan `<tmpDir>` for `SKILL.md`:
       - If `SkillName` is specified, search for directory `<SkillName>` containing `SKILL.md` or `skills/<SkillName>/SKILL.md`.
       - If not specified, if root has `SKILL.md`, use repository name as skill name; else list first matching skill directory.
     - Copy the found skill directory (including `SKILL.md`, `references/`, `scripts/`, `resources/` if present) into `<targetParent>/<skillName>`.
     - Compute sha256 hash of `SKILL.md`.
     - Read or initialize `skills-lock.json` in workspace root (or user home for global).
     - Update `lock.Skills[skillName]` with `{ source, sourceType: "github", skillPath: relativePath, computedHash: hash }` and write atomically.
     - Return installed `SkillItem` with 201 Created.

4. Implement `DeleteSkill(w http.ResponseWriter, r *http.Request)`:
   - Validate auth token.
   - Parse `name`, `scope`, and `cwd` from query params.
   - Guard: if target directory is inside `.gemini/antigravity-cli/builtin/skills`, return 403 Forbidden ("Builtin skills cannot be deleted").
   - Resolve target directory:
     - Global: `~/.agents/skills/<name>`.
     - Workspace: `<cwd>/.agents/skills/<name>`.
   - Ensure the path is within the allowed skills directory (prevent path traversal).
   - Remove directory with `os.RemoveAll(targetDir)`.
   - Remove entry from `skills-lock.json` if present.
   - Return `{"ok": true, "name": name}`.

5. Implement `SyncSkills(w http.ResponseWriter, r *http.Request)`:
   - Validate auth token.
   - Locate `skills-lock.json` in workspace root.
   - For each skill in `lock.Skills`:
     - Check if `.agents/skills/<name>/SKILL.md` exists.
     - If missing, re-install from `entry.Source` and record in `restored`.
   - Return `SyncSkillsResponse`.

**Verify**: `go test -v ./internal/routes -run TestSkillsHandler` → all pass.

### Step 2: Register Routes in `internal/server/server.go`

1. In `internal/server/server.go`, register the 4 new endpoints under `skillsH`:
```go
	mux.HandleFunc("GET /api/skills", skillsH.ListSkills)
	mux.HandleFunc("GET /api/skills/content", skillsH.GetSkillContent)
	mux.HandleFunc("POST /api/skills/scaffold", skillsH.ScaffoldSkill)
	mux.HandleFunc("GET /api/skills/search", skillsH.SearchSkills)
	mux.HandleFunc("POST /api/skills/install", skillsH.InstallSkill)
	mux.HandleFunc("DELETE /api/skills", skillsH.DeleteSkill)
	mux.HandleFunc("POST /api/skills/sync", skillsH.SyncSkills)
```

**Verify**: `go build -o /dev/null ./cmd/ai-cli-online` → exit 0.

### Step 3: Add Backend Unit Tests in `internal/routes/skills_test.go`

1. Add `TestSkillsHandler_SearchSkills`:
   - Tests `GET /api/skills/search?q=antislop` with a mock test server simulating `skills.sh/api/search`.
   - Tests fallback behavior when search service returns empty or non-200.
2. Add `TestSkillsHandler_InstallSkill`:
   - Tests `POST /api/skills/install` with a local git repo fixture or mock tarball.
   - Verifies the skill folder is written to `.agents/skills/<name>/SKILL.md`.
   - Verifies `skills-lock.json` is updated with source and computed hash.
3. Add `TestSkillsHandler_DeleteSkill`:
   - Tests `DELETE /api/skills?name=...` removes the skill folder and cleans `skills-lock.json`.
   - Verifies attempting to delete a builtin skill returns 403 Forbidden.
4. Add `TestSkillsHandler_SyncSkills`:
   - Writes a `skills-lock.json` with a missing skill, invokes `/api/skills/sync`, and verifies restoration.

**Verify**: `go test -v ./internal/routes -run TestSkillsHandler` → PASS with 0 failures.

### Step 4: Add TypeScript API Client Functions in `web/src/api/skills.ts`

1. Export new interfaces:
```typescript
export interface RemoteSkillItem {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
}

export interface SkillsSearchResponse {
  query: string;
  skills: RemoteSkillItem[];
  count: number;
}

export interface InstallSkillPayload {
  source: string;
  skillName?: string;
  scope: 'workspace' | 'global';
  cwd?: string;
}

export interface SyncSkillsResponse {
  synced: number;
  restored: string[];
  errors?: string[];
}
```

2. Export client functions:
   - `searchSkills(token: string, query: string, limit?: number): Promise<SkillsSearchResponse>`
   - `installSkill(token: string, payload: InstallSkillPayload): Promise<SkillItem>`
   - `deleteSkill(token: string, name: string, scope: string, cwd?: string): Promise<{ ok: boolean; name: string }>`
   - `syncSkills(token: string, cwd?: string): Promise<SyncSkillsResponse>`

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exit 0, no errors.

### Step 5: Add `SyncIcon` in `web/src/components/icons/index.tsx`

1. Add `SyncIcon`:
```tsx
export const SyncIcon = createIcon('SyncIcon', (
  <>
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
  </>
));
```

**Verify**: `npx vitest run web/src/components/icons/Icons.test.tsx` → all icon tests pass.

### Step 6: Update `web/src/components/SkillsManagementModal.tsx`

1. Mode Switcher:
   - Add tab bar at the top or toolbar: `[ INSTALLED (N) ]` and `[ EXPLORE SKILLS.SH ]` (with a stylish `skills.sh` pill).
2. "EXPLORE SKILLS.SH" View:
   - Online search bar with debounce (300ms) calling `searchSkills(token, query)`.
   - Quick category chips: `Anti-Slop`, `React`, `Git`, `Testing`, `Review`, `PRD`, `DevOps` (clicking a chip sets the search query).
   - Direct manual installer:
     - Input field: `owner/repo or package slug` (e.g. `vercel-labs/agent-skills`).
     - Scope selector dropdown: `Project (.agents/skills)` vs `Global (~/.agents/skills)`.
     - Action button: `INSTALL FROM GITHUB / SKILLS.SH`.
   - Remote search results list:
     - Displays `name`, `source`, install count (e.g. `44.5K installs`), and link to `https://skills.sh/<id>`.
     - Action button: `INSTALL` (shows `INSTALLING...` with spinner, disables during install, and changes to `INSTALLED` if already present in `skills`).
3. "INSTALLED" View Enhancements:
   - Add `SYNC` button in the toolbar calling `syncSkills()` with feedback alert ("Synced N skills from skills-lock.json").
   - Add `UNINSTALL` button on workspace and global skills with confirmation prompt. Builtin skills do not display the uninstall button.
   - Display source repo tag next to skill name if recorded in `skills-lock.json`.
4. Error & Loading Feedback:
   - Clean, non-blocking toast/alert banner for install, uninstall, and sync actions.

**Verify**: `npx vitest run web/src/components/SkillsManagementModal.test.tsx` → all tests pass.

### Step 7: Add `/skills-find` Quick Action to `web/src/components/CommandPalette.tsx`

1. In `web/src/components/CommandPalette.tsx`:
   - Add quick action:
     - `id: 'cmd-skills-find'`
     - `category: 'SKILLS'`
     - `title: 'Explore & Install Skills: skills.sh Registry'`
     - `desc: 'Browse, search, and 1-click install community agent skills from skills.sh'`
     - `action: () => { window.dispatchEvent(new CustomEvent('agy:open-skills-modal', { detail: { view: 'explore' } })); }`
   - In `SkillsManagementModal.tsx`, listen to `detail.view` from event to switch directly to `explore` tab when opened via this command.

**Verify**: `npx vitest run web/src/components/CommandPalette.test.tsx` → all tests pass.

### Step 8: Full Verification & Static Binary Build

1. Run full web test suite: `npm run test --workspace=web`.
2. Run Go test suite: `go test -v ./...`.
3. Compile single production static binary: `npm run build` (or `go build -o bin/ai-cli-online ./cmd/ai-cli-online`).
4. Verify binary starts and `/api/skills/search` responds.

**Verify**: `npm test && ./bin/ai-cli-online status` → clean exit 0.

## Test plan

- **Go Unit Tests** (`internal/routes/skills_test.go`):
  - `TestSkillsHandler_SearchSkills`: Validates search query serialization and timeout fallback.
  - `TestSkillsHandler_InstallSkill`: Validates installation into `.agents/skills` and `skills-lock.json` recording.
  - `TestSkillsHandler_DeleteSkill`: Validates safe deletion and forbidden guard on builtin skills.
  - `TestSkillsHandler_SyncSkills`: Validates lockfile reconciliation.
- **Frontend Unit Tests** (`web/src/components/SkillsManagementModal.test.tsx`):
  - Tab switching between "INSTALLED" and "EXPLORE SKILLS.SH".
  - Rendering remote search results from `skills.sh`.
  - Clicking "INSTALL" triggers `installSkill()` and updates state.
  - Clicking "UNINSTALL" triggers `deleteSkill()` and removes item.
  - Clicking "SYNC" triggers `syncSkills()` and shows success message.
- **Verification**: `npm test` → all 27+ test files pass 100%.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `GET /api/skills/search?q=git` returns 200 with matching skills list.
- [ ] `POST /api/skills/install` downloads target skill, writes `SKILL.md` to `.agents/skills/<name>`, and updates `skills-lock.json`.
- [ ] `DELETE /api/skills?name=<name>&scope=workspace` removes skill directory and updates `skills-lock.json`.
- [ ] `DELETE /api/skills?name=antigravity-guide&scope=builtin` returns 403 Forbidden.
- [ ] `POST /api/skills/sync` restores missing skills defined in `skills-lock.json`.
- [ ] `web/src/components/SkillsManagementModal.tsx` provides both "INSTALLED" and "EXPLORE SKILLS.SH" tabs.
- [ ] `npx vitest run web/src/components/SkillsManagementModal.test.tsx` passes 100%.
- [ ] `go test -v ./internal/routes -run TestSkillsHandler` passes 100%.
- [ ] `npm test` passes across all web and Go packages with 0 errors.
- [ ] `npm run build` succeeds, compiling static binary `bin/ai-cli-online`.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated to `TODO` for Plan 034.

## STOP conditions

Stop and report back (do not improvise) if:

- The remote `skills.sh` search API schema changes drastically from `{ query, skills: [{ id, skillId, name, source, installs }] }`.
- GitHub repository archive endpoint format is blocked or inaccessible without API tokens on target host.
- A step's verification fails twice after a reasonable fix attempt.
- The implementation appears to require adding external CGO dependencies.

## Maintenance notes

- The Go proxy for `skills.sh` search API includes a graceful offline fallback with well-known community skills (`anti-slop`, `improve`, `prd`, etc.) so the modal remains functional even without internet connectivity.
- `skills-lock.json` format is 100% compatible with the official `skills` CLI (`npx skills`). If the user later runs `skills` CLI in terminal, both AGY Online UI and CLI will share the identical lockfile.
- Deletion is strictly guarded against builtin AGY skills in `~/.gemini/antigravity-cli/builtin/skills`.
