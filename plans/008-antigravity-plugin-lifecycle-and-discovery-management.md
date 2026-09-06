# Plan 008: Antigravity Plugin Lifecycle and Discovery Management

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5ef39c5..HEAD -- internal/routes/ web/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `5ef39c5`, 2026-09-06

## Why this matters

Google Antigravity CLI (`agy`) organizes modular extensions through plugins (such as `ai-cli-task` for the 13-skill task lifecycle). Plugins are tracked in `~/.gemini/config/import_manifest.json` and stored under `~/.gemini/config/plugins/<name>/` with rich manifests (`plugin.json`) defining provided skills and commands. Currently, AGY Online has **zero** plugin management APIs or interfaces. `PlanPanel.tsx` works around this deficiency by making brittle, raw file reads of `import_manifest.json` over the general session file API, which frequently triggers false-positive "ai-cli-task plugin not installed" banners when sessions initialize. Furthermore, `/plugins` is advertised in slash command autocomplete and shortcuts documentation, but typing it does nothing. Building a native Go plugin management route and an interactive React management modal gives users visual control over installed plugins, marketplace installs, component inspection, and clean health checks.

## Current state

1. **`internal/server/server.go` (Lines 60–75)**:
   - Registers routes for sessions, files, editor, git, settings, workspaces, conversations, and skills, but has **zero** plugin endpoints:
   ```go
   // Skills Management
   mux.HandleFunc("GET /api/skills", skillsH.ListSkills)
   mux.HandleFunc("GET /api/skills/content", skillsH.GetSkillContent)
   mux.HandleFunc("POST /api/skills/scaffold", skillsH.ScaffoldSkill)
   ```
2. **`web/src/components/PlanPanel.tsx` (Lines 138–155)**:
   - Reads `import_manifest.json` directly using `fetchFileContent`:
   ```tsx
   const manifestFile = `${home}/.gemini/config/import_manifest.json`;
   const result = await fetchFileContent(token, sessionId, manifestFile, 0);
   if (!cancelled && result) {
     try {
       const parsed = JSON.parse(result.content);
       const imports = parsed.imports || [];
       const hasPlugin = imports.some((imp: { name?: string }) => imp.name === 'ai-cli-task');
       if (!hasPlugin) setShowPluginPrompt(true);
     } catch { setShowPluginPrompt(true); }
   }
   ```
3. **`web/src/components/AiChatView.tsx` (Lines 87, 680–730)**:
   - Line 87 declares: `{ cmd: '/plugins', desc: 'Manage Antigravity CLI plugins', category: 'common' }`.
   - In `handleSendMessage`, there is zero logic handling `/plugins`.
4. **Antigravity Plugin Manifests on Disk**:
   - `~/.gemini/config/import_manifest.json`:
     ```json
     {
       "imports": [
         {
           "name": "ai-cli-task",
           "source": "antigravity",
           "importedAt": "2026-09-03T17:51:23Z",
           "components": ["skills", "commands"]
         }
       ]
     }
     ```
   - `~/.gemini/config/plugins/ai-cli-task/plugin.json`:
     ```json
     {
       "name": "ai-cli-task",
       "version": "0.3.6",
       "description": "Task lifecycle management for Antigravity CLI",
       "author": { "name": "huacheng" },
       "skills": "./skills/",
       "commands": "./commands/"
     }
     ```

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Build     | `npm run build`          | exit 0, bundle built|
| Typecheck | `npx tsc --noEmit -p web/tsconfig.json` | exit 0, no errors|
| Tests     | `npm test`               | all tests pass      |
| Go Tests  | `go test ./internal/routes -v -run TestPlugins` | PASS |

## Scope

