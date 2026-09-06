# Plan 007: Implement Workspace and Project-Based Skills Management

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b759d1d..HEAD -- internal/routes/ web/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `b759d1d`, 2026-09-06

## Why this matters

AGY Online operates in two dual-persona operational modes: **Personal Home (`~`)** (Agentic Assistant) and **Project Workspaces** (Autonomous Coding Agent). In Google Antigravity CLI (`agy`), skills are organized hierarchically: **Project/Workspace Skills** live in `<project-root>/.agents/skills/<name>/SKILL.md`, while **Global & Built-in Skills** live in `~/.gemini/config/plugins/` (e.g. `ai-cli-task`) and `~/.gemini/antigravity-cli/builtin/skills/`. Currently, AGY Online hardcodes a static list of 13 `ai-cli-task` skills in `ShortcutsModal.tsx` and `CommandPalette.tsx`, with no awareness of the active workspace's actual `.agents/skills/` (such as `/improve`, `/prd`, or custom repo runbooks). There is no backend discovery API, no GUI to inspect `SKILL.md` instructions, no visual distinction between workspace-scoped and global skills, and no way to scaffold new project-specific skills from the web interface. Implementing full-stack skills management brings Antigravity's customization system directly into the browser.

## Current state

1. **`internal/server/server.go`**:
   - Registers routes for sessions, files, editor, git, settings, workspaces, and conversations, but has **zero** skills endpoints.
2. **`web/src/components/ShortcutsModal.tsx` (Lines 255–270, 693–721)**:
   - Hardcodes static array `LIFECYCLE_SKILLS` containing only the 13 `ai-cli-task` commands.
3. **`web/src/components/CommandPalette.tsx` (Lines 126–245)**:
   - Hardcodes static commands in the `SKILLS` category without querying workspace or project skills.
4. **`web/src/components/AiChatView.tsx` (Lines 95–110, 639–665)**:
   - Slash command autocomplete has static definitions. Handling `/skills` only prints static markdown text referencing the 13 lifecycle skills.
5. **Project Workspace Skills Exist on Disk**:
   - In the active repository, `.agents/skills/` contains real skills: `improve/SKILL.md`, `prd/SKILL.md`, `improve-codebase-architecture/SKILL.md`, `to-tickets/SKILL.md`.
   - In global config, `~/.gemini/config/plugins/ai-cli-task/skills/` and `~/.gemini/antigravity-cli/builtin/skills/` contain global and builtin skills.
   - None of these are accessible or manageable through the web GUI.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Build     | `npm run build`          | exit 0, bundle built|
| Typecheck | `npm run build --workspace=web` | exit 0, no errors|
| Tests     | `npm test`               | all tests pass      |
| Go Tests  | `go test ./internal/routes -v` | PASS          |

## Scope

**In scope**:
- `internal/routes/skills.go` (Create Go handler for scanning workspace, global, and builtin skills)
- `internal/routes/skills_test.go` (Create unit tests for skills handler and frontmatter parser)
- `internal/server/server.go` (Register `/api/skills`, `/api/skills/content`, `/api/skills/scaffold`)
- `web/src/api/skills.ts` (Create frontend API client for skills)
- `web/src/components/SkillsManagementModal.tsx` (Create interactive skills management and inspector modal)
- `web/src/components/SkillsManagementModal.test.tsx` (Create Vitest suite for skills management modal)
- `web/src/components/ShortcutsModal.tsx` (Enrich SKILLS & TOOLS tab with live dynamic loader and scope badges)
- `web/src/components/CommandPalette.tsx` (Dynamically populate `SKILLS` category with live workspace skills)
- `web/src/components/AiChatView.tsx` (Dynamic slash command autocomplete and interactive `/skills` handler)
- `web/src/components/icons/index.tsx` (Ensure `PuzzleIcon`, `CodeIcon`, `FolderIcon`, `HomeIcon` are available)

**Out of scope**:
- Do not modify skill content files in `~/.gemini/` or `.agents/skills/`.
- Do not install third-party YAML or icon npm packages (use zero-dependency frontmatter parsing in Go and React SVG icons).
- Do not alter terminal PTY or tmux session management.

