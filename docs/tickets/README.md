# AGY Online — Master Ticket Backlog: Workspace Management & Dual-Persona Agent

**Dokumen Induk:** [docs/PRD.md](../PRD.md) | [AGENTS.md](../../AGENTS.md) | [GEMINI.md](../../GEMINI.md)  
**Tech Stack:** Go 1.27 (0 CGO, `creack/pty`, `coder/websocket`, `modernc.org/sqlite`) | React 18 + TypeScript + Zustand + Vite + Tailwind/Custom CSS  
**Total Epics:** 4 Epics  
**Total Actionable Tickets:** 11 Tickets  
**Estimasi Total Story Points:** 42 SP  

---

## 1. Peta Ketergantungan Antar Ticket (Dependency Graph)

```mermaid
flowchart TD
    subgraph Epic1[Epic 1: Workspace Core & Persistence]
        WS001[WS-001: SQLite Workspaces Schema & DB CRUD] --> WS002[WS-002: Workspace REST API Handlers]
        WS001 --> WS003[WS-003: Server Startup Auto-Seeding]
        WS002 --> WS003
    end

    subgraph Epic2[Epic 2: Dual-Persona Agent Engine]
        WS002 --> PER001[PER-001: Home Directory Detector & Mode Resolver]
        PER001 --> PER002[PER-002: Agentic Assistant Directive Injector]
        PER002 --> PER003[PER-003: agy Runner Integration & Session Re-attachment]
    end

    subgraph Epic3[Epic 3: UI Workspace Switcher & Persona Badges]
        WS002 --> UI001[UI-001: Frontend Workspace API Client & Types]
        UI001 --> UI002[UI-002: Header WorkspaceSelector Dropdown Component]
        PER001 & UI001 --> UI003[UI-003: Contextual Agent Persona Badges]
        UI002 --> UI003
    end

    subgraph Epic4[Epic 4: Agentic Chat & Tool Scoping]
        PER002 & UI003 --> CHAT001[CHAT-001: Mode-Adaptive Slash Command Palette]
        WS002 & CHAT001 --> CHAT002[CHAT-002: /workspace Slash Command Handler]
        PER001 --> CHAT003[CHAT-003: Git Graph & Plan Panel Home Guard]
    end
```

---

## 2. Tabel Master Backlog Tiket (11 Tickets)

| ID Tiket | Epic | Judul Tiket | Prioritas | SP | Assignee Role | Status |
|---|---|---|---|---|---|---|
| [`WS-001`](./EPIC-1-WORKSPACE-CORE/WS-001-database-schema-workspaces.md) | Epic 1 | SQLite Workspaces Table Schema & DB CRUD Methods | P0 | 3 | Backend | **Done** |
| [`WS-002`](./EPIC-1-WORKSPACE-CORE/WS-002-workspace-rest-api-handlers.md) | Epic 1 | Workspace REST API Endpoints & Route Registration | P0 | 5 | Backend | **Done** |
| [`WS-003`](./EPIC-1-WORKSPACE-CORE/WS-003-server-initialization-seeding.md) | Epic 1 | Server Startup Workspace Auto-Seeding & Home Binding | P1 | 2 | Backend | **Done** |
| [`PER-001`](./EPIC-2-DUAL-PERSONA-ENGINE/PER-001-home-directory-detector.md) | Epic 2 | Home Directory Scoping & Runtime Mode Resolver | P0 | 3 | Backend / Core | **Done** |
| [`PER-002`](./EPIC-2-DUAL-PERSONA-ENGINE/PER-002-agentic-assistant-directive-engine.md) | Epic 2 | Contextual Agentic Assistant Directive Prompt Injector | P0 | 5 | AI Engine | **Done** |
| [`PER-003`](./EPIC-2-DUAL-PERSONA-ENGINE/PER-003-session-context-resumption-runner.md) | Epic 2 | agy Headless Runner Context Propagation & Session Re-attachment | P0 | 3 | AI Engine | **Done** |
| [`UI-001`](./EPIC-3-UI-WORKSPACE-SWITCHER/UI-001-frontend-workspace-api-client.md) | Epic 3 | Frontend Workspace API Client, Interfaces & State | P0 | 3 | Frontend | **Done** |
| [`UI-002`](./EPIC-3-UI-WORKSPACE-SWITCHER/UI-002-header-workspace-selector-dropdown.md) | Epic 3 | Header WorkspaceSelector Dropdown & Management Modal | P0 | 5 | Frontend | **Done** |
| [`UI-003`](./EPIC-3-UI-WORKSPACE-SWITCHER/UI-003-agent-persona-visual-badges.md) | Epic 3 | Contextual Persona Telemetry Badges (Assistant vs Coding) | P1 | 3 | Frontend | **Done** |
| [`CHAT-001`](./EPIC-4-AGENTIC-CHAT-INTEGRATION/CHAT-001-mode-adaptive-slash-palette.md) | Epic 4 | Mode-Adaptive Slash Command Autocomplete & Palette | P1 | 5 | Full-Stack | **Done** |
| [`CHAT-002`](./EPIC-4-AGENTIC-CHAT-INTEGRATION/CHAT-002-workspace-slash-command.md) | Epic 4 | `/workspace` Slash Command Execution & Navigation Handler | P1 | 3 | Full-Stack | **Done** |
| [`CHAT-003`](./EPIC-4-AGENTIC-CHAT-INTEGRATION/CHAT-003-git-plan-guard-in-home.md) | Epic 4 | Git Graph & Plan Panel Home Directory Graceful Guards | P2 | 2 | Frontend | **Done** |
