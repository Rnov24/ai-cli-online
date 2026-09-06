#!/bin/sh
# Universal shell trampoline (Termux / Linux / macOS)
if [ -z "${BASH_VERSION:-}" ]; then
  if [ -x "/data/data/com.termux/files/usr/bin/bash" ]; then
    exec /data/data/com.termux/files/usr/bin/bash "$0" "$@"
  elif command -v bash >/dev/null 2>&1; then
    exec bash "$0" "$@"
  fi
fi
# ==============================================================================
# agy-profile — Manual Account Profile Manager for Google Antigravity CLI (agy)
# Switch cleanly between personal, work, or team accounts without violating ToS.
# ==============================================================================
set -euo pipefail

CLI_DIR="${HOME}/.gemini/antigravity-cli"
PROFILES_DIR="${CLI_DIR}/profiles"
TOKEN_FILE="${CLI_DIR}/antigravity-oauth-token"
ACTIVE_FILE="${PROFILES_DIR}/.active"

mkdir -p "$PROFILES_DIR"

sync_active() {
  if [[ -f "$ACTIVE_FILE" ]]; then
    local cur
    cur="$(cat "$ACTIVE_FILE" 2>/dev/null || true)"
    if [[ -n "$cur" && -d "$PROFILES_DIR/$cur" && -f "$TOKEN_FILE" ]]; then
      # If token is a regular file or modified by agy token refresh, sync back
      if [[ ! -L "$TOKEN_FILE" ]] || [[ -f "$TOKEN_FILE" ]]; then
        cp -p "$TOKEN_FILE" "$PROFILES_DIR/$cur/antigravity-oauth-token" 2>/dev/null || true
      fi
    fi
  fi
}

get_current() {
  if [[ -f "$ACTIVE_FILE" ]]; then
    cat "$ACTIVE_FILE" 2>/dev/null || echo "default"
  else
    echo "default"
  fi
}

init_if_needed() {
  if [[ ! -f "$ACTIVE_FILE" ]]; then
    if [[ -f "$TOKEN_FILE" ]]; then
      mkdir -p "$PROFILES_DIR/default"
      cp -p "$TOKEN_FILE" "$PROFILES_DIR/default/antigravity-oauth-token"
      echo "default" > "$ACTIVE_FILE"
      ln -sf "$PROFILES_DIR/default/antigravity-oauth-token" "$TOKEN_FILE"
    fi
  fi
}

