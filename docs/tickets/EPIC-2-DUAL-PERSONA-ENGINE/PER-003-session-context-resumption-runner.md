# Ticket: PER-003 — agy Headless Runner Context Propagation & Session Re-attachment

- **Epic**: Epic 2 — Dual-Persona Agent Engine
- **Priority**: P0 (Blocker)
- **Status**: Ready for Development
- **Estimasi Effort**: 3 Story Points (SP)
- **Assignee / Role**: AI Engine Engineer
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [internal/agy/runner.go](../../../internal/agy/runner.go) | [internal/routes/chat.go](../../../internal/routes/chat.go)

---

## 1. User Story / Objective
> **Sebagai** AI Developer,  
> **Saya ingin** runner `agy` mengoperasikan `--conversation <conversation_id>` dan working directory secara konsisten saat melanjutkan sesi sebelumnya,  
> **Agar** memori agen, tool state, dan context window terpelihara secara utuh ketika berpindah atau melanjutkan conversation tanpa overhead render transkrip JSONL.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
internal/agy/
└── runner.go              # Verification & refinement of argument construction & event routing
internal/routes/
└── chat.go                # Proper propagation of CWD & conversationId in HandleChatStream
```

### B. Mekanisme Eksekusi
1. **Pemeriksaan Argumen**:
   - Jika `conversationId` disediakan:
     ```go
     args = append(args, "--conversation", conversationId)
     ```
   - Jika kosong:
     ```go
     args = append(args, "-c")
     ```
2. **Direktori Kerja (`cmd.Dir`)**:
   - Pastikan `cmd.Dir` di-set ke `workingDir` yang valid.
   - Jika `workingDir` kosong atau tidak ada di filesystem, fallback ke `DefaultWorkingDir` atau Home directory.
3. **Capture Conversation ID dari Event Output**:
   - Engine `agy` mengeluarkan event `init` atau property `conversation_id` pada root event JSON.
   - Runner Go menangkap nilai ini dan memancarkannya kembali ke client SSE/WebSocket sehingga frontend dapat meng-update pointer `conversationId` sesi aktif.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Melanjutkan sesi conversation yang sudah ada
  Given Pengguna memiliki conversationId "c02165c2-85ac-48cc-ad17-bb4950aa52e8"
  When Request chat dikirimkan dengan conversationId tersebut
  Then Runner Go menyertakan flag --conversation c02165c2-...
  And agy mengeksekusi prompt dengan mengakses konteks memori sesi lama

Scenario: Inisialisasi sesi conversation baru
  Given Request chat dikirimkan tanpa conversationId
  When agy mulai mengeksekusi prompt
  Then agy menghasilkan conversation_id baru
  And Runner memancarkan event dengan conversation_id baru ke Web UI
```

---

## 4. Verification Steps
1. Jalankan streaming chat test:
   ```bash
   go test -v ./internal/routes -run TestChat
   ```
2. Verifikasi log output child process `agy` menerima argumen `--conversation` dengan tepat.
