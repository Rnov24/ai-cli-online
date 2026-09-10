# Plan 043: Render Subagent Delegation Cards in Streaming and Historical Log Chat

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d8a09a8..HEAD -- internal/routes/conversations.go internal/routes/conversations_test.go internal/agy/parser.go internal/agy/parser_test.go web/src/components/ToolCallCard.tsx web/src/components/TurnAnchor.tsx web/src/components/AiChatView.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/042-redesign-and-relayout-sidebar.md
- **Category**: bug
- **Planned at**: commit `d8a09a8`, 2026-09-10
- **Issue**: none

## Why this matters

When Google Antigravity CLI (`agy`) dispatches autonomous subagents (`invoke_subagent`), developers rely on real-time visual telemetry and interactive `[SEEK SUBAGENT]` cards in the chat interface to inspect delegated worktrees, monitor subagent progress, and review background execution logs.
Currently, subagent delegation cards fail to appear in both live streaming chat and historical conversation logs.
In conversation logs (`GET /api/agy/conversations/:id/messages`), the backend parser drops the `GENERIC` step that contains the subagent creation result, leaving `toolCall.output` empty and stripping the subagent conversation ID.
In live streaming, parser name fallbacks miss `invoke_subagent` when emitted inside `tool_info.name`, and the frontend chat collapsed worklog (`compact` mode) hides tool cards as soon as the initial tool call ends, completely burying the subagent delegation.
Furthermore, `ToolCallCard` expects single-serialized JSON arguments with an explicit `Role` property, whereas real Antigravity transcripts pass double-stringified arguments and encode the role in `toolSummary` or `toolAction`.
This plan fixes backend transcript step correlation, hardens stream parser event extraction, makes subagent delegation cards persistently visible across both compact worklog and transparent stream modes, and provides robust argument/ID normalization.

## Current state

- Relevant files:
  - `internal/routes/conversations.go` — Parses `transcript.jsonl` files into `ChatMessageItem` arrays for `GET /api/agy/conversations/:id/messages` (lines 350–430).
  - `internal/routes/conversations_test.go` — Test suite for conversation listing and message extraction.
  - `internal/agy/parser.go` — Parses line-delimited JSON stream from `agy` CLI process output (lines 64–125).
  - `internal/agy/parser_test.go` — Test suite for stream event parsing.
  - `web/src/components/ToolCallCard.tsx` — Renders tool execution cards, including specialized `invoke_subagent` cards (lines 1–320).
  - `web/src/components/TurnAnchor.tsx` — Renders chat turns in `worklog` (compact), `transparent` (stream), or `final` (answer) modes (lines 30–70, 320–415).
  - `web/src/components/AiChatView.tsx` — Manages message stream sockets, tool call state updates, and seek-subagent event dispatching (lines 1290–1325).

- Transcript step severance in `internal/routes/conversations.go:372–428`:
```go
		if raw.Type == "USER_INPUT" {
			// ... appends user message ...
		} else if raw.Type == "PLANNER_RESPONSE" {
			if currentAssistant == nil {
				currentAssistant = &ChatMessageItem{ ... }
			}
			if len(raw.ToolCalls) > 0 {
				for _, tc := range raw.ToolCalls {
					toolName := tc.Name
					if toolName == "" { toolName = "tool" }
					status := tc.Status
					if status == "" { status = "success" }
					currentAssistant.ToolCalls = append(currentAssistant.ToolCalls, TranscriptToolItem{
						Id:     tc.Id,
						Name:   toolName,
						Args:   tc.Args,
						Output: tc.Output,
						Status: status,
					})
				}
			}
		}
```
In real Antigravity transcripts, `invoke_subagent` is logged in step $N$ (`type: "PLANNER_RESPONSE"` with `tool_calls`), followed immediately by step $N+1$ (`type: "GENERIC"` with `content: "Created the following subagents:\n{\n  \"conversationId\": \"...\" ...}"`). Because `raw.Type == "GENERIC"` has no handler, step $N+1$ is ignored, `tc.Output` remains `""`, and `tc.Id` is empty.

