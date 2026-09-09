# Plan 039: Rebrand and Rename Project Fully to AGY Online and Comprehensive Documentation Overhaul

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b3bb467..HEAD -- package.json go.mod cmd/ assets.go shared/ web/ package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt | dx | docs
- **Planned at**: commit `b3bb467`, 2026-09-09
- **Issue**: none

## Why this matters

The platform has matured from a generic web terminal into a dedicated, autonomous development workspace built exclusively for Google Antigravity CLI (`agy`). However, internal naming still heavily reflects the legacy moniker `ai-cli-online` across directories (`cmd/ai-cli-online`), binaries (`bin/ai-cli-online`), Go module identifiers (`github.com/huacheng/ai-cli-online`), package dependencies (`ai-cli-online-shared`, `ai-cli-online-web`), tmux socket namespaces (`~/.tmux-sockets/ai-cli-online`), runtime state directories (`~/.ai-cli-online`), and client-side localStorage keys.

Furthermore, the existing `README.md` and `README.zh-CN.md` are severely outdated: they still instruct users to configure deleted directories (`server/.env`, `server/.env.example`), quote obsolete RAM metrics ("~70MB" instead of the measured <15MB idle RAM), describe only an 8-skill lifecycle instead of the full 13-skill engine, and fail to document modern core features including the Git History Visualizer, Antigravity Google Auth Multi-Profile Switcher, Skills Hub (`skills.sh` 1-click installer), and the Hermes Plugin to AGY Skill Converter.

Executing this plan establishes total brand consistency as **AGY Online** (`agy-online`), modernizes all documentation from the ground up, and preserves complete backward compatibility for existing user sessions, database files, and tokens.

## Current state

- **CLI entry point**: `cmd/ai-cli-online/main.go` resides in `cmd/ai-cli-online/`.
- **Launcher wrapper**: `bin/ai-cli-online.mjs` delegates to `bin/ai-cli-online`.
- **Go Module**: `go.mod` declares `module github.com/huacheng/ai-cli-online`, and 50+ Go source files in `internal/` and `cmd/` import this module.
- **Embedded Web UI Asset Provider**: `assets.go` declares `package aicli`.
- **Database & Runtime Paths**:
  - `internal/db/db.go:52`: `dbPath := filepath.Join(dataDir, "ai-cli-online.db")`
  - `internal/config/config.go:29`: reads `~/.ai-cli-online/.env`
  - `internal/pid/pid.go:32`: `filepath.Join(home, ".ai-cli-online", "run")`
  - `internal/terminal/tmux.go:30`: `SocketPath = filepath.Join(dir, "ai-cli-online")`
- **NPM Packages & Workspaces**:
  - `package.json`: `"name": "ai-cli-online"`, `"bin": { "ai-cli-online": "bin/ai-cli-online.mjs" }`, `build` and `start` scripts reference `bin/ai-cli-online` and `cmd/ai-cli-online`.
  - `shared/package.json`: `"name": "ai-cli-online-shared"`.
  - `web/package.json`: `"name": "ai-cli-online-web"`, dependency `"ai-cli-online-shared": "*"`.
  - 15 files in `web/src/` import `from 'ai-cli-online-shared'`.
- **Client LocalStorage**:
  - `web/src/store/index.ts`: `'ai-cli-online-token'`
  - `web/src/utils/accountStorage.ts`: `ACCOUNTS_STORAGE_KEY = 'ai-cli-online-accounts'`
  - `web/src/store/settingsSlice.ts`: `'ai-cli-online-theme'`
  - `web/src/store/persistence.ts`: `TABS_KEY = 'ai-cli-online-tabs'`
- **Shell & Installer Scripts**:
  - `start.sh`, `install-service.sh`, `scripts/install-termux-boot.sh`, `scripts/install-mobile-launcher.sh`, `scripts/install-windows-startup.bat`, `scripts/uninstall-windows-startup.bat`, `scripts/build-android-arm64.sh` all reference `ai-cli-online`.