## Git workflow

- Branch: `advisor/007-workspace-and-project-skills-management`
- Commit per logical step; message style: `feat(skills): <description>`
- Do NOT push or merge unless instructed.

## Steps

### Step 1: Implement Backend Skills Discovery Handler in `internal/routes/skills.go`

1. Create `internal/routes/skills.go`:
   - Define data structs:
     ```go
     type SkillItem struct {
         Name        string   `json:"name"`
         Description string   `json:"description"`
         Scope       string   `json:"scope"`       // "workspace", "global", "builtin"
         Path        string   `json:"path"`        // absolute path to directory
         SkillFile   string   `json:"skillFile"`   // absolute path to SKILL.md
         HasScripts  bool     `json:"hasScripts"`
         HasResources bool    `json:"hasResources"`
         Tags        []string `json:"tags,omitempty"`
     }

     type SkillsResponse struct {
         WorkspacePath string      `json:"workspacePath"`
         IsHome        bool        `json:"isHome"`
         Skills        []SkillItem `json:"skills"`
         Count         int         `json:"count"`
     }
     ```
   - Implement `parseSkillFrontmatter(content string) (name string, desc string)`:
     - Pure Go parser reading between leading `---` markers.
     - Extracts `name:` and `description:` lines (supporting multi-line `description: >-` blocks).
   - Implement `scanSkillsDir(dir string, scope string) []SkillItem`:
     - Reads subdirectories in `dir`.
     - Checks for `SKILL.md` (or `skill.md`).
     - Detects `scripts/` and `resources/` subdirectories.
   - Implement `SkillsHandler`:
     - `ListSkills(w http.ResponseWriter, r *http.Request)`:
       - Checks authentication via `h.auth.CheckAuth(r)`.
       - Reads optional `cwd` query parameter or active session's CWD.
       - Discovers **Workspace Skills**: `<cwd>/.agents/skills` (and `<cwd>/.agent/skills`, `<cwd>/.claude/skills`).
       - Discovers **Global Plugin Skills**: `~/.gemini/config/plugins/*/skills/*` and `~/.agents/skills/*`.
       - Discovers **Built-in Skills**: `~/.gemini/antigravity-cli/builtin/skills/*`.
       - Deduplicates skills by name (Workspace skills take precedence over Global, which take precedence over Builtin).
       - Returns JSON response with `SkillsResponse`.
     - `GetSkillContent(w http.ResponseWriter, r *http.Request)`:
       - Query param `path` (or `name` + `scope`).
       - Path traversal security guard: path must end with `SKILL.md` or `skill.md` and reside inside recognized skill directories.
       - Returns raw markdown content of `SKILL.md` and parsed frontmatter.
     - `ScaffoldSkill(w http.ResponseWriter, r *http.Request)`:
       - Accepts POST JSON: `{ "name": "...", "description": "...", "scope": "workspace"|"global", "cwd": "..." }`.
       - Validates name (alphanumeric, hyphens).
       - Creates directory `<targetDir>/<name>` and writes starter `SKILL.md` template with frontmatter and instructions.
2. In `internal/server/server.go`:
   - Initialize `skillsH := routes.NewSkillsHandler(auth, s.db)`.
   - Register routes:
     - `mux.HandleFunc("GET /api/skills", skillsH.ListSkills)`
     - `mux.HandleFunc("GET /api/skills/content", skillsH.GetSkillContent)`
     - `mux.HandleFunc("POST /api/skills/scaffold", skillsH.ScaffoldSkill)`
3. **Verify**: `go build -o /dev/null ./cmd/ai-cli-online` → exit 0.

---

### Step 2: Implement Backend Unit Tests in `internal/routes/skills_test.go`

1. Create `internal/routes/skills_test.go`:
   - Test `parseSkillFrontmatter`:
     - Test simple single-line name and description.
     - Test folded multi-line description (`>-`).
     - Test fallback when frontmatter is absent (derives name from folder).
   - Test `ListSkills`:
     - Create temp directory structure with mock `.agents/skills/my-task/SKILL.md`.
     - Make authenticated HTTP GET request to `/api/skills?cwd=<tempDir>`.
     - Verify response contains `scope: "workspace"` for `my-task`.
   - Test `ScaffoldSkill`:
     - Make authenticated HTTP POST request to scaffold a new skill `test-runbook`.
     - Confirm `<tempDir>/.agents/skills/test-runbook/SKILL.md` is created with valid YAML frontmatter.
   - Test Security Path Traversal:
     - Attempt GET `/api/skills/content?path=/etc/passwd` → returns 400/403.
