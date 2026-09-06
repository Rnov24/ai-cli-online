# Plan 010: Synchronize Color Palettes and Eliminate Theme Desynchronization Across Components

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0c519ee..HEAD -- web/src/index.css web/src/components/ToolCallCard.tsx web/src/components/PersonaSelectorModal.tsx web/src/components/PluginsModal.tsx web/src/components/InteractiveClarifyModal.tsx web/src/components/SystemDiagnosticsModal.tsx web/src/components/SkillsManagementModal.tsx web/src/components/TurnAnchor.tsx web/src/components/AiChatView.tsx web/src/components/ShortcutsModal.tsx web/src/components/CommandPalette.tsx web/src/components/WorkspaceSelector.tsx web/src/components/NavigationRail.tsx web/src/hooks/useMermaidRender.ts web/src/utils/gitGraph.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0c519ee`, 2026-09-06

## Why this matters

AGY Online features a dual-theme design system: **Futuristic Mecha Dark** (`#08090b`) and **Industrial Workstation Lab Light** (`#f0f2f5`). However, several key components suffered from severe color palette desynchronization:
1. Components (`PersonaSelectorModal`, `PluginsModal`, `WorkspaceSelector`) reference CSS variables (`--bg-card`, `--border-color`, `--bg-surface`, `--bg-input`, `--border-hover`) that were never defined in `index.css`. In Light Mode, these fall back to hardcoded near-black colors while rendering near-black text (`#0f172a`), causing a **1.05:1 contrast failure** where text and search inputs are completely invisible.
2. `ToolCallCard.tsx` hardcodes `backgroundColor: '#050608'` with `color: var(--text-primary)`, which in Light Mode renders black text on a pitch-black container (**1.15:1 contrast ratio**), making telemetry output completely unreadable.
3. Buttons in `SkillsManagementModal`, `TurnAnchor`, and `.jump-latest-btn:hover` hardcode text colors (`#000` on dark purple `#7c3aed` or `#fff` on light gray `#e2e8f0`), resulting in severe WCAG contrast violations or vanishing text on hover.
4. Hardcoded dark-mode pastel accents (`#c084fc`, `#60a5fa`, `#f87171`) are scattered across `AiChatView`, `ShortcutsModal`, `CommandPalette`, and `WorkspaceSelector`, washing out to near-illegibility in Light Mode.

Executing this plan synchronizes all color tokens across themes, repairs contrast failures to meet WCAG AA standards (>= 4.5:1), and ensures components render cohesively in both Dark and Light modes.

## Current state

- Relevant files and their roles:
  - `web/src/index.css` — Core design system tokens for `:root, [data-theme="dark"]` and `[data-theme="light"]`, plus global button, badge, and markdown styles.
  - `web/src/components/ToolCallCard.tsx` — Renders shell command execution lines and telemetry outputs. Currently hardcodes `#050608` for pre boxes.
  - `web/src/components/PersonaSelectorModal.tsx` & `web/src/components/PluginsModal.tsx` — Management modals for agent roles and Antigravity plugins. Currently use undefined `--bg-card`, `--border-color`, `--bg-surface`, `--bg-input`.
  - `web/src/components/InteractiveClarifyModal.tsx` & `web/src/components/SystemDiagnosticsModal.tsx` — Tool approval and supervision modals. Currently contain hardcoded `#000` / GitHub Dark fallbacks.
  - `web/src/components/SkillsManagementModal.tsx` & `web/src/components/TurnAnchor.tsx` — Custom actions and tri-mode stream selector. Currently hardcode `#000` text on dark accents.
  - `web/src/components/AiChatView.tsx`, `web/src/components/ShortcutsModal.tsx`, `web/src/components/CommandPalette.tsx`, `web/src/components/WorkspaceSelector.tsx` — Use hardcoded pastels (`#c084fc`, `#60a5fa`) instead of CSS variables.
  - `web/src/hooks/useMermaidRender.ts` & `web/src/utils/gitGraph.ts` — External diagram visualizers with TokyoNight or low-contrast light lane lines.

