# Plan 042: Redesign and Relayout Session Sidebar for IDE Left Docking, Telemetry Density, and Responsive Cockpit Ergonomics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 18c2a2f..HEAD -- web/src/App.tsx web/src/components/SessionSidebar.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/041-stream-verbosity-controls-and-subagent-seeker.md
- **Category**: dx
- **Planned at**: commit `18c2a2f`, 2026-09-09
- **Issue**: none

## Why this matters

The session sidebar (`SessionSidebar.tsx`) manages active Antigravity persistent sessions, conversation history, and autonomous background subagents.
Currently, the sidebar suffers from a critical layout placement flaw: in `App.tsx`, it is rendered on desktop after `ContextPanel`, forcing it to the far right edge of the screen and conflicting with standard IDE conventions where workspace and history drawers dock on the left adjacent to the primary navigation rail.
Furthermore, the sidebar suffers from low information density (`ConversationCard` consumes ~120px vertically, fitting only 2-3 conversations on screen), header title and action button inconsistencies across views, cramped 3-button view switchers that wrap awkwardly, unstyled subagent status filters, and non-standard magic z-indexes (`600`, `601`) on mobile.
This plan relayouts the desktop sidebar to dock cleanly on the left between `NavigationRail` and the central workspace, redesigns the header and view switcher into an avionics telemetry cockpit with segmented controls, compacts cards into high-density telemetry rows with quick-action rails, adds inline status filters for subagents, standardizes mobile drawer z-indexes and touch targets, and adds comprehensive unit test coverage.

## Current state

- Relevant files:
  - `web/src/App.tsx` — Root application container; renders `NavigationRail`, `SplitPaneContainer`, `ContextPanel`, and `SessionSidebar` (lines 355-392).
  - `web/src/components/SessionSidebar.tsx` — Main sidebar component containing header, view switcher, search input, `ConversationCard`, `SubagentItem`, `SessionCard`, and mobile drawer (lines 1-1301).
  - `web/src/components/NavigationRail.tsx` — Collapsible navigation rail on the left; triggers `toggleSidebar()` on the `SESSIONS` button (lines 197-238).
  - `web/src/index.css` — Global stylesheet defining standardized `--z-*` tokens:
    - `--z-header: 30;`
    - `--z-drawer-backdrop: 500;`
    - `--z-drawer: 510;`
    - `--z-modal-backdrop: 700;`
    - `--z-modal: 710;`
  - `DESIGN.md` — Industrial avionics telemetry design specification:
    - Dials: ENERGY 2 (Balanced), RHYTHM 2 (Structured Modular), MOTION 1 (Calm, 0.15s ease).
    - Geometry: Small disciplined geometry (3px to 6px border radius). Pill-shaped buttons and cards are forbidden.
    - Typography: Monospace primary (`JetBrains Mono`, monospace). No em dashes.
    - Mobile: Minimum touch target of 44px on touch viewports (`<= 768px`).

- Existing placement defect in `web/src/App.tsx:355-392`:
```tsx
      {/* Main Workspace Frame: Navigation Rail + Central Split Workspace + Context Panel */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left Collapsible Navigation Rail */}
        <NavigationRail ... />

        {/* Central Command Stream / Terminal Split Container */}
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <SplitPaneContainer />
        </main>

        {/* Right Collapsible System Context Panel */}
        <ContextPanel ... />

        {/* Legacy tabs & tmux session management sidebar (if toggled) */}
        <SessionSidebar />
      </div>
```

- Existing desktop sidebar styling in `web/src/components/SessionSidebar.tsx:1280-1299`:
```tsx
  return (
    <aside
      className="session-sidebar"
      style={{
        width: sidebarOpen ? 340 : 0,
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: 'var(--font-mono)',
        zIndex: 25,
      }}
    >
      {panelContent}
    </aside>
  );
```

- Existing header mismatch in `web/src/components/SessionSidebar.tsx:822-849`:
```tsx
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-amber-bright)', letterSpacing: '1px' }}>
            {activeView === 'conversations' ? 'AGY HISTORY' : 'WORKSPACES'}
          </span>
...
          {activeView === 'conversations' ? (
            <button className="mecha-btn mecha-btn--primary" onClick={handleStartNewConversation}>+ NEW CHAT</button>
          ) : (
            <button className="mecha-btn mecha-btn--primary" onClick={handleCreateNewTab}>+ NEW TAB</button>
          )}
```
(Notice `activeView === 'subagents'` erroneously shows `WORKSPACES` and `+ NEW TAB`).