- Streaming event parser flaw in `internal/agy/parser.go:92–111`:
```go
			if su.StepType == "tool" {
				toolStatus := "running"
				if su.State == "DONE" {
					toolStatus = "success"
				}
				if onEvent != nil {
					onEvent(StreamEvent{
						Event:        "tool",
						StepIndex:    su.StepIndex,
						Conversation: res.ConversationId,
						ToolCall: &ToolCallData{
							Id:       fmt.Sprintf("tool_%d", su.StepIndex),
							Name:     su.ToolName,
							Args:     su.ToolInfo.Parameters,
							Output:   su.ToolInfo.Output,
							Status:   toolStatus,
							Duration: su.DurationSeconds,
						},
					})
				}
```
If `su.ToolName` is empty while `su.ToolInfo.Name` is `"invoke_subagent"`, `ToolCall.Name` becomes `""`, preventing `ToolCallCard.tsx` (`isSubagent = toolCall.name === 'invoke_subagent'`) from identifying the subagent. Also, if `su.State` is `"ERROR"` or `"FAILED"`, `toolStatus` erroneously stays `"running"`.

- Subagent concealment in compact mode (`web/src/components/TurnAnchor.tsx:58, 323–377`):
```tsx
  const isAutoExpanded = worklogExpanded || (activeMode === 'worklog' && !!runningTool);
```
In historical conversation logs (where all turns are `status: 'done'`) and during subsequent response text streaming, `runningTool` is `undefined`. Consequently, `isAutoExpanded` is `false`, and the subagent card is collapsed completely inside the `WORKLOG SUMMARY` fold. Users see only `⚡ WORKLOG SUMMARY // 1 tool calls` without any visual indication that a subagent was delegated.

- Stringified argument and missing role in `web/src/components/ToolCallCard.tsx:22–45, 122–125`:
In real transcripts, `args.Subagents` is often a string containing JSON or a double-serialized string, and `subs[0]` only contains `Prompt` and `Model` with `Role` omitted (the role is passed in `args.toolSummary` or `args.toolAction`, e.g. `"Dispatch executor subagent for Plan 041"`). `parseSubagents` fails on double-escaped strings, and `firstRole` defaults to generic `"Subagent"`.

- Design system and Antislop rules (`DESIGN.md`, `antislop-ui`, `antislop-layoutmobile`, `antislop-code`):
  - **Mood & Tone**: High-precision industrial workstation, avionics telemetry cockpit, utilitarian, austere, focused.
  - **Dials**: ENERGY 2 (Balanced), RHYTHM 2 (Structured Modular), MOTION 1 (Calm, 0.15s state transitions only).
  - **Geometry**: Small disciplined geometry (3px to 6px border radius). Pill-shaped buttons and cards are forbidden.
  - **Colors**: Base `#08090b` (`--bg-primary`), Secondary `#0d0f12` (`--bg-secondary`), Tertiary `#121519` (`--bg-tertiary`), Borders `#252a31` (`--border`), Cyan (`--accent-cyan-bright`), Purple (`--accent-purple, #a78bfa`), Amber (`--accent-amber-bright`).
  - **Typography**: Monospace primary (`JetBrains Mono`, monospace). No em dashes: use hyphens, colons, or parentheses.
  - **Mobile Layout**: Minimum touch target of 44px on mobile viewports (`<= 768px`).

## Commands you will need

| Purpose   | Command                                                        | Expected on success |
|-----------|----------------------------------------------------------------|---------------------|
| Go Tests  | `go test -v ./internal/routes -run TestConversations`          | PASS, exit 0        |
| AGY Tests | `go test -v ./internal/agy -run TestParseStream`               | PASS, exit 0        |
| Web Tests | `npm run test --workspace=web -- ToolCallCard TurnAnchor`      | all pass, exit 0    |
| Typecheck | `npx tsc --noEmit --project web/tsconfig.json`                 | exit 0, no errors   |
| Build Go  | `npm run build:go`                                             | exit 0              |
| Build Web | `npm run build --workspace=web`                                | exit 0, no errors   |

## Scope

