# Plan 035: Automatic Hermes Plugin to AGY Agent Skill Converter and Importer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2cba69c..HEAD -- internal/routes/skills.go internal/routes/skills_test.go internal/routes/hermes_converter.go internal/routes/hermes_converter_test.go internal/server/server.go web/src/api/skills.ts web/src/components/SkillsManagementModal.tsx web/src/components/SkillsManagementModal.test.tsx web/src/components/CommandPalette.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/034-skills-sh-integration.md
- **Category**: dx
- **Planned at**: commit `2cba69c`, 2026-09-09
- **Issue**: none

## Why this matters

Hermes Agent (`NousResearch/hermes-agent`) has an active ecosystem of community plugins containing rich tools, APIs, and integrations. However, Hermes plugins run in-process inside a Python interpreter using `plugin.yaml`, `schemas.py`, and `tools.py`, which is incompatible with Google Antigravity CLI (`agy`)'s declarative Agent Skill standard (`SKILL.md` bundles executed via progressive disclosure).
Currently, converting a Hermes plugin to an AGY skill requires manual effort: reading Python source code, constructing markdown parameter tables, creating a CLI invocation wrapper, and authoring YAML frontmatter.
This plan implements an automated, 1-click Hermes-to-Skill converter and importer in AGY Online: users paste any Hermes plugin source (GitHub repository, Git URL, or local folder), and the Go backend automatically parses the plugin manifest and Python function schemas, generates a structured `SKILL.md`, injects a universal zero-touch `runner.py` adapter, and installs the skill into `.agents/skills/<name>` or `~/.agents/skills/<name>`, ready for immediate execution in AGY Online.

## Current state

- Relevant files:
  - `internal/routes/skills.go` — Backend skills management (scans `.agents/skills`, handles search, install, delete, sync, lockfile).
  - `internal/routes/skills_test.go` — Backend tests for skills routes.
  - `internal/server/server.go` — HTTP route registration for `/api/skills/*`.
  - `web/src/api/skills.ts` — TypeScript API client for skills.
  - `web/src/components/SkillsManagementModal.tsx` — Skills Hub modal with Installed and Explore tabs.
  - `web/src/components/SkillsManagementModal.test.tsx` — Tests for SkillsManagementModal.
  - `web/src/components/CommandPalette.tsx` — Quick actions in Command Palette.
  - `skills-lock.json` — Lockfile in workspace root tracking installed skills and sources.

- Existing route registration in `internal/server/server.go:81-87`:
```go
	mux.HandleFunc("GET /api/skills", skillsH.ListSkills)
	mux.HandleFunc("GET /api/skills/content", skillsH.GetSkillContent)
	mux.HandleFunc("POST /api/skills/scaffold", skillsH.ScaffoldSkill)
	mux.HandleFunc("GET /api/skills/search", skillsH.SearchSkills)
	mux.HandleFunc("POST /api/skills/install", skillsH.InstallSkill)
	mux.HandleFunc("DELETE /api/skills", skillsH.DeleteSkill)
	mux.HandleFunc("POST /api/skills/sync", skillsH.SyncSkills)
```

- Target Hermes plugin structure to convert:
```text
hermes-plugin/
├── plugin.yaml       # Manifest: name, version, description, requires_env, optional_env
├── schemas.py        # Tool parameter schemas
├── tools.py          # Python function implementations
└── __init__.py       # Hermes register(ctx)
```

- Target AGY Skill structure to produce:
```text
.agents/skills/<name>/
├── SKILL.md          # Generated YAML frontmatter + markdown parameter tables + run instructions
└── scripts/
    ├── runner.py     # Injected universal CLI adapter
    ├── tools.py      # Preserved Python logic from Hermes plugin
    └── schemas.py    # Preserved schema metadata (if present)
```

