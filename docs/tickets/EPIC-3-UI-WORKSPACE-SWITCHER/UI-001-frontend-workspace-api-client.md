# Ticket: UI-001 — Frontend Workspace API Client, Interfaces & State

- **Epic**: Epic 3 — UI Workspace Switcher & Persona Badges
- **Priority**: P0 (Blocker)
- **Status**: Ready for Development
- **Estimasi Effort**: 3 Story Points (SP)
- **Assignee / Role**: Frontend Engineer (TypeScript / React)
- **Dokumen Terkait**: [docs/PRD.md](../../PRD.md) | [web/src/api/workspaces.ts](../../../web/src/api/workspaces.ts)

---

## 1. User Story / Objective
> **Sebagai** Frontend Developer,  
> **Saya ingin** modul TypeScript API client yang menangani interaksi dengan endpoint `/api/workspaces` dan tipe-tipe data Workspace secara terstruktur,  
> **Agar** seluruh komponen React di frontend dapat membaca, membuat, menghapus, dan berpindah workspace dengan type-safety penuh.

---

## 2. Technical Scope & Implementation Details

### A. Target File Structure
```text
web/src/
├── api/
│   └── workspaces.ts      # Workspace TypeScript models & API methods
```

### B. Interface TypeScript (`web/src/api/workspaces.ts`)
```typescript
export interface Workspace {
  id: string;
  name: string;
  path: string;
  isHome: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspacesPayload {
  home: string;
  activeWorkspaceId: string;
  activePath: string;
  isHome: boolean;
  mode: 'agentic-assistant' | 'coding-agent';
  workspaces: Workspace[];
}

export interface WorkspaceModePayload {
  cwd: string;
  isHome: boolean;
  mode: 'agentic-assistant' | 'coding-agent';
  workspaceName: string;
}
```

### C. Method API Client
- `fetchWorkspaces(token: string): Promise<WorkspacesPayload>`: Mengambil seluruh daftar workspace dan status aktif.
- `createWorkspace(token: string, path: string, name?: string): Promise<Workspace>`: Mendaftarkan project baru.
- `deleteWorkspace(token: string, id: string): Promise<{ ok: boolean }>`: Menghapus project.
- `switchSessionWorkspace(token: string, sessionId: string, workspaceId: string, path: string): Promise<WorkspaceModePayload>`: Memindahkan sesi ke workspace target.
- `fetchWorkspaceMode(token: string, sessionId: string): Promise<WorkspaceModePayload>`: Mengecek mode sesi saat ini.

---

## 3. Acceptance Criteria (Gherkin Scenarios)

```gherkin
Scenario: Pengambilan daftar workspace dengan token valid
  Given Token autentikasi valid tersedia
  When fetchWorkspaces(token) dipanggil
  Then Mengembalikan objek WorkspacesPayload berisi daftar workspace dan status mode

Scenario: Registrasi workspace baru melalui API client
  Given Pengguna memasukkan path direktori valid
  When createWorkspace(token, path, name) dipanggil
  Then Response mengembalikan objek Workspace yang baru dibuat dengan properti id dan path
```

---

## 4. Verification Steps
1. Uji fungsi API client dengan vitest mock:
   ```bash
   npm test -- web/src/api/workspaces.test.ts
   ```
2. Pastikan TypeScript compiler tidak mengeluarkan error (`npx tsc --noEmit`).
