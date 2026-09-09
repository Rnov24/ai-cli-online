# Plan 040: Paginate Skills Discovery and Registry Search for Performance and Low-Spec Device Resilience

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7593d0b..HEAD -- internal/routes/skills.go internal/routes/skills_test.go web/src/api/skills.ts web/src/components/SkillsManagementModal.tsx web/src/components/SkillsManagementModal.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/034-skills-sh-integration.md
- **Category**: perf
- **Planned at**: commit `7593d0b`, 2026-09-09
- **Issue**: none

## Why this matters

The Skills Hub (`SkillsManagementModal.tsx`) scans, displays, and manages Antigravity agent skills across workspace (`.agents/skills`), user global (`~/.agents/skills`), plugins (`~/.gemini/config/plugins/*/skills`), and builtin (`builtin/skills`) directories.
Currently, `GET /api/skills` performs a full filesystem walk on every request, reading and parsing YAML frontmatter for every `SKILL.md` file, and sends the entire unpaginated array to the browser. In turn, the frontend renders every matching skill directly into the DOM in a single unbounded list without pagination or virtualization.
On mobile devices running Termux or low-spec VPS hosts with dozens or hundreds of installed skills, this causes heavy disk I/O bottlenecks, high memory consumption, and severe UI frame drops during rendering and filtering.
This plan introduces server-side pagination parameters (`page`, `limit`, `scope`, `q`) with short-TTL in-memory caching to eliminate redundant disk scans, extends the TypeScript API client with backward-compatible pagination options, and delivers an antislop-compliant, mobile-resilient pagination toolbar with telemetry readouts (`SHOWING 1-15 OF 42 SKILLS`) and accessible page controls.

## Current state

- Relevant files:
  - `internal/routes/skills.go` — Go handler for `/api/skills` (`ListSkills`, `SearchSkills`, `GetSkillContent`, etc.).
  - `internal/routes/skills_test.go` — Unit test suite for skills endpoints.
  - `web/src/api/skills.ts` — Frontend API client (`fetchSkills`, `searchSkills`).
  - `web/src/components/SkillsManagementModal.tsx` — Main skills hub modal rendering installed skills and explore search.
  - `web/src/components/SkillsManagementModal.test.tsx` — Test suite for `SkillsManagementModal`.
  - `web/src/components/icons/index.tsx` — SVG icon definitions including `ChevronLeftIcon` and `ChevronRightIcon`.

- Existing `ListSkills` handler in `internal/routes/skills.go:261-285`:
```go
// ListSkills handles GET /api/skills. Discovers workspace, global, and builtin skills.
func (h *SkillsHandler) ListSkills(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	cwd := strings.TrimSpace(r.URL.Query().Get("cwd"))
	home, _ := os.UserHomeDir()
	if home != "" {
		home = filepath.Clean(home)
	}

	if cwd == "" {
		cwd = home
	}
	cwd = filepath.Clean(cwd)

	isHome := persona.IsHomeDirectory(cwd)

	var allSkills []SkillItem
	seen := make(map[string]bool)
```

- Existing `SkillsResponse` struct in `internal/routes/skills.go:35-40`:
```go
type SkillsResponse struct {
	WorkspacePath string      `json:"workspacePath"`
	IsHome        bool        `json:"isHome"`
	Skills        []SkillItem `json:"skills"`
	Count         int         `json:"count"`
}
```

