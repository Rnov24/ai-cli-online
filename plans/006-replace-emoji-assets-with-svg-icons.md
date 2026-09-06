# Plan 006: Replace Emoji-Based UI Assets with Unified SVG Icon System

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

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `57da430`, 2026-09-05

## Why this matters

AGY Online currently uses raw Unicode emojis (e.g., `🏠`, `📁`, `🤖`, `💻`, `⚡`, `🩺`, `📋`, `🎯`, `🌿`, `⚙`) as UI icons across headers, navigation rails, dropdowns, and chat headers. Emojis render inconsistently across operating systems and browsers (Termux/Android, Linux VPS, macOS, Windows, iOS), frequently displaying as missing character boxes (`▯`) or distorted monochrome glyphs on systems without full color emoji fonts installed. Furthermore, colorful cartoonish emojis clash with AGY Online's dark cyberpunk / monospace terminal design language. Replacing all UI emojis with a unified, zero-dependency SVG vector icon set ensures pixel-perfect cross-platform consistency, crisp scaling, seamless CSS theme color inheritance (`currentColor`), and proper accessibility (`aria-hidden="true"` and accessible labels).

## Current state

The audited components using emoji characters as UI icons:

1. **`web/src/components/WorkspaceSelector.tsx`**:
   - `L199`: `<span style={{ fontSize: '12px' }}>{isHome ? '🏠' : '📁'}</span>`
   - `L401`: `<span>🏠</span>`
   - `L422`: `{isActive && <span style={{ color: 'var(--accent-cyan)' }}>✓</span>}`
   - `L461`: `<span>📁</span>`
   - `L483`: `{isActive && <span style={{ color: 'var(--accent-blue)' }}>✓</span>}`
   - `L505`: `<button ...>✕</button>`

2. **`web/src/components/NavigationRail.tsx`**:
   - `L244`: `<span style={{ fontSize: '13px' }}>⌁</span>` (Tasks & Plan)
   - `L271`: `<span style={{ fontSize: '13px' }}>◇</span>` (Files Explorer)
   - `L298`: `<span style={{ fontSize: '13px' }}>🌿</span>` (Git History)
   - `L344`: `<span style={{ fontSize: '12px' }}>⚙</span>` (Settings)
   - `L373`: `<span style={{ fontSize: '13px' }}>?</span>` (Help & Guide)
   - `L400`: `<span style={{ fontSize: '12px' }}>⎋</span>` (Logout)
   - `L101`: `✕` (Close mobile drawer)

3. **`web/src/components/AiChatView.tsx`**:
   - `L1202`: `<span>{isHome ? '🤖' : '💻'}</span>` (Persona Badge)
   - `L1270`: `<span>{mode === 'worklog' ? '📋' : mode === 'transparent' ? '⚡' : '🎯'}</span>` (Tri-Mode Selector)
   - `L1291`: `<span>🩺</span>` (Diagnostics Button)
   - `L1310`: `<span>⤓</span>` (Export Button)
   - `L1335`: `<span>🗑</span>` (Clear History Button)

4. **`web/src/components/SessionSidebar.tsx`**:
   - `L44`: `✓ DONE`, `L50`: `✕ ERROR`, `L56`: `⏳ WAITING` (Status Badges)
   - `L156`: `✎` (Edit Session Name)
   - `L205`, `L418`: `🗑` (Delete Session Button)
   - `L484`: `<span>{copiedId ? '✓' : '⧉'}</span>` (Copy CID Button)
   - `L859`: `📜 AGY Conversations`
   - `L877`: `📑 Panes & Tabs`

5. **`web/src/components/WorkspaceFilesPanel.tsx`**:
   - `L300`: `<span>{entry.type === 'directory' ? '📁' : '📄'}</span>`
   - `L403`: `{isSaving ? 'Saving...' : '💾 Save'}`
   - `L416`: `✓ Saved`
   - `L427`: `✏️ Edit`
   - `L436`: `{isMobile ? '← Back' : '✕ Close'}`

6. **`web/src/components/PlanPanel.tsx`**:
   - `L465`: `📁 Files`
   - `L481`: `✏️ Document`
   - `L538`: `📋` (AiTasks empty state icon)
   - `L600`: `📁 Browse Files`

7. **`web/src/components/SystemDiagnosticsModal.tsx`**:
   - `L127`: `<span>🩺</span>`
   - `L156`: `✕`
   - `L230`: `⚡ MEMORY FOOTPRINT`
   - `L263`: `🖥️ SYSTEM & RUNTIME`