**In scope** (the only files you should modify or create):
- `internal/routes/conversations.go`
- `internal/routes/conversations_test.go`
- `internal/agy/parser.go`
- `internal/agy/parser_test.go`
- `web/src/components/ToolCallCard.tsx`
- `web/src/components/ToolCallCard.test.tsx` (create)
- `web/src/components/TurnAnchor.tsx`
- `web/src/components/TurnAnchor.test.tsx`
- `web/src/components/AiChatView.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `internal/routes/subagents.go` — Backend subagent registry scanning is verified and settled in Plan 041.
- `web/src/components/SubagentsModal.tsx` — Subagent Explorer modal layout is settled in Plan 041.
- `web/src/components/SessionSidebar.tsx` — Sidebar left docking and tabs are settled in Plan 042.
- Antigravity CLI binary (`agy`) or subagent runner spawning engine internals.

## Git workflow

- Branch: `advisor/043-subagent-delegation-stream-and-log-rendering`
- Commit style: conventional commits matching repo history (e.g. `git log -n 5`):
  - `fix(conversations): correlate generic transcript steps to tool call outputs`
  - `fix(agy): normalize stream tool name and error state handling`
  - `feat(web): ensure subagent delegation visibility in worklog and stream views`
  - `test(web): add tool call card and turn anchor subagent tests`
- Do NOT push or open a PR unless instructed by the operator.

## Steps

### Step 1: Backend Transcript Step Correlation in `internal/routes/conversations.go`

1. In `internal/routes/conversations.go`, update the `GetConversationMessages` transcript scanner loop (around lines 372–428):
   - When processing `raw.Type == "PLANNER_RESPONSE"`:
     - For each `tc` in `raw.ToolCalls`:
       - If `tc.Id == ""`: assign `fmt.Sprintf("tool_%d_%d", raw.StepIndex, idx)` so React has unique keys.
       - If `tc.Name == ""`: assign `"tool"`.
       - If `tc.Status == ""`: assign `"success"`.
       - Preserve `tc.Args` and `tc.Output`.
   - Add handling for `raw.Type == "GENERIC"` or `raw.Type == "TOOL_OUTPUT"`:
     ```go
     } else if raw.Type == "GENERIC" || raw.Type == "TOOL_OUTPUT" {
     	if currentAssistant != nil && len(currentAssistant.ToolCalls) > 0 {
     		// Attach output to the most recent tool call that has empty output
     		lastIdx := len(currentAssistant.ToolCalls) - 1
     		for i := lastIdx; i >= 0; i-- {
     			if currentAssistant.ToolCalls[i].Output == "" {
     				currentAssistant.ToolCalls[i].Output = raw.Content
     				if raw.Status == "ERROR" || raw.Status == "FAILED" {
     					currentAssistant.ToolCalls[i].Status = "error"
     				}
     				break
     			}
     		}
     	}
     }
     ```
   - Also check if `raw.Type == "MODEL"` with `tool_calls`: ensure it is treated consistently with `PLANNER_RESPONSE`.

**Verify**: `go test -v ./internal/routes -run TestConversations` → exits 0.

---

### Step 2: Backend Streaming Parser Normalization in `internal/agy/parser.go`

1. In `internal/agy/parser.go`, update `step_update` handling for `su.StepType == "tool"` (around lines 92–111):
   - Normalize tool name:
     ```go
     toolName := strings.TrimSpace(su.ToolName)
     if toolName == "" {
     	toolName = strings.TrimSpace(su.ToolInfo.Name)
     }
     if toolName == "" {
     	toolName = "tool"
     }
     ```
   - Normalize status:
     ```go
     toolStatus := "running"
     if su.State == "DONE" || su.State == "COMPLETED" || su.State == "SUCCESS" {
     	toolStatus = "success"
     } else if su.State == "ERROR" || su.State == "FAILED" {
     	toolStatus = "error"
     }
     ```
   - Normalize arguments:
     ```go
     args := su.ToolInfo.Parameters
     if args == nil {
     	args = make(map[string]any)
     }
     ```
   - Set `ToolCallData`:
     ```go
     ToolCall: &ToolCallData{
     	Id:       fmt.Sprintf("tool_%d", su.StepIndex),
     	Name:     toolName,
     	Args:     args,
     	Output:   su.ToolInfo.Output,
     	Status:   toolStatus,
     	Duration: su.DurationSeconds,
     },
     ```
   - Also support `su.StepType == "tool_result"` or `su.StepType == "tool_output"`: if received, emit a tool event with status `"success"` (or `"error"` if failed) and the corresponding `Output`.

**Verify**: `go test -v ./internal/agy -run TestParseStream` → exits 0.

---

### Step 3: Backend Unit Tests in `internal/routes/conversations_test.go` and `internal/agy/parser_test.go`

1. In `internal/routes/conversations_test.go`, add a dedicated test case `TestConversationsHandler_SubagentOutputCorrelation`:
   - Create a simulated transcript with:
     - Step 0: `USER_INPUT` prompt `"Run task"`.
     - Step 1: `PLANNER_RESPONSE` with `tool_calls: [{"name": "invoke_subagent", "args": {"Subagents": "[{\"Model\":\"inherit\",\"Prompt\":\"test\"}]"}}]`.
     - Step 2: `GENERIC` with `content: "Created the following subagents:\n{\n  \"conversationId\": \"sub-conv-456\",\n  \"workspaceUris\": [\"/test/ws\"]\n}"`.
     - Step 3: `PLANNER_RESPONSE` with `content: "I have dispatched the subagent."`.
   - Call `GetConversationMessages`.
   - Verify `res.Messages` has assistant turn with `len(toolCalls) == 1`.
   - Verify `toolCalls[0].Name == "invoke_subagent"`.
   - Verify `toolCalls[0].Output` contains `"sub-conv-456"`.
   - Verify `toolCalls[0].Status == "success"`.
   - Verify `toolCalls[0].Id` is non-empty.

2. In `internal/agy/parser_test.go`, add a test case `TestParseStream_InvokeSubagentToolUpdate`:
   - Provide stream fixtures where `step_update` has `tool_info.name = "invoke_subagent"` but `tool_name` is empty.
   - Verify that emitted `tool` event has `ToolCall.Name == "invoke_subagent"`.
   - Provide stream fixture where `su.State == "ERROR"`, verify `ToolCall.Status == "error"`.

**Verify**: `go test -v ./internal/routes -run TestConversations` and `go test -v ./internal/agy -run TestParseStream` → both exit 0.

---

### Step 4: Subagent Argument Parsing, Role Fallback, and ID Extraction in `web/src/components/ToolCallCard.tsx`

1. In `web/src/components/ToolCallCard.tsx`:
   - Enhance `parseSubagents`:
     ```typescript
     function parseSubagents(subagentsArg: unknown): ParsedSubagent[] {
       if (!subagentsArg) return [];
       if (typeof subagentsArg === 'string') {
         try {
           let parsed = JSON.parse(subagentsArg);
           // Handle double-serialized JSON strings
           if (typeof parsed === 'string') {
             try {
               parsed = JSON.parse(parsed);
             } catch {}
           }
           return Array.isArray(parsed) ? parsed : [parsed];
         } catch {
           return [];
         }
       }
       if (Array.isArray(subagentsArg)) {
         return subagentsArg;
       }
       if (typeof subagentsArg === 'object') {
         return [subagentsArg as ParsedSubagent];
       }
       return [];
     }
     ```
   - Enhance `extractSubagentId`:
     ```typescript
     function extractSubagentId(output?: string, args?: Record<string, unknown>): string | undefined {
       if (output) {
         const m = output.match(/["']?(?:conversationId|conversation_id|id)["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]{8,})/i);
         if (m) return m[1];
       }
       if (args) {
         if (typeof args.conversationId === 'string') return args.conversationId;
         if (typeof args.conversation_id === 'string') return args.conversation_id;
       }
       return undefined;
     }
     ```
   - Support case-insensitive parameter lookups:
     ```typescript
     const rawSubagents =
       toolCall.args?.Subagents ??
       toolCall.args?.subagents ??
       toolCall.args?.Subagent ??
       toolCall.args?.subagent ??
       (toolCall.args && typeof toolCall.args === 'object' && ('Model' in toolCall.args || 'model' in toolCall.args) ? [toolCall.args] : undefined);
     const subs = parseSubagents(rawSubagents);
     ```
   - Role extraction fallback:
     - If `subs[0]?.Role` or `subs[0]?.role` is empty or `"Subagent"`:
     - Check `toolCall.args?.toolSummary` or `toolCall.args?.toolAction`: sanitize escaped quotes (e.g. `String(toolCall.args.toolSummary).replace(/^"|"$/g, '').replace(/Dispatch(ing)?\s*(executor\s*subagent\s*(for\s*)?)?/i, '').trim()`).
     - If non-empty, use it as `firstRole`.
     - Otherwise, check if prompt has `# Plan \d+: (.*)` or similar headline.
   - Fallback rendering when `subs.length === 0`:
     - If `isSubagent` is true but `subs.length === 0`: render a fallback subagent card displaying `toolCall.args?.toolSummary` or prompt excerpt rather than failing silently.

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exits 0.