- Existing frontend API signature in `web/src/api/skills.ts:62-73`:
```typescript
export async function fetchSkills(token: string, cwd?: string): Promise<SkillsPayload> {
  const url = cwd ? `/api/skills?cwd=${encodeURIComponent(cwd)}` : '/api/skills';
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch skills: ${res.statusText}`);
  }
  return res.json();
}
```

- Existing unpaginated rendering in `web/src/components/SkillsManagementModal.tsx:855-861`:
```tsx
                ) : filteredSkills.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    No skills matching the selected criteria.
                  </div>
                ) : (
                  filteredSkills.map((skill) => {
```

- Design system and Antislop rules (`DESIGN.md`, `antislop-ui`, `antislop-layoutmobile`, `antislop-code`):
  - **Mood & Tone**: High-precision industrial workstation, avionics telemetry cockpit, utilitarian, austere, focused.
  - **Dials**: ENERGY 2 (Balanced), RHYTHM 2 (Structured Modular), MOTION 1 (Calm, 0.15s state transitions only, no bouncing or floating).
  - **Geometry**: Small disciplined geometry (3px to 6px border radius). Pill-shaped buttons, pill cards, and pill containers are forbidden.
  - **Colors**: Dark theme default: Base `#08090b` (`--bg-primary`), Secondary `#0d0f12` (`--bg-secondary`), Tertiary `#121519` (`--bg-tertiary`), Borders `#252a31` (`--border`), Strong `#363c46` (`--border-strong`), Text Readout `#e8ebef` (`--text-primary`), Text Telemetry `#8b939e` (`--text-secondary`).
  - **Typography**: Monospace primary (`JetBrains Mono`, monospace) for code, telemetry, status indicators, and keyboard shortcuts. No em dashes: use hyphens, colons, or parentheses.
  - **Mobile Layout**: Minimum touch target of 44px on mobile viewports (`<= 768px`). Controls wrap cleanly without horizontal scrollbars.
  - **Code Comments**: Hygiene rules from `antislop-code`: no decorative banners (`// =====`), no workflow narration (`// Step 1`), no AI emojis (`// 🚀`).

## Commands you will need

| Purpose   | Command                                                      | Expected on success |
|-----------|--------------------------------------------------------------|---------------------|
| Go Tests  | `go test -v ./internal/routes -run TestSkills`               | PASS, exit 0        |
| Web Tests | `npm run test --workspace=web -- SkillsManagementModal`      | all pass, exit 0    |
| Build Go  | `npm run build:go`                                           | exit 0              |
| Build Web | `npm run build --workspace=web`                              | exit 0, no errors   |

## Scope

**In scope** (the only files you should modify):
- `internal/routes/skills.go`
- `internal/routes/skills_test.go`
- `web/src/api/skills.ts`
- `web/src/components/SkillsManagementModal.tsx`
- `web/src/components/SkillsManagementModal.test.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `web/src/components/AiChatView.tsx` — Consumes `/api/skills` for slash-command autocomplete; existing unpaginated response mode must remain 100% backward-compatible so this file does not require alteration.
- `web/src/components/CommandPalette.tsx` — Consumes `/api/skills` for command palette indexing; backward compatibility ensures it remains unaffected.
- `web/src/components/ShortcutsModal.tsx` — Consumes `/api/skills` for shortcut references; backward compatibility ensures it remains unaffected.
- `skills-lock.json` — Lockfile schema and hashing are settled in Plan 034; do not modify.

## Git workflow

- Branch: `advisor/040-paginate-skills-for-performance`
- Commit style: conventional commits matching repo history (e.g. `git log -n 5`):
  - `perf(skills): add server-side pagination and cache to skills api`
  - `feat(web): add antislop responsive pagination toolbar to skills modal`
  - `test(skills): add pagination tests for backend and frontend`
- Do NOT push or open a PR unless instructed by the operator.

## Steps

### Step 1: Add Pagination Parameters, Response Metadata, and In-Memory Cache to `internal/routes/skills.go`

1. Update `SkillsResponse` and `SkillsSearchResponse` structs in `internal/routes/skills.go`:
```go
type SkillsResponse struct {
	WorkspacePath string      `json:"workspacePath"`
	IsHome        bool        `json:"isHome"`
	Skills        []SkillItem `json:"skills"`
	Count         int         `json:"count"`
	Total         int         `json:"total"`
	Page          int         `json:"page"`
	Limit         int         `json:"limit"`
	TotalPages    int         `json:"totalPages"`
}

type SkillsSearchResponse struct {
	Query      string            `json:"query"`
	Skills     []RemoteSkillItem `json:"skills"`
	Count      int               `json:"count"`
	Total      int               `json:"total"`
	Page       int               `json:"page"`
	Limit      int               `json:"limit"`
	TotalPages int               `json:"totalPages"`
}
```

2. Add cache fields and a mutex to `SkillsHandler`:
```go
type SkillsHandler struct {
	auth       *AuthHelper
	db         *db.DB
	cacheMutex sync.RWMutex
	cachedList []SkillItem
	cacheTime  time.Time
	cacheCwd   string
}
```
Add a helper method `invalidateCache()` that resets `cacheTime = time.Time{}` and call it inside `ScaffoldSkill`, `InstallSkill`, `DeleteSkill`, and `SyncSkills`.

3. In `ListSkills`:
- Check cache: if `h.cacheTime` is within 5 seconds (`time.Since(h.cacheTime) < 5*time.Second`) and `h.cacheCwd == cwd`, read `allSkills = h.cachedList` under `cacheMutex.RLock()`.
- If cache miss: scan directories as currently implemented, store `h.cachedList = allSkills`, `h.cacheTime = time.Now()`, `h.cacheCwd = cwd` under `cacheMutex.Lock()`.
- Support query filtering by `scope` (`r.URL.Query().Get("scope")`) and query search `q` (`r.URL.Query().Get("q")`):
  - If `scope` is provided and is not `"all"` and not empty: filter matching `sk.Scope == scope`.
  - If `q` is provided and not empty: filter where lower-case name, description, or tags contain `strings.ToLower(q)`.
- Support pagination parameters `page` and `limit`:
  - `pageStr := strings.TrimSpace(r.URL.Query().Get("page"))`
  - `limitStr := strings.TrimSpace(r.URL.Query().Get("limit"))`
  - Parse `limit` and `page`. If `limit <= 0` or `limitStr == ""` (unspecified):
    - Return all filtered skills: `Count = len(filteredSkills)`, `Total = len(filteredSkills)`, `Page = 1`, `Limit = 0`, `TotalPages = 1`. This guarantees complete backward compatibility with existing callers.
  - If `limit > 0`:
    - Clamp `limit` to a minimum of 1 and maximum of 100 (e.g. `if limit > 100 { limit = 100 }`).
    - Parse `page`: default to 1 if `<= 0`.
    - `total := len(filteredSkills)`
    - `totalPages := (total + limit - 1) / limit`
    - If `total == 0`: `totalPages = 1`.
    - If `page > totalPages` and `total > 0`: clamp `page = totalPages`.
    - `start := (page - 1) * limit`
    - `if start > total { start = total }`
    - `end := start + limit`
    - `if end > total { end = total }`
    - Sliced items: `sliced := filteredSkills[start:end]`
    - Populate `SkillsResponse` with `Skills: sliced`, `Count: len(sliced)`, `Total: total`, `Page: page`, `Limit: limit`, `TotalPages: totalPages`.

4. In `SearchSkills`:
- Parse `pageStr := strings.TrimSpace(r.URL.Query().Get("page"))`.
- Default `page = 1`. If `page <= 0`, set to 1.
- Parse `limit` (default 20, clamp to 100).
- After obtaining `remoteSkills`, calculate `total := len(remoteSkills)`.
- Sliced remote items: `start := (page - 1) * limit`, `end := start + limit`, clamped to `total`.
- Populate `SkillsSearchResponse` with `Count: len(sliced)`, `Total: total`, `Page: page`, `Limit: limit`, `TotalPages: totalPages`.

**Verify**: `go test -v ./internal/routes -run TestSkills` → exits 0.

---

### Step 2: Add Backend Unit Tests for Pagination, Clamping, and Caching in `internal/routes/skills_test.go`

1. In `internal/routes/skills_test.go`, add test assertions to `TestSkillsHandler_ListAndContent`:
- Test unpaginated request (`GET /api/skills?cwd=...`): verify `res.Count == 3`, `res.Total == 3`, `res.Page == 1`, `res.Limit == 0`, `res.TotalPages == 1`.
- Test paginated request with `limit=2&page=1`:
  - Verify `res.Count == 2`, `res.Total == 3`, `res.Page == 1`, `res.Limit == 2`, `res.TotalPages == 2`.
  - Verify returned items match the first two skills.
- Test paginated request with `limit=2&page=2`:
  - Verify `res.Count == 1`, `res.Total == 3`, `res.Page == 2`, `res.Limit == 2`, `res.TotalPages == 2`.
  - Verify returned item matches the third skill.
- Test out-of-bounds page clamping (e.g. `limit=2&page=999`):
  - Verify graceful handling with clamped page `res.Page == 2` and remaining items returned.
- Test server-side scope filter (`&scope=workspace`):
  - Verify `res.Total == 1` and returned skill is `deploy-staging`.
- Test cache invalidation: call `ScaffoldSkill`, then re-query `ListSkills`, confirming the newly scaffolded skill appears immediately.

2. In `internal/routes/skills_test.go`, test `TestSkillsHandler_SearchSkills`:
- Query with `limit=2&page=1`: verify `res.Count <= 2`, `res.Total >= 2`, `res.Page == 1`, `res.Limit == 2`.

**Verify**: `go test -v ./internal/routes -run TestSkills` → exits 0 with all test cases passing.

---

### Step 3: Extend TypeScript API Client in `web/src/api/skills.ts`

1. Update `SkillsPayload` and `SkillsSearchResponse` interfaces in `web/src/api/skills.ts`:
```typescript
export interface SkillsPayload {
  workspacePath: string;
  isHome: boolean;
  skills: SkillItem[];
  count: number;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface SkillsSearchResponse {
  query: string;
  skills: RemoteSkillItem[];
  count: number;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}
```

2. Introduce `FetchSkillsOptions` interface:
```typescript
export interface FetchSkillsOptions {
  cwd?: string;
  page?: number;
  limit?: number;
  scope?: 'all' | 'workspace' | 'global' | 'builtin';
  q?: string;
}
```

3. Update `fetchSkills` signature to support both string `cwd` and `FetchSkillsOptions` object:
```typescript
export async function fetchSkills(
  token: string,
  cwdOrOptions?: string | FetchSkillsOptions
): Promise<SkillsPayload> {
  let url = '/api/skills';
  const params = new URLSearchParams();

  if (typeof cwdOrOptions === 'string') {
    if (cwdOrOptions.trim()) params.set('cwd', cwdOrOptions.trim());
  } else if (cwdOrOptions) {
    if (cwdOrOptions.cwd?.trim()) params.set('cwd', cwdOrOptions.cwd.trim());
    if (cwdOrOptions.page && cwdOrOptions.page > 0) params.set('page', String(cwdOrOptions.page));
    if (cwdOrOptions.limit && cwdOrOptions.limit > 0) params.set('limit', String(cwdOrOptions.limit));
    if (cwdOrOptions.scope && cwdOrOptions.scope !== 'all') params.set('scope', cwdOrOptions.scope);
    if (cwdOrOptions.q?.trim()) params.set('q', cwdOrOptions.q.trim());
  }

  const qs = params.toString();
  if (qs) {
    url += `?${qs}`;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch skills: ${res.statusText}`);
  }
  return res.json();
}
```

4. Update `searchSkills` to accept optional `page` parameter:
```typescript
export async function searchSkills(
  token: string,
  query: string,
  limit: number = 20,
  page: number = 1
): Promise<SkillsSearchResponse> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  params.set('limit', String(limit));
  if (page > 1) params.set('page', String(page));

  const res = await fetch(`/api/skills/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to search skills: ${res.statusText}`);
  }
  return res.json();
}
```

**Verify**: `npx tsc --noEmit --project web/tsconfig.json` → exits 0 with no type errors.

---

### Step 4: Implement Antislop-Compliant Responsive Pagination in `web/src/components/SkillsManagementModal.tsx`

1. Import `ChevronLeftIcon` and `ChevronRightIcon` from `./icons`.

2. Add pagination state hooks for both Installed and Explore views:
```typescript
const [installedPage, setInstalledPage] = useState<number>(1);
const [installedPageSize, setInstalledPageSize] = useState<number>(15);

const [explorePage, setExplorePage] = useState<number>(1);
const [explorePageSize, setExplorePageSize] = useState<number>(10);
```

3. Add reset effects to keep pagination synchronized with filtering:
- Whenever `activeScope` or `searchQuery` changes, reset `installedPage` to 1.
- Whenever `exploreQuery` changes, reset `explorePage` to 1.
- When `filteredSkills.length` changes and `installedPage > Math.ceil(filteredSkills.length / installedPageSize)`, clamp `installedPage` back to the maximum valid page.

4. Compute paginated slices via `useMemo`:
```typescript
const totalInstalled = filteredSkills.length;
const totalInstalledPages = Math.max(1, Math.ceil(totalInstalled / installedPageSize));
const paginatedSkills = useMemo(() => {
  const start = (installedPage - 1) * installedPageSize;
  return filteredSkills.slice(start, start + installedPageSize);
}, [filteredSkills, installedPage, installedPageSize]);

const totalExplore = remoteSkills.length;
const totalExplorePages = Math.max(1, Math.ceil(totalExplore / explorePageSize));
const paginatedRemoteSkills = useMemo(() => {
  const start = (explorePage - 1) * explorePageSize;
  return remoteSkills.slice(start, start + explorePageSize);
}, [remoteSkills, explorePage, explorePageSize]);
```

5. In the Installed skills list, replace `filteredSkills.map(...)` with `paginatedSkills.map(...)`.

6. In the Explore skills list, replace `remoteSkills.map(...)` with `paginatedRemoteSkills.map(...)`.

7. Create an antislop-compliant, mobile-resilient Pagination Toolbar component or render block:
- **Design Tokens & Palette**:
  - Container background: `var(--bg-secondary)` (`#0d0f12`).
  - Border divider: `1px solid var(--border)` (`#252a31`).
  - Text typography: `var(--font-mono)` (`JetBrains Mono`, monospace).
  - Telemetry color: `var(--text-secondary)` (`#8b939e`).
  - Button styling: flat technical surfaces with 1px border (`var(--border)`), 4px radius, no pill shapes.
  - Hover/focus states: border highlight with `var(--accent-amber)` or `var(--border-strong)`.
  - Motion: `transition: all 0.15s ease`.
- **Copy & Formatting**:
  - Telemetry text: `SHOWING {start}-{end} OF {total} SKILLS` (e.g. `SHOWING 1-15 OF 42 SKILLS`, or `SHOWING 0 OF 0 SKILLS` when empty). No em dashes.
  - Page indicator: `PAGE {page} OF {totalPages}`.
- **Controls**:
  - Page size `<select>`: options `10 / page`, `15 / page`, `25 / page`, `50 / page`. Clean monospace styling.
  - Previous button: icon `ChevronLeftIcon`, label `PREV` (or icon with `aria-label="Previous page"`), disabled when `page <= 1`.
  - Next button: icon `ChevronRightIcon`, label `NEXT` (or icon with `aria-label="Next page"`), disabled when `page >= totalPages`.
- **Mobile Layout & Tap Targets**:
  - Flex layout with `flexWrap: 'wrap'`, `justifyContent: 'space-between'`, `alignItems: 'center'`, and `gap: '8px'`.
  - Tap targets for navigation buttons provide a minimum height of `32px` on desktop and scale to `44px` on mobile screens (`<= 768px`) or use accessible padding so touch users never miss targets.
- **Keyboard Navigation**:
  - Add keyboard shortcut support: when the modal is active and no text input is focused, pressing `[` moves to the previous page and `]` moves to the next page.

**Verify**: `npm run build --workspace=web` → compiles cleanly without errors.

---

### Step 5: Update and Expand Frontend Unit Tests in `web/src/components/SkillsManagementModal.test.tsx`

1. Update `web/src/components/SkillsManagementModal.test.tsx` to include dedicated pagination test cases:
- Test: "renders pagination bar with correct item count and page indicators"
  - Provide a mock list of 25 skills.
  - Set page size to 10.
  - Verify `SHOWING 1-10 OF 25 SKILLS` and `PAGE 1 OF 3` are displayed.
  - Verify only 10 skill cards are rendered in the DOM.
- Test: "navigates to next page on NEXT button click"
  - Click the NEXT button.
  - Verify `PAGE 2 OF 3` is displayed.
  - Verify skills 11-20 are rendered.
  - Verify PREV button is enabled.
- Test: "disables PREV button on first page and NEXT button on last page"
  - Verify PREV button has `disabled` attribute on page 1.
  - Navigate to page 3; verify NEXT button has `disabled` attribute.
- Test: "resets page to 1 when search query or scope filter changes"
  - Navigate to page 2.
  - Change search query or click a scope filter pill.
  - Verify `PAGE 1 OF ...` is rendered.
- Test: "updates displayed items when page size select changes"
  - Change page size select from 10 to 25.
  - Verify all 25 skills are rendered on page 1 of 1.

**Verify**: `npm run test --workspace=web -- SkillsManagementModal` → all 13 existing tests + new pagination tests pass.

## Test plan

- **Go Backend**:
  - File: `internal/routes/skills_test.go`
  - Cases:
    1. Unpaginated backward compatibility (`limit=0` or omitted) returns all skills with `Total == Count`.
    2. Paginated requests slice correctly across pages 1, 2, and beyond.
    3. Boundary conditions: clamping negative limits/pages and out-of-range page requests.
    4. Scope filtering before slicing.
    5. Cache invalidation on mutation endpoints (`ScaffoldSkill`, `InstallSkill`, `DeleteSkill`, `SyncSkills`).
  - Command: `go test -v ./internal/routes -run TestSkills`

- **Frontend React**:
  - File: `web/src/components/SkillsManagementModal.test.tsx`
  - Cases:
    1. Default pagination renders the first page slice only.
    2. Next and Previous buttons navigate between pages.
    3. Disabled states for boundary pages (page 1 disables Prev, last page disables Next).
    4. Filter and search input changes reset active page to 1.
    5. Page size select updates items per page and recalculates total pages.
    6. Explore view pagination slices remote search results accurately.
  - Command: `npm run test --workspace=web -- SkillsManagementModal`

- **Full Verification**:
  - Run `npm test` to ensure both Go and Web tests pass.

## Done criteria

- [ ] `GET /api/skills` supports `page`, `limit`, `scope`, and `q` parameters while remaining 100% backward-compatible when `limit` is omitted.
- [ ] `SkillsHandler` caches directory scans with a 5-second TTL and invalidates on skill mutations, eliminating redundant disk I/O on page changes.
- [ ] `fetchSkills` and `searchSkills` in `web/src/api/skills.ts` support pagination options and return pagination metadata.
- [ ] `SkillsManagementModal.tsx` renders paginated slices for both Installed and Explore tabs, preventing excessive DOM node allocation.
- [ ] The pagination toolbar adheres strictly to `DESIGN.md` (industrial telemetry styling, monospace type, no pill buttons, no em dashes, accessible tap targets).
- [ ] Filtering or searching automatically resets page index to 1.
- [ ] `go test -v ./internal/routes -run TestSkills` exits 0.
- [ ] `npm run test --workspace=web -- SkillsManagementModal` exits 0.
- [ ] `npm run build --workspace=web` and `npm run build:go` exit 0.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:
- `git diff --stat 7593d0b..HEAD` shows that `internal/routes/skills.go` or `web/src/components/SkillsManagementModal.tsx` has drifted with breaking structural changes.
- Any existing endpoint caller (`AiChatView.tsx`, `CommandPalette.tsx`, `ShortcutsModal.tsx`) breaks when receiving the extended `SkillsResponse` payload.
- Go tests or Vitest suites fail due to environmental or dependency issues outside the in-scope files.

## Maintenance notes

- The 5-second in-memory cache in `SkillsHandler` significantly reduces filesystem overhead during fast pagination and tab switching on Termux and low-spec VPS hosts. If external filesystem changes are made outside AGY Online (e.g. via direct shell `git pull`), the cache expires automatically within 5 seconds or on the next mutating action.
- If individual skill lists ever exceed 500 items in a single workspace, virtualized windowing (`react-window`, already present in `web/package.json`) can be layered on top of this pagination layer without breaking the API contract.
