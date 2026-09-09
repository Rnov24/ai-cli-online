# Plan 038: Remove Redundant Legacy Node Server, Claude Artifacts, Orphan Hooks, and Obsolete Workspaces

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 505bff0..HEAD -- package.json web/src/hooks/usePasteFloat.ts bin/ai-cli-online.mjs CLAUDE.md .claude .scratch`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `505bff0`, 2026-09-09

## Why this matters

The production backend of AGY Online was completely rewritten in pure Go (`cmd/ai-cli-online` and `internal/`) to achieve sub-15MB idle RAM and instant boot times. Furthermore, the repository was transitioned to exclusively support Google Antigravity CLI (`agy`), with canonical configuration documented in `AGENTS.md` and `GEMINI.md`. 

However, several obsolete, redundant, and unrelated artifacts remain committed in the repository:
1. **Legacy Node Server (`server/`, 25+ files)**: Registered in root `package.json` workspaces (`["shared", "server", "web"]`), pulling in abandoned dependencies (`better-sqlite3`, `node-pty`, `multer`, `ws`, `express`), 22 high/critical `npm audit` CVEs, and breaking `npm run dev` with stale `dev:server` calls.
2. **Unrelated Claude Code Artifacts (`.claude/` and `CLAUDE.md`)**: `.claude/skills/` contains 15 tracked duplicated skill files/symlinks from Claude Code, and `CLAUDE.md` contains 575 lines of obsolete Node.js/Express instructions conflicting with the canonical `AGENTS.md`/`GEMINI.md` directives.
3. **Stale Temporary Directory (`.scratch/`)**: 7 tracked markdown files under `.scratch/hermes-adaptation/issues/` from prior experimentation.
4. **Defunct Launcher (`bin/ai-cli-online.mjs`)**: Attempts to launch `server/dist/index.js`, which is never built, crashing on invocation.
5. **Orphan Frontend Hook (`web/src/hooks/usePasteFloat.ts`)**: 56 lines of dead code implementing an unreferenced context menu paste fallback.

Purging `server/`, `.claude/`, `CLAUDE.md`, `.scratch/`, and `usePasteFloat.ts`, retiring the `server` workspace from `package.json`, updating `bin/ai-cli-online.mjs` to delegate to the Go binary, and cleaning `.gitignore` / `.npmignore` removes technical debt, eliminates all 22 CVEs from `npm audit`, and unifies the repository around the single-binary Antigravity Go architecture.

## Current state

### 1. Root `package.json`
- **Workspaces (`package.json:43-47`)**:
  ```json
  "workspaces": [
    "shared",
    "server",
    "web"
  ],
  ```
- **Scripts (`package.json:48-58`)**:
  ```json
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:web\"",
    "dev:server": "npm run dev --workspace=server",
    "dev:web": "npm run dev --workspace=web",
    "build": "npm run build --workspace=shared && npm run build --workspace=web && go build -o bin/ai-cli-online ./cmd/ai-cli-online",
    "build:go": "go build -o bin/ai-cli-online ./cmd/ai-cli-online",
    "start": "./bin/ai-cli-online start",
    "test": "npm run test --workspace=web && go test -v ./...",
    "test:go": "go test -v ./...",
    "test:watch": "npm run test:watch --workspace=web"
  },
  ```
- **Files array (`package.json:31-42`)**:
  ```json
  "files": [
    "bin/",
    "shared/dist/",
    "shared/package.json",
    "server/dist/",
    "server/package.json",
    "server/.env.example",
    "web/dist/",
    "web/package.json",
    "start.sh",
    "install-service.sh"
  ],
  ```

### 2. Legacy `server/` Directory (25+ files)
All source code and configurations in `server/` are dead code:
- `server/.env.example`
- `server/package.json`
- `server/tsconfig.json`
- `server/vitest.config.ts`
- `server/src/auth.ts`, `server/src/db.ts`, `server/src/files.ts`, `server/src/idleManager.ts`, `server/src/index.ts`, `server/src/pty.ts`, `server/src/tmux.ts`, `server/src/types.ts`, `server/src/websocket.ts`
- `server/src/middleware/auth.ts`
- `server/src/pidManager.ts`, `server/src/pidManager.test.ts`
- `server/src/routes/editor.ts`, `server/src/routes/files.ts`, `server/src/routes/git.ts`, `server/src/routes/git.test.ts`, `server/src/routes/sessions.ts`, `server/src/routes/sessions.test.ts`, `server/src/routes/settings.ts`, `server/src/routes/system.ts`, `server/src/routes/system.test.ts`

### 3. Unrelated Claude Artifacts (`.claude/` and `CLAUDE.md`)
- `.claude/skills/` (15 tracked files duplicating skills under `.agents/skills/`):
  - `.claude/skills/antislop-code/SKILL.md`
  - `.claude/skills/antislop-copywriting/SKILL.md`
  - `.claude/skills/antislop-human/SKILL.md`
  - `.claude/skills/antislop-human/contrast-check.py`
  - `.claude/skills/antislop-human/contrast-mcp.py`
  - `.claude/skills/antislop-layoutmobile/SKILL.md`
  - `.claude/skills/antislop-ui/SKILL.md`
  - `.claude/skills/antislop/SKILL.md`
  - `.claude/skills/improve/SKILL.md`
  - `.claude/skills/improve/references/audit-playbook.md`
  - `.claude/skills/improve/references/closing-the-loop.md`
  - `.claude/skills/improve/references/plan-template.md`
  - `.claude/skills/prd/SKILL.md`
  - `.claude/skills/to-tickets/SKILL.md`
  - `.claude/skills/to-tickets/agents/openai.yaml`
- `CLAUDE.md`: 575 lines of legacy instructions referencing the Node Express server.

### 4. Stale `.scratch/` Directory
- 7 tracked markdown files under `.scratch/hermes-adaptation/issues/`.

### 5. Orphan Frontend Hook (`web/src/hooks/usePasteFloat.ts`)
- 56 lines implementing a floating textarea context menu, never imported or referenced anywhere in `web/src`.

### 6. `bin/ai-cli-online.mjs`
- Lines 248–252:
  ```javascript
  const serverEntry = join(rootDir, 'server', 'dist', 'index.js');
  if (!existsSync(serverEntry)) {
    console.error('Error: Server not built. Run "npm run build" first.');
    process.exit(1);
  }
  ```
  Points to the defunct `server/dist/index.js` instead of dispatching to the compiled Go binary.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Remove legacy server from git | `git rm -rf server` | 25+ files deleted from index |
| Remove Claude artifacts from git | `git rm -rf .claude CLAUDE.md` | .claude and CLAUDE.md deleted from index |
| Remove scratch directory from git | `git rm -rf .scratch` | .scratch deleted from index |
| Remove orphan hook from git | `git rm web/src/hooks/usePasteFloat.ts` | file deleted from index |
| Typecheck Web | `npm run build --workspace=shared && npm run build --workspace=web` | exits 0, no errors |
| Test Frontend | `npm run test --workspace=web` | all tests pass, exit 0 |
| Test Backend | `go test -v ./...` | all Go tests pass, exit 0 |
| Full Build | `npm run build` | exits 0, produces `bin/ai-cli-online` |

## Scope

**In scope** (the only files you should modify or delete):
- Delete `server/` directory entirely (all files).
- Delete `.claude/` directory entirely (all files).
- Delete `CLAUDE.md`.
- Delete `.scratch/` directory entirely.
- Delete `web/src/hooks/usePasteFloat.ts`.
- Modify `package.json` (remove `server` workspace, remove `dev:server` script, update `dev` script, clean `files` packaging array).
- Modify `bin/ai-cli-online.mjs` (delegate directly to `bin/ai-cli-online` or `bin/ai-cli-online.exe` using `execFileSync`/`spawn` with inherited stdio).
- Modify `.gitignore` (add `.claude/`, remove `server/certs/`).
- Modify `.npmignore` (remove `server/` paths).
- Update `plans/README.md`.

**Out of scope**:
- Do NOT touch `internal/...` or `cmd/...` (the Go backend is canonical and fully working).
- Do NOT touch `AGENTS.md` or `GEMINI.md` (these are canonical Antigravity agent instructions).
- Do NOT touch existing tests in `web/src/...` or shared types in `shared/...`.

## Git workflow

- Branch: `advisor/038-remove-redundant-legacy-files-and-workspaces`

---

## Step-by-Step Implementation Instructions

### Step 1: Delete Obsolete Directories and Artifacts from Git
1. Delete the obsolete `server/` directory:
   ```bash
   git rm -rf server
   ```
2. Delete the unrelated `.claude/` directory:
   ```bash
   git rm -rf .claude
   ```
3. Delete the obsolete `CLAUDE.md` file:
   ```bash
   git rm CLAUDE.md
   ```
4. Delete the stale `.scratch/` directory:
   ```bash
   git rm -rf .scratch
   ```
5. Delete the unreferenced `web/src/hooks/usePasteFloat.ts`:
   ```bash
   git rm web/src/hooks/usePasteFloat.ts
   ```

**Verification**:
Run `git status` to verify `server/`, `.claude/`, `CLAUDE.md`, `.scratch/`, and `usePasteFloat.ts` are staged for deletion.

---

### Step 2: Clean `package.json` Workspace & Scripts
1. Open `package.json`.
2. In `"workspaces"`, remove `"server"`. Result:
   ```json
   "workspaces": [
     "shared",
     "web"
   ],
   ```
3. In `"scripts"`:
   - Remove `"dev:server"`.
   - Update `"dev"` to `"npm run dev:web"`.
4. In `"files"`:
   - Remove `"server/dist/"`, `"server/package.json"`, `"server/.env.example"`.
5. Save `package.json`.

**Verification**:
Run `npm run build --workspace=shared && npm run build --workspace=web` → exits 0.

---

### Step 3: Modernize `bin/ai-cli-online.mjs` to Delegate to Go Binary
1. Open `bin/ai-cli-online.mjs`.
2. Replace the old Node server launch logic (`serverEntry = join(rootDir, 'server', 'dist', 'index.js')`) with a clean launcher that executes the Go binary (`bin/ai-cli-online` on Unix/macOS/Termux or `bin/ai-cli-online.exe` on Windows):
   ```javascript
   #!/usr/bin/env node

   import { spawn } from 'node:child_process';
   import { existsSync } from 'node:fs';
   import { dirname, join } from 'node:path';
   import { fileURLToPath } from 'node:url';

   const __dirname = dirname(fileURLToPath(import.meta.url));
   const rootDir = join(__dirname, '..');
   const isWin = process.platform === 'win32';
   const binaryName = isWin ? 'ai-cli-online.exe' : 'ai-cli-online';
   const binaryPath = join(rootDir, 'bin', binaryName);

   if (!existsSync(binaryPath)) {
     console.error(`Error: AGY Online binary not found at ${binaryPath}`);
     console.error('Please run "npm run build" to compile the binary first.');
     process.exit(1);
   }

   const child = spawn(binaryPath, process.argv.slice(2), {
     stdio: 'inherit',
     windowsHide: false,
   });

   child.on('exit', (code) => {
     process.exit(code ?? 0);
   });
   ```
3. Save `bin/ai-cli-online.mjs`.

**Verification**:
Run `node bin/ai-cli-online.mjs status` → executes the Go binary and reports current status (exit 0).

---

### Step 4: Clean `.gitignore` and `.npmignore`
1. In `.gitignore`:
   - Add `.claude/` under the development section to prevent accidental re-creation.
   - Remove `server/certs/`.
2. In `.npmignore`:
   - Remove lines 9-11 (`server/certs/`, `server/.env`, `server/data/`).
   - Remove line 23 (`server/src/`).

**Verification**:
Run `git diff .gitignore .npmignore` to verify clean diffs.

---

### Step 5: Full Verification Suite
1. Run frontend test suite:
   ```bash
   npm run test --workspace=web
   ```
   *Expected*: All tests pass.
2. Run backend test suite:
   ```bash
   go test -v ./...
   ```
   *Expected*: All Go tests pass.
3. Run full build:
   ```bash
   npm run build
   ```
   *Expected*: Produces `bin/ai-cli-online` without error.

---

## STOP Conditions

1. If any test in `web/` fails after removing `server/` or `usePasteFloat.ts`, stop and verify if an unexpected import exists.
2. If `go test -v ./...` fails, stop and investigate whether any Go package imported outside of standard/vendor packages.
3. If `npm run build` fails to find required shared modules, verify that `shared/dist/` is present.
