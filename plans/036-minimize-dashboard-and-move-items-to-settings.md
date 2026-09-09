# Plan 036: Minimize Dashboard Telemetry and Relocate Controls to Settings Modal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b03097..HEAD -- web/src/components/SystemHeader.tsx web/src/components/SettingsModal.tsx web/src/App.tsx web/src/components/ResponsiveLayout.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `6b03097`, 2026-09-09

## Why this matters

The top telemetry dashboard bar (`SystemHeader.tsx`) has accumulated 11+ disparate controls and telemetry readouts: live server memory & PID strings, session mission indicator, workspace directory selector, model badges, 4-bar latency graphs, user profile button, help button, search shortcut, font stepper buttons (`A- 14 A+`), theme toggle (`Sun/Moon`), and context panel toggle. On compact laptop viewports, split panes, and mobile screens, this causes excessive visual density, competing focal points, and horizontal crowding.

Furthermore, several of these controls (font size adjustments, theme switching, account profile switching, and full host telemetry) already exist inside the `SettingsModal.tsx`. By removing redundant steppers and secondary switches from the persistent header, condensing the system status to a clean compact status dot, and introducing a dedicated Settings (`⚙`) trigger, the header is streamlined to an austere, focused telemetry bar aligned with `DESIGN.md` and `antislop` guidelines while keeping all configuration easily accessible in the Settings menu.

## Current state

### 1. `web/src/components/SystemHeader.tsx`
- **Role**: Main persistent application header displaying branding, active mission, and top-level action buttons.
- **Props interface (`web/src/components/SystemHeader.tsx:8-21`)**:
  ```tsx
  interface SystemHeaderProps {
    systemStatus: SystemStatus | null;
    onOpenCommandPalette: () => void;
    onOpenHelp?: () => void;
    onOpenAccountSwitcher?: () => void;
    onToggleContextPanel: () => void;
    contextPanelOpen: boolean;
    onToggleMobileNav: () => void;
    activeSessionName?: string;
    cwd?: string | null;
    token?: string;
    activeSessionId?: string;
    onWorkspaceSwitched?: (newCwd: string, isHome: boolean, mode: 'agentic-assistant' | 'coding-agent') => void;
  }
  ```
  *(Missing `onOpenSettings?: () => void` prop)*.

- **System status readout (`web/src/components/SystemHeader.tsx:140-167`)**:
  ```tsx
  {systemStatus && (
    <div
      className="desktop-only"
      title={`PID: ${systemStatus.server.pid} | Uptime: ${systemStatus.server.uptime}s | Heap: ${systemStatus.server.memory.heapUsedMb}MB / RSS: ${systemStatus.server.memory.rssMb}MB`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 7px',
        borderRadius: '2px',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-primary)',
        fontSize: '10px',
        color: systemStatus.server.idle ? 'var(--text-secondary)' : 'var(--accent-green-bright)',
      }}
    >
      <span
        className={`pulse-dot ${systemStatus.server.idle ? 'pulse-dot--idle' : 'pulse-dot--online'}`}
      />
      <span>SYS:{systemStatus.server.idle ? 'STANDBY' : 'ONLINE'}</span>
      <span className="tablet-hide" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span className="tablet-hide" style={{ color: 'var(--text-muted)' }}>//</span>
        <span className="tablet-hide" style={{ color: 'var(--text-secondary)' }}>{systemStatus.server.memory.rssMb}MB</span>
        <span className="tablet-hide" style={{ color: 'var(--text-muted)' }}>//</span>
        <span className="tablet-hide" style={{ color: 'var(--text-muted)' }}>PID:{systemStatus.server.pid}</span>
      </span>
    </div>
  )}
  ```

- **Right controls (`web/src/components/SystemHeader.tsx:290-422`)**:
  Contains:
  - Account Profile button (`lines 291-315`)
  - Help button (`lines 318-341`)
  - Command Palette trigger (`lines 344-353`)
  - Font size stepper container (`lines 356-397`):
    ```tsx
    <div className="desktop-only tablet-hide" style={{ ... }}>
      <button onClick={() => setFontSize(Math.max(10, fontSize - 1))} ...>A−</button>
      <span>{fontSize}</span>
      <button onClick={() => setFontSize(Math.min(24, fontSize + 1))} ...>A+</button>
    </div>
    ```
  - Theme Switcher button (`lines 400-408`):
    ```tsx
    <button className="mecha-btn" onClick={toggleTheme} ...>
      {theme === 'dark' ? <SunIcon size={13} /> : <MoonIcon size={13} />}
    </button>
    ```
  - Context panel toggle button (`lines 411-421`)