**In scope**:
- `internal/routes/plugins.go` (Create Go handler for plugin discovery, inspection, and execution)
- `internal/routes/plugins_test.go` (Create unit tests for plugin handler)
- `internal/server/server.go` (Register `/api/plugins`, `/api/plugins/{name}`, `/api/plugins/install`, `/api/plugins/uninstall`, `/api/plugins/toggle`)
- `web/src/api/plugins.ts` (Create frontend API client for plugins)
- `web/src/components/PluginsModal.tsx` (Create interactive plugin management modal)
- `web/src/components/PluginsModal.test.tsx` (Create Vitest suite for PluginsModal)
- `web/src/components/PlanPanel.tsx` (Refactor plugin check to use `/api/plugins`)
- `web/src/components/AiChatView.tsx` (Wire `/plugins` slash command and modal trigger)
- `web/src/components/CommandPalette.tsx` (Add `/plugins` launcher command)

**Out of scope**:
- Do not modify plugin source code or skills inside `~/.gemini/config/plugins/`.
- Do not install third-party npm packages.
- Do not change `agy` CLI binary or execution flags.

## Git workflow

- Branch: `advisor/008-antigravity-plugin-lifecycle-management`
- Commit per logical step; message style: `feat(plugins): <description>`
- Do NOT push or merge unless instructed.

## Steps

### Step 1: Implement Backend Plugin Handler in `internal/routes/plugins.go`

1. Create `internal/routes/plugins.go`:
   - Data models:
     ```go
     type PluginComponent string

     type PluginItem struct {
         Name        string            `json:"name"`
         Version     string            `json:"version,omitempty"`
         Description string            `json:"description,omitempty"`
         Author      string            `json:"author,omitempty"`
         Source      string            `json:"source"`
         ImportedAt  string            `json:"importedAt,omitempty"`
         Components  []string          `json:"components"`
         Enabled     bool              `json:"enabled"`
         Path        string            `json:"path"`
         HasSkills   bool              `json:"hasSkills"`
         HasCommands bool              `json:"hasCommands"`
         SkillsCount int               `json:"skillsCount"`
     }

     type PluginsResponse struct {
         Plugins []PluginItem `json:"plugins"`
         Count   int          `json:"count"`
     }

     type InstallPluginRequest struct {
         Target string `json:"target"` // marketplace name (e.g. "plugin@marketplace") or local path
     }

     type UninstallPluginRequest struct {
         Name string `json:"name"`
     }

     type TogglePluginRequest struct {
         Name   string `json:"name"`
         Enable bool   `json:"enable"`
     }
     ```
   - Implement `PluginsHandler`:
     - `ListPlugins(w http.ResponseWriter, r *http.Request)`:
       - Checks authentication via `h.auth.CheckAuth(r)`.
       - Reads `~/.gemini/config/import_manifest.json`.
       - For each imported plugin, checks directory `~/.gemini/config/plugins/<name>/`.
       - Parses `plugin.json` if present to extract `version`, `description`, `author`.
       - Counts skills in `<pluginDir>/skills` and commands in `<pluginDir>/commands`.
       - Returns `PluginsResponse`.
     - `GetPlugin(w http.ResponseWriter, r *http.Request)`:
       - Extracts `{name}` path parameter.
       - Validates alphanumeric naming.
       - Returns detailed plugin inspection payload.
     - `InstallPlugin(w http.ResponseWriter, r *http.Request)`:
       - Accepts POST JSON `{ "target": "..." }`.
       - Runs `agy plugin install <target>` via `exec.CommandContext`.
       - Returns 200 with CLI stdout/stderr or appropriate error.
     - `UninstallPlugin(w http.ResponseWriter, r *http.Request)`:
       - Accepts POST JSON `{ "name": "..." }`.
       - Runs `agy plugin uninstall <name>`.
       - Returns 200 on success.
     - `TogglePlugin(w http.ResponseWriter, r *http.Request)`:
       - Accepts POST JSON `{ "name": "...", "enable": true|false }`.
       - Runs `agy plugin enable <name>` or `agy plugin disable <name>`.
2. In `internal/server/server.go`:
   - Initialize `plugH := routes.NewPluginsHandler(auth)`.
   - Register routes:
     - `mux.HandleFunc("GET /api/plugins", plugH.ListPlugins)`
     - `mux.HandleFunc("GET /api/plugins/{name}", plugH.GetPlugin)`
     - `mux.HandleFunc("POST /api/plugins/install", plugH.InstallPlugin)`
     - `mux.HandleFunc("POST /api/plugins/uninstall", plugH.UninstallPlugin)`
     - `mux.HandleFunc("POST /api/plugins/toggle", plugH.TogglePlugin)`
