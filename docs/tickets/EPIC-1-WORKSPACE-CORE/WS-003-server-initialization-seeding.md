# Ticket: WS-003 — Server Startup Workspace Auto-Seeding & Home Binding

- **Epic**: Epic 1 — Workspace Core & Persistence
- **Priority**: P1
- **Status**: Ready for Development
- **Estimasi Effort**: 2 Story Points (SP)
- **Assignee / Role**: Backend Engineer (Go / Lifecycle)
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [internal/server/server.go](../../../internal/server/server.go) | [internal/config/config.go](../../../internal/config/config.go)

---

## 1. User Story / Objective
> **Sebagai** Pengembang Sistem,  
> **Saya ingin** server Go secara otomatis melakukan auto-seeding terhadap Home directory pengguna (`~`) dan direktori default saat ini (`DefaultWorkingDir`) ke dalam tabel `workspaces` saat pertama kali dinyalakan,  
> **Agar** pengguna yang baru pertama kali menjalankan AGY Online langsung memiliki workspace default tanpa perlu konfigurasi manual.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
internal/server/
└── server.go              # Tambahkan fungsi SeedDefaultWorkspaces saat server.Start()
```

### B. Spesifikasi Logika Auto-Seeding
Di dalam method `server.Start()` (atau sebelum listen socket):
1. **Dapatkan Home Directory**:
   ```go
   home, err := os.UserHomeDir()
   if err == nil && home != "" {
       home = filepath.Clean(home)
       _, _ = s.db.AddWorkspace("home", "Home (~)", home, true)
   }
   ```
2. **Dapatkan Default Working Directory**:
   ```go
   defaultCwd := s.cfg.DefaultWorkingDir
   if defaultCwd != "" {
       cleanDefault := filepath.Clean(defaultCwd)
       if !strings.EqualFold(cleanDefault, home) {
           name := filepath.Base(cleanDefault)
           if name == "." || name == "/" || name == "\\" {
               name = "Default Project"
           }
           id := "ws-" + strconv.FormatInt(time.Now().Unix(), 36)
           _, _ = s.db.AddWorkspace(id, name, cleanDefault, false)
       }
   }
   ```
3. **Pengecekan Idempoten**:
   Operasi ini menggunakan query `ON CONFLICT(path) DO UPDATE` pada `AddWorkspace`, sehingga aman dieksekusi berulang kali setiap server restart tanpa menduplikasi data.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Cold boot pertama kali server dengan database kosong
  Given Database baru dibuat tanpa data workspace
  When Server memanggil Start()
  Then Tabel workspaces otomatis terisi record Home directory dengan is_home = 1
  And Jika working directory saat ini berbeda dengan Home, record project workspace tersebut juga otomatis terdaftar

Scenario: Server restart dengan database yang sudah ada
  Given Database sudah memiliki daftar workspace kustom
  When Server dinyalakan kembali
  Then Tidak ada data workspace kustom yang hilang atau terduplikasi
```

---

## 4. Verification Steps
1. Hapus sementara `~/.ai-cli-online/data/ai-cli-online.db` (atau gunakan direktori test).
2. Jalankan binary server:
   ```bash
   ./bin/ai-cli-online start
   ```
3. Kueri `GET /api/workspaces` dan pastikan minimal ada 2 entitas (Home dan workspace project aktif).