- Conventions:
  - Pure Go (0 CGO), safe path resolution (`filepath.Clean`).
  - Standard JSON response format: `{"ok": true, ...}` or `{"error": "..."}`.
  - UI design tokens match CSS variables (`var(--bg-primary)`, `var(--accent-purple)`, `var(--accent-cyan)`, `var(--accent-green)`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npm run build --workspace=web` | exit 0, no errors |
| Web Tests | `npx vitest run web/src/components/SkillsManagementModal.test.tsx` | all tests pass |
| Go Tests  | `go test -v ./internal/routes -run TestHermesConverter` | PASS |
| All Tests | `npm test`               | exit 0, 100% pass   |
| Go Build  | `go build -o bin/ai-cli-online ./cmd/ai-cli-online` | exit 0 |

## Scope

**In scope**:
- `internal/routes/hermes_converter.go` (create) — Parser for Hermes `plugin.yaml`, Python function extractor, Markdown generator for `SKILL.md`, and runner bundler.
- `internal/routes/hermes_converter_test.go` (create) — Comprehensive unit tests for Hermes detection, schema parsing, markdown generation, and conversion.
- `internal/routes/skills.go` — Add `ConvertHermesPlugin` endpoint (`POST /api/skills/convert-hermes`).
- `internal/server/server.go` — Register `POST /api/skills/convert-hermes`.
- `web/src/api/skills.ts` — Add `convertHermesPlugin` typed API method and `ConvertHermesPayload`.
- `web/src/components/HermesConverterModal.tsx` (create) — Dedicated, standalone Hermes Converter modal with source input (GitHub repo `owner/repo`, Git URL, local folder), scope selector (`Project (.agents/skills)` vs `Global (~/.agents/skills)`), custom skill name override, real-time conversion progress/spinner, error banner, and instructions preview. (Strictly separated from `SkillsManagementModal.tsx`).
- `web/src/components/HermesConverterModal.test.tsx` (create) — Comprehensive unit tests for `HermesConverterModal`.
- `web/src/components/NavigationRail.tsx` — Add dedicated "HERMES" navigation item in the SYSTEM menu (with keyboard shortcut `⌥H`) that opens the Hermes Converter modal.
- `web/src/components/CommandPalette.tsx` — Add `/hermes-convert` quick command in Command Palette.
- `web/src/App.tsx` — Register `agy:open-hermes-modal` event listener, `⌥H` global hotkey, and render `<HermesConverterModal />`.

**Out of scope**:
- Modifying `SkillsManagementModal.tsx` (user explicitly requested not using the same menu as skill management).
- Rewriting Python source code into other languages.
- Supporting Hermes plugins that rely on compiled C-extensions not available on the host machine.
- Modifying `ai-cli-task` core plugin files.

## Git workflow

- Branch: `advisor/035-hermes-plugin-converter`
- Commit message style: Conventional Commits, matching `feat(skills): automatic hermes plugin to agent skill converter and importer`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `internal/routes/hermes_converter.go`

1. Define data models:
```go
package routes

type HermesToolParam struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
	Default     string `json:"default,omitempty"`
}

type HermesToolDef struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Parameters  []HermesToolParam `json:"parameters"`
}

type HermesPluginMetadata struct {
	Name        string          `json:"name"`
	Version     string          `json:"version"`
	Description string          `json:"description"`
	RequiresEnv []string        `json:"requires_env,omitempty"`
	OptionalEnv []string        `json:"optional_env,omitempty"`
	Tools       []HermesToolDef `json:"tools"`
}