3. **Verify**: `go build -o /dev/null ./cmd/ai-cli-online` → exit 0.

---

### Step 2: Implement Backend Unit Tests in `internal/routes/plugins_test.go`

1. Create `internal/routes/plugins_test.go`:
   - Test `ListPlugins`:
     - Sets up temp `HOME` with mock `.gemini/config/import_manifest.json` and `.gemini/config/plugins/ai-cli-task/plugin.json`.
     - Verifies `GET /api/plugins` returns 200 with `count: 1`, name `ai-cli-task`, and parsed metadata.
     - Verifies unauthenticated request returns 401.
   - Test `GetPlugin`:
     - Verifies `GET /api/plugins/ai-cli-task` returns plugin details.
     - Verifies non-existent plugin returns 404.
   - Test input validation:
     - Invalid plugin name with path traversal characters returns 400.
2. **Verify**: `go test -v ./internal/routes -run TestPlugins` → PASS.

---

### Step 3: Implement Frontend API Client in `web/src/api/plugins.ts`

1. Create `web/src/api/plugins.ts`:
   - Define TypeScript interfaces:
     ```ts
     export interface PluginItem {
       name: string;
       version?: string;
       description?: string;
       author?: string;
       source: string;
       importedAt?: string;
       components: string[];
       enabled: boolean;
       path: string;
       hasSkills: boolean;
       hasCommands: boolean;
       skillsCount: number;
     }

     export interface PluginsResponse {
       plugins: PluginItem[];
       count: number;
     }
     ```
   - Implement functions:
     - `fetchPlugins(token: string): Promise<PluginsResponse>`
     - `fetchPluginDetails(token: string, name: string): Promise<PluginItem>`
     - `installPlugin(token: string, target: string): Promise<{ ok: boolean; message?: string }>`
     - `uninstallPlugin(token: string, name: string): Promise<{ ok: boolean }>`
     - `togglePlugin(token: string, name: string, enable: boolean): Promise<{ ok: boolean }>`
2. **Verify**: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.

---

### Step 4: Build Interactive Plugins Management Modal in `web/src/components/PluginsModal.tsx`

1. Create `web/src/components/PluginsModal.tsx`:
   - Props: `isOpen: boolean`, `onClose: () => void`, `token: string | null`, `onSendToTerminal?: (cmd: string) => void`.
   - Header:
     - Icon: `<PuzzleIcon size={16} />`
     - Title: `ANTIGRAVITY PLUGINS & EXTENSIONS`
     - Counter badge: `${count} INSTALLED`
     - Close button (`<CloseIcon />`)
   - Toolbar:
     - Search filter for plugin name and keywords.
     - `+ Install Plugin` button (toggles inline installation card).
     - Refresh button.
   - Installation Card:
     - Input for plugin name/marketplace or local directory path.
     - Quick buttons for official plugins (e.g. `ai-cli-task`).
     - Install action button triggering `installPlugin`.
   - Plugins List:
     - Card per plugin:
       - Name (`name`), Version tag (`v${version}`), Source badge (`${source}`).
       - Description from `plugin.json`.
       - Components pills: `skills (${skillsCount})`, `commands`.
       - Actions:
         - Enable / Disable toggle button.
         - Uninstall button (with confirmation).
         - Terminal run button (`agy plugin ...`).
2. **Verify**: `npm run build --workspace=web` → exit 0.

---

### Step 5: Wire `/plugins` Command and Refactor `PlanPanel.tsx`

