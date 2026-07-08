#!/usr/bin/env bash
# NFR-8 — nightly Postgres backup with 14-day retention.
# Cron example: 15 2 * * * /app/scripts/backup.sh >> /var/log/signx-backup.log 2>&1
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/signx-reach}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/signx-reach-$STAMP.sql.gz"

pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$FILE"
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Retention: drop backups older than N days.
find "$BACKUP_DIR" -name 'signx-reach-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "retention: removed backups older than $RETENTION_DAYS days"

# Offsite copy (docs/08) — Cloudflare R2 free tier via rclone, optional.
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE" --s3-no-check-bucket
  rclone delete "$BACKUP_RCLONE_REMOTE" --min-age "${RETENTION_DAYS}d" || true
  echo "offsite: copied to $BACKUP_RCLONE_REMOTE"
fi

# Restore drill (docs/03 §7 — monthly):
#   createdb signx_restore && gunzip -c FILE | psql signx_restore