8. **`web/src/components/SettingsModal.tsx` & `ShortcutsModal.tsx`**:
   - `L33`: `⚙`, `L62`: `✕`, `L107`: `🌙 MECHA DARK` / `☀ INDUSTRIAL LIGHT`
   - `ShortcutsModal.tsx`: `🚀 QUICK START`, `⚡ SLASH COMMANDS`, `🧩 SKILLS`, `⌨️ KEYBOARD SHORTCUTS`, `🏠`, `📁`

9. **`web/src/components/SystemHeader.tsx` & `TerminalPane.tsx`**:
   - `SystemHeader.tsx`: `☰` (Menu), `🔍` (Command Palette Search), `🌙`/`☀` (Theme Toggle)
   - `TerminalPane.tsx`: `⌁ Tasks`, `🌿 Git`, `✕ Close`

10. **`web/src/components/InteractiveClarifyModal.tsx`**:
    - `L101`: `<span>{isPermission ? '🛡️' : '❓'}</span>`
    - `L122`: `✕`

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Build     | `npm run build`          | exit 0, bundle built|
| Typecheck | `npm run build --workspace=web` | exit 0, no errors|
| Tests     | `npm test`               | all tests pass      |

## Scope

**In scope**:
- `web/src/components/icons/index.tsx` (Create unified, zero-dependency SVG icon system)
- `web/src/components/icons/Icons.test.tsx` (Create unit test suite verifying icon renders and attributes)
- `web/src/components/WorkspaceSelector.tsx`
- `web/src/components/NavigationRail.tsx`
- `web/src/components/SystemHeader.tsx`
- `web/src/components/AiChatView.tsx`
- `web/src/components/SessionSidebar.tsx`
- `web/src/components/WorkspaceFilesPanel.tsx`
- `web/src/components/PlanPanel.tsx`
- `web/src/components/SystemDiagnosticsModal.tsx`
- `web/src/components/SettingsModal.tsx`
- `web/src/components/ShortcutsModal.tsx`
- `web/src/components/TerminalPane.tsx`
- `web/src/components/InteractiveClarifyModal.tsx`
- `web/src/components/ToolCallCard.tsx`
- `web/src/components/TurnAnchor.tsx`
- `web/src/components/ResponsiveLayout.test.tsx` (Update test expectations targeting replaced icons)

**Out of scope**:
- No additions to `package.json` dependencies (no external icon packages like `lucide-react` or `heroicons` — all icons must be pure React SVG components).
- Do not modify user markdown rendering in `web/src/components/MarkdownRenderer.tsx` (user chat text containing emojis remains untouched).
- No changes to Go backend files or SQLite database schemas.

## Git workflow

- Branch: `advisor/006-replace-emoji-assets-with-svg-icons`
- Commit per logical unit; message style: `feat(ui): replace emoji assets with svg icons in <component>`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create Zero-Dependency SVG Icon System in `web/src/components/icons/index.tsx`

1. Create directory `web/src/components/icons/`.
2. Create `web/src/components/icons/index.tsx` declaring clean, accessible React SVG icons.
   Each icon must:
   - Accept standard `IconProps`: `size?: number | string`, `className?: string`, `style?: React.CSSProperties`, `color?: string`, `title?: string`.
   - Default to `size = 14`, `fill = "none"`, `stroke = "currentColor"`, `strokeWidth = 2`, `strokeLinecap = "round"`, `strokeLinejoin = "round"`, `aria-hidden = "true"`.
   - Provide standard viewBox (`0 0 24 24` or `0 0 16 16`).