1. In `web/src/components/AiChatView.tsx`:
   - Import `PluginsModal` and `fetchPlugins`.
   - Add state: `const [showPluginsModal, setShowPluginsModal] = useState(false)`.
   - Listen for event `agy:open-plugins-modal` and keyboard shortcut `⌥P`.
   - In `handleSendMessage`:
     - Handle `/plugins` and `/plugins list`:
       - Open `PluginsModal`.
       - Output formatted chat response summarizing installed plugins.
   - Render `<PluginsModal isOpen={showPluginsModal} onClose={() => setShowPluginsModal(false)} token={token} />` at bottom of JSX.
2. In `web/src/components/PlanPanel.tsx`:
   - Replace lines 138–155:
     - Instead of raw-reading `import_manifest.json` over session file API, call `fetchPlugins(token)`.
     - Check `plugins.some(p => p.name === 'ai-cli-task')`.
     - Eliminate false-positive "ai-cli-task not installed" flashes.
3. In `web/src/components/CommandPalette.tsx`:
   - Add launcher command:
     ```tsx
     {
       id: 'cmd-plugins-manager',
       category: 'SYSTEM',
       title: 'Antigravity Plugins — Manage Extensions & Toolkits',
       desc: 'Inspect installed plugins, components, and marketplace packages',
       shortcut: '⌥P',
       action: () => {
         window.dispatchEvent(new CustomEvent('agy:open-plugins-modal'));
         onClose();
       },
     }
     ```
4. **Verify**: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.

---

### Step 6: Create Frontend Unit Tests in `web/src/components/PluginsModal.test.tsx`

1. Create `web/src/components/PluginsModal.test.tsx`:
   - Test modal rendering with mock plugin data (`ai-cli-task`).
   - Test search filter by plugin name.
   - Test install plugin submit triggering API call.
   - Test toggle enable/disable.
   - Test uninstall confirmation flow.
2. **Verify**: `npx vitest run src/components/PluginsModal.test.tsx` → exit 0.

---

### Step 7: Final End-to-End Verification & Service Restart

1. Run full test suite:
   ```bash
   npm test
   ```
   Confirm all Vitest test files and Go test packages pass with 0 failures.
2. Run production build:
   ```bash
   npm run build
   ```
   Confirm clean Vite build and static Go binary compilation.
3. Restart server and verify live endpoints:
   ```bash
   ./bin/ai-cli-online restart
   curl -s -H "Authorization: Bearer <token>" http://localhost:3001/api/plugins
   ```

---

## Test plan

- **Backend**: `internal/routes/plugins_test.go`
  - Tests reading and parsing `import_manifest.json` and `plugin.json`.
  - Tests input validation and path sanitization.
  - Tests 401 unauthorized handling.
- **Frontend**: `web/src/components/PluginsModal.test.tsx`
  - Tests plugin card rendering with version and badges.
  - Tests install/uninstall/toggle callbacks.
  - Tests search filtering.
- **Regression**:
  - `PlanPanel.tsx`, `AiChatView.tsx`, `CommandPalette.test.tsx`, `SkillsManagementModal.test.tsx` continue to pass without regression.

## Done criteria

- [ ] `GET /api/plugins` returns parsed list of installed plugins with component counts.
- [ ] `POST /api/plugins/install` and `POST /api/plugins/uninstall` execute CLI plugin management commands.
- [ ] `PluginsModal.tsx` renders in browser with search, install form, and status toggles.
- [ ] Typing `/plugins` in `AiChatView.tsx` opens the modal and displays installed plugins summary.
- [ ] `PlanPanel.tsx` uses `/api/plugins` for robust plugin verification.
- [ ] `npm test` passes with 0 failures across all web and Go tests.
- [ ] `npm run build` exits 0.
- [ ] `plans/README.md` status row for Plan 008 is updated.

## STOP conditions

- If `agy plugin list` CLI command format differs from JSON, fall back to parsing `~/.gemini/config/import_manifest.json` directly.
- Do not modify files in `~/.gemini/config/plugins/` directly from Go; use `agy plugin` subcommands.
- Do not install external npm packages.

## Maintenance notes

- Whenever a plugin is installed or uninstalled, frontend should dispatch `agy:refresh-skills` or invalidate skills cache so new skills appear immediately in the Skills Hub.
