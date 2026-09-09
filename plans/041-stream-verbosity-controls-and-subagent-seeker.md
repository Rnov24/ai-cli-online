# Plan 041: Stream Verbosity Controls, Live Process Telemetry, and Subagent Seeking Interface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8021849..HEAD -- internal/server/server.go internal/routes/conversations.go web/src/components/TurnAnchor.tsx web/src/components/ThinkingBlock.tsx web/src/components/ToolCallCard.tsx web/src/components/AiChatView.tsx web/src/components/SessionSidebar.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/040-paginate-skills-for-performance.md
- **Category**: dx
- **Planned at**: commit `8021849`, 2026-09-09
- **Issue**: none

## Why this matters

During autonomous AI execution and multi-agent coordination, user visibility into the live agent process (reasoning, tool calling, subagent delegation) is essential.
Currently in AGY Online, the chat renderer displays generic AI placeholders (`Synthesizing response...` in `TurnAnchor.tsx:319` and `TurnAnchor.tsx:353`) that obscure actual tool status and produce repetitive visual noise. Furthermore, users lack a global verbosity preference to switch smoothly between full transparent execution traces, compact telemetry summaries, and clean final answers.
Additionally, when Antigravity spawns subagents (`invoke_subagent`), they execute in isolated background conversations under `~/.gemini/antigravity-cli/brain/<subagent-id>/`. The UI currently provides no interface to seek, inspect, search, or monitor subagents, forcing developers to manually grep JSONL logs in Termux shells.
This plan removes all generic "synthesizing response" placeholders in favor of real-time technical status telemetry, adds global tri-mode verbosity controls (`compact`, `verbose`, `minimal`), and introduces a dedicated Subagent Seeking & Inspection interface across the backend API, chat tool cards, sidebar, and a new Subagent Explorer modal.

## Current state

- Relevant files:
  - `web/src/components/TurnAnchor.tsx` — Renders chat turns in `worklog`, `transparent`, or `final` mode; contains hardcoded `<span>Synthesizing response...</span>` (lines 319, 353).
  - `web/src/components/ThinkingBlock.tsx` — Renders cognitive trace reasoning block; static header during streaming.
  - `web/src/components/ToolCallCard.tsx` — Renders individual tool call execution cards; renders `invoke_subagent` as raw JSON arguments without subagent navigation.
  - `web/src/components/AiChatView.tsx` — Main chat view managing message history, streaming sockets, and slash commands.
  - `web/src/components/SessionSidebar.tsx` — Left sidebar managing conversation history and workspace panes.
  - `internal/routes/conversations.go` — Backend handler for AGY brain conversation logs (`GET /api/agy/conversations`).
  - `internal/server/server.go` — Route registry for Go server HTTP endpoints.

- Existing placeholder in `web/src/components/TurnAnchor.tsx:307-322`:
```tsx
            {message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : message.status === 'streaming' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--accent-amber-bright)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span className="pulse-dot pulse-dot--executing" />
                <span>Synthesizing response...</span>
              </div>
            ) : null}
```

- Existing `invoke_subagent` in transcript:
  - Parent conversation logs `tool_calls: [{"name": "invoke_subagent", "args": {"Subagents": [...]}}]` with result containing `conversationId` and `logAbsoluteUri`.
  - Child conversation is stored at `~/.gemini/antigravity-cli/brain/<conversationId>/.system_generated/logs/transcript.jsonl`.
  - Child worktree is at `~/.gemini/antigravity-cli/brain/<parentId>/.system_generated/worktrees/subagent-<role>-<type>-<id>`.