cmd_list() {
  init_if_needed
  sync_active
  local cur
  cur="$(get_current)"

  echo "========================================"
  echo "  Antigravity (agy) Account Profiles"
  echo "========================================"

  local count=0
  for p in "$PROFILES_DIR"/*; do
    if [[ -d "$p" ]]; then
      local name
      name="$(basename "$p")"
      count=$((count + 1))
      if [[ "$name" == "$cur" ]]; then
        echo "  * ${name} (active)"
      else
        echo "    ${name}"
      fi
    fi
  done

  if [[ $count -eq 0 ]]; then
    echo "  (No profiles saved yet. Use 'agy-profile save <name>' to save current account.)"
  fi
  echo "========================================"
}

cmd_current() {
  init_if_needed
  sync_active
  echo "$(get_current)"
}

cmd_save() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo "Error: Please specify a profile name."
    echo "Usage: agy-profile save <profile-name>"
    exit 1
  fi

  if [[ ! -f "$TOKEN_FILE" ]]; then
    echo "Error: No active token found at $TOKEN_FILE."
    echo "Please authenticate agy first by running: agy"
    exit 1
  fi

  mkdir -p "$PROFILES_DIR/$name"
  cp -p "$TOKEN_FILE" "$PROFILES_DIR/$name/antigravity-oauth-token"
  echo "$name" > "$ACTIVE_FILE"
  ln -sf "$PROFILES_DIR/$name/antigravity-oauth-token" "$TOKEN_FILE"

  echo "✔ Successfully saved current account to profile: ${name}"
  echo "✔ Profile '${name}' is now active."
}

cmd_switch() {
  local target="${1:-}"
  if [[ -z "$target" ]]; then
    echo "Error: Please specify a profile to switch to."
    echo "Usage: agy-profile switch <profile-name>"
    echo ""
    cmd_list
    exit 1
  fi

  init_if_needed
  sync_active

  if [[ ! -d "$PROFILES_DIR/$target" ]] || [[ ! -f "$PROFILES_DIR/$target/antigravity-oauth-token" ]]; then
    echo "Error: Profile '${target}' does not exist or has no token."
    echo ""
    cmd_list
    exit 1
  fi

  ln -sf "$PROFILES_DIR/$target/antigravity-oauth-token" "$TOKEN_FILE"
  echo "$target" > "$ACTIVE_FILE"
  echo "✔ Switched active Antigravity profile to: ${target}"
}

cmd_add() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo "Error: Please specify a name for the new profile."
    echo "Usage: agy-profile add <profile-name>"
    exit 1
  fi

  init_if_needed
  sync_active

  if [[ -d "$PROFILES_DIR/$name" ]]; then
    echo "Error: Profile '${name}' already exists. Use 'agy-profile switch ${name}' or delete it first."
    exit 1
  fi

  echo "========================================"
  echo "  Adding New Antigravity Profile: ${name}"
  echo "========================================"
  echo "1. Stashing current active profile credentials..."
  
  # Remove current symlink/token so agy starts OAuth flow
  rm -f "$TOKEN_FILE"

  echo "2. Launching 'agy' for Google OAuth login..."
  echo "   Please authenticate with your new account in the browser."
  echo "   (After login finishes, press Ctrl+D or type /exit to return here)"
  echo ""
  
  # Run agy interactively so user can complete auth
  if command -v agy >/dev/null 2>&1; then
    agy || true
  else
    echo "Error: 'agy' command not found in PATH."
    exit 1
  fi

  if [[ -f "$TOKEN_FILE" ]]; then
    mkdir -p "$PROFILES_DIR/$name"
    cp -p "$TOKEN_FILE" "$PROFILES_DIR/$name/antigravity-oauth-token"
    echo "$name" > "$ACTIVE_FILE"
    ln -sf "$PROFILES_DIR/$name/antigravity-oauth-token" "$TOKEN_FILE"
    echo ""
    echo "✔ Successfully configured and activated profile: ${name}"
  else
    echo "Warning: Authentication was not completed or token file was not generated."
    local prev
    prev="$(get_current)"
    if [[ -d "$PROFILES_DIR/$prev" && -f "$PROFILES_DIR/$prev/antigravity-oauth-token" ]]; then
      ln -sf "$PROFILES_DIR/$prev/antigravity-oauth-token" "$TOKEN_FILE"
      echo "Restored previous profile: ${prev}"
    fi
    exit 1
  fi
}

cmd_delete() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo "Error: Please specify a profile name to delete."
    echo "Usage: agy-profile delete <profile-name>"
    exit 1
  fi

  if [[ ! -d "$PROFILES_DIR/$name" ]]; then
    echo "Error: Profile '${name}' does not exist."
    exit 1
  fi

  local cur
  cur="$(get_current)"
  if [[ "$name" == "$cur" ]]; then
    echo "Warning: '${name}' is currently the active profile."
    read -rp "Are you sure you want to delete the active profile? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo "Cancelled."
      exit 0
    fi
    rm -rf "$PROFILES_DIR/$name"
    rm -f "$ACTIVE_FILE" "$TOKEN_FILE"
    echo "Deleted active profile '${name}'."
    echo "Please switch to another profile or run 'agy' to log in."
    return
  fi

  rm -rf "$PROFILES_DIR/$name"
  echo "✔ Deleted profile: ${name}"
}

cmd_rename() {
  local old_name="${1:-}"
  local new_name="${2:-}"
  if [[ -z "$old_name" || -z "$new_name" ]]; then
    echo "Usage: agy-profile rename <old-name> <new-name>"
    exit 1
  fi

  if [[ ! -d "$PROFILES_DIR/$old_name" ]]; then
    echo "Error: Profile '${old_name}' does not exist."
    exit 1
  fi

  if [[ -d "$PROFILES_DIR/$new_name" ]]; then
    echo "Error: Profile '${new_name}' already exists."
    exit 1
  fi

  mv "$PROFILES_DIR/$old_name" "$PROFILES_DIR/$new_name"
  local cur
  cur="$(get_current)"
  if [[ "$cur" == "$old_name" ]]; then
    echo "$new_name" > "$ACTIVE_FILE"
    ln -sf "$PROFILES_DIR/$new_name/antigravity-oauth-token" "$TOKEN_FILE"
  fi
  echo "✔ Renamed profile '${old_name}' to '${new_name}'."
}

show_help() {
  cat << 'EOF'
Antigravity (agy) Account Profile Manager

Usage:
  agy-profile [command] [options]

Commands:
  list, ls                 List all saved account profiles
  current                  Show currently active profile
  switch, use <name>       Switch active account to <name>
  save <name>              Save current authenticated session as <name>
  add <name>               Interactively authenticate and register a new profile
  rename <old> <new>       Rename a profile
  delete, rm <name>        Delete a profile
  help                     Show this help message

Examples:
  agy-profile save personal      # Save current account as 'personal'
  agy-profile add work           # Launch OAuth flow to add a 'work' account
  agy-profile switch work        # Switch to work account
  agy-profile switch personal    # Switch back to personal account
EOF
}

case "${1:-list}" in
  list|ls)
    cmd_list
    ;;
  current)
    cmd_current
    ;;
  save)
    cmd_save "${2:-}"
    ;;
  switch|use)
    cmd_switch "${2:-}"
    ;;
  add)
    cmd_add "${2:-}"
    ;;
  delete|rm)
    cmd_delete "${2:-}"
    ;;
  rename)
    cmd_rename "${2:-}" "${3:-}"
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo "Unknown command: $1"
    echo ""
    show_help
    exit 1
    ;;
esac