- **Documentation**:
  - `README.md` and `README.zh-CN.md` contain references to `server/.env`, legacy RAM numbers, and missing modern features.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Go Tests | `go test -v ./...` | exit 0, all pass |
| Go Build | `go build -o bin/agy-online ./cmd/agy-online` | exit 0, binary created |
| Web Tests | `npm test --workspace=web` | exit 0, 27 test files pass |
| Full Build | `npm run build` | exit 0, Web UI and Go binary built |

## Scope

**In scope**:
- Directory move: `cmd/ai-cli-online/` $\rightarrow$ `cmd/agy-online/`
- Binary wrapper move: `bin/ai-cli-online.mjs` $\rightarrow$ `bin/agy-online.mjs`
- Module update: `go.mod` $\rightarrow$ `module github.com/huacheng/agy-online`
- Assets package: `assets.go` $\rightarrow$ `package agyonline`
- All Go imports: `github.com/huacheng/ai-cli-online/...` $\rightarrow$ `github.com/huacheng/agy-online/...`
- Runtime paths & DB migration fallback in `internal/db/db.go`, `internal/config/config.go`, `internal/pid/pid.go`, and `internal/terminal/tmux.go`
- Package manifests: `package.json`, `shared/package.json`, `web/package.json`
- Frontend imports: `from 'ai-cli-online-shared'` $\rightarrow$ `from 'agy-online-shared'`
- Frontend LocalStorage keys with automatic backward-compatible fallback read
- Test assertions in `web/src/store/persistence.test.ts`
- Scripts: `start.sh`, `install-service.sh`, `scripts/*`
- Workspace directives: `AGENTS.md`, `GEMINI.md`
- Documentation: Complete rewrite of `README.md` and `README.zh-CN.md`

**Out of scope**:
- Changing WebSocket binary protocol opcodes (0x01-0x05)
- Changing REST API route paths (`/api/sessions`, `/api/files`, etc.)
- Modifying UI design tokens or layout mechanics

## Execution Steps

### Step 1: Directory & Launcher Renaming via Git

1. Rename CLI directory:
   ```bash
   git mv cmd/ai-cli-online cmd/agy-online
   ```
2. Rename launcher script:
   ```bash
   git mv bin/ai-cli-online.mjs bin/agy-online.mjs
   ```
3. Update `bin/agy-online.mjs`:
   - Set `binaryName = isWin ? 'agy-online.exe' : 'agy-online'`
   - Update error messages to "AGY Online binary not found at..."

### Step 2: Go Module & Package Import Synchronization

1. In `go.mod`:
   - Change `module github.com/huacheng/ai-cli-online` $\rightarrow$ `module github.com/huacheng/agy-online`
2. In `assets.go`:
   - Change `package aicli` $\rightarrow$ `package agyonline`
3. Across all `.go` files in `cmd/agy-online/` and `internal/`:
   - Replace `github.com/huacheng/ai-cli-online` with `github.com/huacheng/agy-online`
   - In `cmd/agy-online/main.go`, replace `aicli "github.com/huacheng/ai-cli-online"` with `agyonline "github.com/huacheng/agy-online"`
   - Update any references to `aicli.GetWebDistFS()` to `agyonline.GetWebDistFS()`
4. In `internal/terminal/tmux.go`:
   - Update default `SocketPath` from `ai-cli-online` to `agy-online`
5. In `internal/pid/pid.go`:
   - Update `GetRunDir()` to check/create `filepath.Join(home, ".agy-online", "run")`
6. In `internal/config/config.go`:
   - Update `loadDotEnv(filepath.Join(home, ".agy-online", ".env"))` (and check `~/.ai-cli-online/.env` as fallback)
   - Remove obsolete `loadDotEnv("server/.env")`
   - Update `userDir := filepath.Join(home, ".agy-online", "data")` (fallback to `~/.ai-cli-online/data` if existing)
