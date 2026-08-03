#!/bin/sh
# Runs before the node process starts.
# Ensures bind-mounted config files exist as regular files, not directories.
# Docker Compose creates a directory when the host file doesn't exist at mount time.
set -e

ensure_file() {
  local path="$1"
  local default="$2"
  if [ -d "$path" ]; then
    rm -rf "$path"
    printf '%s' "$default" > "$path"
  elif [ ! -f "$path" ]; then
    printf '%s' "$default" > "$path"
  fi
}

ensure_file "${TOKENS_FILE:-/app/config/2fa-tokens.json}" '{}'
ensure_file "${AUDIT_LOG_FILE:-/app/config/audit.log}"    ''

exec "$@"
