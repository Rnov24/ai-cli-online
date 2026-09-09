# Plan 032: Rebrand Project Identity Related Artifacts to AGY Online

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a8a9b51..HEAD -- README.md README.zh-CN.md package.json web/package.json shared/package.json install-service.sh`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/031-binary-content-detection-permission-preservation-and-download.md
- **Category**: docs
- **Planned at**: commit `a8a9b51`, 2026-09-09

## Why this matters

While the application UI, service banners, and core agent guidelines (`AGENTS.md`, `GEMINI.md`, `DESIGN.md`) have evolved to the **AGY Online** identity, several key project artifacts and entry points still reference the legacy name "AI-Cli Online", outdated runtime architecture ("through a single Node.js process"), and retired directory layouts (`server/src/`). In addition, the documentation describes an obsolete "8-skill lifecycle", while the platform now natively supports the complete `ai-cli-task` 13-skill autonomous lifecycle engine.

Synchronizing these project identity artifacts ensures brand consistency across GitHub, npm, installation scripts, and documentation, eliminating confusion for new developers and users regarding the single-binary Go architecture and system capabilities.

## Current state

The codebase contains legacy branding and outdated architectural references in the following files:

- `package.json` (line 4):
  ```json
  "description": "AI-Cli Online - Web Terminal for Google Antigravity CLI (agy) via xterm.js + tmux",
  ```
- `web/package.json` (line 4):
  ```json
  "description": "Antigravity CLI-Online Web Frontend",
  ```
- `shared/package.json` (line 4):
  ```json
  "description": "Shared types for CLI-Online",
  ```
- `README.md` (lines 1, 7, 47, 220-226, 245-257):
  ```markdown
  # AI-Cli Online
  ...
  An AI-powered development environment that runs in your browser. Persistent terminal sessions, structured task lifecycle, and autonomous execution — all through a single Node.js process.
  ...
  The `ai-cli-task` plugin provides an 8-skill lifecycle for structured AI task execution:
  ...
  ai-cli-online/
  ├── server/src/
  │   ├── index.ts
  ```
- `README.zh-CN.md` (lines 1, 7, 47, 245-257):
  ```markdown
  # AI-Cli Online
  ...
  在浏览器中运行的 AI 开发环境。持久化终端会话、结构化任务生命周期、自主执行 — 单个 Node.js 进程即可运行。
  ```
- `install-service.sh` (lines 5, 199, 231):
  ```bash
  #  AI-CLI-Online systemd 服务安装脚本
  ...
  # AI-CLI-Online nginx reverse proxy
  ...
  # API, WebSocket, and HTML via Node.js proxy
  ```

Documented vocabulary to preserve and enforce (from `AGENTS.md` and `GEMINI.md`):
- **Brand Title**: **AGY Online** (`ai-cli-online`)
- **Core Technology**: Single self-contained static executable (`bin/ai-cli-online`) with embedded Web UI assets (embed.FS), pure-Go SQLite, sub-15MB idle RAM (~13.7MB RSS).
- **Task Lifecycle**: 13-skill Antigravity plugin (`init`, `plan`, `research`, `check`, `verify`, `exec`, `merge`, `report`, `auto`, `cancel`, `list`, `annotate`, `summarize`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Lint/Check| `git diff --check`       | exit 0, no trailing whitespace |
| Tests     | `npm test`               | all 22 web suites + Go tests PASS |
| Build     | `npm run build`          | exit 0, binary compiled |

## Scope

**In scope** (the only files you should modify):
- `package.json`
- `web/package.json`
- `shared/package.json`
- `install-service.sh`
- `README.md`
- `README.zh-CN.md`

**Out of scope** (do NOT touch):
- Package name identifiers (`"name": "ai-cli-online"`, `"name": "ai-cli-online-web"`, `"name": "ai-cli-online-shared"`) — npm registry, workspace package resolutions, and imports depend on these package names.
- Socket paths and runtime directories (`~/.tmux-sockets/ai-cli-online`, `~/.ai-cli-online/`) — system daemons and existing persistent tmux sessions rely on this directory structure.
- Binary output target name (`bin/ai-cli-online`) — systemd service, Termux:Boot scripts, and CLI entry points invoke this binary name.
- `CHANGES.md` — historical release notes must maintain historical integrity.

## Git workflow

- Branch: `advisor/032-rebrand-project-identity-artifacts`
- Commit message style: `docs(identity): rebrand project artifacts, descriptions, and documentation to AGY Online`

## Steps

### Step 1: Update Package Descriptions

In `package.json`, `web/package.json`, and `shared/package.json`, update the `description` fields to accurately reflect the AGY Online identity:

1. In `package.json`:
   ```json
   "description": "AGY Online — Autonomous Terminal & Development Workspace for Google Antigravity CLI (agy)",
   ```
2. In `web/package.json`:
   ```json
   "description": "AGY Online Web Frontend",
   ```
3. In `shared/package.json`:
   ```json
   "description": "AGY Online Shared Type Definitions",
   ```

**Verify**:
```bash
grep -n "description" package.json web/package.json shared/package.json
```
→ Expected: All three show the updated "AGY Online" descriptions.

---

### Step 2: Update `install-service.sh` Headers and Proxy Descriptions

In `install-service.sh`:
1. Update line 5:
   ```bash
   #  AGY Online systemd 服务安装脚本
   ```
2. Update line 199:
   ```bash
   # AGY Online nginx reverse proxy
   ```
3. Update line 231:
   ```bash
   # API, WebSocket, and HTML via Go server proxy
   ```

**Verify**:
```bash
grep -n "AGY Online" install-service.sh
```
→ Expected: Header and reverse proxy comments reflect "AGY Online".

---

### Step 3: Modernize and Rebrand `README.md`

In `README.md`:
1. Update main title:
   ```markdown
   # AGY Online — Antigravity Development Workspace
   ```
2. Update overview to accurately describe the Go architecture:
   ```markdown
   An AI-powered development environment that runs in your browser. Persistent terminal sessions, structured 13-skill task lifecycle, and autonomous execution — all through a single compiled static Go executable with embedded Web UI assets.
   ```
3. Update the AI Task Lifecycle section:
   Change "8-skill lifecycle" to "13-skill lifecycle", and expand the skill table to include all 13 skills:
   - `init`: Create task module (`AiTasks/<name>/`), git branch, optional worktree
   - `plan`: Generate implementation plans or process human annotations
   - `research`: Collect external references and background materials
   - `check`: Evaluate feasibility at 3 checkpoints (post-plan / mid-exec / post-exec)
   - `verify`: Run domain-adapted verification suites and test fixtures
   - `exec`: Execute implementation plan steps with per-step verification
   - `merge`: Merge task branch to main with automated conflict resolution
   - `report`: Generate completion report, distill lessons to experience database
   - `auto`: Run the full lifecycle autonomously in a single Antigravity (`agy`) session
   - `cancel`: Stop execution, set status to cancelled, optional cleanup
   - `list`: Query task status, module inventory, and dependency relationships
   - `annotate`: Process Plan panel annotations (insert/delete/replace/comment)
   - `summarize`: Regenerate condensed context summaries
4. Update idle memory figures:
   Change `~70MB` to `sub-15MB idle RAM (~13.7MB RSS)`.
5. Update the Architecture and Project Structure sections:
   Remove obsolete `server/src/` tree and replace with the current Go layout:
   ```markdown
   ai-cli-online/
   ├── cmd/ai-cli-online/   # CLI entry point & daemon lifecycle management
   ├── internal/
   │   ├── files/           # Atomic file operations & symlink security guards
   │   ├── pid/             # Process ID tracking & lifecycle registry
   │   ├── routes/          # REST route handlers (sessions, files, git, task-auto)
   │   ├── server/          # HTTP & WebSocket server engine with embed.FS UI
   │   ├── terminal/        # PTY relay, tmux manager, and direct fallback
   │   └── ws/              # WebSocket hub & client connection supervision
   ├── web/                 # React 18 + Zustand + xterm.js WebGL frontend
   ├── shared/              # Shared TypeScript interfaces & protocol types
   ├── ai-cli-task/         # 13-skill Antigravity lifecycle plugin
   ├── bin/                 # Compiled static executable (bin/ai-cli-online)
   ├── start.sh             # Production startup script
   └── install-service.sh   # systemd + nginx installer
   ```

6. Add Acknowledgements & Inspiration section honoring the project's roots:
   ```markdown
   ## Acknowledgements & Inspiration

   AGY Online builds upon the architectural foundations and interaction paradigms established by:

   - [**ai-cli-online**](https://github.com/huacheng/ai-cli-online) — The foundational browser-based web terminal and persistent AI CLI development environment.
   - [**hermes-webui**](https://github.com/nesquena/hermes-webui) — Inspirations in agent web interface design, terminal ergonomics, and autonomous workflows.
   ```

**Verify**:
```bash
grep -n "13-skill" README.md && grep -n "hermes-webui" README.md && grep -n "server/src" README.md || true
```
→ Expected: `13-skill` and `hermes-webui` matches found, `server/src` yields no matches.

---

### Step 4: Synchronize `README.zh-CN.md`

In `README.zh-CN.md`:
1. Update title to `# AGY Online — Antigravity 开发工作区`.
2. Update description to reflect the single Go static executable and sub-15MB idle RAM.
3. Update the task lifecycle section to list all 13 skills.
4. Replace the old `server/src/` structure with `cmd/` and `internal/`.
5. Add 鸣谢与致敬 (Acknowledgements & Inspiration) section:
   ```markdown
   ## 鸣谢与致敬 (Acknowledgements & Inspiration)

   AGY Online 的设计与演进深受以下开源项目的启发与奠基：

   - [**ai-cli-online**](https://github.com/huacheng/ai-cli-online) — 奠定基础的浏览器 Web 终端与持久化 AI CLI 开发环境。
   - [**hermes-webui**](https://github.com/nesquena/hermes-webui) — 在 Agent Web 界面交互、终端人机工效与自主工作流设计方面的开创性灵感。
   ```

**Verify**:
```bash
grep -n "13-skill" README.zh-CN.md && grep -n "hermes-webui" README.zh-CN.md && grep -n "server/src" README.zh-CN.md || true
```
→ Expected: `13-skill` and `hermes-webui` matches found, `server/src` yields no matches.

---

## Test plan

- Run `npm test` to verify all 22 web test suites and Go packages pass with zero regressions.
- Run `npm run build` to confirm TypeScript validation and single Go binary compilation succeed.
- Verify `git diff` shows clean, targeted modifications without unintended formatting changes.

## Done criteria

- [ ] `package.json`, `web/package.json`, and `shared/package.json` descriptions reference AGY Online.
- [ ] `install-service.sh` header and reverse proxy notes reference AGY Online and Go native server.
- [ ] `README.md` and `README.zh-CN.md` use `# AGY Online`, accurately describe the Go architecture (sub-15MB idle RAM), document the 13-skill lifecycle, and reflect the `cmd/` + `internal/` codebase layout.
- [ ] `README.md` and `README.zh-CN.md` include the Acknowledgements & Inspiration section crediting `ai-cli-online` and `https://github.com/nesquena/hermes-webui`.
- [ ] `npm test` exits 0.
- [ ] `npm run build` exits 0.
- [ ] `plans/README.md` status row for Plan 032 is updated.

## STOP conditions

- If package name modifications break npm workspace dependency resolution (`npm test` fails to resolve `ai-cli-online-shared`).
- If any test expects old package descriptions or specific legacy strings.

## Maintenance notes

- When publishing new versions to npm or GitHub releases, the package name remains `ai-cli-online` while display branding remains `AGY Online`.
- Keep `README.md` and `README.zh-CN.md` synchronized whenever new slash commands or task skills are added.
