# Domain Glossary & Architecture Context

This document records the ubiquitous domain language for **AGY Online (`ai-cli-online`)**. It defines the core domain concepts and names the architectural seams.

---

## Domain Concepts

### 1. Terminal Session
A persistent, interactive pseudo-terminal (PTY) execution stream.
- **Tmux Session**: A terminal session managed by a persistent background tmux server (`~/.tmux-sockets/ai-cli-online`). Survives client disconnects, browser tab closes, and network interruptions.
- **Direct Shell Session**: A terminal session spawned directly via PTY without multiplexer mediation (used as fallback when tmux is unavailable, such as in minimal Android/Termux environments).
- **Session Lifecycle**: The discrete states and transitions: creation, PTY attachment, dimensions resize (`cols`, `rows`), scrollback history capture, working directory detection, and termination (`kill`).

### 2. Workspace
A designated filesystem directory root where user development or system orchestration occurs.
- **Home Root (`~`)**: The user's personal operating system directory. Triggers the **Agentic Assistant** persona. Git repository operations are guarded.
- **Project Workspace**: A directory containing a software codebase (typically with git version control and/or `AiTasks/`). Triggers the **Coding Agent** persona.

### 3. Persona
The contextual operating posture adopted by the Google Antigravity CLI (`agy`).
- **Agentic Assistant**: Tailored for system orchestration, automation, personal productivity, and workspace switching.
- **Coding Agent**: Tailored for codebase comprehension, git changes, implementation planning, and the 13-skill task lifecycle.
- **System Directive**: Contextual preamble prepended to the user's prompt instructing the underlying model on its operating boundary.

### 4. Client Session Adapter
The frontend communication module encapsulating network access to server endpoints for a specific authenticated user and active terminal session.
- Handles bearer token injection, path construction, JSON parsing, and uniform HTTP error wrapping (`ApiError`).

### 5. Tabs Layout
The client-side visual layout configuration.
- **Tab**: An independent logical development view containing one or more terminal instances arranged in a split tree.
- **Split Tree**: A recursive binary tree composed of `SplitNode` (horizontal/vertical container with ratio sizes) and `LeafNode` (terminal view).
- **Active Tab**: The currently focused tab whose layout and terminal instances are mounted in the browser viewport.
- **Tab Persistence**: Multi-tier persistence mechanism: synchronous `localStorage` cache for cold render + debounced server database storage.

### 6. Task Module
A structured work unit residing in `AiTasks/<module-name>/` managed via the `ai-cli-task` 13-skill Antigravity lifecycle (`.target.md`, `.plan.md`, `.summary.md`, annotations, verification reports).
