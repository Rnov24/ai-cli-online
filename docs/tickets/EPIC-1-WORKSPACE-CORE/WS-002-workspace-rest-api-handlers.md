# Ticket: WS-002 — Workspace REST API Endpoints & Route Registration

- **Epic**: Epic 1 — Workspace Core & Persistence
- **Priority**: P0 (Blocker)
- **Status**: Ready for Development
- **Estimasi Effort**: 5 Story Points (SP)
- **Assignee / Role**: Backend Engineer (Go / HTTP API)
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [internal/routes/workspaces.go](../../../internal/routes/workspaces.go) | [internal/server/server.go](../../../internal/server/server.go)

---

## 1. User Story / Objective
> **Sebagai** API Developer,  
> **Saya ingin** mengimplementasikan sekumpulan endpoint RESTful HTTP untuk Workspace Management (`/api/workspaces`, `/api/sessions/{sessionId}/switch-workspace`, `/api/sessions/{sessionId}/workspace-mode`),  
> **Agar** antarmuka Web UI dan terminal client dapat mendaftarkan, memilih, berpindah, dan mengkueri mode workspace secara aman dan reaktif.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
internal/routes/
├── workspaces.go          # WorkspaceHandler struct & HTTP handler methods
└── workspaces_test.go     # Unit & integration tests for Workspace endpoints
```

### B. Spesifikasi Endpoint REST

1. **`GET /api/workspaces`**:
   - Header: `Authorization: Bearer <token>`
   - Response `200 OK`:
     ```json
     {
       "home": "C:\\Users\\Username",
       "activeWorkspaceId": "ws-1",
       "activePath": "d:\\Projects\\ai-cli-online",
       "isHome": false,
       "mode": "coding-agent",
       "workspaces": [
         { "id": "home", "name": "Home (~)", "path": "C:\\Users\\Username", "isHome": true, "createdAt": 1741160000000, "updatedAt": 1741160000000 },
         { "id": "ws-1", "name": "ai-cli-online", "path": "d:\\Projects\\ai-cli-online", "isHome": false, "createdAt": 1741160000000, "updatedAt": 1741160000000 }
       ]
     }
     ```

2. **`POST /api/workspaces`**:
   - Body JSON:
     ```json
     { "path": "d:\\Projects\\new-app", "name": "New App" }
     ```
   - Validasi: `path` harus ada di filesystem OS dan berupa direktori (`os.Stat` -> `fi.IsDir()`). Jika `name` kosong, ambil dari `filepath.Base(path)`.
   - Response `201 Created`: Object `Workspace`.

3. **`DELETE /api/workspaces/{id}`**:
   - Menghapus workspace dari registry SQLite. Return `400 Bad Request` jika mencoba menghapus record ID `"home"`.

4. **`POST /api/sessions/{sessionId}/switch-workspace`**:
   - Body JSON:
     ```json
     { "workspaceId": "ws-1", "path": "d:\\Projects\\ai-cli-online" }
     ```
   - Logic:
     - Dapatkan session name tmux.
     - Eksekusi pergantian direktori pada pane tmux (menggunakan `tmux send-keys` `cd "<path>" ENTER`).
     - Simpan active workspace ID ke pengaturan database (`settings` table: `key = "active_workspace"`).
     - Return status updated workspace info dan mode (`agentic-assistant` jika Home, `coding-agent` jika project).

5. **`GET /api/sessions/{sessionId}/workspace-mode`**:
   - Menginspeksi CWD aktif sesi tmux saat ini, mencocokkannya dengan Home directory, dan mengembalikan status mode instan:
     ```json
     {
       "cwd": "C:\\Users\\Username",
       "isHome": true,
       "mode": "agentic-assistant",
       "workspaceName": "Home (~)"
     }
     ```

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Registrasi direktori workspace baru yang valid
  Given Client terautentikasi mengirim POST /api/workspaces dengan path direktori yang ada di disk
  When Server memvalidasi path dengan os.Stat
  Then Server mengembalikan status 201 Created dengan metadata workspace
  And Workspace baru langsung muncul di GET /api/workspaces

Scenario: Penolakan registrasi path yang tidak valid atau file biasa
  Given Client mengirim POST /api/workspaces dengan path yang tidak ada
  When Server mencoba memvalidasi path
  Then Server mengembalikan status 400 Bad Request dengan pesan error "Directory does not exist"

Scenario: Perpindahan workspace pada sesi aktif
  Given Sesi terminal sedang berada di Home directory
  When Client memanggil POST /api/sessions/{sessionId}/switch-workspace mengarah ke workspace project
  Then Sesi tmux menerima perintah cd ke target path
  And Endpoint mengembalikan mode "coding-agent" dengan isHome = false
```

---

## 4. Verification Steps
1. Tulis integration test di `internal/routes/workspaces_test.go` menggunakan `httptest.NewServer`.
2. Jalankan test:
   ```bash
   go test -v ./internal/routes -run TestWorkspace
   ```
3. Uji via curl untuk endpoint GET, POST, dan switch-workspace.
