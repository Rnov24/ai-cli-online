# Plan 005: Remediate UI/UX Component Responsiveness and Overlapping Across Viewports

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 57da430..HEAD -- web/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `57da430`, 2026-09-05

## Why this matters

AGY Online runs across varied device viewports: mobile screens (360px–480px), tablets / iPad splits (768px–1024px), laptops (1280px–1440px), and wide monitors. Currently, several key layout components suffer from overlapping text, colliding buttons, clipped popovers, and conflicting z-indexes. Specifically, the top telemetry header smashes into the workspace selector at intermediate widths (769px–1024px), the workspace dropdown clips past the viewport boundary on mobile, simultaneous opening of sidebars crushes the central AI command stream below usable widths (<200px), and dialog modals collide with drawer backdrops due to an inverted z-index scale (`z-index: 500` modal vs `z-index: 600` drawer). Resolving these responsive flaws ensures seamless development on mobile, tablet, and desktop without visual degradation or clipped controls.

## Current state

The audited hotspots causing layout overlaps across viewports:

1. **`web/src/components/SystemHeader.tsx` (Lines 57–220, 260–350)**:
   - Header is fixed `height: 38px`, `overflow: hidden`, `display: flex`, `justifyContent: space-between`.
   - `.desktop-only` is governed strictly by `@media (max-width: 768px)` in `web/src/index.css:2096`. On viewports between 769px and 1024px (tablets, split windows), telemetry items (`SYS:ONLINE`, PID, Memory, Latency, Font controls, Help, ⌘K, Model badge) are all rendered alongside the centered `MISSION // {name}` (`maxWidth: 280px`) and `WorkspaceSelector`. The combined width exceeds 820px, causing the center section to collide with the left telemetry and right button controls.

2. **`web/src/components/WorkspaceSelector.tsx` (Lines 200–218)**:
   - Popover dropdown has `position: 'absolute'`, `top: '100%'`, `left: 0`, `width: '320px'`.
   - Because `WorkspaceSelector` is centered in the header, on viewports < 640px, `left: 0` causes the right side of the 320px popover to extend past the right screen boundary, clipping the `+ Add Workspace` button. Additionally, it uses arbitrary `zIndex: 9999`.

3. **`web/src/components/AiChatView.tsx` (Lines 1092–1240 and 2030–2132)**:
   - Header bar (`COMMAND STREAM //`, role badge, state badge, CID badge, Tri-Mode selector, HTML Export, Clear button, Diagnostics button) has `minHeight: 28px` with no text contraction on narrow containers.
   - Dock footer (`Lines 2030-2132`): When streaming prompts with active text, `+ QUEUE`, `⚡ STEER`, and `⏹ STOP` (minHeight 30px) render alongside `[/] COMMANDS` and `? GUIDE`. In containers < 420px wide, the left buttons collide and overlap with the right action buttons.

4. **`web/src/components/TerminalPane.tsx` (Lines 296–335)**:
   - Desktop split for secondary panels (`filesOpen || planOpen || gitHistoryOpen`) allocates `width: planWidthPercent%` with `minWidth: 220px`.
   - If `ContextPanel` (320px) is open on the right and `SessionSidebar` (340px) is open on the left on screens <= 1280px, the central pane is reduced to < 440px. A secondary pane allocation of 220px leaves the chat timeline with < 200px width.

5. **`web/src/index.css` & Modal Z-Index Scale**:
   - `CommandPalette` & `ShortcutsModal` use `.cmd-palette-backdrop` with `z-index: 500`.
   - Mobile drawers (`NavigationRail`, `SessionSidebar`, `ContextPanel`) use `z-index: 600` / `601`.
   - Modals are improperly rendered behind open mobile drawers.
   - `SystemDiagnosticsModal.tsx:66` specifies a hardcoded `height: '520px'`, which overflows mobile landscape viewports (< 450px height).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Build     | `npm run build`          | exit 0, bundle built|
| Typecheck | `npx tsc -b`             | exit 0, no errors   |
| Tests     | `npm test`               | all tests pass      |

## Scope

**In scope**:
- `web/src/index.css` (introduce standardized `--z-*` design tokens, intermediate tablet `@media (max-width: 1024px)` rules, and container query/flex utility classes)
- `web/src/components/SystemHeader.tsx` (responsive element contraction on 769px–1024px, auto-truncating mission badge, collapsible telemetry)
- `web/src/components/WorkspaceSelector.tsx` (responsive dropdown alignment: clamp to `max-width: calc(100vw - 20px)`, right-aligned or centered popover on small screens, standardized z-index)
- `web/src/components/AiChatView.tsx` (responsive header action buttons: icon-only on narrow containers, wrapping dock footer to prevent button collision)
- `web/src/components/SystemDiagnosticsModal.tsx` (replace hardcoded `520px` height with `height: min(520px, calc(100dvh - 32px))` and `maxHeight: calc(100dvh - 32px)`)
- `web/src/components/TerminalPane.tsx` (auto-stacking secondary pane into full overlay when container width is below 560px)

**Out of scope**:
- No modifications to Go backend routes or terminal PTY emulation logic.
- No changes to SQLite schema or database migrations.
- No changes to `shared/src/types.ts` communication protocols.

## Implementation Steps

### Step 1: Establish Standardized Z-Index Token Hierarchy in `web/src/index.css`

