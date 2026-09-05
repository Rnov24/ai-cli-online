# Product Requirements Document (PRD) — AGY Online (`ai-cli-online`)

## 1. Executive Summary

- **Problem Statement**: Developers using AI coding engines (such as Google Antigravity CLI `agy` / Gemini CLI) on resource-constrained VPS instances or mobile devices (Android Termux) suffer from high runtime memory (>70MB idle on Node.js), abrupt session drops upon network disconnections, opaque model token consumption, and zero unified visibility into conversational history, skill libraries (global vs. per-project), and slash-command orchestration.
- **Proposed Solution**: AGY Online is a zero-CGO, single-static Go executable development environment featuring persistent tmux-backed xterm.js WebGL terminals, interactive visual plan annotation, real-time Git history graphs, native offline KaTeX math rendering, and a first-class Antigravity CLI control plane with live model quota meters, historical transcript browsers, global/project skill managers, and slash-command palettes—all operating under 15MB idle RAM.
- **Success Criteria**:
  1. **Memory Efficiency**: Idle RSS memory consumption <= 15MB (benchmark: ~13.7MB RSS on Go backend, an 81% reduction from Node.js ~72MB).
  2. **Cold Boot Latency**: Server cold startup time <= 20ms without runtime JIT warmup.
  3. **Zero-Drop Session Persistence**: 100% of terminal processes survive network disconnects, browser reloads, or background suspension via tmux session management (`~/.tmux-sockets/ai-cli-online`).
  4. **Full Antigravity & Gemini CLI Feature Utilization**: 100% native coverage for all 17 Antigravity slash commands (`/goal`, `/plan`, `/grill-me`, `/model`, `/doctor`, `/mcp`, etc.) and the 13-skill `ai-cli-task` lifecycle.
  5. **Telemetry & Quota Transparency**: Live token and context quota consumption (input/output tokens, remaining window, rate limits) updated with < 100ms latency from `agy --output-format stream-json`.
  6. **Single-Binary Portability**: Entire application (backend + embedded compiled Web UI assets via Go `embed.FS`) distributed as a single static binary <= 20MB requiring zero Node.js or npm dependencies at runtime.
  7. **Mobile Responsiveness**: 100% touch usability down to 320px screen width with mobile quick-keys, touch drawer navigation, and zero horizontal viewport overflow.

---

## 2. User Experience & Functionality

### User Personas
- **Solo Power Developer / Hacker**: Works across laptops, low-cost VPS instances (512MB–1GB RAM), and Android phones (Termux). Needs uninterrupted long-running agent tasks (`/goal`, `/auto`) that continue running even when offline.
- **AI Agent Engineer & Prompt Architect**: Develops with Google Antigravity CLI (`agy`), manages custom skill playbooks, tunes model selection, monitors context window boundaries, and steers agent plans with precision annotations.

### User Stories & Acceptance Criteria

#### US-1: Persistent Remote Terminal Access
*As a developer working on unstable mobile networks, I want persistent terminal sessions so that active commands and AI execution loops never terminate when my connection drops.*
- **Acceptance Criteria**:
  - Closing the browser tab or dropping network connection does not interrupt child processes running inside tmux.
  - Re-opening AGY Online re-attaches to the exact tmux window buffer with complete historical output replay.
  - Supports creating, renaming, switching, and closing multiple concurrent sessions.
  - Binary/JSON WebSocket channel transmits PTY input/output with < 15ms local relay overhead.

#### US-2: Interactive Visual Plan Annotation
*As an AI engineer reviewing an agent's implementation plan, I want to annotate, delete, and replace specific plan blocks visually so that I can guide the AI before code execution starts.*
- **Acceptance Criteria**:
  - Selecting text in the Plan panel triggers a floating action widget (`Replace`, `Comment`, `Delete`).
  - Double-clicking between blocks allows inserting inline annotation cards.
  - Dual-layer persistence guarantees no lost annotations: L1 local storage within 50ms, L2 remote server sync within 200–300ms.
  - Clicking "Send" generates and dispatches `/annotate <file> <ann>` directly into the active terminal session.

