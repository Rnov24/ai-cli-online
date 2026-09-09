# Plan 033: Implement Account Switching, Multi-Profile Management, and Auth Setup Hardening

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 53e3702..HEAD -- web/src/components/LoginForm.tsx web/src/components/SettingsModal.tsx web/src/components/SystemHeader.tsx web/src/store/persistence.ts web/src/components/CommandPalette.tsx web/src/App.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/032-rebrand-project-identity-artifacts-to-agy-online.md
- **Category**: dx
- **Planned at**: commit `53e3702`, 2026-09-09

## Why this matters

Currently, `LoginForm.tsx` bypasses backend authentication verification during form submission, immediately invoking `setToken(inputToken)` without calling `/api/auth/login`. When a user types an invalid password or mistypes their token, the application blindly transitions into the main workspace, triggering cascading `401 Unauthorized` errors on system telemetry, terminal WebSockets, and document panels with no explanatory feedback.

Furthermore, developers operating across multiple Antigravity environments, remote VPS instances, or distinct project sessions have no account switching mechanism. Switching tokens requires manually opening Settings, clicking "DISCONNECT" (which clears active session tabs), and re-entering the raw token. Because `persistence.ts` uses a single global `ai-cli-online-tabs` key, logging into a different token overwrites the previous account's layout.

Implementing verified login handling, an account profile storage manager, an interactive Account Switcher modal, and token-namespaced tab persistence provides a robust multi-tenant developer workflow.

## Current state

- `LoginForm.tsx` (lines 8–11):
  ```tsx
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setToken(inputToken.trim() || 'default');
  };
  ```
  Token is accepted without network validation against the backend.
- `web/src/store/persistence.ts` (lines 17–19, 78–80):
  ```ts
  const TABS_KEY = 'ai-cli-online-tabs';
  ...
  localStorage.setItem(TABS_KEY, JSON.stringify(data));
  ```
  A single global key stores tab state regardless of which token/account is active.
- `web/src/components/SettingsModal.tsx` (lines 239–251):
  ```tsx
  <button
    className="mecha-btn mecha-btn--danger"
    onClick={() => {
      if (window.confirm('Disconnect and logout? Tmux background sessions will remain preserved.')) {
        setToken(null);
        onClose();
      }
    }}
  >
    <LogoutIcon size={12} /> DISCONNECT
  </button>
  ```
  Only provides full session disconnect, requiring manual token re-entry to switch.
- Backend auth endpoints already operational in `internal/routes/auth.go`:
  - `POST /api/auth/login`: validates `{ "token": "..." }`, returns `200 {"ok": true}` or `401 {"error": "Invalid token"}`.
  - `GET /api/auth/verify`: returns `{"authenticated": bool, "authRequired": bool}`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Unit Test | `npx vitest run src/utils/accountStorage.test.ts src/components/AccountSwitcherModal.test.tsx` | all tests PASS |
| Full Test | `npm test`               | all 22+ web suites + Go tests PASS |
| Build     | `npm run build`          | exit 0, binary compiled |

## Scope

**In scope** (the only files you should modify or create):
- `web/src/api/auth.ts` (create typed auth client)
- `web/src/utils/accountStorage.ts` (create account profiles storage and helpers)
- `web/src/utils/accountStorage.test.ts` (create unit tests)
- `web/src/components/icons/index.tsx` (add `UserIcon`, `KeyIcon`)
- `web/src/components/icons/Icons.test.tsx` (update icon test count)
- `web/src/components/LoginForm.tsx` (harden auth setup, add verify check and saved account selector)
- `web/src/components/AccountSwitcherModal.tsx` (create account switcher modal)
- `web/src/components/AccountSwitcherModal.test.tsx` (create unit test)
- `web/src/components/SystemHeader.tsx` (add account profile badge/button)
- `web/src/components/SettingsModal.tsx` (add account switcher trigger in session control)
- `web/src/components/CommandPalette.tsx` (add `/account` command)
- `web/src/store/persistence.ts` (namespace tab layout key per token hash)
- `web/src/App.tsx` (register account switcher modal and handle account switch events)

**Out of scope** (do NOT touch):
- `internal/routes/auth.go` or backend server routes — backend auth handlers are already tested and fully functional.
- Database schemas in SQLite — account profiles are client-side developer credentials stored in browser localStorage.

## Git workflow

- Branch: `advisor/033-account-switching-and-auth-setup`
- Commit message style: `feat(auth): account switching, profile management, and login validation hardening`

