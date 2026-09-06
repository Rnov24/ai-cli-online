# Plan 014: High-Frequency Stream Batching & Conversation Index Performance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b03c93a..HEAD -- web/src/components/AiChatView.tsx internal/routes/conversations.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b03c93a`, 2026-09-06

## Why this matters

During active AI generation, SSE text chunks arrive from the Go runner at high frequencies (50–100 chunks per second). Currently, `AiChatView.tsx` executes `setMessages` and maps across the entire message array on every single delta, triggering continuous React re-renders that drop animation frame rates and drain mobile battery. Concurrently, `GET /api/agy/conversations` scans every line of every historical `transcript.jsonl` in `~/.gemini/antigravity-cli/brain/` from start to finish on every request, blocking the Go HTTP worker on devices with many historical sessions. Batching stream chunks to display refresh frames (via `requestAnimationFrame`) and optimizing conversation log reads to head/tail reads with pagination eliminates rendering jank and reduces list latency by >85%.

## Current state

- `web/src/components/AiChatView.tsx:1144-1150`: In the SSE reader loop, every `chunk` event directly calls `setMessages((prev) => prev.map(...))` with no batching or throttling.
- `internal/routes/conversations.go:113-176`: `ListConversations` iterates through all directory entries, opens `transcript.jsonl`, and scans every line with `bufio.NewScanner` to parse every single JSON line up to EOF.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend Tests | `npm run test --workspace=web` | all pass, exit 0 |
| Go Tests | `go test -v ./internal/routes/...` | PASS, exit 0 |
| All Tests | `npm test` | all pass, exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `web/src/components/AiChatView.tsx`
- `internal/routes/conversations.go`
- `internal/routes/conversations_test.go`

**Out of scope**:
- Direct terminal PTY streaming.
- Markdown parser implementation (`MarkdownRenderer.tsx`).
- Chat message journal schema in SQLite.

## Git workflow

- Branch: `advisor/014-stream-batching-and-conversation-perf`
- Commit message convention: `perf(chat): <description>`

## Steps

### Step 1: Implement `requestAnimationFrame` Chunk Batching in `AiChatView.tsx`
1. Open `web/src/components/AiChatView.tsx`.
2. Add accumulator and animation frame refs inside `AiChatView`:
   ```typescript
   const pendingDeltaRef = useRef<string>('');
   const rafFlushTimerRef = useRef<number | null>(null);
   ```
3. In `handleSendPrompt` (around line 1144):
   Instead of calling `setMessages` on every `data.delta`, accumulate and flush:
   ```typescript
   if (data.event === 'chunk' && data.delta) {
     setAgentState('EXECUTING');
     pendingDeltaRef.current += data.delta;

     if (rafFlushTimerRef.current === null) {
       rafFlushTimerRef.current = requestAnimationFrame(() => {
         rafFlushTimerRef.current = null;
         const deltaToFlush = pendingDeltaRef.current;
         if (!deltaToFlush) return;
         pendingDeltaRef.current = '';
         setMessages((prev) =>
           prev.map((m) =>
             m.id === assistantId
               ? { ...m, content: m.content + deltaToFlush, turnStatus: 'running' }
               : m,
           ),
         );
       });
     }
   }
   ```
4. On reader completion (`while (true)` exits) or error:
   Ensure any leftover `pendingDeltaRef.current` is flushed synchronously:
   ```typescript
   if (rafFlushTimerRef.current !== null) {
     cancelAnimationFrame(rafFlushTimerRef.current);
     rafFlushTimerRef.current = null;
   }
   if (pendingDeltaRef.current) {
     const leftover = pendingDeltaRef.current;
     pendingDeltaRef.current = '';
     setMessages((prev) =>
       prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + leftover } : m)),
     );
   }
   ```
5. In component unmount cleanup:
   Ensure `cancelAnimationFrame(rafFlushTimerRef.current)` is called if active.

**Verify**: `npm run test --workspace=web` → exits 0.

### Step 2: Optimize `ListConversations` with Bounded Reads and Pagination in `conversations.go`
1. Open `internal/routes/conversations.go`.
2. In `ListConversations`:
   - Parse `limit` and `offset` query parameters (default limit 30, max 100).
   - Collect candidate conversation directory entries and sort by `os.Stat(logFile).ModTime()` descending *before* reading contents.
   - Slice entries to requested `limit + 1` so only the top candidate logs are read from disk.
   - For each candidate log file:
     - Read the first 50 lines to quickly extract `createdAt` and the initial `USER_INPUT` title.
     - Stop scanning once the first user prompt is found and turn count estimate is initialized, or if the file is large, read the tail block (last 8KB) to extract `lastResponse` without parsing middle tool call turns.
3. Open `internal/routes/conversations_test.go`:
   - Add a test verifying `ListConversations` honors `?limit=5` and returns properly formatted summaries.

**Verify**: `go test -v ./internal/routes/...` → exits 0.

## Test plan

- `npm run test --workspace=web`:
  - Run full vitest suite, confirming chat view rendering and streaming mocks pass without regression.
- `internal/routes/conversations_test.go`:
  - Verify conversation summaries with various log sizes and limit parameters.
- Regression check:
  - `npm test`: All tests pass.

## Done criteria

- [ ] `npm test` exits 0.
- [ ] `go test -v ./internal/routes/...` exits 0.
- [ ] Chat streaming batches chunks to 60fps RAF windows instead of per-packet updates.
- [ ] `ListConversations` does not scan unbounded JSON lines across all historical files.

## STOP conditions

- If `requestAnimationFrame` is undefined in test/jsdom environment, ensure fallback to `setTimeout(..., 16)`.
- If conversation title extraction misses multi-line prompts, stop and report.

## Maintenance notes

- Future streaming event handlers should leverage the RAF accumulator pattern to protect React component trees from network frame bursts.
