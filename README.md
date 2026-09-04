# AI-Cli Online

[![npm version](https://img.shields.io/npm/v/ai-cli-online.svg)](https://www.npmjs.com/package/ai-cli-online)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

An AI-powered development environment that runs in your browser. Persistent terminal sessions, structured task lifecycle, and autonomous execution — all through a single Node.js process.

Built exclusively for running **Google Antigravity CLI (`agy`)** over local or unstable networks. tmux keeps everything alive when connections drop; the browser UI provides planning, annotation, and chat panels alongside the terminal.

**npm:** https://www.npmjs.com/package/ai-cli-online | **GitHub:** https://github.com/huacheng/ai-cli-online

[**中文文档**](README.zh-CN.md)

![screenshot](screenshot.jpg)

## What It Does

**Terminal + Planning + Execution in one screen:**

```
┌─ Tabs ──────────────────────────────────────────────────────┐
│ ┌─ Plan Panel ──────┬─ Terminal ────────────────────────┐   │
│ │ AiTasks/ browser   │                                   │   │
│ │ Markdown viewer    │  $ /ai-cli-task auto my-feature   │   │
│ │ Inline annotations │  ▶ planning...                    │   │
│ │ (insert/delete/    │  ▶ check(post-plan): PASS         │   │
│ │  replace/comment)  │  ▶ executing step 1/4...          │   │
│ │                    │  ▶ executing step 2/4...          │   │
│ │ Mermaid diagrams   │  ...                              │   │
│ │                    ├───────────────────────────────────┤   │
│ │                    │ Chat Editor                        │   │
│ │                    │ Multi-line Markdown + /commands    │   │
│ └────────────────────┴───────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

- **Plan Panel** — browse `AiTasks/` files, annotate documents with 4 annotation types, send structured feedback to AI
- **Terminal** — full xterm.js with WebGL rendering, binary protocol for ultra-low latency, and touch quick-keys for mobile
- **Chat Editor** — multi-line Markdown editor with slash commands, server-side draft persistence
- **Mobile & Termux Ready** — auto-start at Android device boot via Termux:Boot, wake-lock CPU protection, and registered PID tracking
- **Idle Serving** — automatic low-power idle mode when 0 clients connected; checkpoints SQLite and trims memory (RSS ~70MB)
- All panels can be open simultaneously, each independently resizable

## AI Task Lifecycle

The `ai-cli-task` plugin provides an 8-skill lifecycle for structured AI task execution:

```
init → plan → check → exec → check → merge → report
                ↑        ↓
              re-plan ←──┘ (on issues)
```

| Skill | What it does |
|-------|-------------|
| **init** | Create task module (`AiTasks/<name>/`), git branch, optional worktree |
| **plan** | Generate implementation plan or process human annotations |
| **check** | Evaluate feasibility at 3 checkpoints (post-plan / mid-exec / post-exec) |
| **exec** | Execute plan steps with per-step verification |
| **merge** | Merge task branch to main with conflict resolution (up to 3 retries) |
| **report** | Generate completion report, distill lessons to experience database |
| **auto** | Run the full lifecycle autonomously in a single Antigravity (`agy`) session |
| **cancel** | Stop execution, set status to cancelled, optional cleanup |

### Auto Mode

```bash
/ai-cli-task auto my-feature
```

One command triggers the entire lifecycle. A single Antigravity (`agy`) session runs plan → check → exec → merge → report internally, sharing context across all steps. A daemon monitors progress via `.auto-signal` files, enforces timeouts, and detects stalls.

### Task Structure

```
AiTasks/
├── .index.json                  # Module listing
├── .experiences/                # Cross-task knowledge base (by domain type)
│   ├── .summary.md              # Experience file index
│   └── <type>.md
├── .references/                 # External reference materials (collected during plan/exec)
│   ├── .summary.md              # Reference file index
│   └── <topic>.md
└── my-feature/
    ├── .index.json              # Status, phase, timestamps, dependencies (JSON)
    ├── .target.md               # Requirements (human-authored)
    ├── .summary.md              # Condensed context (prevents context overflow)
    ├── .analysis/               # Evaluation history
    ├── .test/                   # Test criteria & results
    ├── .bugfix/                 # Issue history
    ├── .notes/                  # Research findings
    ├── .report.md               # Completion report
    └── .plan.md                 # Implementation plan
```

### Type-Aware Execution

Tasks are classified by domain type (`software`, `dsp`, `ml`, `literary`, `science:physics`, etc.). Each type adapts planning methodology, execution tools, and verification criteria. Completed task lessons are stored in `.experiences/<type>.md` and referenced by future tasks of the same type.

## Terminal Features

- **Session Persistence** — tmux keeps processes alive through disconnects; fixed socket path ensures auto-reconnect after server restarts
- **Multi-Tab** — independent terminal groups with layout persistence across refreshes
- **Split Panes** — horizontal / vertical splits, arbitrarily nested
- **Binary Protocol** — 1-byte prefix frames for terminal I/O, TCP Nagle disabled, WebSocket compression
- **WebGL Rendering** — 3-10x throughput vs canvas
- **Copy & Paste** — mouse selection auto-copies; right-click pastes
- **Scroll History** — capture-pane scrollback with ANSI color preservation
- **File Transfer** — upload/download files, browse directories, download CWD as tar.gz
- **Network Indicator** — real-time RTT latency with signal bars
- **Auto Reconnect** — exponential backoff with jitter

## Annotation System

The Plan panel provides 4 annotation types for structured AI feedback:

| Type | Icon | Description |
|------|------|------------|
| **Insert** | `+` | Add content at a specific location |
| **Delete** | `−` | Mark text for removal |
| **Replace** | `↔` | Substitute old text with new |
| **Comment** | `?` | Ask questions or leave notes |

Annotations are persisted (localStorage + SQLite) and sent to the AI as structured JSON. The `plan` skill processes them — triaging by impact, applying changes, and updating task files.

## Quick Start

### Option 1: npx (Recommended)

```bash
npx ai-cli-online
```

### Option 2: Global Install

```bash
npm install -g ai-cli-online
ai-cli-online
```

### Option 3: From Source

```bash
git clone https://github.com/huacheng/ai-cli-online.git
cd ai-cli-online
npm install
npm run build      # Compiles React Web UI and builds the single Go binary
./bin/ai-cli-online start
```

## Prerequisites

- Go >= 1.22 (to build from source)
- tmux installed (`pkg install tmux` on Termux, `sudo apt install tmux` on Ubuntu)
- agy installed (Google Antigravity CLI)

## Process Management & CLI Commands

Manage the server lifecycle with PID tracking and background daemon mode:

```bash
# Start in background daemon mode
./bin/ai-cli-online start -d

# Check running status, PID, memory, and uptime
./bin/ai-cli-online status

# Stop running server daemon
./bin/ai-cli-online stop

# Restart server
./bin/ai-cli-online restart
```

## Mobile & Termux Auto-Serving on Boot

AGY Online provides first-class support for running on Android devices via Termux:

1. **Auto-Start on Device Boot**:
   ```bash
   bash scripts/install-termux-boot.sh
   ```
   This creates a boot hook in `~/.termux/boot/start-ai-cli-online.sh` that starts the server whenever your Android device powers on.

2. **Wake-Lock & Battery Optimization**:
   The installer automatically acquires `termux-wake-lock` to ensure Android does not put the CPU to sleep when the screen is off.

3. **Touch Quick-Keys Bar**:
   The Web UI provides a mobile-friendly touch toolbar (`ESC`, `TAB`, `^C`, arrows, `agy ▶`, `/`, paste) toggleable via `⌨️`, eliminating mobile virtual keyboard friction.

4. **Idle Power-Saving**:
   When no browser tabs are connected, the backend automatically transitions to low-power idle mode, committing SQLite WAL and releasing garbage-collected memory (reducing RAM to ~70MB).

## Configuration

Create `server/.env`:

```env
PORT=3001                        # Server port
HOST=0.0.0.0                     # Bind address
AUTH_TOKEN=your-secret-token     # Auth token (required for production)
DEFAULT_WORKING_DIR=/home/user   # Default working directory
HTTPS_ENABLED=true               # Set to false behind nginx reverse proxy
TRUST_PROXY=1                    # Set to 1 when behind nginx/reverse proxy
```

See `server/.env.example` for all available options.

## Architecture

```
Browser (xterm.js + WebGL)
  ├── Plan Panel (annotation editor)
  ├── Chat Editor (Markdown + /commands)
  └── Terminal View (WebGL renderer)
        │
        ↕ WebSocket binary/JSON + REST API
        │
Go Native Server (Single static executable)
  ├── Embedded Web UI assets (embed.FS)
  ├── WebSocket ↔ PTY relay (creack/pty + coder/websocket)
  ├── tmux session manager (~/.tmux-sockets/ai-cli-online)
  ├── File transfer API (tar.gz streaming, upload, download)
  ├── SQLite (drafts, annotations, settings via modernc.org/sqlite)
  └── REST route handlers (sessions, files, editor, settings, git, system)
        │
        ↕ PTY / tmux sockets
        │
tmux sessions → shell → Google Antigravity CLI (agy) / AI agents
  └── AiTasks/ lifecycle (init/plan/check/exec/merge/report/auto)
```

- **Frontend**: React + Zustand + xterm.js (WebGL)
- **Backend**: Go (Golang) + `creack/pty` + `coder/websocket` + `modernc.org/sqlite` (Pure Go, 0 CGO)
- **Binary**: Single self-contained static executable (`bin/ai-cli-online`) with embedded Web UI assets
- **Session Manager**: tmux (persistent terminal sessions)
- **Layout**: Tabs + recursive split tree (LeafNode / SplitNode)
- **Transport**: Binary frames (hot path) + JSON (control messages)
- **Task System**: 8-skill plugin with state machine, dependency gates, and experience database

## Project Structure

```
ai-cli-online/
├── shared/              # Shared type definitions
├── server/src/
│   ├── index.ts         # Main entry (middleware + routes + server)
│   ├── websocket.ts     # WebSocket ↔ PTY relay (binary + JSON)
│   ├── tmux.ts          # tmux session management
│   ├── files.ts         # File operations + path validation
│   ├── pty.ts           # node-pty wrapper
│   ├── db.ts            # SQLite database
│   ├── auth.ts          # Auth utilities
│   ├── middleware/       # Auth middleware
│   └── routes/          # REST API routes (sessions, files, editor, settings)
├── web/src/
│   ├── App.tsx           # Main app (Login / TabBar / Terminal / Theme)
│   ├── store/            # Zustand store (modular slices)
│   ├── components/
│   │   ├── TerminalPane.tsx              # 2D grid layout (Plan + Terminal + Chat)
│   │   ├── TerminalView.tsx              # xterm.js terminal
│   │   ├── PlanPanel.tsx                 # Plan annotation panel
│   │   ├── PlanAnnotationRenderer.tsx    # Markdown + inline annotations
│   │   ├── PlanFileBrowser.tsx           # AiTasks/ file browser
│   │   ├── MarkdownEditor.tsx            # Chat editor
│   │   └── ...
│   ├── hooks/            # React hooks (WebSocket, file stream, resize, etc.)
│   └── api/              # Typed API client modules
├── bin/                  # npx entry point
├── start.sh              # Production start script
└── install-service.sh    # systemd + nginx installer
```

## Development

```bash
# Dev mode (frontend + backend separately)
npm run dev

# Build
npm run build

# Production (build + start)
bash start.sh
```

### systemd Service + nginx Reverse Proxy

```bash
sudo bash install-service.sh          # Interactive install (systemd + optional nginx)
sudo systemctl start ai-cli-online    # Start service
sudo journalctl -u ai-cli-online -f   # View logs
```

The install script will:
1. Create a systemd service for auto-start and process management
2. Detect nginx and optionally configure reverse proxy (WebSocket support, SSL, `client_max_body_size`)
3. Auto-set `HTTPS_ENABLED=false` and `TRUST_PROXY=1` in `server/.env` when nginx is enabled

## Security

- Token authentication with timing-safe comparison
- Symlink traversal protection on all file operations
- Unauthenticated WebSocket connection limits
- TOCTOU download guard (streaming size check)
- CSP headers (frame-ancestors, base-uri, form-action)
- Rate limiting (configurable read/write thresholds)

## License

MIT
