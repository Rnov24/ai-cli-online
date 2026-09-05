# 06: In-Browser Workspace File Editor & Worktree Explorer

**What to build:** A lightweight file inspection and editing workflow integrated directly into the workspace panel. Clicking any file opens a clean in-browser editor with syntax highlighting, line numbers, and save/revert controls. The panel also includes a Git worktree selector allowing developers to switch, inspect, and compare isolated branches created by agent tasks.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Clicking any code or text file in the workspace file tree opens an in-browser editor tab with syntax highlighting.
- [x] File modifications can be saved back to disk with confirmation, or reverted cleanly.
- [x] Worktree selector detects and lists active git worktrees with one-click switching of active workspace context.
- [x] Mobile view provides a touch-friendly scrolling and editing experience without UI overflow.
- [x] Editor memory usage is strictly bounded and releases resources when closed, maintaining idle RAM constraints.
