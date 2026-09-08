# Plan 022: Global Keyboard Navigation, Modal Accessibility, and Shortcut Unification

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 35d060f..HEAD -- web/src/App.tsx web/src/components/AiChatView.tsx web/src/components/CommandPalette.tsx web/src/components/ShortcutsModal.tsx web/src/components/NavigationRail.tsx web/src/components/SkillsManagementModal.tsx web/src/components/PluginsModal.tsx web/src/components/PersonaSelectorModal.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/021-file-streaming-resilience-binary-preview-and-adaptive-sync.md
- **Category**: dx | bug | human
- **Planned at**: commit `35d060f`, 2026-09-08

## Why this matters

A direct keyboard shortcut collision currently exists between `AutoTaskModal` (`Alt+A` registered in `App.tsx`) and `PersonaSelectorModal` (`Alt+A` registered in `AiChatView.tsx`), causing both dialogs to fight or open simultaneously. Furthermore, key system modals (`SkillsManagementModal`, `PluginsModal`, `PersonaSelectorModal`) are trapped inside `AiChatView` local state and cannot be opened via hotkeys when a user navigates to the Tasks, Files, or Git panels. These modals also lack native `Escape` key listeners, trapping keyboard-only and mobile users who cannot dismiss them with standard modal escape behavior. Unifying global hotkeys (`Alt+M` for Mindset/Persona, `Alt+A` for Auto-Task, `Alt+S` for Skills, `Alt+P` for Plugins) across `App.tsx` and adding consistent Escape key listeners eliminates collisions and delivers polished, accessible desktop and mobile workflows.

## Current state

- `web/src/App.tsx:196-202`: Registers `Alt+A` for `AutoTaskModalOpen(true)`:
```tsx
// Alt+A: Open Autonomous Task Lifecycle Loop Modal
if (e.altKey && e.key.toLowerCase() === 'a') {
  e.preventDefault();
  setAutoTaskModalOpen(true);
  return;
}
```
- `web/src/components/AiChatView.tsx:280-283`: Also registers `Alt+A` for `setShowPersonaModal`:
```tsx
} else if (e.altKey && (e.key === 'a' || e.key === 'A')) {
  e.preventDefault();
  setShowPersonaModal((prev) => !prev);
}
```
- `web/src/components/CommandPalette.tsx:163, 373`: Shows duplicate `⌥A` shortcut for both `/auto` dialog and `/agents` persona switch.
- `web/src/components/SkillsManagementModal.tsx`, `web/src/components/PluginsModal.tsx`, `web/src/components/PersonaSelectorModal.tsx`: Render modal overlays with backdrop click handlers, but lack window `Escape` keydown listeners.
- `web/src/components/ShortcutsModal.tsx:242-255`: Does not list `Alt+A`, `Alt+S`, `Alt+P`, or `Alt+M` in the global shortcuts index.
- `web/src/components/NavigationRail.tsx:339-365`: Provides button for `Skills Hub (⌥S)`, but does not have entries for `Plugins (⌥P)` or `Personas (⌥M)`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `npm test`               | all pass            |
| Build     | `npm run build`          | exit 0              |

## Scope

**In scope**:
- `web/src/App.tsx`
- `web/src/components/AiChatView.tsx`
- `web/src/components/CommandPalette.tsx`
- `web/src/components/CommandPalette.test.tsx`
- `web/src/components/ShortcutsModal.tsx`
- `web/src/components/NavigationRail.tsx`
- `web/src/components/SkillsManagementModal.tsx`
- `web/src/components/PluginsModal.tsx`
- `web/src/components/PersonaSelectorModal.tsx`
- `plans/README.md`

**Out of scope**:
- Direct terminal PTY key event handling in `TerminalPane.tsx` (xterm key interception remains isolated).
- Modifying backend `/api/personas` or `/api/plugins` endpoints.

## Step-by-step implementation

### Step 1: Resolve shortcut collision and update CommandPalette
1. In `web/src/components/AiChatView.tsx`:
   - Change `Alt+A` to `Alt+M` (Mindset / Multi-Persona / Model):
     ```tsx
     } else if (e.altKey && (e.key === 'm' || e.key === 'M')) {
       e.preventDefault();
       setShowPersonaModal((prev) => !prev);
     }
     ```
2. In `web/src/components/CommandPalette.tsx`:
   - Update `cmd-switch-persona` shortcut property from `⌥A` to `⌥M`.
   - Update `CommandPalette.test.tsx` if any assertions check for `⌥A` on persona switch.

### Step 2: Elevate modal shortcuts to top-level `App.tsx`
1. In `web/src/App.tsx`:
   - In the global `handleKeyDown` listener, add global hotkeys:
     - `Alt+S`: `window.dispatchEvent(new CustomEvent('agy:open-skills-modal'))`
     - `Alt+P`: `window.dispatchEvent(new CustomEvent('agy:open-plugins-modal'))`
     - `Alt+M`: `window.dispatchEvent(new CustomEvent('agy:open-persona-modal'))`
   - In the `Escape` handler in `App.tsx`, verify closing behaviors and ensure events propagate cleanly.

### Step 3: Add Escape key listeners to modals
1. In `web/src/components/SkillsManagementModal.tsx`:
   - Add `useEffect` on `isOpen`:
     ```tsx
     useEffect(() => {
       if (!isOpen) return;
       const handleKey = (e: KeyboardEvent) => {
         if (e.key === 'Escape') onClose();
       };
       window.addEventListener('keydown', handleKey);
       return () => window.removeEventListener('keydown', handleKey);
     }, [isOpen, onClose]);
     ```
2. In `web/src/components/PluginsModal.tsx`:
   - Add identical `useEffect` for `Escape` dismissal when `isOpen` is true.
3. In `web/src/components/PersonaSelectorModal.tsx`:
   - Add identical `useEffect` for `Escape` dismissal when `isOpen` is true.

### Step 4: Update ShortcutsModal and NavigationRail
1. In `web/src/components/ShortcutsModal.tsx`:
   - In `SHORTCUTS`, add entries:
     - `{ key: '⌥A / Alt+A', desc: 'Open Autonomous Task Lifecycle Loop (/auto)', category: 'GLOBAL' }`
     - `{ key: '⌥S / Alt+S', desc: 'Open Skills & Capabilities Hub', category: 'GLOBAL' }`
     - `{ key: '⌥P / Alt+P', desc: 'Open Antigravity Plugins Manager', category: 'GLOBAL' }`
     - `{ key: '⌥M / Alt+M', desc: 'Switch Agent Persona & Mindset (/agents)', category: 'GLOBAL' }`
2. In `web/src/components/NavigationRail.tsx`:
   - Under `SYSTEM //`, add buttons for:
     - `Plugins (⌥P)` (`agy:open-plugins-modal`)
     - `Personas (⌥M)` (`agy:open-persona-modal`)
   - Ensure icons, styling, tooltips, and mobile behavior match existing rail items.

### Step 5: Verification, Build, and Documentation
1. Run `npm test` to ensure all tests pass.
2. Run `npm run build` to verify clean typescript compilation and bundle creation.
3. Update `plans/README.md` marking Plan 022 as `DONE`.
4. Commit changes with message: `feat(ui): global keyboard navigation, modal escape accessibility, and shortcut unification`.

## Verification gates

```bash
# Gate 1: All unit tests pass
npm test

# Gate 2: Full TypeScript check, bundle compilation, and Go build
npm run build
```

## STOP conditions

- If an existing test expects `Alt+A` to specifically trigger persona selection, pause and verify test alignment.
- If TypeScript compilation fails on missing icon or prop types, stop and check exports in `icons/index.tsx`.