- Design system and Antislop rules (`DESIGN.md`, `antislop-ui`, `antislop-layoutmobile`, `antislop-code`):
  - **Mood & Tone**: High-precision industrial workstation, avionics telemetry cockpit, utilitarian, austere, focused.
  - **Dials**: ENERGY 2 (Balanced), RHYTHM 2 (Structured Modular), MOTION 1 (Calm, 0.15s state transitions only).
  - **Geometry**: Small disciplined geometry (3px to 6px border radius). Pill-shaped buttons and cards are forbidden.
  - **Colors**: Dark theme default: Base `#08090b` (`--bg-primary`), Secondary `#0d0f12` (`--bg-secondary`), Tertiary `#121519` (`--bg-tertiary`), Borders `#252a31` (`--border`), Strong `#363c46` (`--border-strong`), Cyan (`--accent-cyan`), Amber (`--accent-amber`).
  - **Typography**: Monospace primary (`JetBrains Mono`, monospace) for status, telemetry, tool indicators, and buttons. No em dashes.
  - **Mobile Layout**: Minimum touch target of 44px on mobile viewports (`<= 768px`).

## Commands you will need

| Purpose   | Command                                                      | Expected on success |
|-----------|--------------------------------------------------------------|---------------------|
| Go Tests  | `go test -v ./internal/routes -run TestSubagents`            | PASS, exit 0        |
| Web Tests | `npm run test --workspace=web -- TurnAnchor Subagents`       | all pass, exit 0    |
| Build Go  | `npm run build:go`                                           | exit 0              |
| Build Web | `npm run build --workspace=web`                              | exit 0, no errors   |

## Scope

**In scope** (the only files you should modify or create):
- `internal/routes/subagents.go` (create)
- `internal/routes/subagents_test.go` (create)
- `internal/server/server.go`
- `web/src/api/subagents.ts` (create)
- `web/src/components/TurnAnchor.tsx`
- `web/src/components/TurnAnchor.test.tsx` (create or extend)
- `web/src/components/ThinkingBlock.tsx`
- `web/src/components/ToolCallCard.tsx`
- `web/src/components/SubagentsModal.tsx` (create)
- `web/src/components/SubagentsModal.test.tsx` (create)
- `web/src/components/SessionSidebar.tsx`
- `web/src/components/AiChatView.tsx`

**Out of scope** (do NOT touch):
- Modifying Antigravity CLI binary (`agy`) or subagent spawning engine internals.
- Altering the SQLite database schema for sessions.
- Modifying `MarkdownRenderer.tsx` rendering logic.

## Git workflow

- Branch: `advisor/041-stream-verbosity-controls-and-subagent-seeker`
- Commit style: conventional commits matching repo history (e.g. `git log -n 5`):
  - `feat(routes): add subagents discovery and inspection api`
  - `feat(web): remove synthesizing placeholder and add live process telemetry`
  - `feat(web): add subagent explorer modal and sidebar view`
  - `test(subagents): add unit tests for subagents api and ui components`
- Do NOT push or open a PR unless instructed by the operator.

## Steps

### Step 1: Implement Subagents Backend API in `internal/routes/subagents.go` and Register in `internal/server/server.go`

1. Create `internal/routes/subagents.go`:
- Define data structures:
```go
package routes

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type SubagentItem struct {
	ID          string `json:"id"`
	ParentID    string `json:"parentId"`
	Role        string `json:"role"`
	TypeName    string `json:"typeName"`
	Model       string `json:"model"`
	Prompt      string `json:"prompt"`
	Status      string `json:"status"` // "running", "done", "error"
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
	LogUri      string `json:"logUri"`
	WorktreeUri string `json:"worktreeUri,omitempty"`
	ToolCount   int    `json:"toolCount"`
	Report      string `json:"report,omitempty"`
}

type SubagentsResponse struct {
	Ok        bool           `json:"ok"`
	Subagents []SubagentItem `json:"subagents"`
	Count     int            `json:"count"`
}
```

- Implement `SubagentsHandler`:
```go
type SubagentsHandler struct {
	auth *AuthHelper
}

func NewSubagentsHandler(auth *AuthHelper) *SubagentsHandler {
	return &SubagentsHandler{auth: auth}
}
```

