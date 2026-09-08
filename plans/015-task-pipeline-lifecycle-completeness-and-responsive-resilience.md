# Plan 015: Task Pipeline Lifecycle Completeness and Responsive Resilience

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 25b40d6..HEAD -- web/src/components/TaskPipelineBar.tsx web/src/components/icons/index.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: ux
- **Planned at**: commit `25b40d6`, 2026-09-08

## Why this matters

The `ai-cli-task` Antigravity plugin defines a structured 13-skill task lifecycle (`init`, `plan`, `research`, `check`, `verify`, `exec`, `merge`, `report`, `auto`, `cancel`, `list`, `annotate`, `summarize`). Currently, `TaskPipelineBar.tsx` hardcodes only 7 steps, skipping the critical `research` step (which sits between `plan` and `check`/`exec`), and offers no quick access to operational management skills like `list` or `cancel`. Furthermore, the bar relies on raw unicode emojis (`<span>⚡</span>`) and unicode arrows (`➔`), violating design system and Antislop rules (R-04, R-23). Finally, on split panes or narrow viewports (< 768px), rigid styling causes horizontal clipping. Adding the complete lifecycle sequence, unified SVG icons, responsive flex-shrink resilience, and quick actions brings the visual task runner into 100% alignment with the `ai-cli-task` specification.

## Current state

- `web/src/components/TaskPipelineBar.tsx:8-16`: Hardcodes only 7 steps (`init`, `plan`, `check`, `exec`, `verify`, `merge`, `report`), omitting `research`, `list`, and `cancel`.
- `web/src/components/TaskPipelineBar.tsx:92`: Uses raw unicode arrow `➔` between steps.
- `web/src/components/TaskPipelineBar.tsx:110`: Uses raw emoji `<span>⚡</span>` inside the Auto Loop button instead of `<BoltIcon />`.
- `web/src/components/TaskPipelineBar.tsx:31-71`: Rigid container width and unconstrained `MODULE //` input cause overflow and cutoffs on split-pane views.
- `web/src/components/icons/index.tsx`: Missing `ChevronRightIcon`, `ChevronLeftIcon`, and `MinusIcon`.

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
- `web/src/components/TaskPipelineBar.tsx`
- `web/src/components/TaskPipelineBar.test.tsx`
- `plans/README.md`

**Out of scope**:
- Direct terminal PTY or tmux session management.
- Modifying backend task runner routes.
- Refactoring `AiChatView` streaming mechanics.

## Git workflow

- Branch: `master`
- Commit message convention: `feat(task-pipeline): complete lifecycle skills, responsive resilience and svg icons`

## Steps

### Step 1: Add Missing Chevron and Minus Icons in `web/src/components/icons/index.tsx`
1. Open `web/src/components/icons/index.tsx`.
2. Add `ChevronRightIcon`, `ChevronLeftIcon`, and `MinusIcon` using `createIcon`:
   ```typescript
   export const ChevronRightIcon = createIcon('ChevronRightIcon', (
     <polyline points="9 18 15 12 9 6" />
   ));

   export const ChevronLeftIcon = createIcon('ChevronLeftIcon', (
     <polyline points="15 18 9 12 15 6" />
   ));

   export const MinusIcon = createIcon('MinusIcon', (
     <line x1="5" y1="12" x2="19" y2="12" />
   ));
   ```
3. Update `web/src/components/icons/Icons.test.tsx` to verify these icons render properly.

**Verify**: `npm.cmd run test --workspace=web -- web/src/components/icons/Icons.test.tsx` → exits 0.