### 2. `web/src/components/SettingsModal.tsx`
- **Role**: Central configuration dialog for themes, font sizes, telemetry, and profiles.
- **Current sections (`web/src/components/SettingsModal.tsx:77-274`)**:
  - `DISPLAY & APPEARANCE //`: Theme switcher (`lines 94-110`) and Font size stepper (`lines 112-154`).
  - `HOST RUNTIME TELEMETRY //`: PID, Uptime, RSS Memory, Tmux Sessions, Platform, Idle State (`lines 157-211`).
  - `SESSION CONTROL //`: Profile switcher trigger (`lines 230-249`) and Disconnect button (`lines 251-272`).

### 3. `web/src/App.tsx`
- **Role**: Root application shell mounting `SystemHeader`, modals, and workspace panels.
- **SystemHeader usage (`web/src/App.tsx:330-343`)**:
  Currently passes `onOpenCommandPalette`, `onOpenHelp`, `onOpenAccountSwitcher`, `onToggleContextPanel`, `onToggleMobileNav`, but does not pass `onOpenSettings`. `settingsModalOpen` and `setSettingsModalOpen` are already instantiated in state at `line 46`.

### 4. `web/src/components/ResponsiveLayout.test.tsx`
- **Role**: Responsive and breakpoint test suite.
- **Lines 162-202 & 616-645**: Specifically tests that `SystemHeader` hides PID/memory telemetry via `.tablet-hide` and tests font stepper presence with `container.querySelector('.desktop-only.tablet-hide')`. These tests will need updating once steppers are moved to Settings and the status dot is condensed.

### Design Direction & Antislop Constraints
From `DESIGN.md` and `.agents/skills/antislop/SKILL.md`:
- **Identity & Mood**: High-precision industrial workstation, avionics telemetry cockpit, austere, focused.
- **Dials**: ENERGY 2 (Balanced), RHYTHM 2 (Structured Modular), MOTION 1 (Calm, 0.15s max transitions).
- **Geometry**: Small disciplined radius (`2px` to `4px`). Pill-shaped buttons and inputs are strictly prohibited (R-11).
- **Icons**: Unified SVG stroke icons (`SettingsIcon`, `SunIcon`, `MoonIcon`, `UserIcon`, etc.). Emojis forbidden.
- **Mobile Resilience**: Minimum 44px touch targets on touch viewports (R-03). No horizontal overflow.
- **Antislop Timing**: Applies **during the work**.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Build shared | `npm run build --workspace=shared` | exit 0 |
| Typecheck | `npx tsc --noEmit` (in `web/`) | exit 0, no errors |
| Test single | `npx vitest run src/components/ResponsiveLayout.test.tsx` (in `web/`) | all pass |
| Test unit | `npx vitest run src/components/SystemHeader.test.tsx` (in `web/`) | all pass |
| Test all | `npm test` | exit 0, all 26+ test files pass |

## Suggested executor toolkit

- Use `antislop-ui` and `antislop-layoutmobile` principles: keep surfaces flat, borders 1px hairline (`var(--border)`), colors derived strictly from CSS variables, no floating soft shadows.

## Scope

**In scope** (the only files you should modify or create):
- `web/src/components/SystemHeader.tsx` (condense status indicator, remove font stepper/theme toggle/account button, add settings trigger)
- `web/src/components/SettingsModal.tsx` (enhance active profile presentation and link telemetry to diagnostics)
- `web/src/App.tsx` (pass `onOpenSettings` to `SystemHeader`)
- `web/src/components/ResponsiveLayout.test.tsx` (update assertions for condensed status indicator and header controls)
- `web/src/components/SystemHeader.test.tsx` (create unit test for new header structure and settings modal triggering)
- `plans/README.md` (update status row)

**Out of scope** (do NOT touch, even though they look related):
- Go backend files (`cmd/`, `internal/`)
- Terminal backend and PTY management (`TerminalPane.tsx`, `useTerminal.ts`)
- Chat editor and message streaming (`AiChatView.tsx`, `AiChatInput.tsx`)
- Task lifecycle skills or pipeline state (`TaskPipelineBar.tsx`, `AutoTaskModal.tsx`)

## Git workflow

