#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:-db/custom.db}"
BACKUP_DIR="${2:-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
EXTERNAL_BACKUP_DIR="${EXTERNAL_BACKUP_DIR:-}"

command -v sqlite3 >/dev/null || { echo "Falta sqlite3; no se realizó ninguna copia." >&2; exit 2; }
test -f "$DB_PATH" || { echo "No existe la base: $DB_PATH" >&2; exit 2; }
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y-%m-%d_%H%M%S)"
target="$BACKUP_DIR/trazabilidad-$timestamp.sqlite"

# .backup uses SQLite's online backup API and is safe with WAL/concurrent readers.
sqlite3 "$DB_PATH" ".timeout 30000" ".backup '$target'"
result="$(sqlite3 "$target" 'PRAGMA integrity_check;')"
test "$result" = "ok" || { rm -f "$target"; echo "La copia no superó integrity_check: $result" >&2; exit 1; }

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'trazabilidad-*.sqlite' -mtime "+$RETENTION_DAYS" -delete
if test -n "$EXTERNAL_BACKUP_DIR"; then
  mkdir -p "$EXTERNAL_BACKUP_DIR"
  cp -- "$target" "$EXTERNAL_BACKUP_DIR/"
fi
printf '%s\n' "$target"
