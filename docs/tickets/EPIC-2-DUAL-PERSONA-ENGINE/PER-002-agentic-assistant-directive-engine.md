# Ticket: PER-002 — Contextual Agentic Assistant Directive Prompt Injector

- **Epic**: Epic 2 — Dual-Persona Agent Engine
- **Priority**: P0 (Blocker)
- **Status**: Ready for Development
- **Estimasi Effort**: 5 Story Points (SP)
- **Assignee / Role**: AI Engine Engineer
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [internal/agy/runner.go](../../../internal/agy/runner.go) | [internal/agy/persona.go](../../../internal/agy/persona.go)

---

## 1. User Story / Objective
> **Sebagai** Pengguna AI Antigravity,  
> **Saya ingin** engine `agy` secara otomatis mengadopsi persona **Agentic Assistant** ketika prompt dijalankan di Home directory (`~`) dan persona **Coding Agent** ketika di Project Workspace,  
> **Agar** asisten AI di Home bertindak sebagai asisten pribadi serba bisa (manajemen sistem, riset, jadwal, catatan) tanpa menganggap Home sebagai repositori git/coding, sementara di project bertindak sebagai pair programmer andal.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
internal/agy/
├── persona.go             # Add BuildPromptWithPersona & Directives
└── runner.go              # Integrate persona builder into RunPromptStream
```

### B. Spesifikasi Template Directive

1. **Home Directive (`Agentic Assistant`)**:
   ```text
   [System Directive: Environment=Home Directory (~). Persona=Agentic Assistant]
   You are operating as an autonomous Agentic Personal Assistant and System Orchestrator.
   - Your primary focus: personal productivity, task planning, cron/timer scheduling (/schedule), learning user preferences (/learn), system health diagnostics (/doctor), web research (/browser), file organization, and workspace management.
   - CRITICAL SCOPE RULE: The current working directory is the user's personal home root (~), NOT a git software repository or coding project.
   - Do NOT assume git version control exists.
   - Do NOT run git commands, test suites, or package build tools on this directory unless explicitly instructed by the user.
   - If the user wishes to develop software, create codebases, or run task loops, proactively assist them in switching to or creating a dedicated project workspace using /workspace.
   ```

2. **Project Workspace Directive (`Coding Agent`)**:
   ```text
   [System Directive: Environment=Project Workspace. Persona=Coding Agent]
   You are operating as an Autonomous AI Coding Agent & Pair Programmer.
   - Your primary focus: software engineering, codebase comprehension, git version control, implementation planning (/plan, /grill-me), code refactoring, testing (/verify), and task lifecycle execution (ai-cli-task: /auto, /exec, /check, /merge).
   - Read and respect project-level rules (AGENTS.md, GEMINI.md) and task state in AiTasks/.
   ```

### C. Mekanisme Injeksi Prompt
Di dalam fungsi `agy.RunPromptStream()`:
```go
func RunPromptStream(...) {
    ...
    // Inject contextual directive based on working directory
    resolvedPrompt := BuildPromptWithPersona(workingDir, prompt, conversationId)
    args := []string{
        "-p", resolvedPrompt,
        "--output-format", "stream-json",
        "--dangerously-skip-permissions",
    }
    ...
}
```
- Jika `conversationId == ""` (sesi baru): Directive diinjeksikan secara lengkap untuk membentuk persona dasar conversation.
- Jika `conversationId != ""` (sesi lanjutan): Directive diinjeksikan dalam format compact reminder header satu baris:
  `[Context Reminder: Mode=Agentic Assistant | Location=Home (~)]\n\n` + `prompt`.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Eksekusi prompt pengguna di Home directory
  Given Sesi aktif berada pada direktori home pengguna ("~")
  When Pengguna mengirimkan prompt "bantu bersihkan file log lama"
  Then Engine menginjeksikan Home Directive (Agentic Assistant) ke agy
  And Respons model berfokus pada manajemen file OS tanpa mencari repo git atau modul npm

Scenario: Eksekusi prompt pengguna di Project Workspace
  Given Sesi aktif berada pada direktori "d:/Projects/ai-cli-online"
  When Pengguna mengirimkan prompt "perbaiki bug pada router"
  Then Engine menginjeksikan Workspace Directive (Coding Agent) ke agy
  And Model langsung membaca konteks codebase dan menyarankan plan/perubahan kode
```

---

## 4. Verification Steps
1. Buat unit test di `internal/agy/persona_test.go` untuk memverifikasi output `BuildPromptWithPersona`.
2. Jalankan simulasi `RunPromptStream` dengan mock output untuk memastikan directive terangkai dengan benar.