- Existing mobile drawer magic z-index in `web/src/components/SessionSidebar.tsx:1253-1272`:
```tsx
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 600 }}>
        <div className="drawer-backdrop" onClick={toggleSidebar} />
        <aside
          style={{
            ...
            zIndex: 601,
...
```

## Commands you will need

| Purpose   | Command                                                          | Expected on success |
|-----------|------------------------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit --project web/tsconfig.json`                   | exit 0, no errors   |
| Web Tests | `npm run test --workspace=web -- SessionSidebar`                 | all pass, exit 0    |
| Build Web | `npm run build --workspace=web`                                  | exit 0, no errors   |
| Build Go  | `npm run build:go`                                               | exit 0, no errors   |

## Suggested executor toolkit

- `DESIGN.md` — Avionics telemetry design system and color palette.
- `.agents/skills/antislop/SKILL.md` — Core antislop filter.
- `.agents/skills/antislop-ui/SKILL.md` — UI visual styling rules.
- `.agents/skills/antislop-layoutmobile/SKILL.md` — Mobile layout and touch targets.

## Scope

**In scope** (the only files you should modify or create):
- `web/src/App.tsx`
- `web/src/components/SessionSidebar.tsx`
- `web/src/components/SessionSidebar.test.tsx` (create)

**Out of scope** (do NOT touch, even though they look related):
- `web/src/components/NavigationRail.tsx` — Rail button triggers `toggleSidebar()`; integration interface is settled.
- `web/src/components/ContextPanel.tsx` — Secondary right inspector panel; placement and tabs remain separate.
- `web/src/store/settingsSlice.ts` — `sidebarOpen` and `toggleSidebar` store actions remain unchanged.
- `internal/routes/*` — Backend endpoints for sessions, conversations, and subagents are stable and verified.

## Git workflow

- Branch: `advisor/042-redesign-and-relayout-sidebar`
- Commit style: conventional commits matching repo history (e.g. `git log -n 5`):
  - `refactor(web): dock session sidebar to the left adjacent to navigation rail`
  - `feat(web): redesign session sidebar with avionics telemetry and high density cards`
  - `test(web): add comprehensive unit tests for redesigned session sidebar`
- Do NOT push or open a PR unless instructed by the operator.

## Steps

### Step 1: Relayout Desktop Sidebar Placement in `web/src/App.tsx`

1. In `web/src/App.tsx`, move `<SessionSidebar />` from after `<ContextPanel />` (line 390) to immediately between `<NavigationRail />` and `<main>` (between lines 368 and 370).
```tsx
      {/* Main Workspace Frame: Navigation Rail + Central Split Workspace + Context Panel */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left Collapsible Navigation Rail */}
        <NavigationRail
          expanded={railExpanded}
          onToggleExpanded={toggleRailExpanded}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          activePanel={contextPanelOpen ? contextTab : 'chat'}
          onSelectPanel={handleSelectPanel}
          onOpenSettings={() => setSettingsModalOpen(true)}
          onOpenShortcuts={() => handleOpenHelp('shortcuts')}
          onOpenHelp={() => handleOpenHelp('quickstart')}
        />

        {/* Primary Left Navigation & Session Management Sidebar */}
        <SessionSidebar />

        {/* Central Command Stream / Terminal Split Container */}
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <SplitPaneContainer />
        </main>

        {/* Right Collapsible System Context Panel */}
        <ContextPanel
          isOpen={contextPanelOpen}
          onClose={() => setContextPanelOpen(false)}
          activeTab={contextTab}
          onTabChange={setContextTab}
          sessionId={primaryTerminalId}
          token={token}
          systemStatus={systemStatus}
          messageCount={sessionStats.messageCount}
          toolCallCount={sessionStats.toolCallCount}
          totalTokens={sessionStats.totalTokens}
          onExecuteCommand={() => {}}
        />
      </div>
```
2. This establishes the standard IDE layout order:
   `[NavigationRail (52px/200px)] -> [SessionSidebar (0/300px)] -> [main Workspace (flex: 1)] -> [ContextPanel (0/380px)]`.

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exits 0.

---

### Step 2: Redesign `SessionSidebar.tsx` Header, View Switcher, and Subagent Status Filters

1. In `web/src/components/SessionSidebar.tsx`, update desktop `<aside>` styling:
- Set default desktop width to `300px` (when open) and `0px` (when closed).
- Set `borderRight: sidebarOpen ? '1px solid var(--border)' : 'none'`.
- Set `zIndex: 20` (below `--z-header: 30`).
- Ensure crisp transition: `transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1)`.

2. Redesign the Panel Header (lines 809-883):
- Header background: `var(--bg-primary)` (`#08090b`), height `40px`, border bottom `1px solid var(--border)`.
- Telemetry Title Readout:
  - When `activeView === 'conversations'`: `SESSIONS // HISTORY`
  - When `activeView === 'subagents'`: `SESSIONS // SUBAGENTS`
  - When `activeView === 'tabs'`: `SESSIONS // WORKSPACES`
  - Color: `var(--accent-amber-bright)`, font `var(--font-mono)`, `fontSize: '11px'`, `fontWeight: 700`.