type ConvertHermesRequest struct {
	Source     string `json:"source"`     // e.g. "owner/repo", Git URL, or local path
	CustomName string `json:"customName"` // optional custom skill name
	Scope      string `json:"scope"`      // "workspace" or "global"
	Cwd        string `json:"cwd"`
}
```

2. Implement `DetectHermesPlugin(dir string) bool`:
   - Returns true if directory contains `plugin.yaml` or `plugin.yml`, or contains `tools.py` with Hermes references.

3. Implement `ParseHermesManifest(manifestPath string) (name, version, desc string, reqEnv, optEnv []string, err error)`:
   - Scans YAML content line by line (or parses YAML) to extract `name:`, `version:`, `description:`, `requires_env:`, and `optional_env:`.

4. Implement `ExtractPythonTools(toolsPyPath, schemasPyPath string) ([]HermesToolDef, error)`:
   - Reads `tools.py` and `schemas.py`.
   - Uses regex and AST heuristics to extract:
     - Function signatures: `def <name>(<args>):`
     - Docstrings: `"""..."""`
     - Parameter names, types, and default values.
   - If `schemas.py` is present, parses JSON schemas for tool definitions (matching OpenAI function-calling schema `name`, `description`, `parameters.properties`).

5. Implement `GenerateSkillMarkdown(meta HermesPluginMetadata) string`:
   - Builds complete `SKILL.md`:
     - YAML frontmatter with `name` and action-oriented `description` mentioning Hermes origin and trigger conditions.
     - `# <Title>` overview.
     - `## When to Use` section.
     - `## Environment Requirements` (documenting `requires_env` and `optional_env`).
     - `## Available Tools & CLI Commands`: For each tool:
       - Markdown parameter table (`Parameter`, `Type`, `Required`, `Description`).
       - Example CLI command: `python3 scripts/runner.py <tool_name> '{"param1": "val"}'`.
     - `## Execution Instructions for the Agent`: Step-by-step guidance on running via `run_command`, handling missing env keys, and formatting output.

6. Implement `InjectUniversalRunner(scriptsDir string) error`:
   - Writes `scripts/runner.py` with Python code that imports `tools.py`, inspects functions, parses CLI JSON payload, invokes the function, and pretty-prints the result (as specified in the architecture blueprint).
   - Sets file permissions to `0755`.

7. Implement `ConvertHermesDirectory(sourceDir, targetDir, skillName string, meta HermesPluginMetadata) error`:
   - Creates `targetDir/scripts`.
   - Writes generated `SKILL.md` to `targetDir/SKILL.md`.
   - Writes `targetDir/scripts/runner.py`.
   - Copies `tools.py`, `schemas.py`, and other `.py` files from `sourceDir` to `targetDir/scripts/`.

**Verify**: `go build -o /dev/null ./cmd/ai-cli-online` → exit 0.

### Step 2: Add `POST /api/skills/convert-hermes` in `internal/routes/skills.go`

1. In `internal/routes/skills.go`, implement `ConvertHermesPlugin(w http.ResponseWriter, r *http.Request)`:
   - Authenticate request via `h.auth.CheckAuth(r)`.
   - Decode `ConvertHermesRequest`. Validate `source` (reject dangerous shell metacharacters).
   - Resolve temporary working folder:
     - If `source` is a local directory: inspect directly.
     - If `source` is a GitHub repository (`owner/repo` or `https://github.com/...`): clone with `git clone --depth 1 <url> <tmpDir>` or fetch archive tarball.
   - Verify `DetectHermesPlugin(tmpDir)`. If not a Hermes plugin, return 400 Bad Request ("Not a valid Hermes plugin: missing plugin.yaml or tools.py").
   - Parse manifest and extract tools.
   - Determine skill name: `req.CustomName`, fallback to `meta.Name`, fallback to repository name. Sanitize to alphanumeric + hyphens.
   - Resolve target directory (`.agents/skills/<name>` for workspace, `~/.agents/skills/<name>` for global).
   - Execute conversion and bundling.
   - Update `skills-lock.json` with entry:
     ```json
     "<name>": {
       "source": "<source>",
       "sourceType": "hermes-plugin",
       "skillPath": "SKILL.md",
       "computedHash": "<sha256>"
     }
     ```
   - Return 201 Created with `SkillItem`.

### Step 3: Register Route in `internal/server/server.go`

1. Register endpoint:
```go
	mux.HandleFunc("POST /api/skills/convert-hermes", skillsH.ConvertHermesPlugin)
```

**Verify**: `go build -o /dev/null ./cmd/ai-cli-online` → exit 0.

### Step 4: Add Backend Tests in `internal/routes/hermes_converter_test.go`

1. Create test fixture with mock Hermes plugin:
   - `plugin.yaml` with `name: crypto-tracker`, `requires_env: [CRYPTO_API_KEY]`.
   - `tools.py` with `def get_price(coin: str = "btc", currency: str = "usd"): """Fetch current crypto price."""`.
