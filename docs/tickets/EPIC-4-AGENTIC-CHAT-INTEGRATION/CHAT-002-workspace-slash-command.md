# Ticket: CHAT-002 — `/workspace` Slash Command Execution & Navigation Handler

- **Epic**: Epic 4 — Agentic Chat & Tool Scoping
- **Priority**: P1
- **Status**: Ready for Development
- **Estimasi Effort**: 3 Story Points (SP)
- **Assignee / Role**: Full-Stack Engineer
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [web/src/components/AiChatView.tsx](../../../web/src/components/AiChatView.tsx) | [internal/routes/workspaces.go](../../../internal/routes/workspaces.go)

---

## 1. User Story / Objective
> **Sebagai** Keyboard-first Power User,  
> **Saya ingin** menjalankan perintah `/workspace` (misal: `/workspace`, `/workspace list`, `/workspace <nama|path>`) langsung dari prompt input,  
> **Agar** saya dapat menginspeksi daftar project atau langsung berpindah ke workspace lain tanpa harus mengangkat tangan ke mouse untuk mengklik dropdown.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
web/src/components/
└── AiChatView.tsx         # Intercept /workspace slash command before backend dispatch
```

### B. Spesifikasi Sintaks Command
1. **`/workspace` atau `/workspace list`**:
   - Menampilkan card pesan sistem di dalam timeline chat:
     - Daftar workspace terdaftar beserta path dan status active.
     - Contoh:
       - `[Active] 🏠 Home (~): C:\Users\Username (Agentic Assistant)`
       - `📁 ai-cli-online: D:\Projects\ai-cli-online (Coding Agent)`
     - Tautan 1-klik untuk beralih ke workspace tersebut.
2. **`/workspace <name|path>`**:
   - Jika argumen cocok dengan salah satu nama atau ID workspace terdaftar:
     - Jalankan `switchSessionWorkspace`.
     - Cetak pesan konfirmasi: `Switched workspace to <name> (<path>). Agent mode is now: <mode>.`
   - Jika argumen berupa path baru:
     - Panggil `createWorkspace` kemudian `switchSessionWorkspace`.
3. **`/workspace home`**:
   - Pintasan langsung untuk kembali ke Home directory (`~`).

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Menampilkan daftar workspace via slash command
  Given Pengguna berada di Chat View
  When Pengguna mengetik "/workspace" dan menekan Enter
  Then Sistem langsung menampilkan daftar seluruh workspace terdaftar di timeline chat tanpa mengirim prompt ke agy

Scenario: Berpindah workspace via slash command
  Given Workspace "ai-cli-online" terdaftar di sistem
  When Pengguna mengetik "/workspace ai-cli-online" dan menekan Enter
  Then Sistem memindahkan CWD sesi ke direktori "ai-cli-online"
  And Pesan konfirmasi perpindahan workspace muncul di chat
```

---

## 4. Verification Steps
1. Ketik `/workspace` di input chat, pastikan daftar muncul rapi.
2. Ketik `/workspace home`, pastikan berpindah ke Home dan persona berganti ke Agentic Assistant.