## Steps

### Step 1: Create Typed Auth Client (`web/src/api/auth.ts`)

Create `web/src/api/auth.ts` exposing:
- `login(token: string): Promise<{ ok: boolean }>`:
  Sends `POST /api/auth/login` with `{ token }`. Returns `{ ok: true }` on success or throws an `Error('Invalid auth token')` on 401.
- `verify(token?: string): Promise<{ authenticated: boolean; authRequired: boolean }>`:
  Sends `GET /api/auth/verify` with optional Bearer header. Returns authentication state and whether the server enforces an `AUTH_TOKEN`.

**Verify**:
```bash
cat web/src/api/auth.ts
```
→ Expected: File exists with typed `login` and `verify` functions.

---

### Step 2: Implement Account Storage Helper (`web/src/utils/accountStorage.ts`)

Create `web/src/utils/accountStorage.ts` with:
- `AccountProfile` interface:
  ```ts
  export interface AccountProfile {
    id: string;          // 8-character token hash prefix
    name: string;        // user label, e.g. "Default", "Local Dev", "VPS"
    token: string;       // auth token string
    lastUsed: number;    // timestamp
  }
  ```
- Functions:
  - `computeTokenId(token: string): string`: deterministic short hash (e.g. FNV32 or hex substring) for profile identification without exposing plaintext tokens in UI keys.
  - `getSavedAccounts(): AccountProfile[]`: reads from `localStorage.getItem('ai-cli-online-accounts')`.
  - `saveAccount(token: string, name?: string): AccountProfile`: adds or updates an account profile and sets `lastUsed`.
  - `removeAccount(id: string): void`: removes an account by ID from saved accounts.
  - `updateAccountName(id: string, name: string): void`: renames a saved profile label.
  - `getActiveAccount(token: string | null): AccountProfile | null`: finds the matching profile or creates a fallback descriptor (`Account: ***[id]`).
- Write comprehensive unit tests in `web/src/utils/accountStorage.test.ts`.

**Verify**:
```bash
npx vitest run src/utils/accountStorage.test.ts
```
→ Expected: All unit tests pass.

---

### Step 3: Add `UserIcon` and `KeyIcon` to Icons Component

In `web/src/components/icons/index.tsx`, export:
```tsx
export const UserIcon = createIcon('UserIcon', (
  <>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>
));

export const KeyIcon = createIcon('KeyIcon', (
  <>
    <path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5L11 9l-1.5-1.5L8 9" />
    <circle cx="7.5" cy="15.5" r="5.5" />
  </>
));
```
Update `web/src/components/icons/Icons.test.tsx` expectation count to reflect new icons.

**Verify**:
```bash
npx vitest run src/components/icons/Icons.test.tsx
```
→ Expected: All icon tests pass.

---

### Step 4: Namespace Tab Layout Persistence by Token Hash

In `web/src/store/persistence.ts`:
1. Add helper `getTabsKey(token?: string | null): string`:
   ```ts
   export function getTabsKey(token?: string | null): string {
     if (!token || token === 'default') return 'ai-cli-online-tabs-default';
     // deterministic key for token isolation
     let hash = 0;
     for (let i = 0; i < token.length; i++) {
       hash = ((hash << 5) - hash) + token.charCodeAt(i);
       hash |= 0;
     }
     return `ai-cli-online-tabs-${Math.abs(hash).toString(16)}`;
   }
   ```
2. In `persistTabs`: save to both `getTabsKey(token)` and `TABS_KEY` (for backwards compatibility).
3. In `loadTabs(token?: string | null)`: first look up `getTabsKey(token)`, falling back to `TABS_KEY`.
4. In `web/src/store/index.ts`: pass active token to `loadTabs(token)` during `setToken`.

**Verify**:
```bash
npx vitest run src/store/helpers.test.ts
```
→ Expected: Tests pass.

---

### Step 5: Harden `LoginForm.tsx` with Validation & Quick Switch

In `web/src/components/LoginForm.tsx`:
1. On mount, call `verify()` from `../api/auth` to determine `authRequired`.
2. Load saved accounts via `getSavedAccounts()`.
3. If saved accounts exist, render a "Saved Profiles" quick-switch list with 1-click login buttons.
4. On submitting the manual token:
   - Set `loading = true` and `error = ''`.
   - Call `login(inputToken.trim() || 'default')`.
   - On success: call `saveAccount(inputToken.trim() || 'default')` and `setToken(...)`.
   - On failure: set `error = 'Invalid Auth Token. Please verify the credentials configured in your environment.'`.
   - Reset `loading = false`.

