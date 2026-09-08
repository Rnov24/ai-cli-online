# Plan 026: Interactive Clarification Modal UX, Dual-Schema Question Resolution, and Modal Keyboard Accessibility

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f06b384..HEAD -- web/src/components/InteractiveClarifyModal.tsx web/src/components/SystemDiagnosticsModal.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/025-plan-panel-file-loading-resilience-and-annotation-sync.md
- **Category**: correctness | ui | accessibility
- **Planned at**: commit `f06b384`, 2026-09-08

## Why this matters

During autonomous and interactive agent workflows, agents frequently issue clarification prompts (`ask_question`) or request execution permissions (`ask_permission`). However, `InteractiveClarifyModal.tsx` currently only parses the multi-question schema (`args.questions`), failing to render single-question payloads (`args.question` + `args.options`). Additionally, pressing Enter in the custom response input does not submit the response, and pressing Escape or clicking outside the backdrop has no effect. Similarly, `SystemDiagnosticsModal.tsx` lacks Escape key dismissal and overlay click-to-close. Hardening question normalization, adding Enter submit, backdrop dismiss, Escape listeners, ARIA dialog attributes, and dedicated Vitest suites ensures responsive, accessible interaction across all device types.

## Current state

- `web/src/components/InteractiveClarifyModal.tsx:20-25`: Only parses `args.questions`:
```tsx
  const questions = (toolCall.args?.questions as Array<{
    question: string;
    options: string[];
    is_multi_select?: boolean;
  }>) || [];
```
If an agent outputs `{ question: "...", options: [...] }`, `questions` is empty and renders raw unparsed JSON.
- `web/src/components/InteractiveClarifyModal.tsx`: Missing Escape keydown listener and backdrop click handler.
- `web/src/components/InteractiveClarifyModal.tsx:217-233`: Text input does not submit on Enter.
- `web/src/components/SystemDiagnosticsModal.tsx`: Missing Escape keydown listener and backdrop click handler.
- Neither component has a Vitest unit test suite.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Unit test | `npm test`               | All Vitest and Go tests PASS |
| Build     | `npm run build`          | Exit code 0, TypeScript + Vite + Go binary compiled |

## Steps

### Step 1: Normalize question schemas in `InteractiveClarifyModal.tsx`

Update parameter parsing in `web/src/components/InteractiveClarifyModal.tsx`:
1. Accept `args.questions` array when present.
2. If `args.question` (string) and `args.options` (array) are provided at top-level, normalize into a single-question array.
3. Fall back gracefully to `args.prompt` or `args.message` if neither schema is present.

### Step 2: Implement keyboard shortcuts, Enter submission, and backdrop dismissal

In `web/src/components/InteractiveClarifyModal.tsx`:
1. Add window `keydown` listener for `Escape` to call `onDismiss()`.
2. Add `onKeyDown` on custom text input to call `handleSendQuestionResponse()` on `Enter` (when not Shift+Enter).
3. Add backdrop click handler (`e.target === e.currentTarget && onDismiss()`).
4. Add `role="dialog"`, `aria-modal="true"`, and `aria-label`.

### Step 3: Implement Escape listener and backdrop dismissal in `SystemDiagnosticsModal.tsx`

In `web/src/components/SystemDiagnosticsModal.tsx`:
1. Add window `keydown` listener for `Escape` when `isOpen` is true to call `onClose()`.
2. Add backdrop click handler (`e.target === e.currentTarget && onClose()`).
3. Add `role="dialog"`, `aria-modal="true"`, and `aria-label="System Diagnostics"`.

### Step 4: Add unit tests for both modals

1. Create `web/src/components/InteractiveClarifyModal.test.tsx` verifying:
   - Rendering multi-question schema.
   - Rendering single-question schema (`question` + `options`).
   - Selecting single vs multi options.
   - Submitting on Enter key in custom input.
   - Dismissing on Escape key and backdrop click.
   - Permission approval / denial workflow.
2. Create `web/src/components/SystemDiagnosticsModal.test.tsx` verifying:
   - Rendering system status, processes, and logs tabs.
   - Dismissing on Escape key and backdrop click.
   - Tab switching.

### Step 5: Verification and Build Gate

1. Run `npm test` — all web tests and Go tests must pass.
2. Run `npm run build` — full compile must succeed.
3. Update `plans/README.md` row 026 to `DONE`.

## Out of scope

- Changing backend `/api/system` endpoints.
- Modifying `AiChatView` streaming protocol.

## STOP conditions

- If existing tests fail unexpectedly.