- Implement `ListSubagents`:
  - Verify auth via `h.auth.CheckAuth(r)`.
  - Support query filters: `parent := r.URL.Query().Get("parent")`, `status := r.URL.Query().Get("status")`, `q := strings.ToLower(r.URL.Query().Get("q"))`.
  - Read `getBrainDir()`. Scan all entries in brain directory.
  - Parse parent `transcript.jsonl` files to discover subagents dispatched via `invoke_subagent`:
    - Scan lines with `"name": "invoke_subagent"` or `"name":"invoke_subagent"`.
    - Extract `args.Subagents` (Role, TypeName, Model, Prompt).
    - Match corresponding tool response step in the transcript that returns `created_subagents` / `conversationId` and `workspaceUris`.
  - Also inspect child conversation directories: check if child transcript exists, compute `CreatedAt`, `UpdatedAt`, `ToolCount`, and parse final message or last step to determine `Status` (`done`, `running`, `error`) and `Report` (e.g. `STATUS: COMPLETE`).
  - Filter by `parent`, `status`, and `q` (role, prompt, or ID contains query).
  - Sort by `UpdatedAt` descending.
  - Respond with JSON `SubagentsResponse`.

- Implement `GetSubagent`:
  - Handle `GET /api/agy/subagents/{id}`:
  - Verify auth. Find subagent by ID.
  - Return detailed `SubagentItem` with recent step messages.

2. In `internal/server/server.go`:
- Instantiate `subagentH := routes.NewSubagentsHandler(auth)`.
- Register routes:
```go
	// AGY Subagent Seeking & Inspection
	mux.HandleFunc("GET /api/agy/subagents", subagentH.ListSubagents)
	mux.HandleFunc("GET /api/agy/subagents/{id}", subagentH.GetSubagent)
```

**Verify**: `go test -v ./internal/routes -run TestSubagents` → exits 0 (after Step 2 tests).

---

### Step 2: Add Backend Unit Tests in `internal/routes/subagents_test.go`

1. Create `internal/routes/subagents_test.go`:
- Test unauthorized access returns 401.
- Setup temporary test brain directory with simulated parent conversation and subagent conversation:
  - Parent transcript with `invoke_subagent` tool call and result containing `conversationId: "test-subagent-123"`, `Role: "Test Executor"`, `TypeName: "self"`.
  - Child transcript with initial prompt, 3 tool calls, and final complete message.
- Test `ListSubagents`:
  - Verify `res.Ok == true`, `res.Count == 1`.
  - Verify subagent ID, Role, TypeName, ParentID, ToolCount, and Status are parsed accurately.
- Test query filtering by `q=Executor` and `status=done`.
- Test `GetSubagent` returns 200 with matching details, and 404 for unknown IDs.

**Verify**: `go test -v ./internal/routes -run TestSubagents` → PASS, exit 0.

---

### Step 3: Remove "Synthesizing response..." and Add Live Process Telemetry in `web/src/components/TurnAnchor.tsx` & `ThinkingBlock.tsx`

1. In `web/src/components/TurnAnchor.tsx`:
- Export and support global verbosity modes:
```typescript
export type VerbosityMode = 'compact' | 'verbose' | 'minimal';
```
- In `TurnAnchorProps`, add:
```typescript
verbosityMode?: VerbosityMode;
```
- Remove all instances of `<span>Synthesizing response...</span>` (lines 319 and 353).
- Replace with contextual telemetry:
  - If any tool call has `status === 'running'`:
    - Render active execution indicator:
      ```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber-bright)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
        <span className="pulse-dot pulse-dot--executing" />
        <span>EXECUTING // {runningTool.name.toUpperCase()} {runningTarget ? `> ${runningTarget}` : ''}</span>
      </div>
      ```
  - If streaming text and no content yet:
    - In `minimal` mode: render subtle pulse dot without text.
    - In `compact` and `transparent` mode: render:
      ```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan-bright)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
        <span className="pulse-dot pulse-dot--executing" />
        <span>STREAMING RESPONSE...</span>
      </div>
      ```
- In `compact` mode (formerly `worklog`): auto-collapse completed tool cards and completed thinking blocks into clean, single-line telemetry rows, expanding only during active execution.

2. In `web/src/components/ThinkingBlock.tsx`:
- During streaming (`isStreaming`), update header text:
  - If thinking is receiving tokens: show `REASONING // {thinking.length} CHARS` with active pulse dot.
  - When settled: `REASONING TRACE // {thinking.length} CHARS`.