---

### Step 5: Persistent Subagent Delegation Visibility in `web/src/components/TurnAnchor.tsx` & `web/src/components/AiChatView.tsx`

1. In `web/src/components/TurnAnchor.tsx`:
   - Identify subagent presence:
     ```typescript
     const subagentToolCalls = toolCalls.filter(
       (tc) => tc.name === 'invoke_subagent' || tc.name.toLowerCase().includes('subagent')
     );
     const hasSubagent = subagentToolCalls.length > 0;
     ```
   - In `TurnAnchor` header and running telemetry:
     - Update `runningTarget` to detect subagent:
       ```typescript
       const runningTarget = runningTool
         ? (runningTool.name === 'invoke_subagent'
             ? (runningTool.args?.toolSummary ? String(runningTool.args.toolSummary).replace(/^"|"$/g, '') : 'SUBAGENT')
             : runningTool.args?.CommandLine
             ? String(runningTool.args.CommandLine)
             : String(runningTool.args?.TargetFile || runningTool.args?.AbsolutePath || runningTool.args?.Query || ''))
         : '';
       ```
     - In turn header: if `hasSubagent`, render a distinct purple badge:
       ```tsx
       <span
         style={{
           fontSize: '9px',
           padding: '1px 5px',
           borderRadius: '3px',
           backgroundColor: 'var(--bg-tertiary)',
           color: 'var(--accent-purple, #a78bfa)',
           border: '1px solid var(--border)',
           fontWeight: 700,
           letterSpacing: '0.5px',
         }}
       >
         {subagentToolCalls.length} SUBAGENT{subagentToolCalls.length > 1 ? 'S' : ''}
       </span>
       ```
   - In `worklog` (compact) mode:
     - In the Worklog Summary bar: if `hasSubagent`, display an active inline indicator:
       ```tsx
       <span style={{ color: 'var(--accent-purple, #a78bfa)', fontWeight: 600 }}>
         // {subagentToolCalls.length} DELEGATED
       </span>
       ```
     - **Prominently render Subagent Dispatch Cards**:
       Even when `worklogExpanded` is false (collapsed worklog), subagent delegation cards must NOT be hidden.
       Directly render `subagentToolCalls` immediately beneath the Worklog Summary bar so they are visible on stream and in log chat:
       ```tsx
       {/* Always surface Subagent Dispatch Cards even in compact worklog mode */}
       {!isAutoExpanded && subagentToolCalls.length > 0 && (
         <div style={{ margin: '8px 0' }}>
           {subagentToolCalls.map((tc) => (
             <ToolCallCard key={tc.id || tc.name} toolCall={tc} />
           ))}
         </div>
       )}
       ```
       When `isAutoExpanded` is true, render non-subagent tool calls or all tool calls as appropriate without duplicating.

