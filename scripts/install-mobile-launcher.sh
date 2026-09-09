#!/usr/bin/env bash
# ==============================================================================
# AGY Online — Mobile Headless 1-Tap Launcher Installer (Termux:Widget)
# Configures background tasks for 1-tap startup and shutdown from Android home screen
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=================================================="
echo "  AGY Online — Mobile Headless Launcher Installer"
echo "=================================================="

# 1. Check if running in Termux
if [[ ! -d "/data/data/com.termux" ]] && [[ -z "${TERMUX_VERSION:-}" ]]; then
  echo "Notice: This installer is designed for Termux on Android."
  echo "Termux:Widget runs shortcut scripts located in ~/.shortcuts/tasks/."
  read -rp "Continue anyway? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    exit 0
  fi
fi

# 2. Create directories for Termux:Widget tasks (headless background execution)
SHORTCUTS_TASKS_DIR="${HOME}/.shortcuts/tasks"
mkdir -p "$SHORTCUTS_TASKS_DIR"

START_TASK="${SHORTCUTS_TASKS_DIR}/agy-start"
STOP_TASK="${SHORTCUTS_TASKS_DIR}/agy-stop"

# 3. Generate ~/.shortcuts/tasks/agy-start
cat > "$START_TASK" << 'TASK_EOF'
#!/data/data/com.termux/files/usr/bin/bash
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi
PROJECT_DIR="__PROJECT_DIR__"
cd "$PROJECT_DIR"
./bin/agy-online start -d
# Open browser automatically to localhost URL
if command -v termux-open-url >/dev/null 2>&1; then
  sleep 1
  termux-open-url "http://localhost:3001"
fi
TASK_EOF

sed -i "s|__PROJECT_DIR__|${PROJECT_DIR}|g" "$START_TASK"
chmod +x "$START_TASK"

# 4. Generate ~/.shortcuts/tasks/agy-stop
cat > "$STOP_TASK" << 'TASK_EOF'
#!/data/data/com.termux/files/usr/bin/bash
PROJECT_DIR="__PROJECT_DIR__"
cd "$PROJECT_DIR"
./bin/agy-online stop
if command -v termux-wake-unlock >/dev/null 2>&1; then
  termux-wake-unlock
fi
TASK_EOF

sed -i "s|__PROJECT_DIR__|${PROJECT_DIR}|g" "$STOP_TASK"
chmod +x "$STOP_TASK"

# 5. Output confirmation and instructions
echo ""
echo "✔ Termux:Widget tasks successfully installed:"
echo "  - Start: $START_TASK"
echo "  - Stop:  $STOP_TASK"
echo ""
echo "To add 1-tap launchers to your Android Home Screen:"
echo " 1. Install 'Termux:Widget' APK (from F-Droid or GitHub releases)."
echo " 2. Long-press on your Android home screen and select Widgets."
echo " 3. Locate 'Termux:Widget' and add a shortcut or widget list."
echo " 4. Choose 'agy-start' (starts daemon headlessly + opens browser) or 'agy-stop'."
echo " 5. Tap the home screen shortcut to run AGY Online with zero terminal interaction."
echo "=================================================="