3. Include the following icons:
   - **Navigation & Workspace**:
     - `HomeIcon` (replaces `🏠`)
     - `FolderIcon` (replaces `📁`)
     - `FileIcon` / `FileTextIcon` (replaces `📄`)
     - `GitBranchIcon` (replaces `🌿`)
     - `TaskPulseIcon` / `ActivityIcon` (replaces `⌁`)
     - `SettingsIcon` (replaces `⚙`)
     - `HelpIcon` (replaces `?` / `❓`)
     - `LogoutIcon` (replaces `⎋`)
     - `MenuIcon` (replaces `☰`)
     - `SearchIcon` (replaces `🔍`)
     - `SunIcon` (replaces `☀`)
     - `MoonIcon` (replaces `🌙`)
   - **Actions & States**:
     - `CheckIcon` (replaces `✓`)
     - `CloseIcon` / `CrossIcon` (replaces `✕`)
     - `EditIcon` (replaces `✎` / `✏️`)
     - `TrashIcon` (replaces `🗑`)
     - `SaveIcon` (replaces `💾`)
     - `CopyIcon` (replaces `⧉`)
     - `HourglassIcon` (replaces `⏳`)
     - `DownloadIcon` (replaces `⤓`)
   - **Personas, AI & Supervision**:
     - `RobotIcon` (replaces `🤖`)
     - `TerminalWindowIcon` / `LaptopIcon` (replaces `💻`)
     - `BoltIcon` (replaces `⚡`)
     - `WorklogIcon` / `ClipboardIcon` (replaces `📋`)
     - `TargetIcon` (replaces `🎯`)
     - `StethoscopeIcon` (replaces `🩺`)
     - `ShieldIcon` (replaces `🛡️`)
     - `ScrollIcon` (replaces `📜`)
     - `TabsIcon` (replaces `📑`)
     - `RocketIcon` (replaces `🚀`)
     - `PuzzleIcon` (replaces `🧩`)
     - `KeyboardIcon` (replaces `⌨️`)
     - `DesktopScreenIcon` (replaces `🖥️`)
4. **Verify**: Run `npx tsc --noEmit -p web/tsconfig.json` → exit 0.

---

### Step 2: Replace Emojis in `WorkspaceSelector.tsx`, `NavigationRail.tsx`, and `SystemHeader.tsx`

1. In `web/src/components/WorkspaceSelector.tsx`:
   - Import `HomeIcon`, `FolderIcon`, `CheckIcon`, `CloseIcon` from `./icons`.
   - Replace `isHome ? '🏠' : '📁'` with `{isHome ? <HomeIcon size={13} /> : <FolderIcon size={13} />}`.
   - Replace `{isActive && <span>✓</span>}` with `{isActive && <CheckIcon size={14} color="var(--accent-cyan)" />}`.
   - Replace delete button text `✕` with `<CloseIcon size={12} />`.
2. In `web/src/components/NavigationRail.tsx`:
   - Import `TaskPulseIcon`, `FolderIcon`, `GitBranchIcon`, `SettingsIcon`, `HelpIcon`, `LogoutIcon`, `CloseIcon` from `./icons`.
   - Replace `⌁` with `<TaskPulseIcon size={14} />`.
   - Replace `◇` with `<FolderIcon size={14} />`.
   - Replace `🌿` with `<GitBranchIcon size={14} />`.
   - Replace `⚙` with `<SettingsIcon size={14} />`.
   - Replace `⎋` with `<LogoutIcon size={14} />`.
   - Replace drawer close `✕` with `<CloseIcon size={14} />`.
3. In `web/src/components/SystemHeader.tsx`:
   - Import `MenuIcon`, `SearchIcon`, `SunIcon`, `MoonIcon` from `./icons`.
   - Replace `☰` with `<MenuIcon size={14} />`.
   - Replace `🔍` with `<SearchIcon size={11} />`.
   - Replace theme toggle `{theme === 'dark' ? '☀' : '🌙'}` with `{theme === 'dark' ? <SunIcon size={13} /> : <MoonIcon size={13} />}`.
4. **Verify**: Run `npm run build --workspace=web` → exit 0.

---

### Step 3: Replace Emojis in `AiChatView.tsx`, `ToolCallCard.tsx`, and `TurnAnchor.tsx`

1. In `web/src/components/AiChatView.tsx`:
   - Import `RobotIcon`, `LaptopIcon`, `ClipboardIcon`, `BoltIcon`, `TargetIcon`, `StethoscopeIcon`, `DownloadIcon`, `TrashIcon` from `./icons`.
   - Replace `isHome ? '🤖' : '💻'` with `{isHome ? <RobotIcon size={13} /> : <LaptopIcon size={13} />}`.
   - Replace Tri-Mode selector emojis `{mode === 'worklog' ? '📋' : mode === 'transparent' ? '⚡' : '🎯'}` with:
     ```tsx
     {mode === 'worklog' ? <ClipboardIcon size={11} /> : mode === 'transparent' ? <BoltIcon size={11} /> : <TargetIcon size={11} />}
     ```
     Add `data-testid={`mode-${mode}`}` or `aria-label={`presentation-mode-${mode}`}` to the buttons.
   - Replace `<span>🩺</span>` with `<StethoscopeIcon size={12} />`.
   - Replace `<span>⤓</span>` with `<DownloadIcon size={12} />`.
   - Replace `<span>🗑</span>` with `<TrashIcon size={12} />`.
