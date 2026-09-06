# Plan 013: Repository Hygiene & Legacy Server Workspace Retirement

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b03c93a..HEAD -- package.json bin/ai-cli-online.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b03c93a`, 2026-09-06

## Why this matters

The production backend of AGY Online was completely migrated from Node.js Express to a pure-Go static executable (`bin/ai-cli-online`) to achieve sub-15MB idle RAM and instant boot times. However, the obsolete `server/` workspace remains registered in root `package.json` (`workspaces: ["shared", "server", "web"]`). This legacy manifest pulls in abandoned Node packages (`better-sqlite3`, `node-pty`, `multer`, `express-rate-limit`, `ws`), triggering 22 high/critical `npm audit` CVEs and requiring C++ compiler toolchains during `npm install`. Furthermore, `npm run dev` attempts to start `npm run dev:server`, which runs a stale Node backend lacking the 5 newly implemented endpoint domains (plugins, personas, skills, workspaces, conversations). Retiring `server/` from workspaces and pointing developer workflows to the Go server eliminates all 22 CVEs and restores single-source backend architecture.

## Current state

- `package.json:43-47`: `"workspaces": ["shared", "server", "web"]`.
- `package.json:48-58`: `"dev": "concurrently \"npm run dev:server\" \"npm run dev:web\""`, `"dev:server": "npm run dev --workspace=server"`.
- `package.json:31-42`: `"files"` array packages `server/dist/`, `server/package.json`, `server/.env.example`.
- `bin/ai-cli-online.mjs:18-35`: Fallback paths point to `join(rootDir, 'server', 'data', 'run')` and `join(rootDir, 'server', 'data', 'logs')`.
- `npm audit`: Reports 22 vulnerabilities (2 critical, 13 high, 5 moderate, 2 low) originating entirely from `node_modules/server/` dependencies.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Workspace Audit | `npm audit` | clean, exit 0 |
| Frontend Tests | `npm run test --workspace=web` | all pass, exit 0 |
| All Tests | `npm test` | all pass, exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `package.json`
- `package-lock.json`
- `bin/ai-cli-online.mjs`
- `README.md` (if setup or dev instructions reference `dev:server`)

**Out of scope**:
- Go backend files in `internal/...` or `cmd/...`.
- React frontend components in `web/...`.
- `server/` directory source files (left intact or archived, but removed from npm workspace tracking).

## Git workflow

- Branch: `advisor/013-repository-hygiene-and-legacy-server-retirement`
- Commit message convention: `chore(deps): <description>`

## Steps

### Step 1: Remove `server` from Root Workspaces and Files in `package.json`
1. Open `package.json`:
   - Change `workspaces` from:
     ```json
     "workspaces": [
       "shared",
       "server",
       "web"
     ],
     ```
     to:
     ```json
     "workspaces": [
       "shared",
       "web"
     ],
     ```
   - In `"files"` array, remove:
     ```json
     "server/dist/",
     "server/package.json",
     "server/.env.example",
     ```
   - In `"scripts"`, update `"dev"` and replace `"dev:server"` with `"dev:go"`:
     ```json
     "dev": "concurrently \"npm run dev:go\" \"npm run dev:web\"",
     "dev:go": "go run ./cmd/ai-cli-online start",
     "dev:web": "npm run dev --workspace=web",
     ```

**Verify**: `node -e "const p = require('./package.json'); if(p.workspaces.includes('server')) process.exit(1)"` → exits 0.

### Step 2: Update Data Directory Fallbacks in `bin/ai-cli-online.mjs`
1. Open `bin/ai-cli-online.mjs`:
   - In `getRunDir()`:
     Replace `join(rootDir, 'server', 'data', 'run')` with `join(rootDir, '.ai-cli-online', 'run')`.
   - In `getLogDir()`:
     Replace `join(rootDir, 'server', 'data', 'logs')` with `join(rootDir, '.ai-cli-online', 'logs')`.

**Verify**: Run `node bin/ai-cli-online.mjs status` → exits 0 or reports offline status without error.

### Step 3: Prune Lockfile and Verify Zero Vulnerabilities
1. Run `npm install` to update `package-lock.json` without the `server` workspace dependencies.
2. Run `npm audit` to verify the workspace dependency tree is clean.

**Verify**: `npm audit` → exits 0 (0 vulnerabilities).

## Test plan

- `npm run build`: Verify single binary builds cleanly without Node server dependency.
- `npm test`: Verify all web and Go test suites pass with 100% success.
- `npm audit`: Verify 0 critical and 0 high vulnerabilities reported.

## Done criteria

- [ ] `package.json` workspaces list only `"shared"` and `"web"`.
- [ ] `npm audit` exits 0 with 0 vulnerabilities.
- [ ] `npm test` exits 0.
- [ ] `npm run build` exits 0.

## STOP conditions

- If removing `server` causes `shared` or `web` module resolution to fail, stop and report.
- If `go run ./cmd/ai-cli-online start` fails in dev mode, stop and report.

## Maintenance notes

- Development server now runs the Go binary concurrently with Vite: `npm run dev` boots the actual native server that contains all modern routes.