- Code excerpts of current defects:

  1. `web/src/components/ToolCallCard.tsx:223, 276-278`:
     ```tsx
     backgroundColor: '#050608',
     border: '1px solid var(--border)',
     color: toolCall.status === 'error' ? 'var(--accent-red)' : 'var(--text-primary)',
     ```
     In Light Mode, `var(--text-primary)` is `#0f172a`, rendering `#0f172a` text on `#050608` background (1.15:1 contrast).

  2. `web/src/components/PersonaSelectorModal.tsx:215-216, 296, 330`:
     ```tsx
     backgroundColor: 'var(--bg-card, #12151c)',
     border: '1px solid var(--border-color, #232a3b)',
     ...
     backgroundColor: 'var(--bg-surface, #0f1219)',
     ...
     backgroundColor: 'var(--bg-input, #0b0d13)',
     color: 'var(--text-primary, #e2e8f0)',
     ```
     `--bg-card`, `--border-color`, `--bg-surface`, `--bg-input` do not exist in `web/src/index.css`. In Light Mode, background falls back to `#0f1219` / `#0b0d13` while text becomes `#0f172a` (near-black on near-black).

  3. `web/src/index.css:100-113`:
     ```css
     [data-theme="light"] {
       --accent-amber: #d97706;
       --accent-amber-bright: #b45309;
       --accent-green: #059669;
       --accent-green-bright: #10b981;
       --accent-cyan: #0891b2;
       --accent-cyan-bright: #06b6d4;
     ```
     In Light Mode, `--accent-green-bright` (`#10b981`) and `--accent-cyan-bright` (`#06b6d4`) are pale pastels with ~2.1:1 contrast on white background, whereas `--accent-amber-bright` was correctly given a dark high-contrast value (`#b45309`).

  4. `web/src/index.css:2279-2285`:
     ```css
     .jump-latest-btn:hover {
       background: var(--bg-hover);
       color: #fff;
     ```
     In Light Mode, `--bg-hover` is `#e2e8f0`. `#fff` text on `#e2e8f0` has **1.29:1 contrast**, disappearing entirely.

