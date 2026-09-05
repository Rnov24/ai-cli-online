# Ticket: UI-003 — Contextual Persona Telemetry Badges (Assistant vs Coding)

- **Epic**: Epic 3 — UI Workspace Switcher & Persona Badges
- **Priority**: P1
- **Status**: Ready for Development
- **Estimasi Effort**: 3 Story Points (SP)
- **Assignee / Role**: Frontend Engineer (React / UI)
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [web/src/components/SystemHeader.tsx](../../../web/src/components/SystemHeader.tsx) | [web/src/components/AiChatView.tsx](../../../web/src/components/AiChatView.tsx)

---

## 1. User Story / Objective
> **Sebagai** Pengguna AGY Online,  
> **Saya ingin** visual badge yang tegas dan elegan pada SystemHeader dan header AI Chat View yang menunjukkan persona aktif (`🤖 AGENTIC ASSISTANT` vs `💻 CODING AGENT`),  
> **Agar** saya selalu memiliki visibilitas penuh mengenai mode operasi agen AI saat ini sebelum mengirimkan prompt.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
web/src/components/
├── SystemHeader.tsx       # Render persona badge in telemetry cluster
└── AiChatView.tsx         # Render persona status bar inside Chat View
```

### B. Styling & Desain Persona Badge
1. **Mode `agentic-assistant` (Home Directory)**:
   - Visual: Warna Cyan / Purple neon (`--accent-cyan`, `--accent-magenta`).
   - Teks: `🤖 AGENTIC ASSISTANT`.
   - Tooltip: *"Personal Assistant & System Orchestrator • Operating in Home Directory (~)"*.
2. **Mode `coding-agent` (Project Workspace)**:
   - Visual: Warna Emerald / Bright Amber (`--accent-green`, `--accent-amber`).
   - Teks: `💻 CODING AGENT`.
   - Tooltip: *"Autonomous Software Engineer & Pair Programmer • Operating in Project Workspace"*.
3. **Chat Header Integration**:
   - Di bagian atas `AiChatView`, tampilkan bar ringkas yang menginformasikan konteks aktif:
     - `Mode: AGENTIC ASSISTANT | Working in: ~`
     - Tombol cepat: `[Switch Workspace]` untuk memudahkan pergantian mode tanpa harus ke header atas.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Tampilan badge saat berada di Home Directory
  Given Sesi aktif berada di Home directory
  When SystemHeader dan Chat View dirender
  Then Badge berwarna Cyan menampilkan "🤖 AGENTIC ASSISTANT"

Scenario: Tampilan badge saat berada di Project Workspace
  Given Sesi aktif berada di direktori project workspace
  When SystemHeader dan Chat View dirender
  Then Badge berwarna Hijau menampilkan "💻 CODING AGENT"
```

---

## 4. Verification Steps
1. Buka Web UI dan perhatikan badge pada SystemHeader.
2. Ganti workspace antara Home dan Project, verifikasi badge berganti warna dan teks secara reaktif.
