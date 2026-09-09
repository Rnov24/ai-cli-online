# Plan 037: Implement Antigravity Google Auth Multi-Profile Switcher with OAuth Helper

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 91b6a31..HEAD -- internal/agy/ internal/routes/ internal/server/ web/src/components/AccountSwitcherModal.tsx web/src/components/SettingsModal.tsx web/src/App.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/036-minimize-dashboard-and-move-items-to-settings.md
- **Category**: dx
- **Planned at**: commit `91b6a31`, 2026-09-09

## Why this matters

In Google Antigravity CLI (`agy`), user authentication is tied to Google OAuth credentials stored on disk at `~/.gemini/antigravity-cli/antigravity-oauth-token`. Developers frequently operate across multiple Google identities (e.g. personal Gmail accounts, enterprise Google Workspace accounts, or different Vertex AI project allocations with separate quotas and models).

Previously in Plan 033, "account switching" was implemented only for the browser-facing `ai-cli-online` web access token (the web password), failing to address the user's primary requirement: **switching between different Google Antigravity (`agy`) Google accounts and OAuth tokens**. 

Furthermore, logging into a new Google account in headless, Termux, or web terminal environments is challenging: the CLI generates a Google OAuth authorization URL, and the user must manually copy the link, open it in a browser, authorize with Google, copy the authorization code, and paste it back into the terminal.

This plan natively incorporates Google Antigravity profile management into the Go native backend (`/api/agy/profiles`) and provides a guided **OAuth Auth Helper** in `AccountSwitcherModal.tsx` that allows users to 1-click open the Google authorization link and paste the authorization code directly in the UI.

## Scope

**In scope** (the only files you should modify or create):
- `internal/agy/profile.go` (native Go profile manager)
- `internal/agy/profile_test.go` (unit tests for profile management)
- `internal/agy/auth_helper.go` (interactive OAuth flow runner and code submission handler)
- `internal/routes/agy_profiles.go` (REST handler for profiles and auth helper)
- `internal/routes/agy_profiles_test.go` (unit tests for routes)
- `internal/server/server.go` (register `/api/agy/profiles` routes)
- `web/src/api/agyProfiles.ts` (typed frontend client for Google Antigravity profiles & auth helper)
- `web/src/components/AccountSwitcherModal.tsx` (Google Antigravity profiles manager + OAuth Link & Paste Helper)
- `web/src/components/AccountSwitcherModal.test.tsx` (update tests for profile switching and auth helper)
- `web/src/components/SettingsModal.tsx` (display active Google account in settings)
- `plans/README.md` (update status row)

**Out of scope** (do NOT touch):
- `ai-cli-task` skills and lifecycle plugins
- PTY relay logic (`internal/ws/`)
- SQLite database tables (`internal/db/`) — profiles are filesystem-backed to preserve full parity with `scripts/agy-profile.sh` and external `agy` CLI invocations.

## Git workflow

- Branch: `advisor/037-antigravity-google-auth-multi-profile-switcher`
- Commit per logical unit:
  - `feat(backend): implement native Antigravity Google auth profile manager and routes`
  - `feat(ui): redesign AccountSwitcherModal for Antigravity Google OAuth profiles and auth helper`
  - `test: add unit and integration tests for Google auth profile switching`
- Do NOT push or open a PR.

## Steps

### Step 1: Implement `internal/agy/profile.go` and `profile_test.go`