**Verify**:
```bash
npx vitest run src/components/LoginForm.test.tsx
```
→ Expected: Tests verify valid login, invalid login error alert, and saved account click.

---

### Step 6: Create `AccountSwitcherModal.tsx`

Create `web/src/components/AccountSwitcherModal.tsx`:
- Accepts `isOpen`, `onClose`, `currentToken`, `onSwitchAccount(token: string)`.
- Renders:
  - Header: "ACCOUNT & IDENTITY // MULTI-PROFILE CONTROL" with `UserIcon` and `CloseIcon`.
  - Active profile highlight card with status badge `ACTIVE`.
  - List of saved accounts with:
    - Profile name (inline editable or with edit label input).
    - Obfuscated token hint (e.g. `***f8a1`).
    - "Switch" button (calls `onSwitchAccount(acc.token)`).
    - "Remove" button (`×`).
  - "+ Connect New Account / Token" section with token input and "Add & Switch" button.
  - "Disconnect / Logout" action button.
  - Keyboard listeners: `Escape` to close, accessible ARIA attributes.
- Write unit tests in `web/src/components/AccountSwitcherModal.test.tsx`.

**Verify**:
```bash
npx vitest run src/components/AccountSwitcherModal.test.tsx
```
→ Expected: Modal tests pass.

---

### Step 7: Integrate Account Switcher into SystemHeader, SettingsModal, and App

1. In `web/src/components/SystemHeader.tsx`:
   - Add Account Profile trigger button next to the model badge:
     ```tsx
     <button
       className="mecha-btn desktop-only"
       onClick={onOpenAccountSwitcher}
       title={`Active Account: ${activeAccountName} (Click to switch)`}
       style={{ padding: '2px 8px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
     >
       <UserIcon size={11} />
       <span>{activeAccountName}</span>
     </button>
     ```
2. In `web/src/components/SettingsModal.tsx`:
   - In "SESSION CONTROL //", add "Switch Profile / Account" button that triggers the Account Switcher modal.
3. In `web/src/components/CommandPalette.tsx`:
   - Add `/account` command: "Switch Account / Profile".
4. In `web/src/App.tsx`:
   - Manage `accountSwitcherOpen` state.
   - Listen for `agy:open-account-switcher` custom event.
   - Render `<AccountSwitcherModal />`.

**Verify**:
```bash
npm test && npm run build
```
→ Expected: All test suites and production build pass.

---

## Test plan

- **Unit tests**:
  - `src/utils/accountStorage.test.ts`: test saving, retrieving, renaming, deduplicating, and removing account profiles.
  - `src/components/LoginForm.test.tsx`: test API verification, error state on 401, and saved account selection.
  - `src/components/AccountSwitcherModal.test.tsx`: test listing saved profiles, switching tokens, renaming labels, and adding new accounts.
- **Integration verification**:
  - `npm test` passes all web vitest suites and Go unit tests.
  - `npm run build` compiles clean production bundle and Go executable.

## Done criteria

- [ ] `web/src/api/auth.ts` provides typed `login` and `verify` methods.
- [ ] `web/src/utils/accountStorage.ts` manages saved account profiles in localStorage.
- [ ] `web/src/store/persistence.ts` namespaces tab layout persistence per token hash.
- [ ] `LoginForm.tsx` validates token via `/api/auth/login`, shows loading/error states, and offers quick-switch for saved accounts.
- [ ] `AccountSwitcherModal.tsx` allows 1-click switching between saved tokens, adding new accounts, and removing old accounts.
- [ ] `SystemHeader.tsx`, `SettingsModal.tsx`, and `CommandPalette.tsx` provide entry points to switch accounts.
- [ ] `npm test` exits 0.
- [ ] `npm run build` exits 0.
- [ ] `plans/README.md` status row for Plan 033 is updated.

## STOP conditions

- If backend `/api/auth/login` contract differs from `{ "token": string }` -> `{"ok": bool}`.
- If switching tokens fails to trigger `reconcileWithTmux` for the target token's session cluster.

## Maintenance notes

- Tokens are stored locally in the developer's browser localStorage (`ai-cli-online-accounts`). No tokens or credentials are submitted outside the local host `/api/auth` endpoints.
- If an account token is revoked or changed on the host server, the UI gracefully prompts for re-authentication.
