# 01: Write-Ahead Turn Journal & Crash Recovery

**What to build:** An append-only turn journal that records turn lifecycle states (`submitted`, `running`, `completed`, `interrupted`) before and during dispatch. If the browser disconnects, the server crashes, or the agent process terminates unexpectedly, reopening the session detects uncompleted turns, cleanly marks them as interrupted, and displays a recovery banner allowing the user to view partial output, resume, or retry.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Submitting a prompt writes an initial journal entry before execution starts.
- [x] Active turn transitions to `running` with streaming checkpoints, and marks `completed` on clean finish.
- [x] Unexpected server or tab disconnect leaves the turn safely recoverable without corrupting session history.
- [x] UI displays an interrupted turn banner with one-click retry or resume options upon session reconnect.
- [x] Pure Go SQLite journal operations run with zero CGO overhead and pass idle memory reclamation after completion.