- Telemetry Badge:
  - `activeView === 'conversations'`: `{conversations.length}`
  - `activeView === 'subagents'`: `{subagents.length}`
  - `activeView === 'tabs'`: `{tabs.filter(t => t.status === 'open').length}`
- Dynamic Primary Action Button:
  - `conversations`: `<button className="mecha-btn mecha-btn--primary" onClick={handleStartNewConversation}>+ NEW CHAT</button>`
  - `subagents`: `<button className="mecha-btn mecha-btn--primary" onClick={() => window.dispatchEvent(new CustomEvent('agy:seek-subagent'))}>+ EXPLORE</button>`
  - `tabs`: `<button className="mecha-btn mecha-btn--primary" onClick={handleCreateNewTab}>+ NEW TAB</button>`
- Refresh Button (`↻`):
  - Tooltip: `Refresh history and sessions`.
  - Icon rotates when `loadingConversations || loadingSubagents || tabsLoading`.
- Close Button:
  - Icon: `<CloseIcon size={12} />` (or `×`), `onClick={toggleSidebar}`, `title="Close session sidebar (Esc)"`.

3. Redesign the View Switcher (lines 885-957):
- Implement an industrial segmented control bar:
  - Container: `padding: '4px 8px'`, `backgroundColor: 'var(--bg-base)'`, `borderBottom: '1px solid var(--border)'`, `gap: '3px'`.
  - Buttons: Flat technical surfaces, 3px border radius, no pill shapes.
  - Text format:
    - Tab 1: `HISTORY ({conversations.length})`
    - Tab 2: `SUBAGENTS ({subagents.length})`
    - Tab 3: `TABS ({openTabsCount})`
  - Active tab styling:
    - `backgroundColor: 'var(--bg-secondary)'`
    - `border: '1px solid var(--border)'`
    - `borderBottom: '2px solid var(--accent-amber)'`
    - `color: 'var(--text-bright)'`
    - `fontWeight: 700`
  - Inactive tab styling:
    - `backgroundColor: 'transparent'`
    - `border: '1px solid transparent'`
    - `color: 'var(--text-muted)'`
    - Hover: `color: 'var(--text-primary)'`
  - Support keyboard arrow navigation between segments (`ArrowLeft`, `ArrowRight`).

4. Integrated Search and Subagent Status Filters:
- Search Bar:
  - Height `32px`, container background `var(--bg-secondary)`.
  - Indicator: `> ` in `var(--accent-amber-bright)`.
  - Dynamic placeholder:
    - `conversations`: `Filter history & prompts...`
    - `subagents`: `Filter subagents by role/ID...`
    - `tabs`: `Filter workspace tabs...`
  - Clear button (`×`) when query is present.
- In `subagents` view, add an Antislop-compliant status filter row directly beneath the search bar:
  - Filter state: `subagentStatusFilter: 'ALL' | 'RUNNING' | 'DONE' | 'ERROR'`.
  - Segmented buttons: `ALL`, `RUNNING`, `DONE`, `ERROR`.
  - Active button has amber border highlight and bright text.
  - Filter `subagents` by both `searchQuery` and `subagentStatusFilter`.

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exits 0.

---

### Step 3: Redesign Cards for High Telemetry Density & Precision

1. Redesign `ConversationCard` (lines 348-534):
- Reduce vertical height from ~120px to a compact, high-density row (~60px).
- Card Container:
  - `padding: '8px 10px'`, `margin: '2px 6px'`, `borderRadius: '3px'`, `border: isActive ? '1px solid var(--accent-amber-bright)' : '1px solid var(--border)'`.
  - `backgroundColor: isActive ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-primary)'`.
  - Hover: `borderColor: var(--border-strong)`, subtle highlight.
  - Clicking the card directly selects/resumes the conversation: `onClick={onSelect}`.
- Header row (flex justify-between):
  - Left: Status indicator:
    - If `isActive`: `<span className="pulse-dot pulse-dot--executing" /> <span style={{ color: 'var(--accent-amber-bright)', fontWeight: 700, fontSize: '9px' }}>ACTIVE</span>`
    - If inactive: `<span className="tech-badge tech-badge--cyan" style={{ fontSize: '9px', padding: '1px 4px' }}>{conv.turnCount} turns</span>`
    - Relative time: `formatRelativeTime(conv.updatedAt)` in `var(--text-muted)`.
  - Right action icons:
    - Delete button (`<TrashIcon size={11} />`): discreet hover reveal or subtle opacity `0.5`, turns red on hover.