- Ensure styling uses flat technical borders and respects `DESIGN.md` tokens.

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exits 0.

---

### Step 4: Enhance `ToolCallCard.tsx` with Specialized Subagent Dispatch Card

1. In `web/src/components/ToolCallCard.tsx`:
- Detect if `toolCall.name === 'invoke_subagent'`.
- When `toolCall.name === 'invoke_subagent'`:
  - Parse `toolCall.args?.Subagents` to extract target subagents (Role, TypeName, Model, Prompt).
  - Extract subagent conversation ID from `toolCall.output` if present.
  - Render an Antislop-compliant **Subagent Dispatch Card**:
    - Header: Category badge `SUBAGENT` (`--accent-purple` or `--accent-cyan`), Role name in bold monospace, status indicator (`DISPATCHED` / `RUNNING` / `COMPLETE`).
    - Body: Inlined task prompt excerpt, model badge, and workspace isolation badge.
    - Action button: `[SEEK SUBAGENT]` or `[INSPECT SUBAGENT]`, which dispatches a custom window event `agy:seek-subagent` with the subagent conversation ID or role.
- For other tool calls:
  - Add line-clamp / maximum height to output telemetry with toggle to prevent vertical layout explosion on high-output commands.

**Verify**: `npm run build --workspace=web` → compiles cleanly.

---

### Step 5: Implement Subagents Frontend API and `SubagentsModal.tsx`