- Branch: `advisor/036-minimize-dashboard-and-move-items-to-settings`
- Commit per logical unit:
  - `refactor(ui): minimize SystemHeader telemetry and add settings menu trigger`
  - `feat(ui): enhance SettingsModal profile and telemetry presentation`
  - `test(ui): update responsive layout tests and add SystemHeader test suite`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Update `SystemHeaderProps` and add `onOpenSettings`

1. Open `web/src/components/SystemHeader.tsx`.
2. In `interface SystemHeaderProps`, add:
   ```tsx
   onOpenSettings?: () => void;
   ```
3. In `SystemHeader` destructuring, add `onOpenSettings`.
4. Import `SettingsIcon` from `./icons` alongside the existing icon imports:
   ```tsx
   import { MenuIcon, SearchIcon, SettingsIcon } from './icons';
   ```
5. Remove unused `SunIcon`, `MoonIcon`, and `UserIcon` imports from `SystemHeader.tsx` if they are no longer referenced in the component.

**Verify**:
In `web/`: `npx tsc --noEmit` → exit 0.

---

### Step 2: Condense system status readout to a compact status dot indicator

1. In `web/src/components/SystemHeader.tsx`, locate the system status block (`lines 140-167`).
2. Replace the verbose horizontal string (`SYS:ONLINE // 14MB // PID:1234`) with a compact, clean status indicator:
   ```tsx
   {systemStatus && (
     <button
       type="button"
       className="mecha-btn desktop-only"
       onClick={() => {
         if (onOpenSettings) onOpenSettings();
       }}
       title={`SYS: ${systemStatus.server.idle ? 'STANDBY' : 'ONLINE'} | PID: ${systemStatus.server.pid} | RSS: ${systemStatus.server.memory.rssMb}MB | Uptime: ${systemStatus.server.uptime}s (Click for Settings & Diagnostics)`}
       aria-label={`System status: ${systemStatus.server.idle ? 'Standby' : 'Online'}`}
       style={{
         display: 'inline-flex',
         alignItems: 'center',
         gap: '5px',
         padding: '2px 6px',
         fontSize: '10px',
         cursor: 'pointer',
       }}
     >
       <span
         className={`pulse-dot ${systemStatus.server.idle ? 'pulse-dot--idle' : 'pulse-dot--online'}`}
       />
       <span style={{ fontWeight: 600, color: systemStatus.server.idle ? 'var(--text-secondary)' : 'var(--accent-green-bright)' }}>
         SYS:{systemStatus.server.idle ? 'STANDBY' : 'ONLINE'}
       </span>
     </button>
   )}
   ```
3. Notice:
   - The redundant secondary text (`// 14MB // PID:1234`) is removed from the persistent header.
   - The compact badge retains the live pulse dot and status code (`SYS:ONLINE` / `SYS:STANDBY`).
   - Clicking the status badge directly triggers `onOpenSettings` (or diagnostics), allowing the user to view full telemetry on demand without cluttering the persistent bar.

**Verify**:
In `web/`: `npx tsc --noEmit` → exit 0.

---

### Step 3: Remove Font Stepper, Theme Switcher, and Account Switcher from header & add Settings Button

1. In `web/src/components/SystemHeader.tsx`, in the right controls container (`lines 238-422`):
   - **Remove** the Account Profile Switcher button (`lines 290-315`).
   - **Remove** the Font size adjustment container (`lines 356-397`).
   - **Remove** the Theme Switcher button (`lines 400-408`).
   - Note: Unused Zustand store hooks in `SystemHeader` (`fontSize`, `setFontSize`, `theme`, `toggleTheme`) can be cleaned up to avoid unnecessary re-renders.
2. Add a dedicated **Settings** button in the header right controls, placed before the Context toggle:
   ```tsx
   {/* System Settings Modal Trigger */}
   <button
     className="mecha-btn"
     onClick={() => {
       if (onOpenSettings) {
         onOpenSettings();
       } else {
         window.dispatchEvent(new CustomEvent('agy:open-settings'));
       }
     }}
     title="System Settings & Diagnostics (Display, Theme, Font, Telemetry)"
     aria-label="Open system settings"
     style={{
       padding: '3px 8px',
       fontSize: '11px',
       minHeight: '28px',
       display: 'inline-flex',
       alignItems: 'center',
       gap: '4px',
       color: 'var(--text-secondary)',
     }}
   >
     <SettingsIcon size={13} />
     <span className="desktop-only" style={{ fontSize: '9px', fontWeight: 600 }}>SETTINGS</span>
   </button>
   ```