7. In `internal/db/db.go`:
   - Open `filepath.Join(dataDir, "agy-online.db")`
   - If `agy-online.db` does not exist but `ai-cli-online.db` exists in `dataDir`, automatically migrate/rename it or copy so user databases remain intact:
     ```go
     oldDb := filepath.Join(dataDir, "ai-cli-online.db")
     newDb := filepath.Join(dataDir, "agy-online.db")
     if _, err := os.Stat(newDb); os.IsNotExist(err) {
         if _, errOld := os.Stat(oldDb); errOld == nil {
             _ = os.Rename(oldDb, newDb)
         }
     }
     ```

### Step 3: TypeScript Packages & Workspace Renaming

1. In `shared/package.json`:
   - Change `"name": "ai-cli-online-shared"` $\rightarrow$ `"name": "agy-online-shared"`
2. In `web/package.json`:
   - Change `"name": "ai-cli-online-web"` $\rightarrow$ `"name": "agy-online-web"`
   - In `"dependencies"`: change `"ai-cli-online-shared": "*"` $\rightarrow$ `"agy-online-shared": "*"`
3. In `package.json`:
   - Change `"name": "ai-cli-online"` $\rightarrow$ `"name": "agy-online"`
   - Update `"bin"`:
     ```json
     "bin": {
       "agy-online": "bin/agy-online.mjs",
       "ai-cli-online": "bin/agy-online.mjs"
     }
     ```
   - Update `"repository"`, `"homepage"`, `"bugs"` URLs to `github.com/huacheng/agy-online`
   - Update scripts:
     ```json
     "build": "npm run build --workspace=shared && npm run build --workspace=web && go build -o bin/agy-online ./cmd/agy-online",
     "build:go": "go build -o bin/agy-online ./cmd/agy-online",
     "start": "./bin/agy-online start",
     ```
4. In `web/src/`:
   - Replace all `from 'ai-cli-online-shared'` with `from 'agy-online-shared'` (15 files).

### Step 4: Frontend LocalStorage Migration & Backward Compatibility

1. In `web/src/utils/accountStorage.ts`:
   - Set `export const ACCOUNTS_STORAGE_KEY = 'agy-online-accounts';`
   - In `getStoredAccounts()`: if `localStorage.getItem(ACCOUNTS_STORAGE_KEY)` is empty, read `localStorage.getItem('ai-cli-online-accounts')` and migrate it.
2. In `web/src/store/index.ts`:
   - When retrieving the auth token: `localStorage.getItem('agy-online-token') || localStorage.getItem('ai-cli-online-token') || ''`
   - When setting: `localStorage.setItem('agy-online-token', token)`
   - When removing: remove both `'agy-online-token'` and `'ai-cli-online-token'`
3. In `web/src/store/settingsSlice.ts`:
   - Read: `localStorage.getItem('agy-online-theme') || localStorage.getItem('ai-cli-online-theme')`
   - Set: `localStorage.setItem('agy-online-theme', theme)`
4. In `web/src/store/persistence.ts`:
   - Update keys to `agy-online-tabs`, `agy-online-layout`, `agy-online-session-names`
   - Support fallback read if old key exists and new key is null.
5. In `web/src/store/persistence.test.ts`:
   - Update regex assertions from `/^ai-cli-online-tabs-[0-9a-f]{8}$/` to `/^agy-online-tabs-[0-9a-f]{8}$/`.

### Step 5: Scripts & Workflow Directives Synchronization

1. In `start.sh`:
   - Update banner to "AGY Online"
   - Update process cleanup to `pkill -f "agy-online"` (and also kill legacy `ai-cli-online`)
   - Update compile targets: `go build -o bin/agy-online ./cmd/agy-online`
   - Update launch target: `exec "$PROJECT_DIR/bin/agy-online" start -p "$PORT"`
2. In `install-service.sh`:
   - Update `SERVICE_NAME="agy-online"`
   - Update `CLI_BIN="${PROJECT_DIR}/bin/agy-online"`
   - Update build command to `./cmd/agy-online`
3. In `scripts/install-termux-boot.sh`:
   - Update boot script: `start-agy-online.sh`
   - Update log/run dirs: `~/.agy-online/logs`, `~/.agy-online/run`
   - Update binary reference: `bin/agy-online`
