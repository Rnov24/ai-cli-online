# Plan 002: Add Mobile Headless 1-Tap Launcher and Standalone PWA Support

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 077ca51..HEAD -- web/index.html internal/server/server.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-fix-termux-boot-and-phantom-killer.md
- **Category**: dx
- **Planned at**: commit `077ca51`, 2026-09-05

## Why this matters

Mobile users who want to run AGY Online without opening Termux currently face a major gap if they need to start or stop the server during the day without a device reboot. Termux provides the `Termux:Widget` extension and `RUN_COMMAND` intent, which can run commands headlessly (`background=true`) directly from an Android home screen widget or shortcut. In addition, the frontend lacks a Web App Manifest ([`web/manifest.webmanifest`](file:///data/data/com.termux/files/home/ai-cli-online/web/)), preventing mobile browsers from offering "Install App" / "Add to Home Screen". With a headless shortcut installer and a standalone PWA manifest, users can tap a home screen icon to launch AGY Online fullscreen with zero terminal interaction.

## Current state

- In [web/index.html:L6-10](file:///data/data/com.termux/files/home/ai-cli-online/web/index.html#L6-L10), basic mobile meta tags exist but there is no `manifest.webmanifest` link:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content" />
  <meta name="theme-color" content="#08090b" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  ```
- In [internal/server/server.go:L141-154](file:///data/data/com.termux/files/home/ai-cli-online/internal/server/server.go#L141-L154), static MIME types are handled manually:
  ```go
  if strings.HasSuffix(cleanPath, ".js") {
      w.Header().Set("Content-Type", "application/javascript")
  } else if strings.HasSuffix(cleanPath, ".css") {
      w.Header().Set("Content-Type", "text/css; charset=utf-8")
  ...
  ```
  Files ending in `.webmanifest` or `.json` do not have an explicit `application/manifest+json` header.
- No headless launcher script exists in `scripts/` to configure Termux:Widget shortcuts (`~/.shortcuts/tasks/`).

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Build UI  | `npm run build --workspace=web`            | exit 0              |
| Verify Go | `go test ./internal/...`                   | exit 0, all pass    |
| Build CLI | `go build -o bin/ai-cli-online ./cmd/ai-cli-online` | exit 0     |
| Syntax    | `bash -n scripts/install-mobile-launcher.sh` | exit 0             |

## Scope

**In scope** (the only files you should modify):
- `scripts/install-mobile-launcher.sh` (create)
- `web/public/manifest.webmanifest` (create)
- `web/index.html`
- `internal/server/server.go`

**Out of scope** (do NOT touch):
- `internal/pty/*`, `internal/tmux/*`
- Any React layout or editor component under `web/src/`

## Git workflow

- Branch: `advisor/002-mobile-headless-launcher-and-pwa`
- Commit message: `feat(mobile): add headless widget launcher and PWA standalone manifest`

## Steps

### Step 1: Create `web/public/manifest.webmanifest`

Create `web/public/manifest.webmanifest` with PWA manifest metadata:
```json
{
  "name": "AGY Online — Antigravity Workspace",
  "short_name": "AGY Online",
  "description": "Terminal & Autonomous Task Development Workspace for Google Antigravity CLI",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#08090b",
  "theme_color": "#08090b",
  "orientation": "any",
  "icons": [
    {
      "src": "/favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

**Verify**: Validate JSON syntax with `node -e "JSON.parse(require('fs').readFileSync('web/public/manifest.webmanifest'))"` → exit 0.

### Step 2: Link manifest in `web/index.html`

In [web/index.html:L6](file:///data/data/com.termux/files/home/ai-cli-online/web/index.html#L6):
Add:
```html
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/favicon.svg" />
```

**Verify**: `npm run build --workspace=web` → confirm `web/dist/manifest.webmanifest` is generated.

### Step 3: Add `.webmanifest` Content-Type in `internal/server/server.go`

In [internal/server/server.go:L141-154](file:///data/data/com.termux/files/home/ai-cli-online/internal/server/server.go#L141-L154):
Add handling for `.webmanifest`:
```go
} else if strings.HasSuffix(cleanPath, ".webmanifest") {
    w.Header().Set("Content-Type", "application/manifest+json")
}
```

**Verify**: `go test ./internal/server/...` (or `./internal/...`) → exit 0.

### Step 4: Create `scripts/install-mobile-launcher.sh` for Termux:Widget / 1-Tap Home Screen

Create executable script `scripts/install-mobile-launcher.sh`:
1. Check if running on Android/Termux.
2. Create directories:
   `~/.shortcuts/tasks` (for Termux:Widget background headless execution).
3. Generate `~/.shortcuts/tasks/agy-start`:
   ```bash
   #!/data/data/com.termux/files/usr/bin/bash
   if command -v termux-wake-lock >/dev/null 2>&1; then
     termux-wake-lock
   fi
   PROJECT_DIR="__PROJECT_DIR__"
   cd "$PROJECT_DIR"
   ./bin/ai-cli-online start -d
   # Open browser automatically to localhost URL
   if command -v termux-open-url >/dev/null 2>&1; then
     sleep 1
     termux-open-url "http://localhost:3001"
   fi
   ```
4. Generate `~/.shortcuts/tasks/agy-stop`:
   ```bash
   #!/data/data/com.termux/files/usr/bin/bash
   PROJECT_DIR="__PROJECT_DIR__"
   cd "$PROJECT_DIR"
   ./bin/ai-cli-online stop
   if command -v termux-wake-unlock >/dev/null 2>&1; then
     termux-wake-unlock
   fi
   ```
5. Set `chmod +x` on created task files.
6. Provide clear instructions for adding the 1-tap widget to the Android Home Screen via Termux:Widget.

**Verify**: `bash -n scripts/install-mobile-launcher.sh` → exit 0.

## Test plan

- Test web build:
  ```bash
  npm run build --workspace=web
  ```
  Verify `web/dist/manifest.webmanifest` exists.
- Recompile Go binary and verify static serving:
  ```bash
  go build -o bin/ai-cli-online ./cmd/ai-cli-online
  ```
- Start server locally and request manifest:
  ```bash
  curl -I http://localhost:3001/manifest.webmanifest
  ```
  Confirm `HTTP/1.1 200 OK` and `Content-Type: application/manifest+json`.

## Done criteria

- [ ] `web/public/manifest.webmanifest` exists and contains valid JSON.
- [ ] `web/index.html` references `<link rel="manifest" href="/manifest.webmanifest" />`.
- [ ] `internal/server/server.go` serves `.webmanifest` with `application/manifest+json`.
- [ ] `scripts/install-mobile-launcher.sh` exists, is executable, and passes `bash -n`.
- [ ] `npm run build` and `go test ./internal/...` exit 0.
- [ ] No out-of-scope files modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- If Termux path layout on non-standard Android ROMs differs from `/data/data/com.termux`, report back.
- If Vite build configuration fails to copy `public/manifest.webmanifest`, stop and check `vite.config.ts`.

## Maintenance notes

- When changing default ports or branding assets, update `web/public/manifest.webmanifest` and `scripts/install-mobile-launcher.sh` accordingly.