### Step 2: Update `TaskPipelineBar.tsx` with Full Lifecycle, Icons & Responsive Layout
1. Open `web/src/components/TaskPipelineBar.tsx`.
2. Import `BoltIcon`, `ChevronRightIcon`, `TaskPulseIcon`, `CloseIcon` from `./icons`.
3. Update the `STEPS` array to include `research` in the correct lifecycle position:
   ```typescript
   const STEPS = [
     { id: 'init', num: '01', label: 'INIT', cmd: '/init' },
     { id: 'plan', num: '02', label: 'PLAN', cmd: '/plan' },
     { id: 'research', num: '03', label: 'RES', cmd: '/research', title: 'Research external references (/research)' },
     { id: 'check', num: '04', label: 'CHK', cmd: '/check', title: 'Check feasibility (/check)' },
     { id: 'exec', num: '05', label: 'EXEC', cmd: '/exec', title: 'Execute implementation plan (/exec)' },
     { id: 'verify', num: '06', label: 'VRFY', cmd: '/verify', title: 'Run domain-adapted verification tests (/verify)' },
     { id: 'merge', num: '07', label: 'MRG', cmd: '/merge', title: 'Merge task branch to main (/merge)' },
     { id: 'report', num: '08', label: 'REPT', cmd: '/report', title: 'Generate completion report (/report)' },
   ];
   ```
4. Add quick actions for `LIST` (`/list`) and `CANCEL` (`/cancel`).
5. Replace `<span>⚡</span>` with `<BoltIcon size={11} style={{ marginRight: '4px' }} />`.
6. Replace `➔` with `<ChevronRightIcon size={9} style={{ color: 'var(--text-muted)', margin: '0 1px', opacity: 0.7 }} />`.
7. Update the container layout to be fully responsive:
   - Module input: `minWidth: '70px'`, `maxWidth: '130px'`, `flexShrink: 1`.
   - Pipeline steps container: `overflowX: 'auto'`, `scrollbarWidth: 'none'`, `flex: '1 1 auto'`.
   - Ensure proper `aria-label` attributes on every interactive button.

**Verify**: Run frontend tests.

### Step 3: Create Comprehensive Test Suite in `TaskPipelineBar.test.tsx`
1. Create `web/src/components/TaskPipelineBar.test.tsx`.
2. Add tests verifying:
   - Renders all 8 lifecycle steps (`01 INIT` through `08 REPT`).
   - Renders quick actions (`LIST`, `CANCEL`, `AUTO // LOOP`).
   - Clicking a step with a module input runs the command with the module argument (`/init my-mod`).
   - Clicking a step without module input runs the bare command (`/init`).
   - Clicking `AUTO // LOOP` runs `/auto <module>`.
   - Clicking `LIST` runs `/list`.
   - No raw emojis are present in the DOM tree.

**Verify**: `npm.cmd run test --workspace=web -- web/src/components/TaskPipelineBar.test.tsx` → exits 0.

## Test plan

- `npm.cmd run test --workspace=web`:
  - Verify all unit tests pass, including new `TaskPipelineBar.test.tsx` and updated `Icons.test.tsx`.
- `npm.cmd test`:
  - Run full test suite across the repository.
- `npm.cmd run build`:
  - Verify clean production Vite build with 0 TypeScript/bundling errors.
- `go build -o bin/ai-cli-online.exe ./cmd/ai-cli-online`:
  - Verify single static executable builds cleanly.

## Done criteria

- [ ] `web/src/components/icons/index.tsx` exports `ChevronRightIcon`, `ChevronLeftIcon`, `MinusIcon`.
- [ ] `TaskPipelineBar.tsx` supports all 8 sequential lifecycle skills (`init`, `plan`, `research`, `check`, `exec`, `verify`, `merge`, `report`).
- [ ] `TaskPipelineBar.tsx` includes quick actions for `LIST` and `CANCEL`.
- [ ] Raw emoji `<span>⚡</span>` is replaced with SVG `<BoltIcon />` and raw `➔` is replaced with `<ChevronRightIcon />`.
- [ ] Layout is responsive with no horizontal clipping on split-pane views.
- [ ] `TaskPipelineBar.test.tsx` has 100% test coverage for all interactions.
- [ ] `plans/README.md` status row for Plan 015 is updated to `DONE`.

## STOP conditions

- If any other component relies on a specific property name or signature from `TaskPipelineBarProps`, maintain backward compatibility.
- If existing tests fail due to step count differences, inspect and resolve cleanly.

## Maintenance notes

- Any future skills added to the `ai-cli-task` suite should be added to `STEPS` or the secondary actions bar according to whether they are sequential or standalone commands.
