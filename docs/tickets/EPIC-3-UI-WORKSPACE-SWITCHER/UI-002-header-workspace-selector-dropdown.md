# Ticket: UI-002 — Header WorkspaceSelector Dropdown & Management Modal

- **Epic**: Epic 3 — UI Workspace Switcher & Persona Badges
- **Priority**: P0 (Blocker)
- **Status**: Ready for Development
- **Estimasi Effort**: 5 Story Points (SP)
- **Assignee / Role**: Frontend Engineer (React / UI)
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [web/src/components/WorkspaceSelector.tsx](../../../web/src/components/WorkspaceSelector.tsx) | [web/src/components/SystemHeader.tsx](../../../web/src/components/SystemHeader.tsx)

---

## 1. User Story / Objective
> **Sebagai** Pengguna AGY Online,  
> **Saya ingin** komponen dropdown Workspace Selector di SystemHeader yang menampilkan workspace aktif dan memungkinkan perpindahan 1-klik antara Home (`~`) dan project-project terdaftar,  
> **Agar** saya dapat mengelola multi-project dan beralih konteks tanpa perlu mengetik manual perintah cd di shell.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
web/src/components/
├── WorkspaceSelector.tsx  # Interactive dropdown, list, add modal, & quick-switch
└── SystemHeader.tsx       # Integrate WorkspaceSelector into header bar
```

### B. Komponen `WorkspaceSelector`
1. **Trigger Button**:
   - Menampilkan icon status: `🏠 Home (~)` atau `📁 <Workspace Name>`.
   - Menampilkan indikator chevron (`▼`) yang memicu pembukaan popover.
   - Responsif pada layar mobile (menyesuaikan teks agar tidak memotong elemen header lain).
2. **Popover / Dropdown Menu**:
   - **Section 1: Personal Space**:
     - 🏠 **Home Directory** (`~`)
     - Sub-keterangan: *"Agentic Assistant Mode • Personal productivity & system management"*
     - Badge active jika sedang di Home.
   - **Section 2: Project Workspaces**:
     - Daftar workspace project yang tersimpan di SQLite.
     - Setiap item menampilkan nama project, path relatif/lengkap, tombol switch, dan tombol hapus (`🗑️`).
   - **Section 3: Actions**:
     - Tombol `➕ Add Workspace...` yang membuka input form inline atau modal untuk memasukkan path folder lokal.
3. **Event Handler**:
   - Saat pengguna mengklik salah satu workspace:
     - Panggil `switchSessionWorkspace(token, sessionId, ws.id, ws.path)`.
     - Update local CWD state.
     - Trigger reload pada File Tree dan Git Graph.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Membuka dropdown Workspace Selector
  Given Header menampilkan WorkspaceSelector
  When Pengguna mengklik tombol trigger
  Then Popover dropdown terbuka menampilkan Home directory dan daftar project

Scenario: Berpindah ke Home Directory
  Given Sesi saat ini berada di project "ai-cli-online"
  When Pengguna memilih item Home directory di dropdown
  Then Session CWD berganti ke Home directory pengguna
  And Header otomatis memperbarui lencana menjadi "Agentic Assistant"

Scenario: Menambahkan workspace baru dari UI
  Given Dropdown sedang terbuka
  When Pengguna memasukkan path "d:/Projects/my-new-app" dan mengklik Tambah
  Then Workspace baru terdaftar di database dan langsung muncul di list dropdown
```

---

## 4. Verification Steps
1. Buka antarmuka web AGY Online di browser.
2. Klik dropdown Workspace Selector di SystemHeader.
3. Verifikasi perpindahan antara Home dan project berjalan mulus dan memperbarui CWD seketika.