- Repo conventions to follow:
  - Colors are declared via CSS Custom Properties on `:root, [data-theme="dark"]` and `[data-theme="light"]` in `web/src/index.css`.
  - Component styles use standard CSS variables (`var(--token)`) without arbitrary ad-hoc hex codes.
  - Buttons use standard class names (`mecha-btn`, `mecha-btn--primary`, `mecha-btn--cyan`) or standard token variables.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` (in `web/`) | exit 0, no errors |
| Frontend Tests | `npm run test --workspace=web` | all pass (156+ tests) |
| All Tests | `npm run test` | all pass |
| Build | `npm run build` | exit 0, artifacts built |

## Scope

**In scope** (the only files you should modify):
- `web/src/index.css`
- `web/src/components/ToolCallCard.tsx`
- `web/src/components/PersonaSelectorModal.tsx`
- `web/src/components/PluginsModal.tsx`
- `web/src/components/InteractiveClarifyModal.tsx`
- `web/src/components/SystemDiagnosticsModal.tsx`
- `web/src/components/SkillsManagementModal.tsx`
- `web/src/components/TurnAnchor.tsx`
- `web/src/components/AiChatView.tsx`
- `web/src/components/ShortcutsModal.tsx`
- `web/src/components/CommandPalette.tsx`
- `web/src/components/WorkspaceSelector.tsx`
- `web/src/components/NavigationRail.tsx`
- `web/src/hooks/useMermaidRender.ts`
- `web/src/utils/gitGraph.ts`
- `web/src/theme.test.ts` (create automated theme consistency regression test)

**Out of scope** (do NOT touch, even though they look related):
- Go backend API handlers or routes (`internal/...`).
- Core PTY / terminal stream session protocols.
- Git graph traversal algorithm in `gitGraph.ts` (only modify `LANE_COLORS` palette array).
- Layout sizing / split pane dividers.

## Git workflow

- Branch: `advisor/010-color-palette-sync`
- Commit per step or per logical unit; message style: conventional commits (e.g. `fix(theme): declare missing CSS tokens and unify dark/light color palette`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Formalize and Declare Missing Theme Tokens in `web/src/index.css`

1. Open `web/src/index.css`. Under `:root, [data-theme="dark"]` (around line 30), add:
   ```css
   /* Semantic Card & Surface Aliases */
   --bg-card: var(--bg-tertiary);
   --bg-surface: var(--bg-secondary);
   --bg-input: var(--bg-primary);
   --border-color: var(--border);
   --border-hover: var(--border-strong);
   --btn-contrast-text: #08090b;
   --badge-overlay-bg: rgba(255, 255, 255, 0.08);
   ```

2. Under `[data-theme="light"]` (around line 80), add corresponding light values:
   ```css
   /* Semantic Card & Surface Aliases */
   --bg-card: #ffffff;
   --bg-surface: #f8fafc;
   --bg-input: #ffffff;
   --border-color: var(--border);
   --border-hover: var(--border-strong);
   --btn-contrast-text: #ffffff;
   --badge-overlay-bg: rgba(15, 23, 42, 0.08);

   /* Accessible text accents for light mode (WCAG AA >= 4.5:1 against light surfaces) */
   --accent-green-bright: #047857;  /* High-contrast emerald (darker for text on light bg) */
   --accent-cyan-bright: #0e7490;   /* High-contrast cyan (darker for text on light bg) */
   ```

3. Update `.jump-latest-btn:hover` (around line 2280):
   Change:
   ```css
   .jump-latest-btn:hover {
     background: var(--bg-hover);
     color: #fff;
     border-color: var(--accent-cyan-bright);
     transform: translateX(-50%) translateY(-1px);
     box-shadow: 0 6px 20px rgba(0, 0, 0, 0.65), 0 0 16px var(--accent-cyan-glow);
   }
   ```
   To:
   ```css
   .jump-latest-btn:hover {
     background: var(--bg-hover);
     color: var(--text-bright);
     border-color: var(--accent-cyan);
     transform: translateX(-50%) translateY(-1px);
     box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 0 16px var(--accent-cyan-glow);
   }
   ```

4. Remove duplicate definitions of `.code-block-wrapper`, `.code-block-header`, `.code-block-lang`, and `.code-copy-btn` in `index.css` (lines 1830-1870), consolidating them into the primary block (lines 1559-1599).

**Verify**: `npx tsc --noEmit` in `web/` → exits with code 0.

---

### Step 2: Fix Pitch-Black Containers in `web/src/components/ToolCallCard.tsx`

1. In `web/src/components/ToolCallCard.tsx`:
   - Replace line 223:
     `backgroundColor: '#050608',`
     With:
     `backgroundColor: 'var(--bg-primary)',`
   - Replace line 276:
     `backgroundColor: '#050608',`
     With:
     `backgroundColor: 'var(--bg-primary)',`
   - Ensure the command line text (`color: 'var(--accent-green-bright)'`) and telemetry text (`color: toolCall.status === 'error' ? 'var(--accent-red)' : 'var(--text-primary)'`) use theme-aware tokens against `var(--bg-primary)`.

**Verify**: Run `npm run test --workspace=web` → exits 0.

---

### Step 3: Synchronize Modals (`PersonaSelectorModal`, `PluginsModal`, `InteractiveClarifyModal`, `SystemDiagnosticsModal`)

1. In `web/src/components/PersonaSelectorModal.tsx` & `web/src/components/PluginsModal.tsx`:
   - Replace any hardcoded fallback `#232a3b` with `var(--border)` (or let `var(--border-color)` resolve to the newly declared token).
   - Replace any hardcoded fallback `#12151c` with `var(--bg-card)`.
   - Replace any hardcoded fallback `#0f1219` with `var(--bg-surface)`.
   - Replace any hardcoded fallback `#0b0d13` with `var(--bg-input)`.
   - Replace any hardcoded fallback `#e2e8f0` with `var(--text-primary)`.
   - Replace any hardcoded fallback `#94a3b8` with `var(--text-secondary)`.
   - In `PluginsModal.tsx:601`, change `backgroundColor: 'rgba(255, 255, 255, 0.08)'` to `backgroundColor: 'var(--badge-overlay-bg)'`.

2. In `web/src/components/InteractiveClarifyModal.tsx`:
   - Replace line 80: `backgroundColor: 'var(--bg-primary, #0d1117)'` with `backgroundColor: 'var(--bg-primary)'`.
   - Replace lines 81, 98, 157, 225, 244, 292: `var(--border, #30363d)` with `var(--border)`.
   - Replace lines 161, 226, 243: `var(--bg-secondary, #161b22)` with `var(--bg-secondary)`.
   - Replace line 187: `<pre style={{ backgroundColor: '#000', ... }}>` with `<pre style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)', ... }}>`.
   - Replace lines 276, 311: `color: '#000'` with `color: 'var(--btn-contrast-text)'`.