1. Create `web/src/api/subagents.ts`:
```typescript
export interface SubagentItem {
  id: string;
  parentId: string;
  role: string;
  typeName: string;
  model: string;
  prompt: string;
  status: 'running' | 'done' | 'error';
  createdAt: number;
  updatedAt: number;
  logUri: string;
  worktreeUri?: string;
  toolCount: number;
  report?: string;
}

export interface SubagentsResponse {
  ok: boolean;
  subagents: SubagentItem[];
  count: number;
}

export async function fetchSubagents(
  token: string,
  options?: { parentId?: string; status?: string; query?: string }
): Promise<SubagentsResponse> {
  const params = new URLSearchParams();
  if (options?.parentId) params.set('parent', options.parentId);
  if (options?.status && options.status !== 'all') params.set('status', options.status);
  if (options?.query) params.set('q', options.query);

  const qs = params.toString();
  const url = qs ? `/api/agy/subagents?${qs}` : '/api/agy/subagents';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch subagents: ${res.statusText}`);
  }
  return res.json();
}
```

2. Create `web/src/components/SubagentsModal.tsx`:
- Antislop & `DESIGN.md` compliant modal:
  - Header: Title `SUBAGENT EXPLORER`, telemetry count readout (`{count} SUBAGENTS INDEXED`).
  - Filter bar:
    - Search input: `Search subagents by role, task, or ID...`
    - Status pills: `ALL`, `RUNNING`, `DONE`, `ERROR` with active border highlights (`var(--accent-amber)`).
  - Subagent List:
    - Cards showing Role name (`/{subagent.role}`), Type (`self` / `research`), Status badge with pulse dot, start timestamp, tool call count (`{toolCount} tools executed`).
    - Clicking a card opens the subagent detail inspection drawer.
  - Detail Inspection Drawer:
    - View prompt instructions.
    - View execution report (e.g. `STATUS: COMPLETE`, steps performed).
    - Link to open child transcript messages directly.
  - Keyboard accessibility: Escape key dismisses modal, Enter selects active card.
  - Mobile responsiveness: stack drawer below list on `<= 768px` viewports, minimum 44px touch targets for filter buttons.

3. In `web/src/components/AiChatView.tsx`:
- Import `SubagentsModal`.
- Add `/subagents` command to `SLASH_COMMANDS`:
  `{ cmd: '/subagents', desc: 'Seek, inspect, and monitor active and past subagents', category: 'assistant' }`.
- Handle `/subagents` command input to toggle `showSubagentsModal(true)`.
- Add global Verbosity Mode selector in the chat telemetry header:
  - Buttons: `COMPACT`, `VERBOSE`, `MINIMAL`.
  - Persist to `localStorage.setItem('agy:chat_verbosity', mode)`.
  - Pass `verbosityMode` to all `TurnAnchor` components.
- Listen to `agy:seek-subagent` event to open `SubagentsModal` focused on requested subagent ID.

4. In `web/src/components/SessionSidebar.tsx`:
- Add `subagents` to `activeView` modes: `'conversations' | 'subagents' | 'tabs'`.
- In `subagents` tab, display active and recent subagents with status pills and quick link to inspect.

**Verify**: `npm run build --workspace=web` → compiles without type or lint errors.

---

### Step 6: Add Comprehensive Frontend Unit Tests

1. Create `web/src/components/SubagentsModal.test.tsx`:
- Test: "renders subagent cards and counts accurately".
- Test: "filters subagents by status pills (ALL, RUNNING, DONE)".
- Test: "filters subagents by search input".
- Test: "inspects subagent details and renders prompt and report".
- Test: "dismisses modal on Escape key".

2. Update or create `web/src/components/TurnAnchor.test.tsx`:
- Test: "does not render 'Synthesizing response...' placeholder during streaming".
- Test: "renders active tool execution telemetry when tool is running".
- Test: "renders streaming response telemetry when streaming content".
- Test: "respects verbosityMode prop".

**Verify**: `npm run test --workspace=web -- TurnAnchor Subagents` → all tests pass.

## Test plan

- **Go Backend**:
  - File: `internal/routes/subagents_test.go`
  - Tests:
    1. Unauthorized access returns 401.
    2. Parsing parent transcript and discovering child subagents.
    3. Query filters (`parent`, `status`, `q`).
    4. Individual subagent inspection via `GET /api/agy/subagents/:id`.
  - Command: `go test -v ./internal/routes -run TestSubagents`

- **Frontend React**:
  - Files: `web/src/components/TurnAnchor.test.tsx`, `web/src/components/SubagentsModal.test.tsx`
  - Tests:
    1. Elimination of "Synthesizing response..." in favor of live telemetry.
    2. Subagent card rendering, search filtering, and inspection drawer.
    3. Global verbosity mode switching.
  - Command: `npm run test --workspace=web -- TurnAnchor Subagents`

- **Full Suite**:
  - `npm test` and `npm run build`.

## Done criteria

- [ ] All instances of `Synthesizing response...` removed from `TurnAnchor.tsx`.
- [ ] Live running process telemetry displays active tool name and target during streaming execution.
- [ ] Global verbosity mode (`compact` | `verbose` | `minimal`) integrated into chat header and persisted in localStorage.
- [ ] `GET /api/agy/subagents` and `GET /api/agy/subagents/:id` endpoints discover and index subagents from brain logs.
- [ ] `ToolCallCard.tsx` renders specialized Subagent Dispatch Cards with role name and `[SEEK SUBAGENT]` action for `invoke_subagent` calls.
- [ ] `SubagentsModal.tsx` provides an Antislop-compliant interface to search, filter, and inspect subagents.
- [ ] `/subagents` slash command registered in `AiChatView.tsx`.
- [ ] `SessionSidebar.tsx` supports a dedicated Subagents tab.
- [ ] `go test -v ./internal/routes -run TestSubagents` exits 0.
- [ ] `npm run test --workspace=web -- TurnAnchor Subagents` exits 0.
- [ ] `npm run build` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:
- `git diff --stat 8021849..HEAD` shows unexpected drift in existing session or chat websocket routes.
- Parsing brain transcript logs causes memory spikes on large transcripts (>10MB).
- TypeScript compiler errors cannot be resolved within in-scope files.

## Maintenance notes

- Subagent discovery scans brain conversation logs efficiently using line-based streaming (`bufio.Scanner`) with a 64KB buffer, avoiding loading full 100MB+ transcripts into memory.
- If thousands of subagents accumulate in `~/.gemini/antigravity-cli/brain`, pagination should be added to `GET /api/agy/subagents` following the Plan 040 pattern.