3. The right controls section now cleanly consists of:
   - Model Badge (`◈ GEMINI 3.8`)
   - Latency indicator (`SIGNAL_BARS`)
   - Help guide trigger (`? HELP`)
   - Command Palette trigger (`⌘K`)
   - Settings trigger (`⚙ SETTINGS`)
   - Context panel toggle (`◫ CONTEXT`)

**Verify**:
In `web/`: `npx tsc --noEmit` → exit 0.

---

### Step 4: Enhance `SettingsModal.tsx` for Account Profiles and Telemetry

1. Open `web/src/components/SettingsModal.tsx`.
2. Inspect the `SESSION CONTROL //` section (`lines 220-274`). Ensure the active user profile is prominently displayed:
   ```tsx
   {/* Account Profile & Authentication */}
   <div style={{
     padding: '12px',
     backgroundColor: 'var(--bg-tertiary)',
     border: '1px solid var(--border)',
     borderRadius: '3px',
   }}>
     <div style={{
       fontSize: '11px',
       fontFamily: 'var(--font-mono)',
       fontWeight: 700,
       color: 'var(--accent-blue)',
       marginBottom: '10px',
     }}>
       USER PROFILES & AUTHENTICATION //
     </div>

     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
       <div>
         <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
           Active Account Profile
         </div>
         <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
           Switch between saved credentials or manage workspace tokens.
         </div>
       </div>
       <button
         className="mecha-btn"
         onClick={() => {
           onClose();
           window.dispatchEvent(new CustomEvent('agy:open-account-switcher'));
         }}
         style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-blue)' }}
       >
         <UserIcon size={12} /> SWITCH PROFILE
       </button>
     </div>

     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <div>
         <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
           Disconnect Active Session
         </div>
         <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
           Clears local token. Tmux sessions remain preserved on server.
         </div>
       </div>
       <button
         className="mecha-btn mecha-btn--danger"
         onClick={() => {
           if (window.confirm('Disconnect and logout? Tmux background sessions will remain preserved.')) {
             setToken(null);
             onClose();
           }
         }}
         style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
       >
         <LogoutIcon size={12} /> DISCONNECT
       </button>
     </div>
   </div>
   ```
3. In the `HOST RUNTIME TELEMETRY //` section, add a link button or action allowing the user to open full system diagnostics:
   ```tsx
   <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
     <button
       className="mecha-btn"
       onClick={() => {
         onClose();
         window.dispatchEvent(new CustomEvent('agy:open-diagnostics'));
       }}
       style={{ fontSize: '10px', padding: '3px 8px', color: 'var(--accent-cyan-bright)' }}
     >
       OPEN ADVANCED PROCESS DIAGNOSTICS →
     </button>
   </div>
   ```

**Verify**:
In `web/`: `npx tsc --noEmit` → exit 0.

---

### Step 5: Wire `onOpenSettings` in `App.tsx`

1. Open `web/src/App.tsx`.
2. Locate `<SystemHeader` at lines 330-343.
3. Pass `onOpenSettings={() => setSettingsModalOpen(true)}`:
   ```tsx
   <SystemHeader
     systemStatus={systemStatus}
     onOpenCommandPalette={() => setCommandPaletteOpen(true)}
     onOpenHelp={() => handleOpenHelp('quickstart')}
     onOpenAccountSwitcher={() => setAccountSwitcherOpen(true)}
     onOpenSettings={() => setSettingsModalOpen(true)}
     onToggleContextPanel={() => setContextPanelOpen(!contextPanelOpen)}
     contextPanelOpen={contextPanelOpen}
     onToggleMobileNav={() => setMobileNavOpen(true)}
     activeSessionName={activeTab ? activeTab.name : undefined}
     cwd={cwd}
     token={token || undefined}
     activeSessionId={primaryTerminalId}
     onWorkspaceSwitched={(newCwd) => setCwd(newCwd)}
   />
   ```
4. Also listen for the global `agy:open-settings` custom event in `App.tsx`:
   ```tsx
   useEffect(() => {
     const onOpenSettingsEvent = () => setSettingsModalOpen(true);
     window.addEventListener('agy:open-settings', onOpenSettingsEvent);
     return () => window.removeEventListener('agy:open-settings', onOpenSettingsEvent);
   }, []);
   ```

