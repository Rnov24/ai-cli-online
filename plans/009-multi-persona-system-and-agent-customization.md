# Plan 009: Multi-Persona System and Dynamic Agent Customization

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5ef39c5..HEAD -- internal/persona/ internal/routes/ web/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `5ef39c5`, 2026-09-06

## Why this matters

AGY Online currently enforces a rigid binary persona: Personal Home (`agentic-assistant`) vs Project Workspace (`coding-agent`), hardcoded in `internal/persona/persona.go` based strictly on whether the directory path is `~`. Developers cannot switch to specialized role personas for different phases of software development, such as **System Architect** (focusing on system structure, design trade-offs, and ADRs), **Security Auditor** (focusing on threat boundaries, input validation, and credential hygiene), **Pair Programmer** (focusing on test-driven development and surgical refactoring), or **DevOps/SRE** (focusing on deployment, containerization, and service telemetry). Furthermore, `/agents` is advertised in the chat slash command dropdown and shortcuts reference, but has no implementation, and `internal/agy/runner.go` never passes custom directives or `--agent` profile flags to Antigravity CLI executions. Implementing a multi-persona registry with SQLite persistence and an interactive selector modal allows developers to dynamically adapt Antigravity's mindset and instructions to the task at hand.

## Current state

1. **`internal/persona/persona.go` (Lines 10–30, 60–84)**:
   - Hardcoded binary modes and string constants:
   ```go
   const (
       ModeAgenticAssistant AgentMode = "agentic-assistant"
       ModeCodingAgent      AgentMode = "coding-agent"
   )
   const HomeAssistantDirective = `...`
   const ProjectCodingDirective = `...`

   func ResolveAgentMode(workingDir string) AgentMode {
       if IsHomeDirectory(workingDir) {
           return ModeAgenticAssistant
       }
       return ModeCodingAgent
   }
   ```
2. **`internal/agy/runner.go` (Lines 109–125)**:
   - Directives are resolved strictly by directory, with no agent profile or persona overrides:
   ```go
   resolvedPrompt := persona.BuildPromptWithPersona(workingDir, prompt, conversationId)
   args := []string{
       "-p", resolvedPrompt,
       "--output-format", "stream-json",
       "--dangerously-skip-permissions",
   }
   ```
3. **`web/src/components/AiChatView.tsx` (Lines 95, 1270–1285)**:
   - Line 95 advertises: `{ cmd: '/agents', desc: 'List and switch available agents & personas', category: 'assistant' }`.
   - Lines 640–750 contain zero logic handling `/agents`.
   - Header badge (lines 1275–1285) renders static icon with passive tooltip and no click handler to select or customize personas.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Build     | `npm run build`          | exit 0, bundle built|
| Typecheck | `npx tsc --noEmit -p web/tsconfig.json` | exit 0, no errors|
| Tests     | `npm test`               | all tests pass      |
| Go Tests  | `go test ./internal/persona ./internal/routes -v` | PASS |

## Scope

**In scope**:
- `internal/persona/persona.go` (Extend with multi-persona registry, preset roles, and directive compilation)
- `internal/persona/persona_test.go` (Update and add unit tests)
- `internal/routes/personas.go` (Create Go handler for listing, creating, and selecting personas)
- `internal/routes/personas_test.go` (Create unit tests)
- `internal/server/server.go` (Register `/api/personas`, `/api/personas/{id}`, `/api/sessions/{sessionId}/persona`)
- `internal/agy/runner.go` (Support persona directive overrides and `--agent` parameter)
- `web/src/api/personas.ts` (Create frontend API client)
- `web/src/components/PersonaSelectorModal.tsx` (Create interactive persona switcher and creator modal)
- `web/src/components/PersonaSelectorModal.test.tsx` (Create Vitest suite for PersonaSelectorModal)
- `web/src/components/AiChatView.tsx` (Wire `/agents` command, clickable header badge, and persona state)
- `web/src/components/CommandPalette.tsx` (Add `/agents` launcher)

**Out of scope**:
- Do not modify global `~/.gemini/antigravity-cli/settings.json` without user action.
- Do not alter terminal PTY or tmux sockets.

## Git workflow

- Branch: `advisor/009-multi-persona-and-agent-customization`
- Commit per logical step; message style: `feat(persona): <description>`
- Do NOT push or merge unless instructed.

## Steps

### Step 1: Extend Multi-Persona Registry in `internal/persona/persona.go`