2. Test `DetectHermesPlugin`: returns true for fixture, false for empty dir.
3. Test `ParseHermesManifest`: extracts metadata and env vars correctly.
4. Test `ExtractPythonTools`: correctly extracts function name, docstring, and parameters.
5. Test `GenerateSkillMarkdown`: verifies presence of YAML frontmatter, parameter tables, and CLI example.
6. Test `ConvertHermesPlugin` HTTP handler:
   - Posts fixture directory as source.
   - Verifies converted skill is created in `.agents/skills/crypto-tracker/SKILL.md`.
   - Verifies `scripts/runner.py` and `scripts/tools.py` exist and are executable.
   - Verifies `skills-lock.json` contains `"sourceType": "hermes-plugin"`.

**Verify**: `go test -v ./internal/routes -run TestHermesConverter` → all pass.

### Step 5: Extend TypeScript API Client in `web/src/api/skills.ts`

1. Add interfaces and method:
```typescript
export interface ConvertHermesPayload {
  source: string;
  customName?: string;
  scope: 'workspace' | 'global';
  cwd?: string;
}

export async function convertHermesPlugin(token: string, payload: ConvertHermesPayload): Promise<SkillItem> {
  const res = await fetch('/api/skills/convert-hermes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to convert Hermes plugin: ${res.statusText}`);
  }
  return res.json();
}
```

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exit 0.

### Step 6: Create Dedicated `web/src/components/HermesConverterModal.tsx`

1. Build standalone modal:
   - Header: `HERMES PLUGIN CONVERTER` with `PuzzleIcon` / `BoltIcon` in amber/cyan styling, badge indicator, and close button.
   - Informative subtitle / banner: Explains how NousResearch Hermes Agent plugins (`plugin.yaml` + `tools.py`) are automatically converted into zero-touch AGY Agent Skills (`SKILL.md` + universal `runner.py`).
   - Input fields:
     - `Plugin Source`: Placeholder `owner/repo, https://github.com/..., or local path (e.g. ./hermes-plugins/crypto)`.
     - `Custom Skill Name`: Optional name override (e.g. `crypto-tracker`).
     - `Target Scope`: Radio or select between `Project (.agents/skills)` and `Global (~/.agents/skills)`.
   - Quick Example Presets: Provide 2-3 clickable presets (e.g., `NousResearch/hermes-agent`, local sample) to pre-fill the form.
   - Action Buttons:
     - `Convert & Install as Skill`: Triggers `convertHermesPlugin()`, displays spinner with `CONVERTING & BUNDLING...`, disables inputs while in-flight.
     - `Cancel`: Closes modal.
   - Status & Result Feedback:
     - Error alert banner: Explains missing manifest, syntax issues, or network errors with clear resolution hints.
     - Success banner: Displays converted skill name, installation path, and sample usage command (e.g., `python3 scripts/runner.py <tool_name> '{}'`).
   - Accessible dialog markup (`role="dialog"`, `aria-modal="true"`, Escape key dismiss, backdrop click dismiss).

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exit 0.

### Step 7: Create Unit Tests in `web/src/components/HermesConverterModal.test.tsx`

1. Add tests covering:
   - Rendering modal when `isOpen={true}` and not rendering when `isOpen={false}`.
   - Form input validation (prevent submit on empty source).
   - Calling `convertHermesPlugin()` with correct payload upon form submit.
   - Displaying error message when API call rejects.
   - Displaying success message and trigger `onConverted` callback when conversion succeeds.
   - Keyboard accessibility: pressing Escape calls `onClose`.

**Verify**: `npx vitest run web/src/components/HermesConverterModal.test.tsx` → all pass.

### Step 8: Wire NavigationRail, CommandPalette, and App.tsx

1. In `web/src/components/NavigationRail.tsx`:
   - Add a dedicated navigation button under the SYSTEM section:
     - Icon: `PuzzleIcon` or `BoltIcon` (styled in `var(--accent-amber-bright)`).
     - Label: `HERMES IMPORT` (or `HERMES CONVERTER`).
     - Action: dispatches `window.dispatchEvent(new CustomEvent('agy:open-hermes-modal'))`.
     - Tooltip: `Hermes Plugin Converter (⌥H)`.
