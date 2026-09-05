# Ticket: PER-001 — Home Directory Scoping & Runtime Mode Resolver

- **Epic**: Epic 2 — Dual-Persona Agent Engine
- **Priority**: P0 (Blocker)
- **Status**: Ready for Development
- **Estimasi Effort**: 3 Story Points (SP)
- **Assignee / Role**: Backend / Core Engineer
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [internal/agy/runner.go](../../../internal/agy/runner.go) | [internal/tmux/tmux.go](../../../internal/tmux/tmux.go)

---

## 1. User Story / Objective
> **Sebagai** Core Engine Developer,  
> **Saya ingin** fungsi utilitas deterministik untuk mengevaluasi apakah sebuah path direktori kerja (CWD) merupakan Home Directory pengguna atau Project Workspace,  
> **Agar** server, runner `agy`, dan WebSocket handler dapat secara akurat menentukan persona agent (`agentic-assistant` vs `coding-agent`) secara lintas-platform (Linux, macOS, Android Termux, dan Windows).

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
internal/agy/
├── persona.go             # Helper IsHomeDirectory, ResolveAgentMode, & Constants
└── persona_test.go        # Unit tests verifying path normalization & mode resolution
```

### B. Spesifikasi Logika Penentuan Mode (`internal/agy/persona.go`)
1. **Konstanta Mode**:
   ```go
   type AgentMode string

   const (
       ModeAgenticAssistant AgentMode = "agentic-assistant"
       ModeCodingAgent      AgentMode = "coding-agent"
   )
   ```
2. **Fungsi `IsHomeDirectory(targetPath string) bool`**:
   - Ambil `home, err := os.UserHomeDir()`.
   - Normalisasi kedua path: `filepath.Clean(targetPath)` dan `filepath.Clean(home)`.
   - Lakukan perbandingan:
     - Di Windows: Gunakan `strings.EqualFold` karena Windows filesystem bersifat case-insensitive (`C:\Users\User` == `c:\users\user`).
     - Di Unix / Termux: Gunakan `cleanTarget == cleanHome`.
   - Tangani symlink bila ada menggunakan `filepath.EvalSymlinks`.
3. **Fungsi `ResolveAgentMode(targetPath string) AgentMode`**:
   - Jika `IsHomeDirectory(targetPath)` -> Return `ModeAgenticAssistant`.
   - Jika bukan -> Return `ModeCodingAgent`.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Deteksi path yang identik dengan Home Directory
  Given Path target adalah direktori home pengguna (misal: "C:\Users\Username" atau "/home/user")
  When Fungsi IsHomeDirectory dipanggil
  Then Mengembalikan nilai true
  And ResolveAgentMode mengembalikan "agentic-assistant"

Scenario: Deteksi path sub-folder project di dalam home atau drive terpisah
  Given Path target adalah "D:\Projects\ai-cli-online" atau "/home/user/my-project"
  When Fungsi IsHomeDirectory dipanggil
  Then Mengembalikan nilai false
  And ResolveAgentMode mengembalikan "coding-agent"

Scenario: Penanganan variasi trailing slash dan kapitalisasi path
  Given Path target memiliki trailing slash atau huruf kecil pada Windows
  When Fungsi IsHomeDirectory dipanggil setelah normalisasi
  Then Hasil evaluasi tetap akurat sesuai direktori fisik OS
```

---

## 4. Verification Steps
1. Buat unit test di `internal/agy/persona_test.go` yang menguji berbagai skenario path (Home exact, sub-folder, casing Windows, path kosong).
2. Jalankan test:
   ```bash
   go test -v ./internal/agy -run TestPersona
   ```
