#!/usr/bin/env bash
# Create and verify a consistent SQLite backup, then remove old backups.
set -euo pipefail

readonly database=/var/lib/cubench/cubench.db
readonly backup_dir=/var/backups/cubench

[[ -f "$database" ]] || exit 0

exec 9>"$backup_dir/backup.lock"
flock 9

timestamp=$(date -u +%Y%m%dT%H%M%S.%NZ)
backup="$backup_dir/cubench-$timestamp.db"

sqlite3 "$database" ".backup '$backup'"
[[ $(sqlite3 "$backup" "PRAGMA integrity_check;") == "ok" ]]
gzip "$backup"
find "$backup_dir" -type f -name 'cubench-*.db.gz' -mtime +14 -delete