2. **Verify**: `go test -v ./internal/routes -run TestSkills` → PASS.

---

### Step 3: Implement Frontend API Client in `web/src/api/skills.ts`

1. Create `web/src/api/skills.ts`:
   - Define TypeScript interfaces:
     ```ts
     export interface SkillItem {
       name: string;
       description: string;
       scope: 'workspace' | 'global' | 'builtin';
       path: string;
       skillFile: string;
       hasScripts: boolean;
       hasResources: boolean;
       tags?: string[];
     }

     export interface SkillsPayload {
       workspacePath: string;
       isHome: boolean;
       skills: SkillItem[];
       count: number;
     }

     export interface SkillContentPayload {
       name: string;
       description: string;
       content: string;
       path: string;
     }
     ```
   - Implement functions:
     - `fetchSkills(token: string, cwd?: string): Promise<SkillsPayload>`
     - `fetchSkillContent(token: string, skillPath: string): Promise<SkillContentPayload>`
     - `scaffoldSkill(token: string, data: { name: string; description: string; scope: 'workspace' | 'global'; cwd?: string }): Promise<SkillItem>`
2. **Verify**: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.

---

### Step 4: Build Interactive Skills Management Modal in `web/src/components/SkillsManagementModal.tsx`

1. Create `web/src/components/SkillsManagementModal.tsx`:
   - Props: `isOpen: boolean`, `onClose: () => void`, `cwd?: string`, `token: string | null`, `onExecuteSkill?: (cmd: string) => void`.
   - Header with title: `SKILLS & CAPABILITIES MANAGEMENT`, badge showing active workspace name / home mode, and close button (`<CloseIcon />`).
   - Top Toolbar:
     - Scope Filter Tabs: `ALL (<count>)`, `PROJECT (<count>)`, `GLOBAL (<count>)`, `BUILT-IN (<count>)`.
     - Search input with debounce to filter skills by name or keyword.
     - `+ Create Project Skill` button (opens inline or modal scaffolding form).
   - Skills Grid / List View:
     - Each card displays:
       - Name (`/<name>`) with copy command button.
       - Scope badge: `PROJECT` (blue/cyan border), `GLOBAL` (purple border), `BUILT-IN` (green border).
       - Full description from `SKILL.md`.
       - Badges for `scripts/` or `resources/` if present.
       - Action buttons:
         - `[RUN / INSERT]` → sends `/<name> ` to chat editor or executes in terminal.
         - `[INSPECT SKILL.MD]` → opens embedded markdown preview drawer showing full instructions.
   - Skill Markdown Inspector Drawer:
     - Renders `SKILL.md` markdown instructions with syntax highlighting.
     - Copy button to copy skill file path or instructions.
   - Inline Scaffolding Form:
     - Name input (e.g. `deploy-staging`, `benchmark`), description input.
     - Generates `.agents/skills/<name>/SKILL.md` and refreshes list.
2. **Verify**: `npm run build --workspace=web` → exit 0.

---

### Step 5: Integrate Dynamic Skills into `AiChatView.tsx` & `CommandPalette.tsx`

1. In `web/src/components/AiChatView.tsx`:
   - Fetch skills on mount and when CWD/workspace changes via `fetchSkills(token, cwd)`.
   - Merge fetched workspace and global skills into the slash command suggestions dropdown (`/` trigger in prompt textarea).
   - In `/skills` command handler:
     - Open `SkillsManagementModal` (or dispatch `agy:open-skills-modal` event).
     - Output interactive chat card summarizing active workspace skills and global skills with quick-run buttons.