1. In `internal/persona/persona.go`:
   - Define data models:
     ```go
     type PersonaDefinition struct {
         Id          string   `json:"id"`          // "agentic-assistant", "coding-agent", "architect", "auditor", "pair-programmer", "sre"
         Name        string   `json:"name"`        // "System Architect"
         Role        string   `json:"role"`        // "Software Architecture & System Design"
         Icon        string   `json:"icon"`        // "compass" | "shield" | "code" | "laptop" | "robot" | "terminal"
         Color       string   `json:"color"`       // CSS accent variable or hex
         Description string   `json:"description"` // Short summary of persona focus
         Directive   string   `json:"directive"`   // Injected system prompt instructions
         IsPreset    bool     `json:"isPreset"`
         Tags        []string `json:"tags,omitempty"`
     }
     ```
   - Define built-in preset personas:
     1. **`agentic-assistant`**: Personal productivity, scheduling (`/schedule`), learning (`/learn`), system health (`/doctor`), web research (`/browser`).
     2. **`coding-agent`**: Software engineering, plan execution (`/plan`, `/auto`, `/exec`, `/verify`), git version control.
     3. **`architect`**: High-level system design, domain modeling, architecture decision records (ADRs), module decoupling, performance trade-offs.
     4. **`auditor`**: Security auditing, defensive coding, vulnerability inspection, OWASP mitigation, test coverage verification.
     5. **`pair-programmer`**: Interactive pair programming, TDD refactoring, step-by-step guidance, explanatory walkthroughs.
     6. **`sre`**: System reliability, deployment runbooks, logging, process supervision, performance profiling, shell automation.
   - Implement `ResolvePersona(personaId string, workingDir string) PersonaDefinition`:
     - If `personaId` is provided and exists, return it.
     - Fallback: if `IsHomeDirectory(workingDir)` return `agentic-assistant`, else `coding-agent`.
   - Implement `BuildPromptWithPersonaConfig(workingDir, prompt, conversationId string, persona PersonaDefinition) string`.
2. In `internal/persona/persona_test.go`:
   - Add tests verifying all preset personas compile valid directives.
   - Add tests verifying fallback logic when invalid persona ID is supplied.
3. **Verify**: `go test -v ./internal/persona` → PASS.

---

### Step 2: Implement Persona Routes in `internal/routes/personas.go`

1. Create `internal/routes/personas.go`:
   - Implement `PersonasHandler`:
     - `ListPersonas(w http.ResponseWriter, r *http.Request)`:
       - Returns all preset personas merged with any user custom personas stored in SQLite.
     - `GetPersona(w http.ResponseWriter, r *http.Request)`:
       - Returns single persona by `{id}`.
     - `CreateCustomPersona(w http.ResponseWriter, r *http.Request)`:
       - Validates ID (alphanumeric with hyphens), name, and directive.
       - Stores custom persona in SQLite (`settings` or `personas` table).
       - Returns 201 Created.
     - `SetSessionPersona(w http.ResponseWriter, r *http.Request)`:
       - Sets active persona ID for `{sessionId}` in store/settings.
2. In `internal/server/server.go`:
   - Initialize `personaH := routes.NewPersonasHandler(auth, s.db)`.
   - Register routes:
     - `mux.HandleFunc("GET /api/personas", personaH.ListPersonas)`
     - `mux.HandleFunc("GET /api/personas/{id}", personaH.GetPersona)`
     - `mux.HandleFunc("POST /api/personas", personaH.CreateCustomPersona)`
     - `mux.HandleFunc("POST /api/sessions/{sessionId}/persona", personaH.SetSessionPersona)`
3. In `internal/agy/runner.go` and `internal/routes/chat.go`:
   - Allow passing `personaId` in chat stream requests.
   - Resolve `PersonaDefinition` and pass into `BuildPromptWithPersonaConfig`.
4. **Verify**: `go test -v ./internal/routes -run TestPersonas` → PASS.

---

### Step 3: Implement Frontend API Client in `web/src/api/personas.ts`

1. Create `web/src/api/personas.ts`:
   - Define TypeScript interfaces:
     ```ts
     export interface PersonaDefinition {
       id: string;
       name: string;
       role: string;
       icon: string;
       color: string;
       description: string;
       directive: string;
       isPreset: boolean;
       tags?: string[];
     }

     export interface PersonasResponse {
       personas: PersonaDefinition[];
       activePersonaId?: string;
     }
     ```
   - Implement functions:
     - `fetchPersonas(token: string): Promise<PersonasResponse>`
     - `createCustomPersona(token: string, data: Partial<PersonaDefinition>): Promise<PersonaDefinition>`
     - `setSessionPersona(token: string, sessionId: string, personaId: string): Promise<{ ok: boolean }>`
2. **Verify**: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.

---

### Step 4: Build Interactive Persona Selector Modal in `web/src/components/PersonaSelectorModal.tsx`

1. Create `web/src/components/PersonaSelectorModal.tsx`:
   - Props: `isOpen: boolean`, `onClose: () => void`, `activePersonaId: string`, `onSelectPersona: (persona: PersonaDefinition) => void`, `token: string | null`.
   - Header:
     - Icon: `<RobotIcon size={16} />`
     - Title: `AGENT PERSONAS & OPERATIONAL ROLES`
     - Close button (`<CloseIcon />`)
   - Toolbar:
     - Filter tabs: `ALL`, `CODING`, `ASSISTANT`, `CUSTOM`.
     - Search input for persona name, role, and tags.
     - `+ Custom Persona` button.
   - Persona Cards Grid:
     - Each card displays:
       - Persona icon + colored badge.
       - Title (`name`), Role subtitle (`role`).
       - Description and primary capabilities tags.
       - Directive preview toggle (shows injected prompt guidelines).
       - Active indicator (`[ACTIVE]`).
       - `[ACTIVATE PERSONA]` button.
   - Custom Persona Creation Form:
     - Name input, role input, directive textarea, icon & color picker.
     - Submits to `createCustomPersona`.