2. In `web/src/components/AiChatView.tsx`:
   - In `handleSeek` (around line 255):
     ```typescript
     const handleSeek = (e: Event) => {
       const customEvent = e as CustomEvent<{ id?: string; role?: string }>;
       if (customEvent.detail?.id) {
         setActiveSubagentId(customEvent.detail.id);
       } else if (customEvent.detail?.role) {
         // Fallback to role search if id was not yet captured
         setSubagentSearchQuery(customEvent.detail.role);
       }
       setShowSubagentsModal(true);
     };
     ```
   - In tool stream update (around line 1290):
     - Ensure `tc.name` is normalized: if `tc.name === '' && data.tool_call.name` is empty, check `data.tool_call.args?.Subagents` to infer `'invoke_subagent'`.

**Verify**: `npm run build --workspace=web` → compiles cleanly without errors.

---

### Step 6: Frontend Unit Tests in `web/src/components/ToolCallCard.test.tsx` and `web/src/components/TurnAnchor.test.tsx`

1. Create `web/src/components/ToolCallCard.test.tsx`:
   - Test: "renders subagent dispatch card for invoke_subagent tool call with stringified arguments"
     - Provide `toolCall` with `name: 'invoke_subagent'`, `args: { Subagents: '[{"Model":"inherit","Prompt":"test prompt","Role":"Code Auditor"}]' }`, `output: 'Created the following subagents:\n{\n  "conversationId": "sub-12345"\n}'`.
     - Verify `SUBAGENT` badge and `/Code Auditor` are in the document.
     - Verify prompt excerpt is displayed.
     - Verify `[SEEK SUBAGENT]` button is present.
   - Test: "extracts role from toolSummary when Role is omitted in Subagents argument"
     - Provide `args: { Subagents: '[{"Prompt":"do stuff"}]', toolSummary: '"Dispatch executor subagent for Plan 041"' }`.
     - Verify role text reflects `"Plan 041"`.
   - Test: "dispatches agy:seek-subagent custom event with conversationId on click"
     - Click `[SEEK SUBAGENT]`.
     - Verify custom event dispatched with `detail.id == 'sub-12345'`.