- Title & Preview row:
  - Title: `fontSize: '11px'`, `fontWeight: 600`, single line clamped with ellipsis (`whiteSpace: 'nowrap'`, `overflow: 'hidden'`, `textOverflow: 'ellipsis'`).
  - Preview snippet (if present): `fontSize: '10px'`, `color: 'var(--text-secondary)'`, single line clamped.
- Footer action row:
  - Left: Compact ID readout: `ID: {conv.id.slice(0, 8)}` with copy icon on click.
  - Right:
    - CLI button: `<button className="mecha-btn" style={{ fontSize: '8px', padding: '1px 5px' }} onClick={(e) => { e.stopPropagation(); onCopyCli(); }}>&gt;_ CLI</button>`
    - Resume button: `<button className="mecha-btn mecha-btn--primary" style={{ fontSize: '8px', padding: '1px 6px', fontWeight: 700 }}>{isActive ? 'CURRENT' : isResuming ? 'LOADING...' : 'RESUME'}</button>`

2. Redesign `SubagentItem` in Sidebar (lines 1015-1090):
- Compact telemetry card (~52px height):
  - Container: `padding: '6px 10px'`, `margin: '2px 6px'`, `borderRadius: '3px'`, `border: '1px solid var(--border)'`, `borderLeft: statusColor 3px solid`.
  - Row 1: Role `/{sub.role}` in bold monospace + Status badge (`RUNNING` amber pulse, `DONE` green dot, `STOPPED` red dot).
  - Row 2: Prompt excerpt (single line clamped) in `var(--text-secondary)`.
  - Row 3: `{sub.toolCount} tools` readout + `[INSPECT ↗]` button that dispatches `agy:seek-subagent`.

3. Redesign `SessionCard` (Workspace Tabs, lines 88-270):
- High-density layout matching `ConversationCard`:
  - Active tab highlighted with amber border and indicator `● ACTIVE`.
  - Name display with inline rename trigger (`<EditIcon size={10} />`).
  - Sub-row showing `{tab.terminalIds.length} pane(s)` and relative time.
  - Close / Archive (`×`) button.

4. Empty States:
- Clean avionics cockpit aesthetic:
  - Monospace telemetry text: `NO CONVERSATIONS INDEXED`, `NO SUBAGENTS DETECTED`, or `NO WORKSPACES MATCHING QUERY`.
  - Secondary action button: `+ START NEW CHAT` with minimum 44px tap target on touch screens.

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exits 0.

---

### Step 4: Standardize Mobile Drawer, Z-Index Tokens, and Touch Targets

1. In `web/src/components/SessionSidebar.tsx`:
- Replace hardcoded magic numbers with standardized CSS tokens:
  - Mobile Backdrop: `style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-drawer-backdrop)' }}` (500).
  - Mobile Drawer aside: `style={{ zIndex: 'var(--z-drawer)', width: 'min(340px, 85vw)' }}` (510).
  - Desktop Drawer aside: `style={{ zIndex: 20 }}`.
- Touch Targets:
  - On mobile (`isMobile` or viewport `<= 768px`), all header action buttons, view switcher tabs, and card buttons enforce a minimum tap target of `44px` height (or `44px` touch bounding box) per `DESIGN.md` and `antislop-layoutmobile`.
- Keyboard Accessibility:
  - Add `useEffect` listener for `Escape` key to close sidebar when open.

**Verify**: `npm run build --workspace=web` → compiles cleanly.

---

### Step 5: Author Comprehensive Unit Tests in `web/src/components/SessionSidebar.test.tsx`

