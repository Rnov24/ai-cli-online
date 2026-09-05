# Ticket: CHAT-003 — Git Graph & Plan Panel Home Directory Graceful Guards

- **Epic**: Epic 4 — Agentic Chat & Tool Scoping
- **Priority**: P2
- **Status**: Ready for Development
- **Estimasi Effort**: 2 Story Points (SP)
- **Assignee / Role**: Frontend Engineer (React / UI)
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [web/src/components/GitGraphPanel.tsx](../../../web/src/components/GitGraphPanel.tsx) | [web/src/components/PlanPanel.tsx](../../../web/src/components/PlanPanel.tsx)

---

## 1. User Story / Objective
> **Sebagai** Pengguna AGY Online di Home Directory,  
> **Saya ingin** panel Git Graph dan Plan Panel menampilkan state placeholder yang informatif dan ramah ketika berada di Home directory (bukan error stack trace merah),  
> **Agar** antarmuka tetap bersih dan mengarahkan pengguna dengan jelas untuk membuka project workspace bila ingin menggunakan fitur Git atau Plan task.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
web/src/components/
├── GitGraphPanel.tsx      # Check isHome; render graceful empty state
└── PlanPanel.tsx          # Handle missing AiTasks directory gracefully in Home
```

### B. Spesifikasi UI Placeholder
1. **`GitGraphPanel.tsx`**:
   - Jika CWD terdeteksi sebagai Home directory atau backend mengembalikan error `not a git repository`:
     - Tampilkan kartu informasi:
       - Icon: `🏠` / `Git Branch Icon (Muted)`
       - Judul: *"Home Directory — Personal Space"*
       - Deskripsi: *"You are currently in your personal Home directory running in **Agentic Assistant** mode. Git version control is not initialized here."*
       - Call-to-action button: `[Switch to a Project Workspace]` yang memicu pembukaan modal/dropdown Workspace Selector.
2. **`PlanPanel.tsx`**:
   - Jika `AiTasks/` tidak ditemukan di Home directory:
     - Tampilkan deskripsi bahwa Plan Panel dirancang untuk modul task software development, dengan tombol cepat untuk berpindah ke project workspace yang memiliki modul `AiTasks/`.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Membuka Git History saat berada di Home Directory
  Given Sesi aktif berada di Home directory (bukan repositori git)
  When Pengguna membuka tab atau split pane Git History
  Then Panel tidak menampilkan error crash "fatal: not a git repository"
  And Panel menampilkan kartu panduan yang ramah dengan tombol beralih workspace

Scenario: Membuka Git History setelah beralih ke Project Workspace
  Given Sesi beralih ke project workspace "ai-cli-online"
  When Pengguna membuka Git History
  Then Git commit graph dan riwayat branch langsung dirender normal
```

---

## 4. Verification Steps
1. Di Home directory, klik icon Git Graph di activity rail / tab.
2. Pastikan muncul UI placeholder edukatif dengan tombol switch workspace.
3. Klik tombol switch workspace, pindah ke project, dan pastikan grafik git muncul kembali.