2. In `web/src/components/CommandPalette.tsx`:
   - Add command palette action:
     - `id: 'cmd-hermes-convert'`
     - `category: 'HERMES'`
     - `title: 'Hermes Plugin Converter: Convert to AGY Skill'`
     - `desc: 'Convert any Hermes Agent plugin (repo, git URL, local folder) into an Antigravity skill'`
     - `action: () => window.dispatchEvent(new CustomEvent('agy:open-hermes-modal'))`
3. In `web/src/App.tsx`:
   - State: `const [hermesConverterOpen, setHermesConverterOpen] = useState(false);`
   - Event listener: listen for `agy:open-hermes-modal` and global hotkey `Alt+H` (`⌥H`).
   - Render `<HermesConverterModal isOpen={hermesConverterOpen} onClose={() => setHermesConverterOpen(false)} token={token} cwd={cwd || undefined} />`.

**Verify**: `npx vitest run web/src/components/CommandPalette.test.tsx` → all pass.

### Step 9: Full Verification & Static Binary Compilation

1. Run full web test suite: `npm run test --workspace=web`.
2. Run Go test suite: `go test -v ./...`.
3. Compile single production static binary: `npm run build` (or `go build -o bin/ai-cli-online ./cmd/ai-cli-online`).
4. Verify `./bin/ai-cli-online status` returns clean status.

**Verify**: `npm test` → all tests pass 100%.

## Test plan

- **Go Tests** (`internal/routes/hermes_converter_test.go`):
  - `TestHermesConverter_Detection`: Validates detection of `plugin.yaml` and `tools.py`.
  - `TestHermesConverter_ParseManifest`: Validates YAML parsing of metadata, requirements, and env variables.
  - `TestHermesConverter_ExtractTools`: Validates Python function signature and docstring extraction.
  - `TestHermesConverter_GenerateMarkdown`: Validates generated `SKILL.md` frontmatter, parameter tables, and runner instructions.
  - `TestHermesConverter_EndToEndConversion`: Validates complete conversion pipeline, runner generation, and lockfile recording.
- **Frontend Tests** (`web/src/components/HermesConverterModal.test.tsx`):
  - Rendering Hermes conversion modal.
  - Successful form submission calling `convertHermesPlugin`.
  - Error alert handling on non-Hermes repositories.
  - Escape key closing modal.
- **Verification**: `npm test` → all test suites pass 100%.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `POST /api/skills/convert-hermes` accepts `{ source, scope, cwd }`, detects Hermes plugin, generates `SKILL.md` and `scripts/runner.py`, and installs into `.agents/skills/<name>`.
- [ ] Converted skill includes working `scripts/runner.py` with executable permissions (`0755`).
- [ ] `skills-lock.json` is updated with `"sourceType": "hermes-plugin"`.
- [ ] `POST /api/skills/convert-hermes` returns 400 with helpful error message if source is not a valid Hermes plugin.
- [ ] `web/src/components/HermesConverterModal.tsx` provides dedicated standalone converter modal (separated from `SkillsManagementModal.tsx`).
- [ ] `web/src/components/NavigationRail.tsx` contains dedicated "HERMES IMPORT" navigation item with `⌥H` shortcut.
- [ ] `web/src/components/CommandPalette.tsx` contains `/hermes-convert` command.
- [ ] `npx vitest run web/src/components/HermesConverterModal.test.tsx` passes 100%.
- [ ] `go test -v ./internal/routes -run TestHermesConverter` passes 100%.
- [ ] `npm test` passes across all web and Go packages with 0 errors.
- [ ] `npm run build` succeeds, compiling static binary `bin/ai-cli-online`.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated for Plan 035.

## STOP conditions

Stop and report back (do not improvise) if:

- Python is completely missing from the target system environment (check with `command -v python3`).
- A step's verification fails twice after a reasonable fix attempt.
- The implementation appears to require adding external CGO dependencies.

## Maintenance notes

- The generated `scripts/runner.py` adapter uses standard Python 3 standard libraries only (`sys`, `json`, `inspect`), avoiding any additional dependencies.
- The converted skill conforms to the universal Agent Skills standard (`SKILL.md`), making it compatible with Antigravity CLI (`agy`), `skills.sh`, Claude Code, and Cursor.