2. **Verify**: `npm run build --workspace=web` → exit 0.

---

### Step 5: Wire `/agents` Command and Header Switcher in `AiChatView.tsx`

1. In `web/src/components/AiChatView.tsx`:
   - Import `PersonaSelectorModal`, `fetchPersonas`, `setSessionPersona`, `type PersonaDefinition`.
   - State:
     - `const [activePersona, setActivePersona] = useState<PersonaDefinition | null>(null)`
     - `const [showPersonaModal, setShowPersonaModal] = useState(false)`
   - Load default persona on mount (or derived from workspace).
   - In header persona badge (lines 1270–1285):
     - Make button clickable: `onClick={() => setShowPersonaModal(true)}`.
     - Display active persona name, icon, and role color.
     - Cursor: `pointer` with hover highlight.
   - In `handleSendMessage`:
     - Pass `personaId: activePersona?.id` in chat request payload.
     - Handle `/agents` and `/agents list`:
       - Open `PersonaSelectorModal`.
       - Output formatted message listing available personas with quick-switch links.
     - Handle `/agent <id>`:
       - Instantly switches active persona and confirms in chat.
   - Global event listener: `agy:open-persona-modal` and keyboard shortcut `⌥A`.
   - Render `<PersonaSelectorModal isOpen={showPersonaModal} onClose={() => setShowPersonaModal(false)} activePersonaId={activePersona?.id || ''} onSelectPersona={handleSelectPersona} token={token} />`.
2. In `web/src/components/CommandPalette.tsx`:
   - Add command:
     ```tsx
     {
       id: 'cmd-switch-persona',
       category: 'SYSTEM',
       title: '/agents — Switch Agent Persona & Mindset',
       desc: 'Toggle between Architect, Auditor, Pair Programmer, SRE, and Assistant',
       shortcut: '⌥A',
       action: () => {
         window.dispatchEvent(new CustomEvent('agy:open-persona-modal'));
         onClose();
       },
     }
     ```
3. **Verify**: `npx tsc --noEmit -p web/tsconfig.json` → exit 0.

---

### Step 6: Create Frontend Unit Tests in `web/src/components/PersonaSelectorModal.test.tsx`

1. Create `web/src/components/PersonaSelectorModal.test.tsx`:
   - Test rendering preset personas (Architect, Auditor, Pair Programmer, Coding Agent, Assistant).
   - Test search filtering by keyword.
   - Test clicking "Activate Persona" calls `onSelectPersona` and triggers session update.
   - Test custom persona creation form submit.
2. **Verify**: `npx vitest run src/components/PersonaSelectorModal.test.tsx` → exit 0.

---

### Step 7: Final End-to-End Test Suite & Production Build Verification

1. Run full test suite:
   ```bash
   npm test
   ```
   Confirm all Vitest and Go test suites pass with 0 failures.
2. Run production build:
   ```bash
   npm run build
   ```
   Confirm clean Vite bundle and single Go static binary compilation.
3. Restart server and verify live endpoints:
   ```bash
   ./bin/ai-cli-online restart
   curl -s -H "Authorization: Bearer <token>" http://localhost:3001/api/personas
   ```

---

## Test plan

- **Backend**: `internal/persona/persona_test.go` and `internal/routes/personas_test.go`
  - Tests preset persona directives and fallback resolution.
  - Tests `GET /api/personas` and `POST /api/personas`.
  - Tests prompt compilation with custom persona directives.
- **Frontend**: `web/src/components/PersonaSelectorModal.test.tsx`
  - Tests persona cards rendering and active badge.
  - Tests persona switching callback.
  - Tests custom persona creation.
- **Regression**:
  - `AiChatView.tsx`, `WorkspaceSelector.tsx`, `CommandPalette.test.tsx`, `SkillsManagementModal.test.tsx` continue to pass without regression.

## Done criteria

- [ ] `internal/persona/persona.go` includes preset definitions for Architect, Auditor, Pair Programmer, SRE, Coding Agent, and Assistant.
- [ ] `GET /api/personas` returns list of all available personas.
- [ ] `POST /api/sessions/{sessionId}/persona` updates active session persona.
- [ ] `PersonaSelectorModal.tsx` renders in browser with role filtering and directive preview.
- [ ] Clicking persona badge in `AiChatView.tsx` header opens the persona selector.
- [ ] Typing `/agents` in `AiChatView.tsx` opens modal and displays persona summary.
- [ ] `npm test` passes with 0 failures across all web and Go tests.
- [ ] `npm run build` exits 0.
- [ ] `plans/README.md` status row for Plan 009 is updated.

## STOP conditions

- If SQLite schema requires migration, use backwards-compatible `CREATE TABLE IF NOT EXISTS` or JSON storage in `settings` table without breaking existing tables.
- Do not add external npm packages.
- Maintain sub-15MB idle RAM and zero CGO.

## Maintenance notes

- When a session changes workspaces, check if the active persona should stay pinned or follow the workspace default.
