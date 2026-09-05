# Ticket: WS-001 — SQLite Workspaces Table Schema & DB CRUD Methods

- **Epic**: Epic 1 — Workspace Core & Persistence
- **Priority**: P0 (Blocker)
- **Status**: Ready for Development
- **Estimasi Effort**: 3 Story Points (SP)
- **Assignee / Role**: Backend Engineer (Go / SQLite)
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [internal/db/db.go](../../../internal/db/db.go)

---

## 1. User Story / Objective
> **Sebagai** Backend Engineer,  
> **Saya ingin** menambahkan tabel `workspaces` pada basis data SQLite murni (zero CGO) beserta metode CRUD berkinerja tinggi,  
> **Agar** sistem dapat menyimpan, memperbarui, mengkueri, dan menghapus registrasi workspace project serta status Home directory pengguna secara persisten tanpa dependensi eksternal.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
internal/db/
├── db.go                  # Add Workspace struct, workspaces table schema, & CRUD queries
└── db_test.go             # Add unit tests for Workspace CRUD
```

### B. Spesifikasi Skema SQLite & Indeks
Tambahkan skema DDL ke dalam fungsi `db.Open(dataDir string)`:
```sql
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    is_home INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_updated_at ON workspaces(updated_at);
CREATE INDEX IF NOT EXISTS idx_workspaces_is_home ON workspaces(is_home);
```

### C. Spesifikasi Model & Method Go (`internal/db/db.go`)
1. **Model `Workspace`**:
   ```go
   type Workspace struct {
       Id        string `json:"id"`
       Name      string `json:"name"`
       Path      string `json:"path"`
       IsHome    bool   `json:"isHome"`
       CreatedAt int64  `json:"createdAt"`
       UpdatedAt int64  `json:"updatedAt"`
   }
   ```
2. **Method DB**:
   - `ListWorkspaces() ([]Workspace, error)`: Mengurutkan `is_home DESC, updated_at DESC`.
   - `AddWorkspace(id, name, path string, isHome bool) (*Workspace, error)`: Menggunakan `ON CONFLICT(path) DO UPDATE`.
   - `DeleteWorkspace(id string) error`: Menghapus baris berdasarkan `id` dan memblokir penghapusan jika `is_home = 1`.
   - `GetWorkspaceByPath(path string) (*Workspace, error)`: Pencarian exact match path (normalisasi case-insensitive untuk Windows jika diperlukan).
   - `GetWorkspaceById(id string) (*Workspace, error)`.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Inisialisasi skema tabel workspaces dan penambahan record baru
  Given Server membuka database SQLite di memory atau dataDir sementara
  When Metode AddWorkspace dipanggil dengan id "ws-test", name "Test Project", path "/tmp/project", isHome false
  Then Record berhasil disimpan ke dalam tabel workspaces
  And Pemanggilan ListWorkspaces mengembalikan list berisi workspace "Test Project"

Scenario: Pencegahan penghapusan Home directory
  Given Record Home directory tersimpan di tabel workspaces dengan is_home = 1
  When Metode DeleteWorkspace dipanggil untuk ID record Home tersebut
  Then Record Home tidak terhapus dari tabel
  And Query ListWorkspaces tetap mengembalikan record Home
```

---

## 4. Verification Steps
1. Tulis unit test di `internal/db/db_test.go` yang menguji operasi `AddWorkspace`, `ListWorkspaces`, `GetWorkspaceByPath`, dan proteksi `DeleteWorkspace`.
2. Jalankan test:
   ```bash
   go test -v ./internal/db/...
   ```
3. Verifikasi benchmark WAL checkpoint tetap berjalan tanpa deadlock.
