#!/usr/bin/env bash
# ==============================================================================
# AGY Online — Termux:Boot Auto-Serving Installer
# Automatically launches AGY Online on Android boot with wake-lock and PID tracking
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=================================================="
echo "  AGY Online — Termux:Boot Auto-Serving Installer"
echo "=================================================="

# Check if running in Termux
if [[ ! -d "/data/data/com.termux" ]] && [[ -z "${TERMUX_VERSION:-}" ]]; then
  echo "Notice: This installer is optimized for Termux on Android."
  echo "If you are on standard Linux, use ./install-service.sh for systemd."
  read -rp "Continue anyway? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    exit 0
  fi
fi

BOOT_DIR="${HOME}/.termux/boot"
mkdir -p "$BOOT_DIR"

BOOT_SCRIPT="${BOOT_DIR}/start-ai-cli-online.sh"
LOG_DIR="${HOME}/.ai-cli-online/logs"
RUN_DIR="${HOME}/.ai-cli-online/run"
mkdir -p "$LOG_DIR" "$RUN_DIR"

NODE_BIN="$(which node 2>/dev/null || echo "/data/data/com.termux/files/usr/bin/node")"
CLI_BIN="${ROOT_DIR}/bin/ai-cli-online.mjs"

echo "Configuring boot script at: ${BOOT_SCRIPT}"

cat > "$BOOT_SCRIPT" << 'BOOT_EOF'
#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# AGY Online Auto-Start on Android Boot (Termux:Boot)
# ==============================================================================

# 1. Acquire wake-lock to prevent CPU sleep when screen is off
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

# 2. Environment paths
export PREFIX="/data/data/com.termux/files/usr"
export HOME="/data/data/com.termux/files/home"
export PATH="${HOME}/.gemini/antigravity-cli/bin:${PREFIX}/bin:${PATH}"
export NODE_OPTIONS="--expose-gc --max-old-space-size=256"

ROOT_DIR="__ROOT_DIR__"
BOOT_LOG="${HOME}/.ai-cli-online/logs/boot.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Device booted. Starting AGY Online..." >> "$BOOT_LOG"

# 3. Wait 3 seconds for network interfaces to initialize
sleep 3

# 4. Start AGY Online in background daemon mode
cd "$ROOT_DIR"
./bin/ai-cli-online start -d >> "$BOOT_LOG" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] AGY Online boot script finished." >> "$BOOT_LOG"
BOOT_EOF

# Substitute actual ROOT_DIR into the boot script
sed -i "s|__ROOT_DIR__|${ROOT_DIR}|g" "$BOOT_SCRIPT"
chmod +x "$BOOT_SCRIPT"

echo ""
echo "✔ Termux:Boot script successfully installed to: $BOOT_SCRIPT"
echo ""
echo "Requirements for automatic startup on Android boot:"
echo " 1. Install 'Termux:Boot' APK (from F-Droid or GitHub releases)."
echo " 2. Open the Termux:Boot app ONCE to allow it to receive boot permissions."
echo " 3. Disable battery optimization for both Termux and Termux:Boot in Android settings."
echo ""
echo "Test now manually by running:"
echo "  bash $BOOT_SCRIPT"
echo "Or check status with:"
echo "  ./bin/ai-cli-online status"
echo "=================================================="
