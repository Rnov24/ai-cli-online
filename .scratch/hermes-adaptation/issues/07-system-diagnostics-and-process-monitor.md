# 07: System Diagnostics & Background Process Supervision Dashboard

**What to build:** A dedicated diagnostic control panel providing live visibility into system health, active tmux sessions, running background subagents/daemons, SQLite WAL checkpoints, and server ring-buffer logs. Allows developers to verify the sub-15MB idle RAM profile and terminate orphaned agent processes directly from the UI.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Diagnostics modal displays real-time memory metrics (RSS, Go heap, OS allocation) and proves sub-15MB idle state after GC.
- [x] Active background processes (tmux sessions, subagents, background jobs) are enumerated in a clear table with PID, uptime, and terminate actions.
- [x] Live server logs can be streamed or inspected from a circular ring buffer without reading raw terminal files manually.
- [x] Health check endpoint provides system status, disk usage, and Antigravity CLI version detection.
- [x] Accessible via settings menu and top status indicator.