4. In `scripts/install-mobile-launcher.sh`:
   - Update binary reference to `bin/agy-online`
5. In `scripts/install-windows-startup.bat` & `scripts/uninstall-windows-startup.bat`:
   - Update executable target to `bin\agy-online.exe` and startup script to `start-agy-online.vbs`
6. In `scripts/build-android-arm64.sh`:
   - Update output binary to `dist/agy-online-android-arm64` and source to `cmd/agy-online`
7. In `AGENTS.md` and `GEMINI.md`:
   - Replace any remaining references to `bin/ai-cli-online` and `cmd/ai-cli-online` with `bin/agy-online` and `cmd/agy-online`.

### Step 6: Complete Overhaul of `README.md` and `README.zh-CN.md`

Rewrite both documents with modern, clear, engaging structure:
- **Hero & Badges**: AGY Online identity, npm, Go, license, platform badges.
- **Project Vision**: Explain how AGY Online turns Google Antigravity CLI (`agy`) into an all-in-one browser IDE with persistent terminal sessions, planning, annotations, and automated execution.
- **Key Features Showcase**:
  1. **Persistent Terminal**: WebGL-accelerated xterm.js, tmux session persistence across network drops, direct PTY fallback.
  2. **Sub-15MB Idle Footprint**: Single compiled Go binary, pure Go SQLite (0 CGO), embedded Web UI, automatic memory checkpointing (<15MB RAM).
  3. **Plan Panel & Interactive Annotations**: Real-time markdown viewer with 4 annotation types (`insert`, `delete`, `replace`, `comment`).
  4. **Git History Visualizer**: Interactive commit lane graph, file tree, and side-by-side diff viewer.
  5. **Antigravity Multi-Profile Switcher**: Seamless switching between multiple Google accounts with 1-click OAuth.
  6. **Skills Hub & Hermes Converter**: 1-click install from skills.sh and automatic Hermes plugin conversion.
  7. **Native 13-Skill Task Lifecycle Engine**: Full autonomous task loop (`/auto`), state-machine checkpoints, and experience database.
  8. **Mobile & Termux First-Class Support**: Termux:Boot integration, touch virtual quick-keys, battery wake-lock.
- **Architecture Diagram**: Clean ASCII layout showing the Browser $\leftrightarrow$ Single Go Static Binary $\leftrightarrow$ tmux $\leftrightarrow$ agy relationship.
- **Installation & Quick Start**:
  - `npx agy-online`
  - Global npm install `npm i -g agy-online && agy-online`
  - Prebuilt binary / build from source (`npm run build && ./bin/agy-online start`)
  - Background daemon lifecycle (`./bin/agy-online start -d`, `status`, `stop`, `restart`)
  - Termux boot setup (`bash scripts/install-termux-boot.sh`)
  - systemd & nginx reverse proxy (`sudo bash install-service.sh`)
- **Environment & Configuration**: Clean `.env` table (`PORT`, `HOST`, `AUTH_TOKEN`, `DEFAULT_WORKING_DIR`, `DATA_DIR`).
- **Keyboard Shortcuts Reference**: Table of all hotkeys (`Ctrl+\`, `Alt+A`, `Alt+P`, `Alt+G`, `Alt+C`, etc.).
- **License & Acknowledgements**.

### Step 7: Verification & Test Execution

1. Build shared and web packages:
   ```bash
   npm run build --workspace=shared
   npm run build --workspace=web
   ```
2. Build Go binary:
   ```bash
   go build -o bin/agy-online.exe ./cmd/agy-online
   ```
3. Run Go test suite:
   ```bash
   go test -v ./...
   ```
4. Run Frontend test suite:
   ```bash
   npm test --workspace=web
   ```
5. Confirm full build passes:
   ```bash
   npm run build
   ```

## STOP conditions

- If `go test -v ./...` fails due to unmapped import paths.
- If `npm test --workspace=web` fails on unexpected type errors or broken imports.
- If any existing user configuration or database cannot be migrated cleanly.