2. In `web/src/components/CommandPalette.tsx`:
   - Fetch skills from `fetchSkills` and dynamically populate the `SKILLS` category:
     - Title: `/<skill.name> — <skill.description>`.
     - Badge: `[PROJECT]` or `[GLOBAL]`.
     - Action: injects `/<skill.name> ` into active chat or runs command.
3. **Verify**: `npm run build --workspace=web` → exit 0.

---

### Step 6: Update `ShortcutsModal.tsx` and Navigation Rail

1. In `web/src/components/ShortcutsModal.tsx`:
   - In TAB 3 (`SKILLS & TOOLS REFERENCE`):
     - Replace static `LIFECYCLE_SKILLS` with a dynamic loader that fetches live skills.
     - Display a prominent banner: `WORKSPACE-SCOPED SKILLS (ACTIVE REPO)` vs `GLOBAL & LIFECYCLE SKILLS`.
     - Add `[OPEN SKILLS MANAGER]` button linking directly to `SkillsManagementModal`.
2. In `web/src/components/NavigationRail.tsx`:
   - Add a quick-access item or tooltip shortcut `⌥S` (Skills Hub) to launch the `SkillsManagementModal`.
3. **Verify**: `npm run build --workspace=web` → exit 0.

---

### Step 7: Create Frontend Unit Tests in `web/src/components/SkillsManagementModal.test.tsx`

1. Create `web/src/components/SkillsManagementModal.test.tsx`:
   - Test rendering modal with mock skills payload containing workspace, global, and builtin skills.
   - Test scope filter buttons (`ALL`, `PROJECT`, `GLOBAL`, `BUILT-IN`).
   - Test search filtering by skill name.
   - Test clicking "Inspect" fetches and displays skill markdown content.
   - Test clicking "Run" calls `onExecuteSkill`.
2. **Verify**: `npx vitest run src/components/SkillsManagementModal.test.tsx` → exit 0.

---

### Step 8: Final Full Test Suite & Production Build Verification

1. Run full test suite:
   ```bash
   npm test
   ```
   Confirm all Vitest test suites and Go backend test suites pass with 0 failures.
2. Run production build:
   ```bash
   npm run build
   ```
   Confirm Vite bundle builds with 0 errors and single Go static binary `bin/ai-cli-online` compiles cleanly.

---

## Test plan

- **Backend**: `internal/routes/skills_test.go`
  - Tests `parseSkillFrontmatter` with edge cases (multi-line, missing markers, missing fields).
  - Tests `ListSkills` discovery across mock project directories, global plugins, and builtins.
  - Tests path traversal prevention on `/api/skills/content`.
  - Tests `ScaffoldSkill` file creation.
- **Frontend**: `web/src/components/SkillsManagementModal.test.tsx`
  - Tests filtering between project-specific and global skills.
  - Tests search query filtering.
  - Tests skill execution callback.
- **Regression**:
  - `CommandPalette.test.tsx`, `HelpGuideModal.test.tsx`, `ResponsiveLayout.test.tsx` continue to pass without failure.

## Done criteria

- [ ] `GET /api/skills` returns partitioned list of workspace, global, and builtin skills.
- [ ] `GET /api/skills/content` returns parsed markdown instructions safely.
- [ ] `POST /api/skills/scaffold` creates new `.agents/skills/<name>/SKILL.md` in active project workspace.
- [ ] `SkillsManagementModal.tsx` renders in browser with scope filter tabs and search.
- [ ] `AiChatView.tsx` slash autocomplete dynamically includes active project workspace skills.
- [ ] `CommandPalette.tsx` dynamically displays live project skills in `SKILLS` category.
- [ ] `npm test` passes with 0 failures across all Go and Vitest test suites.
- [ ] `npm run build` exits 0 with cleanly compiled static binary.
- [ ] `plans/README.md` status row for Plan 007 is updated.

## STOP conditions

- If directory walking encounters permission denied on system directories, skip that path gracefully without returning a 500 error.
- Do not import external YAML parser libraries in Go (use standard library strings/scanner) to maintain zero CGO and minimal binary footprint.
- Do not add external npm packages.

## Maintenance notes

- When a user switches workspaces via `WorkspaceSelector`, the frontend should re-query `/api/skills?cwd=<new_cwd>` to reflect that workspace's local `.agents/skills/`.
