# Ticket: CHAT-001 — Mode-Adaptive Slash Command Autocomplete & Palette

- **Epic**: Epic 4 — Agentic Chat & Tool Scoping
- **Priority**: P1
- **Status**: Ready for Development
- **Estimasi Effort**: 5 Story Points (SP)
- **Assignee / Role**: Full-Stack Engineer
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [web/src/components/AiChatView.tsx](../../../web/src/components/AiChatView.tsx)

---

## 1. User Story / Objective
> **Sebagai** Pengguna AI Chat,  
> **Saya ingin** popup autocomplete slash command (`/`) menyesuaikan daftar perintah yang diprioritaskan berdasarkan mode aktif (`Agentic Assistant` vs `Coding Agent`),  
> **Agar** perintah yang relevan dengan konteks saat ini langsung berada di urutan teratas tanpa membingungkan pengguna dengan command coding saat berada di Home directory.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
web/src/components/
└── AiChatView.tsx         # Update SLASH_COMMANDS list & adaptive filtering logic
```

### B. Segmentasi Perintah Slash Berdasarkan Mode
1. **Perintah Prioritas Mode Home (`Agentic Assistant`)**:
   - `/goal`: Autonomous long-running execution for general goals.
   - `/schedule`: Set a timer or recurring cron schedule.
   - `/learn`: Save behavioral learning or user preferences.
   - `/doctor`: Run system diagnostics and health check.
   - `/browser`: Web search and browser research.
   - `/workspace`: List, inspect, or switch project workspaces.
   - `/model`: Select model for current session.
   - `/mcp`: MCP server management.
   - `/clear`: Clear conversation history.
2. **Perintah Prioritas Mode Project (`Coding Agent`)**:
   - `/plan`: Step-by-step implementation planning.
   - `/verify`: Run domain-adapted tests.
   - `/exec`: Execute implementation plan.
   - `/review`: Review code changes and diffs.
   - `/check`: Check feasibility.
   - `/merge`: Merge task branch.
   - `/auto`: Autonomous full lifecycle loop (`ai-cli-task`).
   - `/workspace`: Switch or list workspaces.
   - Plus seluruh 13 task lifecycle skills.

### C. Logika Filtering Autocomplete
Saat pengguna mengetik karakter `/`:
- Evaluasi `isHome`:
  - Jika `isHome === true`: Tampilkan kelompok command **Assistant & Productivity** di bagian teratas dengan tag `[Assistant]`.
  - Jika `isHome === false`: Tampilkan kelompok command **Coding & Task Lifecycle** di bagian teratas dengan tag `[Coding]`.
- Pengguna tetap dapat mengakses semua perintah dengan mengetik nama perintahnya (fuzzy filtering).

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Membuka autocomplete slash command di Home directory
  Given Sesi berada di Home directory
  When Pengguna mengetik "/" pada input chat
  Then Daftar perintah memprioritaskan /schedule, /doctor, /browser, /learn, dan /workspace di baris atas
  And Perintah /merge atau /exec tidak mendominasi rekomendasi utama

Scenario: Membuka autocomplete slash command di Project Workspace
  Given Sesi berada di Project Workspace
  When Pengguna mengetik "/" pada input chat
  Then Daftar perintah memprioritaskan /plan, /verify, /exec, /review, dan /auto
```

---

## 4. Verification Steps
1. Buka Chat View saat sesi di Home, ketik `/` dan periksa urutan rekomendasi.
2. Pindah ke workspace project, ketik `/` dan periksa urutan rekomendasi coding.
