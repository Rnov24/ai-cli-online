<div align="center">

# AGY Online

### Autonomous Browser Workspace & Persistent Command Console for Google Antigravity CLI (`agy`)

[![npm version](https://img.shields.io/npm/v/agy-online.svg)](https://www.npmjs.com/package/agy-online)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-%3E%3D1.22-00ADD8.svg)](https://golang.org/)
[![Memory Footprint](https://img.shields.io/badge/Idle%20RAM-%3C15MB-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Termux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()

[**English**](README.md) • [**简体中文**](README.zh-CN.md)

</div>

---

**AGY Online** is a lightweight, high-performance web development environment engineered exclusively for **Google Antigravity CLI (`agy`)**. Packaged as a **single, self-contained Go static binary** with an embedded Web UI, AGY Online bridges the gap between raw terminal AI agents and modern desktop IDEs.

Whether deployed on a $3/month VPS, an Android phone via Termux, or a local workstation, AGY Online delivers persistent tmux terminal sessions, real-time Plan document annotation, Git history diffing, multi-account Google authentication, and native 13-skill autonomous AI task loops.

---

## ⚡ Why AGY Online?

| Feature | Legacy Web Terminals | AGY Online |
|:---|:---|:---|
| **Idle Memory** | 70MB – 150MB+ (Node.js runtime) | **~13.7MB RSS (<15MB)** in pure Go (0 CGO) |
| **Cold Boot** | 1,200ms – 2,500ms (V8 JIT warmup) | **< 20ms** instant binary startup |
| **Binary Packaging** | Multi-file Node tree + `node_modules` | **Single static binary** with embedded React UI (`embed.FS`) |
| **Session Resilience** | PTY process killed on tab disconnect | **Persistent tmux engine**; survives reconnects & reboots |
| **Autonomous Lifecycle** | Manual copy-paste prompts | Native **13-skill task automation engine** (`ai-cli-task`) |
| **Google Profiles** | Manual config editing | **Interactive multi-profile switcher** with 1-click OAuth |
| **Mobile & Termux** | Clunky virtual keyboards, background sleep | **Touch quick-keys toolbar**, Termux:Boot & CPU wake-lock |

---

## 🖥️ Screen Layout & Capabilities

```
┌─ Tab Bar ─────────────────────────────────────────────────────────────┐
│ ┌─ Plan Panel ──────┬─ Terminal ──────────────────────────────────┐   │
│ │ AiTasks/ module   │                                             │   │
│ │ Markdown viewer   │  $ /ai-cli-task auto my-feature             │   │
│ │                   │  ▶ [auto] Initializing task workspace...    │   │
│ │ Annotations:      │  ▶ [auto] Generating implementation plan... │   │
│ │  [+] Insert       │  ▶ [auto] Checkpoint 1 (post-plan): PASS    │   │
│ │  [-] Delete       │  ▶ [auto] Executing implementation step 1/4 │   │
│ │  [↔] Replace      │  ▶ [auto] Executing implementation step 2/4 │   │
│ │  [?] Comment      │  ...                                        │   │
│ │                   ├─────────────────────────────────────────────┤   │
│ │ Mermaid Diagrams  │ Chat / Slash Editor                         │   │
│ │ LaTeX equations   │ Multi-line Markdown + /goal, /plan, /model  │   │
│ └───────────────────┴─────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

- **Persistent WebGL Terminal**: Hardware-accelerated terminal powered by xterm.js and a custom 1-byte binary protocol relaying I/O to tmux (with direct PTY fallback).
- **Interactive Plan & Annotation Panel**: Review AI-generated architecture and task plans in real-time. Highlight text to insert, delete, replace, or leave comments, sending structured JSON feedback directly to `agy`.
- **Git History Visualizer & Diff Viewer**: Inspect commit logs with interactive lane graph visualization, file commit diffs, and instant message search.
- **Markdown Chat & Slash Console**: Full-fledged Markdown editor with syntax highlighting, Antigravity slash commands (`/goal`, `/plan`, `/grill-me`, `/review`, `/model`), and server-side draft synchronization.
- **Antigravity Google Auth Profile Switcher**: Switch between work, personal, and team Google accounts without touching configuration files. Features a built-in OAuth helper and direct token importer.
- **Skills Hub**: Discover and 1-click install skills from the official `skills.sh` registry, or convert legacy Hermes plugins to native Antigravity skills automatically.

---

## 🔄 13-Skill Task Lifecycle Engine (`ai-cli-task`)

AGY Online natively supports the complete 13-skill Antigravity task lifecycle plugin:

```
              ┌────────────────────────────────────────────────────────┐
              ▼                                                        │
init ──► plan ──► check ──► exec ──► verify ──► check ──► merge ──► report
  │        ▲        │ (fail)          (fail)      │ (fail)
  │        └────────┴─────────────────────────────┘
  └─► research (external knowledge ingestion)
```

| Skill | Description |
|:---|:---|
| `/auto <module>` | **Full autonomous loop**: runs plan → check → exec → verify → merge → report in a single session |
| `/init <module>` | Initializes task module directory under `AiTasks/<name>/`, creates git branch & workspace |
| `/plan <module>` | Drafts implementation plan or consumes human annotations from the Plan Panel |
| `/research <module>`| Collects external references, documentation, and web sources into `.references/` |
| `/check <module>` | Evaluates feasibility and drift at 3 critical checkpoints (post-plan, mid-exec, post-exec) |
| `/verify <module>` | Runs domain-adapted automated tests and verification suites, logging results to `.test/` |
| `/exec <module>` | Executes implementation steps with step-by-step validation gates |
| `/merge <module>` | Merges validated task branch back to `main` with automated conflict resolution |
| `/report <module>` | Generates completion report and distills lessons learned into `.experiences/` |
| `/cancel <module>` | Gracefully terminates active task execution, marks state cancelled, and cleans resources |
| `/list` | Queries all task modules, dependency graphs, and lifecycle states (read-only) |
| `/annotate <f> <a>`| Ingests structured JSON annotations submitted from the browser Plan panel |
| `/summarize <module>`| Condenses context summaries to avoid LLM context window overflow |

---

## 🚀 Quick Start

### Option 1: Run with `npx` (No Install Required)

```bash
npx agy-online
```

### Option 2: Global NPM Install

```bash
npm install -g agy-online
agy-online start
```

### Option 3: Precompiled Binary / Build from Source

```bash
# 1. Clone repository
git clone https://github.com/huacheng/agy-online.git
cd agy-online

# 2. Build Web UI and single Go binary
npm install
npm run build

# 3. Start server
./bin/agy-online start
```

Access the web console at **`http://localhost:3001`**.

---

## ⚙️ Service & Daemon Management

The compiled Go executable contains a built-in process manager with PID tracking, resource accounting, and graceful shutdown:

```bash
# Start in background daemon mode
./bin/agy-online start -d

# Start on a custom port
./bin/agy-online start -p 8080 -d

# Inspect status, PID, RSS memory, and uptime
./bin/agy-online status

# Restart daemon cleanly
./bin/agy-online restart

# Stop daemon
./bin/agy-online stop
```

---

## 📱 Mobile & Termux (Android) Setup

AGY Online is optimized to run headlessly on Android devices via **Termux**, consuming under 15MB of RAM:

### 1. 1-Tap Termux:Boot Auto-Start

```bash
bash scripts/install-termux-boot.sh
```

- Installs `~/.termux/boot/start-agy-online.sh`.
- Acquires `termux-wake-lock` automatically so the CPU remains active when your phone screen turns off.
- Boots AGY Online headlessly in the background whenever your Android phone boots up.

### 2. Mobile Touch Quick-Keys Toolbar

Tap the **`⌨️`** button in the bottom navigation bar to toggle the touch-optimized mobile toolbar:
- Quick keys: `ESC`, `TAB`, `Ctrl+C`, `Ctrl+D`, `▲`, `▼`, `◀`, `▶`, `/`
- One-tap `agy ▶` launcher
- Native clipboard paste button

---

## 🏗️ Architecture

```
Browser Client (xterm.js + WebGL)
  ├── Plan Panel (interactive task annotation editor)
  ├── Git History Panel (commit browser + diff viewer + lane graph)
  ├── Chat Editor (Markdown + Antigravity slash commands)
  └── Terminal View (WebGL renderer + quick-keys)
        │
        ↕ WebSocket (0x01-0x05 binary frames) + REST API
Go Native Server (Single static binary, 0 CGO)
  ├── Embedded Web UI assets (embed.FS — no external node_modules)
  ├── WebSocket ↔ PTY relay (creack/pty + coder/websocket)
  ├── tmux session manager (~/.tmux-sockets/agy-online)
  ├── Pure-Go SQLite with WAL mode (modernc.org/sqlite)
  ├── Idle Memory Compactor (checkpoints WAL & frees OS memory after 60s idle)
  └── REST routes (sessions, files, editor, settings, git, agy profiles)
        │
        ↕ tmux socket / direct PTY fallback
tmux session ──► shell ──► Google Antigravity CLI (agy)
  └── AiTasks/ lifecycle (13-skill state machine)
```

---

## 🔧 Configuration & Environment Variables

AGY Online reads environment variables from `~/.agy-online/.env` or `.env`:

| Variable | Default | Description |
|:---|:---|:---|
| `PORT` | `3001` | Server listening port |
| `HOST` | `0.0.0.0` | Network bind address |
| `AUTH_TOKEN` | *(empty)* | Optional authentication token required to access Web UI |
| `DEFAULT_WORKING_DIR`| `$HOME` | Default directory when opening terminal sessions |
| `DATA_DIR` | `~/.agy-online/data` | Database (`agy-online.db`) and persistent state directory |
| `START_COMMAND` | *(system shell)* | Custom startup command for new terminal sessions |
| `MAX_CONNECTIONS` | `10` | Maximum simultaneous WebSocket connections |

---

## 🛡️ Production Deployment (systemd + nginx)

Run the automated production installer to configure a systemd service and optional nginx reverse proxy with WebSocket support and SSL:

```bash
sudo bash install-service.sh
```

```bash
# Manage system service
sudo systemctl start agy-online
sudo systemctl status agy-online
sudo journalctl -u agy-online -f
```

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| `Ctrl + \` | Toggle Chat Editor panel |
| `Alt + A` | Open Autonomous Task Modal |
| `Alt + P` | Open Skills Hub & Management Modal |
| `Alt + G` | Toggle Git History & Diff Viewer panel |
| `Alt + C` | Open Interactive Clarification Modal |
| `Alt + H` | Open Help & Guide Modal |
| `Ctrl + S` | Save file in Workspace Explorer |
| `Escape` | Dismiss active modal or exit file edit mode |

---

## 🤝 Acknowledgements

AGY Online builds upon the architectural ideas and community efforts of:
- [**Google Antigravity CLI (`agy`)**](https://github.com/google/antigravity) — Google's advanced autonomous agentic coding engine.
- [**ai-cli-online**](https://github.com/huacheng/ai-cli-online) — The original foundational browser web terminal for CLI agents.
- [**hermes-webui**](https://github.com/nesquena/hermes-webui) — Inspirations in agent web interface design and developer ergonomics.

---

## 📄 License

[MIT](LICENSE) © 2026 AGY Online Contributors.