1. Create `web/src/components/SessionSidebar.test.tsx` with full Vitest test suite:
- Mock Zustand store (`useStore`) with tabs, `sidebarOpen: true`, `toggleSidebar`, `activeTabId`.
- Mock `fetchConversations`, `fetchConversationMessages`, `deleteConversation` from `../api/conversations`.
- Mock `fetchSubagents` from `../api/subagents`.
- Test cases:
  1. "renders telemetry header with title and counts for each view mode"
     - Verifies `SESSIONS // HISTORY`, `SESSIONS // SUBAGENTS`, and `SESSIONS // WORKSPACES` render based on active view.
     - Verifies action button updates (`+ NEW CHAT`, `+ EXPLORE`, `+ NEW TAB`).
  2. "switches views when clicking segmented tab buttons"
     - Clicks `SUBAGENTS` segment; verifies subagents view renders.
     - Clicks `TABS` segment; verifies workspace tabs view renders.
  3. "filters conversations by search query"
     - Types query into search input; verifies matching conversation cards are displayed.
  4. "filters subagents by status pills (ALL, RUNNING, DONE, ERROR)"
     - Switches to `SUBAGENTS` view.
     - Clicks `RUNNING`; verifies only running subagents are shown.
  5. "dispatches agy:resume-conversation when clicking conversation card"
     - Clicks conversation card; verifies `fetchConversationMessages` is called and event is dispatched.
  6. "dispatches agy:new-conversation when clicking + NEW CHAT"
     - Clicks `+ NEW CHAT`; verifies `agy:new-conversation` event is dispatched.
  7. "dispatches agy:seek-subagent when clicking inspect on subagent card"
     - Clicks `[INSPECT ↗]`; verifies `agy:seek-subagent` event is dispatched with subagent ID.
  8. "applies standardized --z-drawer tokens and closes on Escape"
     - Simulates mobile viewport; verifies backdrop and aside use `--z-drawer-backdrop` and `--z-drawer`.
     - Presses `Escape`; verifies `toggleSidebar` is called.

**Verify**: `npm run test --workspace=web -- SessionSidebar` → all tests pass, exit 0.

---

### Step 6: Full Verification & Build Gate

1. Run full test suites:
   - `npm run test --workspace=web -- SessionSidebar`
   - `go test -v ./internal/routes -run TestSubagents`
2. Run production builds:
   - `npm run build:go`
   - `npm run build --workspace=web`
3. Verify git diff cleanly touches only in-scope files:
   - `git diff --stat 18c2a2f..HEAD`

**Verify**: Both Web and Go builds exit 0.

## Test plan

- **Frontend React**:
  - File: `web/src/components/SessionSidebar.test.tsx` (new)
  - Cases:
    1. Header telemetry title and count synchrony across all 3 view modes (`conversations`, `subagents`, `tabs`).
    2. Dynamic action buttons (`+ NEW CHAT`, `+ EXPLORE`, `+ NEW TAB`).
    3. Segmented view switcher tab navigation.
    4. Query search filtering in all 3 views.
    5. Subagent status pill filtering (`ALL`, `RUNNING`, `DONE`, `ERROR`).
    6. Compact card click-to-resume and CLI command copy.
    7. Subagent inspect button custom event dispatch.
    8. Mobile drawer standardized CSS z-index tokens and Escape key dismissal.
  - Command: `npm run test --workspace=web -- SessionSidebar`

- **Full Suite**:
  - `npm test` and `npm run build`

## Done criteria

- [ ] `<SessionSidebar />` is relocated in `web/src/App.tsx` between `<NavigationRail />` and `<main>`, docking on the left on desktop.
- [ ] Desktop sidebar width defaults to 300px with `borderRight: 1px solid var(--border)`.
- [ ] Sidebar header features telemetry title (`SESSIONS // HISTORY`, `SESSIONS // SUBAGENTS`, `SESSIONS // WORKSPACES`) with active count and dynamic primary action button.
- [ ] View switcher uses an industrial segmented control bar with flat technical geometry (3px radius, no pill shapes).
- [ ] In `subagents` view, status filter pills (`ALL`, `RUNNING`, `DONE`, `ERROR`) allow fast status-based triage.
- [ ] `ConversationCard` vertical height is condensed from ~120px to ~60px high-density telemetry layout with single-click resume.
- [ ] `SubagentItem` and `SessionCard` are condensed into high-density telemetry rows.
- [ ] Mobile drawer adheres to standardized CSS tokens (`--z-drawer-backdrop: 500;`, `--z-drawer: 510;`) and minimum 44px touch targets.
- [ ] `web/src/components/SessionSidebar.test.tsx` passes with 100% assertions satisfied.
- [ ] `npm run build --workspace=web` and `npm run build:go` compile cleanly with 0 errors.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:
- Moving `SessionSidebar` in `web/src/App.tsx` causes unexpected horizontal layout breakage in `SplitPaneContainer` or `ContextPanel`.
- TypeScript compiler errors cannot be resolved within in-scope files.

## Maintenance notes

- Docking `SessionSidebar` to the left aligns AGY Online with modern IDE conventions (VS Code, Cursor, Zed) where the primary navigation rail expands into the primary session/history drawer, leaving the right side dedicated to secondary inspectors.
- If more tabs are added to the sidebar in the future, the segmented switcher is designed to accommodate additional view modes without breaking layout.