2. In `web/src/components/ToolCallCard.tsx`:
   - Replace `✕ FAILED` with `<CloseIcon size={11} /> FAILED`.
   - Replace `✓ COPIED` with `<CheckIcon size={11} /> COPIED`.
3. In `web/src/components/TurnAnchor.tsx`:
   - Replace `✓ COPIED` with `<CheckIcon size={11} /> COPIED`.
   - Replace `⚡ WORKLOG SUMMARY` with `<BoltIcon size={12} /> WORKLOG SUMMARY`.
4. **Verify**: Run `npm run build --workspace=web` → exit 0.

---

### Step 4: Replace Emojis in `SessionSidebar.tsx`, `WorkspaceFilesPanel.tsx`, `PlanPanel.tsx`, and `TerminalPane.tsx`

1. In `web/src/components/SessionSidebar.tsx`:
   - Replace status badge text with SVG icons: `✓ DONE` -> `<CheckIcon size={10} /> DONE`, `✕ ERROR` -> `<CloseIcon size={10} /> ERROR`, `⏳ WAITING` -> `<HourglassIcon size={10} /> WAITING`.
   - Replace `✎` (edit) with `<EditIcon size={11} />`.
   - Replace `🗑` (delete) with `<TrashIcon size={11} />`.
   - Replace `copiedId ? '✓' : '⧉'` with `{copiedId ? <CheckIcon size={10} /> : <CopyIcon size={10} />}`.
   - Replace `📜 AGY Conversations` with `<ScrollIcon size={12} /> AGY Conversations`.
   - Replace `📑 Panes & Tabs` with `<TabsIcon size={12} /> Panes & Tabs`.
2. In `web/src/components/WorkspaceFilesPanel.tsx`:
   - Replace `entry.type === 'directory' ? '📁' : '📄'` with `{entry.type === 'directory' ? <FolderIcon size={13} color="var(--accent-blue)" /> : <FileIcon size={13} />}`.
   - Replace `💾 Save` with `<SaveIcon size={11} /> Save`.
   - Replace `✓ Saved` with `<CheckIcon size={11} /> Saved`.
   - Replace `✏️ Edit` with `<EditIcon size={11} /> Edit`.
   - Replace `✕ Close` with `<CloseIcon size={11} /> Close`.
3. In `web/src/components/PlanPanel.tsx`:
   - Replace `📁 Files` with `<FolderIcon size={12} /> Files`.
   - Replace `✏️ Document` with `<EditIcon size={12} /> Document`.
   - Replace empty state `📋` with `<ClipboardIcon size={24} color="var(--accent-amber-bright)" />`.
   - Replace `📁 Browse Files` with `<FolderIcon size={12} /> Browse Files`.
4. In `web/src/components/TerminalPane.tsx`:
   - Replace `⌁ Tasks` with `<TaskPulseIcon size={12} /> Tasks`.
   - Replace `🌿 Git` with `<GitBranchIcon size={12} /> Git`.
   - Replace `✕` and `✕ CLOSE` with `<CloseIcon size={12} />`.
5. **Verify**: Run `npm run build --workspace=web` → exit 0.

---

### Step 5: Replace Emojis in Modals (`InteractiveClarifyModal.tsx`, `SystemDiagnosticsModal.tsx`, `SettingsModal.tsx`, `ShortcutsModal.tsx`)

1. In `web/src/components/InteractiveClarifyModal.tsx`:
   - Replace `isPermission ? '🛡️' : '❓'` with `{isPermission ? <ShieldIcon size={14} color="var(--accent-red)" /> : <HelpIcon size={14} color="var(--accent-cyan)" />}`.
   - Replace close button `✕` with `<CloseIcon size={14} />`.
2. In `web/src/components/SystemDiagnosticsModal.tsx`:
   - Replace `<span>🩺</span>` with `<StethoscopeIcon size={14} />`.
   - Replace close button `✕` with `<CloseIcon size={14} />`.
   - Replace `⚡ MEMORY FOOTPRINT` with `<BoltIcon size={13} /> MEMORY FOOTPRINT`.
   - Replace `🖥️ SYSTEM & RUNTIME` with `<DesktopScreenIcon size={13} /> SYSTEM & RUNTIME`.