1. Open `web/src/index.css` and declare the standardized z-index tokens under `:root`:
   ```css
   --z-base: 1;
   --z-header: 30;
   --z-split-resizer: 40;
   --z-drawer-backdrop: 500;
   --z-drawer: 510;
   --z-modal-backdrop: 700;
   --z-modal: 710;
   --z-popover: 800;
   --z-toast: 900;
   ```
2. Update `.cmd-palette-backdrop` from `z-index: 500` to `z-index: var(--z-modal-backdrop, 700)`.
3. Add tablet responsive classes:
   ```css
   @media (max-width: 1024px) {
     .tablet-hide {
       display: none !important;
     }
     .tablet-shrink {
       max-width: 160px !important;
     }
   }
   ```
4. **Verification**: Run `npm run build --workspace=web`. Confirm exit 0.

### Step 2: Remediate `SystemHeader.tsx` Overlapping on Tablet and Split Viewports

1. In `web/src/components/SystemHeader.tsx`:
   - Add `.tablet-hide` to the PID/Memory details (`PID:...` and RSS memory text) while keeping the compact status dot and `SYS:ONLINE`.
   - Add `.tablet-hide` to font size stepper (`A- / A+`) and command palette trigger `⌘K` (which is already accessible via ☰ or Cmd+K shortcut).
   - Constrain the center mission name container with `maxWidth: clamp(120px, 20vw, 220px)` and ensure `text-overflow: ellipsis`.
   - Wrap the latency indicator with `.tablet-hide` on < 1024px.
2. **Verification**: Run `npm run build --workspace=web`. Confirm exit 0.

### Step 3: Fix `WorkspaceSelector.tsx` Dropdown Popover Bounds & Z-Index

1. In `web/src/components/WorkspaceSelector.tsx:200-218`:
   - Replace fixed `left: 0` with dynamic boundary positioning:
     ```tsx
     position: 'absolute',
     top: '100%',
     left: 'auto',
     right: 0,
     marginTop: '4px',
     width: 'min(320px, calc(100vw - 24px))',
     maxHeight: 'min(440px, calc(100dvh - 60px))',
     zIndex: 'var(--z-popover, 800)',
     ```
   - Add an invisible full-screen backdrop click dismisser `<div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setIsOpen(false)} />` inside the popover wrapper.
2. **Verification**: Run `npm run build --workspace=web`. Confirm exit 0.

### Step 4: Fix `AiChatView.tsx` Command Header and Dock Footer Collisions

1. In `web/src/components/AiChatView.tsx`:
   - In the Command Header (`lines 1092-1240`):
     - Wrap the Tri-Mode Presentation selector, Export, and Diagnostics labels so text labels hide on narrow viewports while icons/acronyms remain clickable.
     - Add `flexShrink: 0` to the right-side control group and `minWidth: 0` to the left-side status badges.
   - In the Dock Footer (`lines 2030-2132`):
     - Replace rigid single-row flex with flex-wrap: `flexWrap: 'wrap'`, `gap: '6px'`.
     - Ensure the right-side buttons (`+ QUEUE`, `STEER`, `STOP`, `SEND`) maintain proper min-touch targets without overflowing into the prompt hint text.
2. **Verification**: Run `npm run build --workspace=web`. Confirm exit 0.

### Step 5: Prevent Secondary Panel Squashing in `TerminalPane.tsx`

1. In `web/src/components/TerminalPane.tsx`:
   - Add a container width observer or breakpoint check: when the pane width drops below `560px` (due to simultaneous open sidebars), automatically treat secondary panels (`filesOpen || planOpen || gitHistoryOpen`) as full overlay panels rather than rigid horizontal splits.
2. **Verification**: Run `npm run build --workspace=web`. Confirm exit 0.

### Step 6: Fix `SystemDiagnosticsModal.tsx` Viewport Clamping

1. In `web/src/components/SystemDiagnosticsModal.tsx:64-75`:
   - Replace `height: '520px'` with `height: 'min(520px, calc(100dvh - 32px))'` and `maxHeight: 'calc(100dvh - 32px)'`.
   - Update `zIndex: 9999` to `zIndex: 'var(--z-modal, 710)'` and backdrop to `var(--z-modal-backdrop, 700)`.
2. **Verification**: Run `npm run build --workspace=web`. Confirm exit 0.

### Step 7: Final Full Test Suite & Build Verification

1. Run the full test suite:
   ```bash
   npm test
   ```
   Confirm all web tests and Go backend tests pass.
2. Run the production build:
   ```bash
   npm run build
   ```
   Confirm `vite build` finishes cleanly and `bin/ai-cli-online` is compiled.

## STOP conditions

- If modifying CSS breaks existing Vitest component snapshots in `CommandPalette.test.tsx` or `HelpGuideModal.test.tsx`, STOP and adjust the responsive classes without changing rendered DOM element hierarchies.
- If TypeScript reports missing properties or type errors in `usePanelResize` or terminal pane interfaces, STOP and report.
- Do not touch backend Go files; this remediation is strictly scoped to frontend layout and CSS.

## Maintenance note

Future UI components added to the header or split panes must use the standardized `--z-*` CSS variables and `.desktop-only` / `.tablet-hide` utility classes. Do not use hardcoded numeric z-indexes like `9999`.
