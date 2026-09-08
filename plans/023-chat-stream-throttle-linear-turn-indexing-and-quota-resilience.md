# Plan 023: Chat Streaming High-Frequency Throttle, Linear Turn Indexing, and Quota-Resilient Persistence

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat df89ea7..HEAD -- web/src/components/AiChatView.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/022-global-keyboard-navigation-modal-accessibility-and-shortcut-unification.md
- **Category**: perf | dx | tests
- **Planned at**: commit `df89ea7`, 2026-09-08

## Why this matters

During streaming responses in `AiChatView`, synchronous `localStorage.setItem` is invoked on every single frame/delta update via `useEffect([messages])`. Because `localStorage.setItem` is synchronous and blocking in web browsers, serializing the entire message history on every token causes significant UI stuttering, dropped frames, and high CPU/battery consumption on mobile devices. If a conversation exceeds the browser's 5MB quota, it fails silently and throws on every token. Furthermore, when rendering message history, `AiChatView` executes `messages.slice(0, idx + 1).filter((m) => m.role === 'assistant')` inside the message map loop, resulting in $O(N^2)$ array allocations on every render. Debouncing persistence, providing quota fallback, linearizing turn indexing to $O(N)$, and adding automated test coverage resolves this major performance bottleneck.

## Current state

- `web/src/components/AiChatView.tsx:475-490`: Synchronous `localStorage.setItem` coupled with scroll animation:
```tsx
  useEffect(() => {
    try {
      localStorage.setItem(`chat-messages-${sessionId}`, JSON.stringify(messages));
    } catch {
      // quota exceeded
    }

    if (isAtBottomRef.current) {
      const raf = requestAnimationFrame(() => {
        scrollToBottom(false);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, scrollToBottom, sessionId]);
```
- `web/src/components/AiChatView.tsx:1882`: $O(N^2)$ slice and filter in render loop:
```tsx
const turnIndex = messages.slice(0, idx + 1).filter((m) => m.role === 'assistant').length - 1;
```
- No existing unit test file covers `AiChatView` persistence and rendering logic.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `npm test`               | all pass            |
| Build     | `npm run build`          | exit 0              |

## Scope

**In scope**:
- `web/src/components/AiChatView.tsx`
- `web/src/components/AiChatView.test.tsx` (create)
- `plans/README.md`

**Out of scope**:
- Changing the backend `/api/sessions/:id/conversations` API.
- Altering markdown syntax parsing in `MarkdownRenderer.tsx`.

## Step-by-step implementation

### Step 1: Linearize turn indexing in message rendering
1. In `web/src/components/AiChatView.tsx`:
   - Replace the $O(N^2)$ `messages.slice(0, idx + 1).filter(...)` call inside `messages.map`.
   - Maintain a running assistant turn counter before or within the mapping function:
     ```tsx
     {(() => {
       let assistantCounter = 0;
       return messages.map((msg) => {
         const isUser = msg.role === 'user';
         const turnIndex = isUser ? -1 : assistantCounter++;
         // ... render TurnAnchor with turnIndex
       });
     })()}
     ```
   - This eliminates quadratic array slicing and memory allocation on every render.

### Step 2: Separate auto-scroll and debounced quota-safe persistence
1. In `web/src/components/AiChatView.tsx`:
   - Split the combined effect into two dedicated effects:
     - Effect 1 (Auto-scroll): Triggers `scrollToBottom(false)` via RAF when `messages` changes, decoupled from storage.
     - Effect 2 (Persistence): Debounced via `setTimeout` (1000ms when `isStreaming` is active, 200ms when idle).
   - Implement `safeSaveMessages(sessionId, messages)`:
     - Attempts `localStorage.setItem(key, JSON.stringify(messages))`.
     - On error (`QuotaExceededError`), falls back to trimming history to the latest 50 messages so recent turns remain persisted.

### Step 3: Add unit test coverage in `AiChatView.test.tsx`
1. Create `web/src/components/AiChatView.test.tsx`:
   - Test that message history is persisted in `localStorage` when debounced timer fires.
   - Test that streaming state debounces storage writes appropriately.
   - Test quota fallback behavior when `localStorage.setItem` throws.

### Step 4: Verification, Build, and Documentation
1. Run `npm test` to ensure all tests pass.
2. Run `npm run build` to verify clean build.
3. Update `plans/README.md` marking Plan 023 as `DONE`.
4. Commit changes with message: `perf(chat): stream persistence debounce, quota resilience, and linear turn indexing`.

## Verification gates

```bash
# Gate 1: All unit tests pass including new AiChatView tests
npm test

# Gate 2: Full build succeeds
npm run build
```

## STOP conditions

- If `safeSaveMessages` alters message format expected by `localStorage.getItem`, stop and align schema.
- If test environment lacks `localStorage` mock, configure mock in Vitest setup.