**Verify**:
In `web/`: `npx tsc --noEmit` → exit 0.

---

### Step 6: Update `ResponsiveLayout.test.tsx` and Add `SystemHeader.test.tsx`

1. Open `web/src/components/ResponsiveLayout.test.tsx`.
2. In lines 162-202:
   - Update the test `applies .tablet-hide to PID/memory telemetry, latency indicator, cmd-k, and font steppers`:
     - Since font steppers and PID/memory text are moved to Settings, adjust this test to assert that `SystemHeader` renders the compact status button (`SYS:ONLINE`), latency indicator, and command palette button with `.tablet-hide`.
     - Remove obsolete assertions looking for `PID:12345` or `.desktop-only.tablet-hide` font stepper inside `SystemHeader`.
3. In lines 616-645:
   - Update the test `contracts SystemHeader telemetry via .tablet-hide and clamps mission title without horizontal collision`:
     - Assert that `screen.getByRole('button', { name: /System status: Online/i })` or `screen.getByText(/SYS:ONLINE/i)` is rendered and mission title is properly clamped.
4. Create `web/src/components/SystemHeader.test.tsx` to verify:
   - Header renders brand (`AGY //`), active mission name, and compact status indicator.
   - Header does NOT render font steppers (`A−` or `A+`) or direct theme toggle button.
   - Header renders Settings button (`SETTINGS`) and clicking it calls `onOpenSettings`.
   - Header renders Context toggle and clicking it calls `onToggleContextPanel`.

**Verify**:
In `web/`:
`npx vitest run src/components/ResponsiveLayout.test.tsx` → all pass.
`npx vitest run src/components/SystemHeader.test.tsx` → all pass.

---

### Step 7: Run Full Verification Suite

1. Run TypeScript typecheck:
   In `web/`: `npx tsc --noEmit` → exit 0.
2. Run Vitest suite:
   In `web/`: `npx vitest run` → all tests pass.
3. Run root test suite:
   In repo root: `npm test` → all tests pass.
4. Update `plans/README.md` status row for `036` to `DONE` (if self-executing or dispatching).

## Test plan

- **Unit tests in `SystemHeader.test.tsx`**:
  - Test 1: Renders compact system status badge (`SYS:ONLINE`) without horizontal memory/PID bloat.
  - Test 2: Omits redundant controls: asserts `screen.queryByText('A−')` and `screen.queryByText('A+')` are null.
  - Test 3: Clicking Settings button fires `onOpenSettings`.
  - Test 4: Clicking compact status badge triggers `onOpenSettings`.
- **Responsive tests in `ResponsiveLayout.test.tsx`**:
  - Validates that the streamlined header layout prevents horizontal overflow at 768px and 1024px breakpoints.
- **Verification command**:
  `npx vitest run src/components/SystemHeader.test.tsx src/components/ResponsiveLayout.test.tsx`

## Done criteria

- [ ] `web/src/components/SystemHeader.tsx` does not render font steppers (`A−/A+`), theme toggle, or standalone account profile switcher.
- [ ] `SystemHeader.tsx` renders a compact system status dot button that triggers `onOpenSettings`.
- [ ] `SystemHeader.tsx` renders a dedicated Settings (`⚙`) button that invokes `onOpenSettings`.
- [ ] `SettingsModal.tsx` houses theme toggle, font stepper, user profile switcher, and host telemetry.
- [ ] `App.tsx` passes `onOpenSettings` to `SystemHeader` and listens for `agy:open-settings`.
- [ ] `npx tsc --noEmit` in `web/` exits 0 with 0 type errors.
- [ ] `npx vitest run src/components/ResponsiveLayout.test.tsx` passes.
- [ ] `web/src/components/SystemHeader.test.tsx` exists and passes.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status table updated.

## STOP conditions

- If `SystemHeader` contains undocumented custom integrations that cannot be rendered in `SettingsModal`, stop and report.
- If `npx vitest run` fails on any unrelated test suite after clean changes, stop and report.
- If any in-scope file has drifted since commit `6b03097`, stop and report.

## Maintenance notes

- Any future dashboard telemetry (e.g. CPU temperature, disk usage, or network throughput) should be added to `SettingsModal.tsx` or `SystemDiagnosticsModal.tsx` rather than crowding `SystemHeader.tsx`.
- The `SystemHeader` is intentionally preserved as a lean status banner with a maximum of 6 interactive items on desktop viewports.