3. In `web/src/components/SystemDiagnosticsModal.tsx`:
   - Replace lines 106, 107, 123, 124, 170, 171, 229, 262, 307: Replace `#0d1117`, `#30363d`, `#161b22`, `#090d13` fallbacks with standard CSS variables: `var(--bg-primary)`, `var(--border)`, `var(--bg-secondary)`, `var(--bg-tertiary)`.
   - Replace lines 140, 154: `var(--text-muted, #8b949e)` with `var(--text-muted)`.

**Verify**: `npm run test --workspace=web` → exits 0.

---

### Step 4: Fix Button and Badge Text Contrast Across Components

1. In `web/src/components/SkillsManagementModal.tsx`:
   - Line 295: Change `color: active ? '#000' : 'var(--text-secondary)'` to `color: active ? 'var(--btn-contrast-text)' : 'var(--text-secondary)'`.
   - Line 371: Change `color: showScaffold ? '#000' : 'var(--accent-cyan)'` to `color: showScaffold ? 'var(--btn-contrast-text)' : 'var(--accent-cyan)'`.
   - Line 520: Change `color: '#000'` to `color: 'var(--btn-contrast-text)'`.
   - Line 706: Change `color: '#000'` to `color: 'var(--btn-contrast-text)'`.
   - Line 739: Change `color: 'var(--text-muted, #666)'` to `color: 'var(--text-muted)'`.

2. In `web/src/components/TurnAnchor.tsx`:
   - Lines 132, 148, 164: In the tri-mode selector (`WORKLOG`, `STREAM`, `ANSWER`), change:
     `color: activeMode === '...' ? '#000' : 'var(--text-muted)'`
     To:
     `color: activeMode === '...' ? 'var(--btn-contrast-text)' : 'var(--text-muted)'`

3. In `web/src/components/ShortcutsModal.tsx`:
   - Line 606: Change `color: selectedCategory === cat ? '#000' : 'var(--text-secondary)'` to `color: selectedCategory === cat ? 'var(--btn-contrast-text)' : 'var(--text-secondary)'`.
   - Line 739: In the Skills Hub trigger button (`backgroundColor: 'var(--accent-purple)'`), change `color: '#000'` to `color: 'var(--btn-contrast-text)'`.

**Verify**: `npm run test --workspace=web` → exits 0.

---

### Step 5: Replace Hardcoded Pastel Hex Colors with Semantic Theme Tokens

1. In `web/src/components/AiChatView.tsx`:
   - Lines 1445-1447:
     ```tsx
     backgroundColor: activePersona?.color
       ? 'var(--badge-overlay-bg)'
       : isHome ? 'var(--accent-purple-subtle, rgba(168, 85, 247, 0.15))' : 'rgba(59, 130, 246, 0.15)',
     color: activePersona ? activePersona.color : (isHome ? 'var(--accent-purple)' : 'var(--accent-blue)'),
     border: `1px solid ${activePersona?.color || (isHome ? 'var(--accent-purple)' : 'var(--accent-blue)')}`,
     ```
   - Line 1664:
     Change `color: isHome ? '#c084fc' : 'var(--accent-amber-bright)'` to `color: isHome ? 'var(--accent-purple)' : 'var(--accent-amber-bright)'`.
   - Line 2167:
     Change `sc.category === 'assistant' ? '#c084fc' : 'var(--accent-amber-bright)'` to `sc.category === 'assistant' ? 'var(--accent-purple)' : 'var(--accent-amber-bright)'`.

2. In `web/src/components/ShortcutsModal.tsx`:
   - Lines 465-473 (Home Directory card):
     Replace `#c084fc` with `'var(--accent-purple)'`.
     Replace `borderLeft: '4px solid #c084fc'` with `borderLeft: '4px solid var(--accent-purple)'`.
   - Lines 490-498 (Project Workspace card):
     Replace `#60a5fa` with `'var(--accent-blue)'`.
     Replace `borderLeft: '4px solid #60a5fa'` with `borderLeft: '4px solid var(--accent-blue)'`.
   - Lines 659-663:
     Replace `#c084fc` with `'var(--accent-purple)'`, and `#60a5fa` with `'var(--accent-blue)'`.