3. In `web/src/components/SettingsModal.tsx`:
   - Replace header `⚙` with `<SettingsIcon size={14} />`.
   - Replace close button `✕` with `<CloseIcon size={14} />`.
   - Replace `{theme === 'dark' ? '🌙 MECHA DARK' : '☀ INDUSTRIAL LIGHT'}` with:
     ```tsx
     {theme === 'dark' ? <><MoonIcon size={12} /> MECHA DARK</> : <><SunIcon size={12} /> INDUSTRIAL LIGHT</>}
     ```
   - Replace `⎋ DISCONNECT` with `<LogoutIcon size={12} /> DISCONNECT`.
4. In `web/src/components/ShortcutsModal.tsx`:
   - Replace category emojis (`🚀`, `⚡`, `🧩`, `⌨️`) with `<RocketIcon size={13} />`, `<BoltIcon size={13} />`, `<PuzzleIcon size={13} />`, `<KeyboardIcon size={13} />`.
   - Replace modal close `✕` with `<CloseIcon size={14} />`.
   - Replace `<span>🏠</span>` and `<span>📁</span>` with `<HomeIcon size={16} />` and `<FolderIcon size={16} />`.
5. **Verify**: Run `npm run build --workspace=web` → exit 0.

---

### Step 6: Create Unit Test Suite & Update Test Assertions

1. Create `web/src/components/icons/Icons.test.tsx`:
   - Test that each SVG icon renders with valid SVG elements (`<svg>`, `<path>` / `<rect>` / `<circle>`).
   - Test that `size`, `className`, and `color` props propagate to the SVG element.
   - Verify all icons set `aria-hidden="true"`.
2. In `web/src/components/ResponsiveLayout.test.tsx`:
   - Lines 272-282 & 563-566 currently assert `expect(screen.getByText('📋')).toBeInTheDocument()`. Update these assertions to query by presentation mode role/button or data-testid (e.g. `screen.getByTitle(/presentation mode to worklog/i)` or `screen.getByRole('button', { name: /worklog/i })`).
   - Line 610 currently asserts `expect(screen.getByRole('button', { name: '✕' }))`. Update to query the close button by title/aria-label or container.
3. **Verify**: Run `npx vitest run src/components/icons/Icons.test.tsx src/components/ResponsiveLayout.test.tsx` → exit 0.

---

### Step 7: Final End-to-End Test Suite & Production Build Verification

1. Run the full test suite:
   ```bash
   npm test
   ```
   Confirm all Vitest test suites and Go backend suites pass with 0 failures.
2. Run the production build:
   ```bash
   npm run build
   ```
   Confirm Vite bundle builds with 0 errors and `bin/ai-cli-online` compiles cleanly.

---

## Test plan

- **New test file**: `web/src/components/icons/Icons.test.tsx` verifying:
  - Rendering of all icons with standard `size`, `color`, and `className` props.
  - Presence of `aria-hidden="true"` on decorative icons.
- **Updated test file**: `web/src/components/ResponsiveLayout.test.tsx` verifying:
  - Header actions and Tri-Mode presentations render correctly without relying on raw emoji strings.
- **Regression checks**:
  - `CommandPalette.test.tsx`, `GitHistoryPanel.test.tsx`, `HelpGuideModal.test.tsx` continue to pass without regression.

## Done criteria

- [ ] `web/src/components/icons/index.tsx` exists with all required icons.
- [ ] No hardcoded UI emoji assets remain in `WorkspaceSelector.tsx`, `NavigationRail.tsx`, `AiChatView.tsx`, `SessionSidebar.tsx`, `WorkspaceFilesPanel.tsx`, `PlanPanel.tsx`, `SystemDiagnosticsModal.tsx`, `SettingsModal.tsx`, `ShortcutsModal.tsx`, `TerminalPane.tsx`.
- [ ] `npm run build` exits 0 with no TypeScript or bundling errors.
- [ ] `npm test` exits 0 across all 11+ test files.
- [ ] `plans/README.md` status row for Plan 006 is updated.

## STOP conditions

- If an SVG path fails to scale or distorts in layout containers, STOP and adjust the `viewBox` rather than falling back to emoji.
- If replacing text in buttons causes unexpected text wrapping in narrow viewports, STOP and inspect container flex rules.
- Do not install any external npm icon packages (`lucide-react`, `heroicons`, etc.) — if an external package seems necessary, STOP and report.
- Do not modify user message markdown rendering in `MarkdownRenderer.tsx`.

## Maintenance notes

- Any future UI component that needs an icon should import from `web/src/components/icons` rather than using emoji characters.
- All icons should use `stroke="currentColor"` or `fill="currentColor"` so they adapt automatically to parent color and CSS theme variables.