2. Update `web/src/components/TurnAnchor.test.tsx`:
   - Test: "renders subagent delegation card prominently in compact worklog mode"
     - Provide message with `toolCalls: [{ id: 'tc-sub', name: 'invoke_subagent', args: { Subagents: '[{"Role":"Worker"}]' }, status: 'success' }]`.
     - Render `TurnAnchor` with `verbosityMode="compact"`.
     - Verify `subagent-dispatch-card` is rendered even when worklog is collapsed.
   - Test: "renders subagent badge in turn header"
     - Verify `1 SUBAGENT` badge is present in header.

**Verify**: `npm run test --workspace=web -- ToolCallCard TurnAnchor` → all tests pass.

## Test plan

- **Go Backend**:
  - Files: `internal/routes/conversations_test.go`, `internal/agy/parser_test.go`
  - Tests:
    1. `GENERIC` step immediately following `PLANNER_RESPONSE` populates tool call `Output` and preserves `conversationId`.
    2. Missing tool call `Id` is populated with a unique index-based ID.
    3. `step_update` with `tool_info.name` correctly populates `ToolCall.Name`.
    4. `su.State == "ERROR"` correctly sets `ToolCall.Status == "error"`.
  - Commands:
    - `go test -v ./internal/routes -run TestConversations`
    - `go test -v ./internal/agy -run TestParseStream`

- **Frontend React**:
  - Files: `web/src/components/ToolCallCard.test.tsx`, `web/src/components/TurnAnchor.test.tsx`
  - Tests:
    1. Subagent dispatch card renders from double-stringified JSON arguments.
    2. Role fallback resolves from `toolSummary` or `toolAction` when omitted in `Subagents`.
    3. `[SEEK SUBAGENT]` button triggers `agy:seek-subagent` with conversation ID.
    4. Compact worklog mode keeps subagent delegation cards persistently visible.
  - Command: `npm run test --workspace=web -- ToolCallCard TurnAnchor`

- **Full Suite Verification**:
  - `npm run build:go`
  - `npm run build --workspace=web`

## Done criteria

- [ ] `GET /api/agy/conversations/:id/messages` correlates `GENERIC` steps to preceding `PLANNER_RESPONSE` tool calls, populating `toolCalls[].output` with subagent conversation IDs.
- [ ] `internal/agy/parser.go` normalizes tool names from both `su.ToolName` and `su.ToolInfo.Name`, and maps error states cleanly.
- [ ] `ToolCallCard.tsx` parses double-serialized and case-variant `Subagents` parameters without failing.
- [ ] `ToolCallCard.tsx` derives subagent roles from `toolSummary` or `toolAction` when `Role` is omitted in the argument object.
- [ ] `TurnAnchor.tsx` prominently renders subagent delegation cards in both `compact` (worklog) and `transparent` (stream) modes.
- [ ] `TurnAnchor.tsx` displays live running subagent telemetry during streaming (e.g. `EXECUTING // DELEGATE SUBAGENT > role`).
- [ ] Clicking `[SEEK SUBAGENT]` passes the extracted subagent conversation ID to `agy:seek-subagent`.
- [ ] `go test -v ./internal/routes -run TestConversations` exits 0.
- [ ] `go test -v ./internal/agy -run TestParseStream` exits 0.
- [ ] `npm run test --workspace=web -- ToolCallCard TurnAnchor` exits 0.
- [ ] `npm run build:go` and `npm run build --workspace=web` exit 0.
- [ ] No files outside the in-scope list are modified (`git status`).

## STOP conditions

Stop and report back (do not improvise) if:
- `git diff --stat d8a09a8..HEAD` shows unexpected drift in `internal/routes/conversations.go` or `web/src/components/TurnAnchor.tsx`.
- Brain transcript formats differ significantly from the `step_index`, `type`, and `content` patterns documented in Current State.
- Vitest or Go test suite fails for reasons unrelated to subagent tool rendering.

## Maintenance notes

- In Antigravity CLI, `invoke_subagent` is an asynchronous dispatch tool that produces an immediate confirmation with child conversation metadata. The actual child execution runs in a separate process in `~/.gemini/antigravity-cli/brain/<child-id>/`.
- Future enhancements to multi-agent teamwork may stream child subagent step updates directly back into parent stream sockets; ensuring tool ID and conversation ID pairing here forms the prerequisite foundation for that capability.