3. In `web/src/components/CommandPalette.tsx`:
   - Line 583:
     Replace `item.category === 'WORKSPACES' ? '#c084fc'` with `item.category === 'WORKSPACES' ? 'var(--accent-purple)'`.

4. In `web/src/components/WorkspaceSelector.tsx`:
   - Line 272: Replace `color: isHome ? '#c084fc' : '#60a5fa'` with `color: isHome ? 'var(--accent-purple)' : 'var(--accent-blue)'`.
   - Line 303: Replace `color: '#f87171'` with `color: 'var(--accent-red)'`.
   - Lines 462, 469, 484: Replace `#60a5fa` with `'var(--accent-blue)'`.

5. In `web/src/components/NavigationRail.tsx`:
   - Line 171: Change `color: 'var(--accent-green-bright)'` to `color: 'var(--accent-green)'` for the 9px "ACTIVE PROCESS" status badge to guarantee high contrast across viewports.

**Verify**: `npm run test --workspace=web` → exits 0.

---

### Step 6: Synchronize External Visualizers (`useMermaidRender.ts`, `gitGraph.ts`)

1. In `web/src/hooks/useMermaidRender.ts`:
   - Update `DARK_THEME_VARS` (lines 15-44) to match AGY Online Futuristic Mecha Dark palette:
     ```ts
     const DARK_THEME_VARS = {
       primaryColor: '#38bdf8',       // --accent-blue
       primaryTextColor: '#ffffff',   // --text-bright
       primaryBorderColor: '#363c46', // --border-strong
       lineColor: '#8b939e',          // --text-secondary
       secondaryColor: '#a855f7',     // --accent-purple
       tertiaryColor: '#121519',      // --bg-tertiary
       background: '#08090b',         // --bg-primary
       mainBkg: '#121519',            // --bg-tertiary
       nodeBorder: '#363c46',
       clusterBkg: '#0d0f12',         // --bg-secondary
       titleColor: '#e8ebef',         // --text-primary
       edgeLabelBackground: '#121519',
       gridColor: '#252a31',          // --border
       doneTaskBkgColor: '#10b981',   // --accent-green
       doneTaskBorderColor: '#059669',
       activeTaskBkgColor: '#f59e0b', // --accent-amber
       activeTaskBorderColor: '#fbbf24',
       critBkgColor: '#ef4444',       // --accent-red
       critBorderColor: '#dc2626',
       taskBkgColor: '#171b20',       // --bg-elevated
       taskBorderColor: '#252a31',
       taskTextColor: '#e8ebef',
       taskTextDarkColor: '#08090b',
       sectionBkgColor: '#0d0f12',
       sectionBkgColor2: '#121519',
       altSectionBkgColor: '#0d0f12',
       todayLineColor: '#f59e0b',
     };
     ```
   - Update `LIGHT_THEME_VARS` (lines 46-75) to match AGY Online Industrial Lab Light palette:
     ```ts
     const LIGHT_THEME_VARS = {
       primaryColor: '#0284c7',       // --accent-blue
       primaryTextColor: '#020617',   // --text-bright
       primaryBorderColor: '#94a3b8', // --border-strong
       lineColor: '#475569',          // --text-secondary
       secondaryColor: '#7c3aed',     // --accent-purple
       tertiaryColor: '#f8fafc',      // --bg-tertiary
       background: '#ffffff',         // --bg-secondary
       mainBkg: '#f8fafc',            // --bg-tertiary
       nodeBorder: '#94a3b8',
       clusterBkg: '#f0f2f5',         // --bg-primary
       titleColor: '#0f172a',         // --text-primary
       edgeLabelBackground: '#ffffff',
       gridColor: '#cbd5e1',          // --border
       doneTaskBkgColor: '#059669',   // --accent-green
       doneTaskBorderColor: '#047857',
       activeTaskBkgColor: '#d97706', // --accent-amber
       activeTaskBorderColor: '#b45309',
       critBkgColor: '#dc2626',       // --accent-red
       critBorderColor: '#b91c1c',
       taskBkgColor: '#ffffff',
       taskBorderColor: '#cbd5e1',
       taskTextColor: '#0f172a',
       taskTextDarkColor: '#ffffff',
       sectionBkgColor: '#f0f2f5',
       sectionBkgColor2: '#f8fafc',
       altSectionBkgColor: '#f0f2f5',
       todayLineColor: '#d97706',
     };
     ```