1. Create `internal/agy/profile.go`:
   - Data structures:
     ```go
     type ProfileInfo struct {
         Name      string `json:"name"`
         IsActive  bool   `json:"isActive"`
         UpdatedAt int64  `json:"updatedAt"`
         HasToken  bool   `json:"hasToken"`
     }

     type ProfilesResponse struct {
         Current  string        `json:"current"`
         Profiles []ProfileInfo `json:"profiles"`
     }
     ```
   - Implementation:
     - Configurable directory locations via package variable `CustomCliDir` (defaults to `~/.gemini/antigravity-cli`).
     - `EnsureDefaultProfile()`:
       If `antigravity-oauth-token` exists and no `profiles/.active` exists:
       Create `profiles/default`, copy `antigravity-oauth-token` to `profiles/default/antigravity-oauth-token`, write `"default"` into `profiles/.active`.
     - `SyncActiveToken()`:
       If `profiles/.active` exists, read active profile name `cur`. If `profiles/cur` exists and `antigravity-oauth-token` was refreshed, copy `antigravity-oauth-token` back to `profiles/cur/antigravity-oauth-token`.
     - `ListProfiles() (*ProfilesResponse, error)`:
       Calls `EnsureDefaultProfile()` and `SyncActiveToken()`.
       Reads `profiles/.active` to get `Current`. If missing, defaults to `"default"`.
       Iterates entries in `profiles/`. For each subdirectory, checks if `antigravity-oauth-token` exists and reads mod time.
       Sorts profiles with active profile first, then alphabetically.
     - `SwitchProfile(name string) error`:
       Validate `name` is clean/valid identifier (`^[a-zA-Z0-9_-]+$`).
       Check `profiles/name/antigravity-oauth-token` exists.
       Call `SyncActiveToken()`.
       Copy `profiles/name/antigravity-oauth-token` to `antigravity-oauth-token`.
       Write `name` to `profiles/.active`.
     - `SaveCurrentProfile(name string) error`:
       Validate `name` is clean identifier (`^[a-zA-Z0-9_-]+$`).
       Ensure `antigravity-oauth-token` exists.
       Create `profiles/name`.
       Copy `antigravity-oauth-token` to `profiles/name/antigravity-oauth-token`.
       Write `name` to `profiles/.active`.
     - `SaveProfileWithToken(name string, tokenContent []byte) error`:
       Validate `name`. Validate `tokenContent` is valid JSON or non-empty string.
       Create `profiles/name`.
       Write `tokenContent` to `profiles/name/antigravity-oauth-token`.
       Write `name` to `profiles/.active`.
       Copy `profiles/name/antigravity-oauth-token` to `antigravity-oauth-token`.
     - `DeleteProfile(name string) error`:
       If `name` is the active profile, return an error (`"cannot delete active profile"`).
       Remove `profiles/name`.
     - `RenameProfile(oldName, newName string) error`:
       Validate names. Rename `profiles/oldName` to `profiles/newName`. If `oldName` was active, update `profiles/.active`.
2. Write unit tests in `internal/agy/profile_test.go` using `t.TempDir()`.

**Verify**:
`go test -v ./internal/agy/...` → exit 0.

---

### Step 2: Implement `internal/agy/auth_helper.go` for OAuth Flow

1. Create `internal/agy/auth_helper.go`:
   - Handles the OAuth login helper:
     - `StartAuthFlow(profileName string) (authUrl string, flowId string, err error)`:
       Spawns `agy` in a fresh environment without token, captures stdout looking for Google OAuth URL (`https://accounts.google.com/...`), stores running process in `sync.Map` by `flowId`.
     - `SubmitAuthCode(flowId string, profileName string, code string) error`:
       Sends authorization code + newline to `agy`'s stdin, waits for exit code 0 or token generation, then saves to `profiles/<profileName>/antigravity-oauth-token` and sets as active.
     - Also provides a fallback if `agy` cannot be spawned non-interactively: returns instructions or allows direct paste.
2. Unit test `auth_helper.go`.

**Verify**:
`go test -v ./internal/agy/...` → exit 0.

---

### Step 3: Implement `internal/routes/agy_profiles.go` and Wire in `server.go`

1. Create `internal/routes/agy_profiles.go`:
   - Methods:
     - `GET /api/agy/profiles`: returns list of profiles and current active profile.
     - `POST /api/agy/profiles/switch`: accepts `{"name":"..."}`, calls `SwitchProfile`.
     - `POST /api/agy/profiles/save`: accepts `{"name":"..."}`, saves current token.
     - `POST /api/agy/profiles/import`: accepts `{"name":"...", "token":"..."}`, saves raw token.
     - `POST /api/agy/profiles/rename`: accepts `{"oldName":"...", "newName":"..."}`.
     - `DELETE /api/agy/profiles/{name}`: deletes profile.
     - `POST /api/agy/profiles/auth/start`: starts auth flow, returns `{ "authUrl": "...", "flowId": "..." }`.
     - `POST /api/agy/profiles/auth/submit`: accepts `{ "flowId": "...", "profileName": "...", "code": "..." }`.
2. Register in `internal/server/server.go`.

**Verify**:
`go test -v ./internal/routes/...` → exit 0.

---

