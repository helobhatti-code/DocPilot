#!/usr/bin/env bash
#
# GPMS — Postgres + uploads backup script.
#
# Usage:
#   ./scripts/backup.sh                       # uses values from .env / env vars
#   BACKUP_DIR=/var/backups/gpms ./backup.sh
#
# Cron example (daily at 02:30):
#   30 2 * * * /opt/gpms/scripts/backup.sh >> /var/log/gpms-backup.log 2>&1
#

set -euo pipefail

# Load .env if present (without exporting unrelated junk)
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/$TIMESTAMP"

mkdir -p "$TARGET"

PG_USER="${POSTGRES_USER:-postgres}"
PG_DB="${POSTGRES_DB:-gpms}"
PG_CONTAINER="${PG_CONTAINER:-gpms-postgres}"

echo "[backup] Postgres dump → $TARGET/db.dump"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -F c -d "$PG_DB" \
  > "$TARGET/db.dump"

if [[ -d "${UPLOAD_DIR:-./uploads}" ]]; then
  echo "[backup] Uploads → $TARGET/uploads.tar.gz"
  tar -czf "$TARGET/uploads.tar.gz" -C "$(dirname "${UPLOAD_DIR:-./uploads}")" \
    "$(basename "${UPLOAD_DIR:-./uploads}")"
fi

echo "[backup] Wrote $(du -sh "$TARGET" | cut -f1) of data"

# Prune old backups
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
  -mtime +"$RETENTION_DAYS" -print -exec rm -rf {} +

echo "[backup] Done."