#### US-3: Real-Time Git History & Diff Inspection
*As a developer, I want an integrated visual Git graph and file diff viewer so that I can audit agent code modifications without switching external tools.*
- **Acceptance Criteria**:
  - Renders visual Git commit DAG with multi-lane branching curves and merge arrows.
  - Displays commit metadata (author, relative time, SHA hash with 1-click clipboard copy).
  - Clicking a commit expands the modified file list with unified syntax-highlighted diffs.
  - Branch filter dropdown allows switching and viewing any local or remote git branch.

#### US-4: Offline Markdown & Mathematical Rendering
*As a technical researcher, I want complete Markdown rendering supporting multi-level lists and LaTeX math so that formulas and task specifications render cleanly on mobile and desktop.*
- **Acceptance Criteria**:
  - Numbered and unordered lists render with strict 2em indentation and progressive markers (disc/circle/square and decimal/alpha/roman).
  - Display math (`$$...$$`, `\[...\]`, and ```` ```math ````) renders via KaTeX inside styled, touch-scrollable containers.
  - Currency amounts (`$100`, `$20.00`) and shell variables (`` `$HOME` ``) are strictly preserved as plain text/code without false math triggers.
  - All KaTeX CSS and web fonts are locally embedded for 100% offline standalone rendering.

#### US-5: Mobile Viewport & Virtual Quick-Keys
*As a mobile/Termux user, I want touch ergonomics and essential virtual keys so that I can control shell sessions without a physical keyboard.*
- **Acceptance Criteria**:
  - Touch-friendly quick-keys toolbar (`ESC`, `TAB`, `^C`, `▲`, `▼`, `agy ▶`, `/`, `📋 PASTE`).
  - Drawer navigation collapses to full-bleed modal drawer on screens <= 768px.
  - Jump-to-latest button floats dynamically without overlapping mobile navigation docks.
  - Zero double-tap zoom delay via `touch-action: manipulation`.

#### US-6: Live Model Quota & Token Consumption HUD
*As an AI developer, I want real-time visibility into model quota, context limits, and token velocity so that I can avoid rate-limit exhaustion and control API expenses.*
- **Acceptance Criteria**:
  - SystemHeader and Chat View display active token consumption (`tokens_total`), generation speed (tokens/sec), and elapsed time.
  - Context Window Bar displays visual usage percentage against model threshold (e.g. 1M or 2M tokens for Gemini 2.5 Pro).
  - Triggers a visual warning badge when context window approaches 80% capacity, offering a 1-click `/compress` action.
  - Displays active model name, provider, and tier with 1-click model switching (`/model`).

#### US-7: Past Session Resumption & Conversation Switching
*As an AI developer, I want to quickly reopen and resume past conversation sessions without rendering heavy transcripts, so that I can immediately continue my workflow with full model memory.*
- **Acceptance Criteria**:
  - Provides a lightweight session switcher/drawer listing past conversations (ID, title/initial prompt preview, last active timestamp, model name).
  - Selecting a past session re-binds the active `conversationId` without parsing or dumping long JSONL transcripts into the DOM.
  - Supports 1-click resumption in the UI and via slash command `/resume <conversation-id>`.
  - Next user message automatically transmits `--conversation <id>` to Google Antigravity CLI (`agy`), allowing the agent to seamlessly restore its brain context, memory, and tool states.
  - In Terminal Mode, supports direct re-attachment via `agy --conversation <conversation-id>` or terminal tmux session re-attachment.

#### US-8: Global & Workspace Skill Manager
*As a developer, I want to discover, inspect, and toggle AI skills both globally and per-project so that I can manage custom playbooks easily.*
- **Acceptance Criteria**:
  - Scans and visualizes skills across two distinct tiers:
    - **Global Skills**: `~/.gemini/antigravity/builtin/skills/` and `~/.agents/skills/`.
    - **Workspace Skills**: `<project>/.agents/skills/` and `<project>/ai-cli-task/skills/`.
  - Parses YAML frontmatter (`name`, `description`, triggers) and renders documentation view for `SKILL.md`.
  - Highlights triggers and available scripts/templates associated with each skill.
  - Allows direct invocation of skills from the UI or inserting trigger keywords into the prompt dock.

#### US-9: Antigravity Slash Command Autocomplete & Palette
*As a power user, I want an intelligent slash command palette so that I can invoke CLI commands and task lifecycle skills with autocompletion.*
- **Acceptance Criteria**:
  - Typing `/` in the Chat input opens an autocomplete popup with descriptions and argument signatures.
  - Covers all 17 Antigravity Core Slash Commands:
    - `/goal`: Autonomous long-running execution until complete.
    - `/plan`: Step-by-step implementation planning.
    - `/grill-me`: Interactive discovery interview to refine requirements.
    - `/browser`: Browser automation and web search.
    - `/schedule`: Set a timer or recurring cron schedule.
    - `/learn`: Save behavioral learning to persistent memory.
    - `/teamwork-preview`: Autonomous multi-agent coordination.
    - `/review`: Review code changes and diffs.
    - `/model`: Select model for current session.
    - `/agents`: List and switch available agents.
    - `/plugins`: Manage Antigravity plugins.
    - `/compress`: Prune and compress conversation context.
    - `/clear`: Clear conversation history.
    - `/doctor`: Run system diagnostics and health check.
    - `/permissions`: Manage tool permissions.
    - `/mcp`: Inspect MCP server status and tools.
    - `/exit`: Clean session exit.
  - Covers all 13 `ai-cli-task` Lifecycle Skills:
    - `/auto`, `/init`, `/research`, `/check`, `/verify`, `/exec`, `/merge`, `/report`, `/cancel`, `/list`, `/annotate`, `/summarize`.

#### US-10: Workspace Management & Dual-Persona Scoping (Home vs. Project)
*As an AI developer and power user, I want clear separation between my user home directory (`~`) and project workspaces, so that `agy` behaves as a general agentic personal assistant at Home and a dedicated coding agent inside project codebases.*
- **Acceptance Criteria**:
  - **Directory Hierarchy Separation**:
    - **Home Directory (`~`)**: User home root (`$HOME` / `os.UserHomeDir()`). Configured with **Agentic Assistant Persona**.
    - **Project Workspace Directories**: Dedicated project repositories (e.g. `d:/Projects/ai-cli-online`, `~/projects/*`). Configured with **Coding Agent Persona**.
  - **Contextual Agent Behavior**:
    - In **Home Directory (`~`)**:
      - `agy` acts as an autonomous personal assistant, system orchestrator, scheduler, and researcher.
      - Never assumes `~` is a git repository or code package; strictly avoids running git, test suites, or package build scripts unless explicitly instructed.
      - Prioritizes slash commands: `/goal`, `/schedule`, `/learn`, `/doctor`, `/browser`, `/model`, `/mcp`.
      - UI displays the badge `🤖 AGENTIC ASSISTANT`.
    - In **Project Workspace**:
      - `agy` acts as a specialized AI coding agent and pair programmer.
      - Operates with full codebase awareness: reads `AGENTS.md`, `GEMINI.md`, `AiTasks/`, git branch/diffs.
      - Prioritizes slash commands: `/plan`, `/verify`, `/exec`, `/review`, `/check`, `/merge`, `/auto`, and 13 `ai-cli-task` skills.
      - UI displays the badge `💻 CODING AGENT`.
  - **Workspace Manager UI & Controls**:
    - Header dropdown displays current workspace and agent mode with 1-click switcher.
    - Lists Home (`~`) and all registered project workspaces stored in SQLite `workspaces` table.
    - Supports adding new workspace directories via path input and removing inactive workspaces (Home cannot be removed).
    - Switching workspace immediately updates session working directory (`cd <path>`), refreshes file tree, switches Git panel context, and updates the agent persona badge.
    - Supports `/workspace <path|name>` slash command in chat dock for instant navigation.

### Non-Goals
- **Multi-Tenant SaaS / Cloud Hosting**: Not building a multi-user shared hosting platform; AGY Online is explicitly designed as a self-hosted single-tenant development environment.
- **Full IDE Re-implementation**: Not replacing VS Code; no language server protocol (LSP) client, AST refactoring engine, or heavy desktop extensions.
- **Proprietary AI Gateway**: Not proxying or billing LLM tokens; all AI execution is delegated directly to the local or remote Google Antigravity CLI (`agy`) binary.

---

## 3. AI System Requirements

### Tool & Engine Requirements
- **CLI Engine**: Google Antigravity CLI (`agy`).
- **Autonomous Task Plugin**: `ai-cli-task` (13-skill lifecycle: `init`, `plan`, `research`, `check`, `verify`, `exec`, `merge`, `report`, `auto`, `cancel`, `list`, `annotate`, `summarize`).
- **Execution Modes**:
  - **PTY Stream Relay**: Standard OS PTY relay (`creack/pty`) connected to tmux socket paths (`~/.tmux-sockets/ai-cli-online`) for interactive shell sessions.
  - **Structured JSON Stream Runner**: Headless invocation via `agy -p "<prompt>" --output-format stream-json` parsing events:
    - `init`: CWD, loaded tools, and active model.
    - `thinking`: Model chain-of-thought tokens.
    - `delta`: Streaming Markdown response.
    - `tool_call`: Live tool execution status (`running`, `success`, `error`), args, and output.
    - `tokens_total`, `duration_seconds`: Live consumption metrics.

### Skill Runtime & Discovery Specification
```
Skills Discovery Tier:
├── Global Builtin:   ~/.gemini/antigravity/builtin/skills/<name>/SKILL.md
├── Global Custom:    ~/.agents/skills/<name>/SKILL.md
└── Project Local:    <workspace>/.agents/skills/<name>/SKILL.md
                      <workspace>/ai-cli-task/skills/<name>/SKILL.md
```
- **Metadata Parsing**: Extract YAML frontmatter (`name`, `description`, `license`) and trigger lists from markdown documentation.
- **Skill Execution**: Skills injected into prompt context via standard `view_file` calls when trigger conditions match user intent.

### Dual-Persona Agent Specification (Home vs. Project)

The system automatically detects whether the active directory is the User Home Directory (`~`) or a Project Workspace, dynamically injecting targeted system directives to align `agy`'s role:

| Attribute | Home Directory (`~`) | Project Workspace (`<workspace>`) |
| :--- | :--- | :--- |
| **Agent Persona** | **Agentic Assistant** (`AGENTIC_ASSISTANT`) | **Coding Agent** (`CODING_AGENT`) |
| **Core Directive** | Personal assistant, system administrator, task scheduler, researcher, workflow orchestrator | Software engineer, pair programmer, codebase architect, task execution loop |
| **Git / Repo Assumption** | Strictly None (does NOT assume git repo, build tools, or test suites) | Full git repository awareness (branch, commits, diffs, PRs) |
| **Highlighted Commands** | `/goal`, `/schedule`, `/learn`, `/doctor`, `/browser`, `/model`, `/mcp`, `/workspace` | `/plan`, `/verify`, `/exec`, `/review`, `/check`, `/merge`, `/auto`, `/workspace` |
| **Task Lifecycle** | Personal notes, task scheduling, workspace creation | `ai-cli-task` 13-skill autonomous lifecycle (`AiTasks/`) |
| **UI Badge** | `🤖 AGENTIC ASSISTANT` | `💻 CODING AGENT` |

### Evaluation & Quality Strategy
- **Task Loop State Validation**: Real-time monitoring of task lifecycle state transitions (Init ➔ Planned ➔ Verified ➔ Executing ➔ Done) displayed on the Task Pipeline Bar.
- **Stall & Deadlock Detection**: Automated detection of stagnant subagent execution or context quota exhaustion as defined in `ai-cli-task/skills/auto/references/stall-detection.md`.
- **Annotation Feedback Loop**: Accuracy evaluation ensuring user plan annotations (insertions, replacements, deletions) are translated into valid structured JSON and processed by `/annotate`.

---

## 4. Technical Specifications

### Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Browser UI (React 18 + Zustand)                     │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────────┐ │
│  │   xterm.js   │ │  Plan Panel  │ │ Git History    │ │ ContextPanel │ │
│  │ (WebGL Term) │ │ (Annotator)  │ │ (Diff + Graph) │ │ (Quota/Skill)│ │
│  └──────────────┘ └──────────────┘ └────────────────┘ └──────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ WebSocket (Binary + JSON Stream) + REST
┌───────────────────────────────────▼────────────────────────────────────┐
│                  Go Native Server (Single Executable)                  │
│  ├── Embedded Static Assets (embed.FS from web/dist)                   │
│  ├── WebSocket PTY Relay (coder/websocket) ↔ tmux (~/.tmux-sockets)    │
│  ├── agy.Runner (Streaming stream-json Parser & Process Manager)       │
│  ├── Skill Discovery Engine (Global ~/.gemini vs Project .agents)      │
│  ├── Workspace Registry & Persona Injector (Home vs Project Workspaces) │
│  ├── Session Registry & Resumption Manager (~/.gemini/antigravity/brain) │
│  ├── Pure-Go SQLite (modernc.org/sqlite, WAL mode)                     │
│  └── Low-Power Idle Manager (runtime.GC + FreeOSMemory after 60s)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ UNIX Domain Socket / PTY
┌───────────────────────────────────▼────────────────────────────────────┐
│              tmux Session Cluster (ai-cli-online socket)               │
│  └── Shell Process (bash / zsh / sh)                                   │
│        └── Google Antigravity CLI (agy)                                │
│              ├── Dual Agent Personas (Agentic Assistant vs Coding Agent)│
│              ├── Antigravity Core Slash Commands (17 commands)         │
│              ├── MCP Tool Registry (Model Context Protocol)            │
│              └── ai-cli-task Autonomous Loop (13 lifecycle skills)     │
└────────────────────────────────────────────────────────────────────────┘
```

### Integration Points & Telemetry Protocols
- **WebSocket Protocol**:
  - `0x01`: Raw binary PTY data stream (bidirectional terminal I/O).
  - `0x02`: Terminal window resize event (`{ cols, rows }`).
  - `0x03`: Ping/Pong heartbeat frames (10s keepalive).
  - `0x04`: Authentication & session attachment payload.
  - `0x05`: Session lifecycle notification & status broadcast.
- **REST Endpoints for Antigravity & Workspace Management**:
  - `GET /api/agy/quota`: Returns remaining token quota, RPM/TPM status, and active model capabilities.
  - `GET /api/agy/sessions`: Lists past conversations with ID, initial prompt, timestamp, and model (lightweight metadata only, no raw transcripts).
  - `POST /api/agy/sessions/:id/resume`: Re-binds active session conversation ID or resumes via `--conversation <id>`.
  - `GET /api/agy/skills`: Returns aggregated catalog of global and workspace-scoped skills.
  - `POST /api/agy/chat`: Dispatches prompt to background `agy` runner with streaming SSE/WebSocket response.
  - `GET /api/workspaces`: Lists user Home directory, registered project workspaces, active workspace ID, and active persona mode (`agentic-assistant` vs `coding-agent`).
  - `POST /api/workspaces`: Registers a new project workspace directory path with filesystem directory validation.
  - `DELETE /api/workspaces/:id`: Removes a workspace from registry (Home directory cannot be removed).
  - `POST /api/sessions/:sessionId/switch-workspace`: Updates active session working directory (`cd <path>`) and sets active workspace in database.
  - `GET /api/sessions/:sessionId/workspace-mode`: Returns session mode (`agentic-assistant` vs `coding-agent`), `isHome` boolean, and CWD.
- **Persistence Engine**:
  - Pure-Go SQLite (`modernc.org/sqlite`, 0 CGO) in WAL mode storing drafts, annotations, UI preferences, and registered project workspaces (`workspaces` table).
- **Daemon Management**:
  - Linux `systemd`: `ai-cli-online.service` with `KillMode=process`.
  - Android Termux: `scripts/install-termux-boot.sh` with wake-lock support.

### Security & Privacy
- **Authentication**: Bearer token authentication validated on all HTTP requests and WebSocket handshakes.
- **Local Socket Isolation**: Tmux sockets enforced with `0700` permissions inside user-owned socket directories.
- **Path Traversal Protection**: REST file operations strictly bounded to current workspace directory.
- **DOM Sanitization**: HTML outputs sanitized using `DOMPurify` with an explicit whitelist before injection into the DOM.

---

## 5. Risks & Roadmap

### Technical Risks & Mitigations
| Risk | Severity | Mitigation |
| :--- | :---: | :--- |
| **High Idle RAM on 512MB VPS** | High | Go backend maintains sub-15MB footprint; idle manager invokes WAL checkpoint, `runtime.GC()`, and `debug.FreeOSMemory()` after 60s client inactivity. |
| **Quota Exhaustion during /goal** | High | Real-time quota tracker warns user when context reaches 80%; automatically triggers context compression (`/compress`). |
| **Mobile WebGL Context Loss** | Medium | Seamless fallback to xterm.js canvas 2D renderer when mobile OS reclaims GPU memory. |
| **Tmux Socket Permission Leak** | High | Server automatically verifies and enforces `0700` directory permissions on `~/.tmux-sockets/ai-cli-online/`. |
| **Long Equation Viewport Distortion** | Low | KaTeX display blocks wrapped in `.katex-block-wrapper` with responsive touch-scrolling (`overflow-x: auto`). |

### Phased Roadmap
- **v3.0 (Current Baseline)**:
  - Complete Go rewrite with embedded Web UI assets (0 CGO, <15MB idle RAM).
  - WebGL xterm.js terminal with mobile quick-keys and touch navigation.
  - Interactive Plan annotation editor with dual-layer local/server persistence.
  - Visual Git graph history browser with file diff viewer.
  - Native offline KaTeX math rendering and strict list indentation hierarchy.
  - Antigravity stream-json runner with live Thinking blocks and Tool Call cards.
  - Android Termux:Boot integration and `systemd` process management.
- **v3.1 (Near-Term — Gemini CLI Feature Expansion)**:
  - **Live Model Quota & Cost HUD**: Real-time context window usage meter, token count, and 1-click `/compress` alert.
  - **Past Session Resumption & Switcher**: Lightweight conversation selector, `/resume <id>` slash command, and instant context re-attachment to `agy` without transcript rendering overhead.
  - **Workspace Management & Dual-Persona Agent**: Strict separation between Home (`~`) and Project Workspaces, with contextual Agentic Assistant (Home) vs Coding Agent (Project) personas, fast workspace switcher dropdown, and SQLite workspace registry.
  - **Global & Project Skill Manager**: Two-tier catalog in Context Panel with searchable `SKILL.md` cards, trigger keywords, and fast invocation.
  - **Enhanced Slash Command Palette**: Intelligent auto-completer supporting all 17 core commands and 13 `ai-cli-task` skills.
- **v4.0 (Future)**:
  - WebRTC peer-to-peer relay for direct device-to-device terminal sharing without port forwarding.
  - Multi-agent swarm orchestration dashboard visualizing concurrent subagents.