2. In `web/src/utils/gitGraph.ts`:
   - Update `LANE_COLORS` array (lines 3-12) to replace low-contrast light pastels (`#56d4dd`, `#00d9a3`) with tones that maintain >= 4.5:1 contrast against both Dark (`#08090b`) and Light (`#f0f2f5`) backgrounds:
     ```ts
     export const LANE_COLORS = [
       '#0284c7', // blue (main branch)
       '#c026d3', // fuchsia
       '#16a34a', // green
       '#ea580c', // orange
       '#7c3aed', // purple
       '#0891b2', // cyan (darkened from #56d4dd for light-bg contrast)
       '#dc2626', // red
       '#0d9488', // teal (darkened from #00d9a3 for light-bg contrast)
     ];
     ```

**Verify**: Run `npm run test --workspace=web` → exits 0 (including `src/utils/gitGraph.test.ts`).

---

### Step 7: Create Automated Theme Token and Contrast Regression Test

1. Create `web/src/theme.test.ts`:
   - Test 1: Reads `web/src/index.css` and verifies that all CSS custom properties defined under `:root, [data-theme="dark"]` are also declared under `[data-theme="light"]` and vice-versa.
   - Test 2: Verifies that semantic alias variables (`--bg-card`, `--border-color`, `--bg-surface`, `--bg-input`, `--border-hover`, `--btn-contrast-text`, `--badge-overlay-bg`) are present in both themes.
   - Test 3: Verifies that no component under `web/src/components` contains undefined `var(--...)` tokens.

**Verify**: `npx vitest run src/theme.test.ts` (in `web/`) → exits 0, all tests pass.

---

## Test plan

- Automated test file: `web/src/theme.test.ts`
  - Validates full parity between dark and light theme tokens.
  - Ensures no orphan CSS variable references exist in any `.tsx` component.
  - Pattern: Follow existing Vitest test files in `web/src/components/`.
- Verification command: `npm run test` (web + go) → all pass with 0 failures.

## Done criteria

- [ ] `web/src/index.css` defines `--bg-card`, `--border-color`, `--bg-surface`, `--bg-input`, `--border-hover`, `--btn-contrast-text`, and `--badge-overlay-bg` in both dark and light themes.
- [ ] In Light Theme, `ToolCallCard` renders telemetry and commands on `var(--bg-primary)` (`#f0f2f5`) with readable text (`#0f172a`), eliminating the black-on-black bug.
- [ ] `PersonaSelectorModal` and `PluginsModal` render on crisp light card/surface/input backgrounds in Light Mode without near-black fallbacks.
- [ ] Buttons with purple, cyan, and amber backgrounds use `var(--btn-contrast-text)` to maintain WCAG AA contrast in both themes.
- [ ] Hardcoded pastels (`#c084fc`, `#60a5fa`, `#f87171`) in `AiChatView`, `ShortcutsModal`, `CommandPalette`, and `WorkspaceSelector` are replaced with CSS tokens.
- [ ] `useMermaidRender.ts` and `gitGraph.ts` color definitions align with AGY Online mecha tokens and maintain contrast.
- [ ] `web/src/theme.test.ts` passes and runs as part of `npm test`.
- [ ] `npx tsc --noEmit` in `web/` exits 0 with 0 TypeScript errors.
- [ ] `plans/README.md` updated with Plan 010 row.

## STOP conditions

Stop and report back (do not improvise) if:
- Any file listed in Scope has drifted significantly from the line numbers/excerpts shown in Current State.
- Any change to CSS variables breaks existing component snapshot or DOM tests in `web/src/components/*.test.tsx`.
- The fix appears to require changes to Go backend binary or session management.

## Maintenance notes

- When creating new UI components or modals, always use CSS Custom Properties from `web/src/index.css` rather than hardcoding hex/rgb colors in inline styles.
- To inspect or verify color contrast across themes, toggle the theme in Settings (`/settings` or Settings modal) and inspect both dark (`data-theme="dark"`) and light (`data-theme="light"`).
