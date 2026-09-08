# AGY Online — Antigravity Development Workspace

## Project Overview

**AGY Online** (`ai-cli-online`) is a browser-based development environment built exclusively for **Google Antigravity CLI (`agy`)**. Through xterm.js + tmux, it provides persistent terminal sessions alongside an integrated Plan annotation panel, Git History visualizer, and Markdown Chat editor. It natively supports the `ai-cli-task` 13-skill lifecycle plugin (`init`, `plan`, `research`, `check`, `verify`, `exec`, `merge`, `report`, `auto`, `cancel`, `list`, `annotate`, `summarize`), enabling autonomous AI task execution.

## Architecture

```
Browser (xterm.js + WebGL)
  ├── Plan Panel (interactive task annotation editor)
  ├── Git History Panel (commit browser + diff viewer + lane graph)
  ├── Chat Editor (Markdown + Antigravity slash commands)
  └── Terminal View (WebGL renderer)
        │
        ↕ WebSocket binary/JSON + REST API
Go Native Server (Single static executable)
  ├── Embedded Web UI assets (embed.FS)
  ├── WebSocket (0x01-0x05 binary) ↔ PTY relay (creack/pty)
  ├── tmux session manager (~/.tmux-sockets/ai-cli-online)
  ├── File transfer API (tar.gz streaming, upload, download)
  ├── Pure-Go SQLite (drafts, annotations, settings via modernc.org/sqlite)
  └── REST routes (sessions, files, editor, settings, git, system)
        │
        ↕ PTY / tmux sockets
tmux sessions → shell → Google Antigravity CLI (agy)
  └── AiTasks/ lifecycle (init/plan/research/check/verify/exec/merge/report/auto/cancel/list/annotate/summarize)
```

- **Frontend**: React + Zustand + xterm.js (WebGL rendering)
- **Backend**: Go (Golang) + `creack/pty` + `coder/websocket` + `modernc.org/sqlite` (Pure Go, 0 CGO)
- **Binary**: Single self-contained static executable (`bin/ai-cli-online`) with embedded Web UI assets
- **Session Management**: tmux (persistent terminal sessions survive disconnects)
- **Layout**: Tabs + recursive split tree (LeafNode / SplitNode)
- **Data Persistence**: SQLite (WAL mode, pure Go)
- **Task Plugin**: `ai-cli-task` (13-skill Antigravity plugin)
- **Fonts**: JetBrains Mono (Latin) + LXGW WenKai Mono (CJK)

## Development & Lifecycle Commands

```bash
# Build Web UI and single Go binary
npm run build
# or build Go binary directly:
go build -o bin/ai-cli-online ./cmd/ai-cli-online

# Start production server (foreground)
./bin/ai-cli-online start
# or via npm:
npm start

# Run all tests (Web + Go)
npm test

# Service lifecycle commands (with PID management)
./bin/ai-cli-online start -d    # Background daemon mode
./bin/ai-cli-online status      # Query PID, memory, and status
./bin/ai-cli-online stop        # Stop daemon cleanly
./bin/ai-cli-online restart     # Restart daemon
./bin/ai-cli-online install-boot # Install Termux:Boot auto-start

# Termux & mobile auto-start script
bash scripts/install-termux-boot.sh

# One-step production start script
bash start.sh
```

## Mobile & Low-Spec VPS Optimizations

- **Sub-15MB Idle RAM**: Rebuilt in Go to achieve ~13.7MB RSS memory (an 81% reduction from Node.js ~72MB).
- **Sub-20ms Cold Boot**: Single compiled Go executable boots instantly without V8 JIT warmup.
- **Single Self-Contained Binary**: The compiled Web UI (`web/dist/`) is embedded directly into the Go executable via `embed.FS` — no Node.js or `node_modules` required in production.
- **Idle Serving**: Automatic transition to low-power idle mode when 0 clients connected for >60s.
  - Checkpoints SQLite WAL and trims dirty pages (`wal_checkpoint(PASSIVE)`).
  - Calls `runtime.GC()` and `debug.FreeOSMemory()` to return physical pages to the OS kernel.
- **Adaptive Polling**: Frontend pauses document, CWD, and task polling when the browser tab is hidden or screen is off.
- **Mobile Quick-Keys**: Touch-friendly virtual toolbar (`ESC`, `TAB`, `^C`, arrows, `agy ▶`, `/`, clipboard) toggleable via `⌨️`.
- **Termux:Boot Integration**: Registers auto-start on Android device boot via `~/.termux/boot/start-ai-cli-online.sh` with wake-lock support.
- **PID Registry**: Tracks `server.pid` and `tmux.pid` in `~/.ai-cli-online/run/` for clean lifecycle management.

## Antigravity CLI (`agy`) Integration

- **Binary**: `agy` (Google Antigravity CLI)
- **Settings Path**: `~/.gemini/antigravity-cli/settings.json`
- **Plugin Manifest**: `~/.gemini/config/import_manifest.json`
- **Plugin Directory**: `./ai-cli-task` (install with `agy plugin install ./ai-cli-task`)

### Core Slash Commands in Chat Editor
- `/goal`: Autonomous long-running execution until complete
- `/plan`: Step-by-step implementation planning
- `/grill-me`: Interactive interview to refine and align plans
- `/browser`: Browser automation and web search
- `/schedule`: Set a timer or recurring cron schedule
- `/learn`: Save behavioral learning / persistent memory
- `/teamwork-preview`: Autonomous multi-agent coordination
- `/review`: Review code changes and diffs
- `/model`: Select model for current session
- `/agents`: List and switch available agents
- `/plugins`: Manage Antigravity plugins
- `/compress`: Compress conversation context
- `/clear`: Clear conversation history
- `/doctor`: Run diagnostics and health check
- `/permissions`: Manage tool permissions
- `/mcp`: MCP server management
- `/exit`: Exit Antigravity CLI session

### Task Lifecycle Skills (`ai-cli-task`)
- `/auto <module>`: Autonomous full lifecycle loop
- `/init <module>`: Initialize task module + branch
- `/research <module>`: Collect external references
- `/check <module>`: Check feasibility (post-plan/mid/post-exec)
- `/verify <module>`: Run domain-adapted tests
- `/exec <module>`: Execute implementation plan
- `/merge <module>`: Merge task branch to main
- `/report <module>`: Generate completion report
- `/cancel <module>`: Cancel task + optional cleanup
- `/list`: Query task status (read-only)
- `/annotate <file> <ann>`: Process Plan panel annotations
- `/summarize <module>`: Regenerate context summary

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `DESIGN.md` for direction, `.agents/skills/antislop/SKILL.md` (core) as the filter, and then the skill for the task:
- UI / visual: `.agents/skills/antislop-ui/SKILL.md`
- Copy & text: `.agents/skills/antislop-copywriting/SKILL.md`
- People: `.agents/skills/antislop-human/SKILL.md`
- Mobile / responsive: `.agents/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `.agents/skills/antislop-code/SKILL.md`
Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->
