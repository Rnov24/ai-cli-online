# Plan 016: Global Antislop Glyph & SVG Icon Modernization

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 9afbc72..HEAD -- web/src/components/AiChatView.tsx web/src/components/NavigationRail.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 015
- **Category**: ux
- **Planned at**: commit `9afbc72`, 2026-09-08

## Why this matters

The Antislop design system guidelines (R-04, R-23, and `DESIGN.md` Section 4) strictly forbid using raw unicode emojis, unstyled arrows (`➔`, `◀`, `▶`), multiplication signs (`✕`), and raw typography symbols (`A−`, `A+`) inside interactive action buttons, pills, and status headers where standard SVG icons provide cleaner rendering, consistent stroke geometry, and full theme integration. Modernizing these elements across `AiChatView`, `WorkspaceFilesPanel`, `GitHistoryPanel`, `NavigationRail`, `SettingsModal`, and `ContextPanel` ensures a completely unified mechanical aesthetic across all screen sizes and themes.

## Current state

- `web/src/components/AiChatView.tsx:2167`: Uses `📋 PASTE` instead of `<ClipboardIcon />`.
- `web/src/components/AiChatView.tsx:2523`: Uses `⚡ STEER` instead of `<BoltIcon />`.
- `web/src/components/AiChatView.tsx:2360`: Uses `✕` instead of `<CloseIcon />`.
- `web/src/components/AiChatView.tsx:1830`: Uses raw emoji `⚠️ TURN INTERRUPTED` instead of an SVG warning icon.
- `web/src/components/WorkspaceFilesPanel.tsx:359, 390`: Uses `✕` and `📄` raw glyphs.
- `web/src/components/GitHistoryPanel.tsx:733`: Uses `{isHome ? '🏠' : '🌿'}` instead of `<HomeIcon />` and `<GitBranchIcon />`.
- `web/src/components/NavigationRail.tsx:130, 157, 216`: Uses `◀`/`▶`, `◉`, and `▣` unicode symbols.
- `web/src/components/SettingsModal.tsx:128, 146`: Uses text `A−` and `A+`.
- `web/src/components/ContextPanel.tsx:100`: Uses `➔`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend Tests | `npm.cmd run test --workspace=web` | all pass, exit 0 |
| All Tests | `npm.cmd test` | all pass, exit 0 |
| Web Build | `npm.cmd run build` | exit 0 |
| Go Binary Build | `go build -o bin/ai-cli-online.exe ./cmd/ai-cli-online` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `web/src/components/icons/index.tsx`
- `web/src/components/icons/Icons.test.tsx`
- `web/src/components/AiChatView.tsx`
- `web/src/components/WorkspaceFilesPanel.tsx`
- `web/src/components/GitHistoryPanel.tsx`
- `web/src/components/NavigationRail.tsx`
- `web/src/components/SettingsModal.tsx`
- `web/src/components/ContextPanel.tsx`
- `plans/README.md`

**Out of scope**:
- Terminal xterm WebGL rendering.
- Markdown parse engine (`MarkdownRenderer.tsx`).
- Chat message history database schema.

## Git workflow

- Branch: `master`
- Commit message convention: `style(icons): modernize raw emojis and glyphs with unified svg icons across workspace`

## Steps

### Step 1: Ensure AlertTriangleIcon is Available in `icons/index.tsx`
1. Check `web/src/components/icons/index.tsx` and add `AlertTriangleIcon` (or `WarningIcon`).
2. Update `web/src/components/icons/Icons.test.tsx` to include `AlertTriangleIcon`.

### Step 2: Replace Glyphs and Emojis in Workspace Components
1. In `AiChatView.tsx`:
   - Replace `📋 PASTE` with `<ClipboardIcon size={12} style={{ marginRight: '4px' }} /><span>PASTE</span>`.
   - Replace `⚡ STEER` with `<BoltIcon size={12} style={{ marginRight: '4px' }} /><span>STEER</span>`.
   - Replace `✕` with `<CloseIcon size={10} />`.
   - Replace `⚠️ TURN INTERRUPTED` with `<AlertTriangleIcon size={12} style={{ marginRight: '4px' }} /><span>TURN INTERRUPTED</span>`.
2. In `WorkspaceFilesPanel.tsx`:
   - Replace `✕` with `<CloseIcon size={12} />`.
   - Replace `📄` with `<FileIcon size={13} style={{ marginRight: '4px' }} />`.
3. In `GitHistoryPanel.tsx`:
   - Replace `{isHome ? '🏠' : '🌿'}` with `{isHome ? <HomeIcon size={13} style={{ marginRight: '4px' }} /> : <GitBranchIcon size={13} style={{ marginRight: '4px' }} />}`.
4. In `NavigationRail.tsx`:
   - Replace `{expanded ? '◀' : '▶'}` with `{expanded ? <ChevronLeftIcon size={12} /> : <ChevronRightIcon size={12} />}`.
   - Replace `◉` with `<ActivityIcon size={13} />`.
   - Replace `▣` with `<TabsIcon size={13} />`.
5. In `SettingsModal.tsx`:
   - Replace `A−` button with `<MinusIcon size={12} />` and `aria-label="Decrease font size"`.
   - Replace `A+` button with `<PlusIcon size={12} />` and `aria-label="Increase font size"`.
6. In `ContextPanel.tsx`:
   - Replace unicode `➔` with `<ChevronRightIcon size={9} />`.

### Step 3: Verify and Build
1. Run all web unit tests to confirm 0 test regressions.
2. Build production frontend assets with `npm.cmd run build`.
3. Recompile Go static binary with `go build -o bin/ai-cli-online.exe ./cmd/ai-cli-online`.
4. Update `plans/README.md` marking Plan 016 as `DONE`.

## Done criteria

- [ ] Zero raw emojis in button labels across `AiChatView`, `WorkspaceFilesPanel`, `GitHistoryPanel`.
- [ ] Unicode arrows `◀`/`▶` and `➔` replaced with `<ChevronLeftIcon />` and `<ChevronRightIcon />`.
- [ ] Font stepper in `SettingsModal.tsx` uses `<MinusIcon />` and `<PlusIcon />` with accessible aria labels.
- [ ] All unit tests pass with exit code 0.
- [ ] `plans/README.md` updated.