### Step 4: Create Frontend API Client `web/src/api/agyProfiles.ts`

1. Create `web/src/api/agyProfiles.ts` exporting:
   - `fetchAgyProfiles(token?: string): Promise<AgyProfilesResponse>`
   - `switchAgyProfile(name: string, token?: string): Promise<{ ok: boolean; current: string }>`
   - `saveCurrentAgyProfile(name: string, token?: string): Promise<{ ok: boolean; current: string }>`
   - `importAgyProfile(name: string, tokenContent: string, token?: string): Promise<{ ok: boolean; current: string }>`
   - `startAgyAuth(profileName: string, token?: string): Promise<{ authUrl?: string; flowId?: string; manualTerminalCommand?: string }>`
   - `submitAgyAuthCode(flowId: string, profileName: string, code: string, token?: string): Promise<{ ok: boolean; current: string }>`
   - `renameAgyProfile(oldName: string, newName: string, token?: string): Promise<{ ok: boolean }>`
   - `deleteAgyProfile(name: string, token?: string): Promise<{ ok: boolean }>`

**Verify**:
In `web/`: `npx tsc --noEmit` → exit 0.

---

### Step 5: Redesign `AccountSwitcherModal.tsx` with Google Auth Helper

1. In `web/src/components/AccountSwitcherModal.tsx`:
   - Header: `GOOGLE ANTIGRAVITY (AGY) ACCOUNTS //`
   - Active Profile Hero Banner: displays active Google account (e.g. `default`, `personal`, `work`) with `◈ ACTIVE GOOGLE IDENTITY`.
   - Profiles List:
     - 1-click **SWITCH** button.
     - Rename and Delete buttons.
   - **Interactive Google Auth Helper**:
     - Mode A: **Guided Google Sign-in**:
       - Profile Name input (e.g. `work-gemini`).
       - Button: **"Get Google Authorization Link"**.
       - When clicked:
         - Displays a 1-click button: **"Open Google Sign-In Page ↗"** (opens the OAuth URL directly in a new tab).
         - An input field with paste button: **"Paste Google Authorization Code"**.
         - Button: **"Verify & Complete Login"**.
         - Fallback button: **"Open Terminal Login"** (runs `bash scripts/agy-profile.sh add <name>`).
     - Mode B: **Direct Paste Token JSON**:
       - Paste raw `antigravity-oauth-token` JSON from another machine or backup.
   - Preserves collapsible footer for web workspace credentials if needed.

**Verify**:
In `web/`: `npx tsc --noEmit` → exit 0.

---

### Step 6: Integrate with `SettingsModal.tsx`

1. In `web/src/components/SettingsModal.tsx`:
   - In `USER PROFILES & AUTHENTICATION //`:
     - Show: `Active Google Antigravity Account: <currentProfile>`
     - Button `SWITCH GOOGLE ACCOUNT` opens `AccountSwitcherModal`.

**Verify**:
In `web/`: `npx tsc --noEmit` → exit 0.

---

### Step 7: Update Tests in `AccountSwitcherModal.test.tsx`

1. In `web/src/components/AccountSwitcherModal.test.tsx`:
   - Verify rendering of active Google profile and profiles list.
   - Verify clicking switch calls `switchAgyProfile`.
   - Verify the Auth Helper shows the link and handles code submission.
   - Verify direct token paste imports profile.

**Verify**:
In `web/`: `npx vitest run src/components/AccountSwitcherModal.test.tsx` → all pass.

---

### Step 8: Full Verification & Commit

1. Run `go test -v ./...` → all pass.
2. Run `npx tsc --noEmit` in `web/` → exit 0.
3. Run `npx vitest run` in `web/` → all pass.
4. Commit changes following the git workflow.

## Done criteria

- [ ] `internal/agy/profile.go` implements safe profile listing, switching, saving, renaming, and deletion.
- [ ] `internal/agy/auth_helper.go` and `/api/agy/profiles` endpoints provide Google OAuth link extraction and code submission.
- [ ] Frontend `web/src/api/agyProfiles.ts` provides typed API calls.
- [ ] `AccountSwitcherModal.tsx` provides 1-click Google account switching, Google OAuth link button, and code/token paste input.
- [ ] `SettingsModal.tsx` shows the active Google Antigravity profile.
- [ ] All unit and integration tests pass with 0 errors.
