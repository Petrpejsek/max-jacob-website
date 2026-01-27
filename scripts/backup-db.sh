#!/bin/bash
# Daily backup script for SQLite DB and assets
# Run via cron: 0 2 * * * /path/to/backup-db.sh

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/render/project/backups}"
DB_PATH="${DB_PATH:-/opt/render/project/data/data.db}"
PUBLIC_DIR="${PUBLIC_DIR:-/opt/render/project/data/public}"
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "[BACKUP] Starting backup at $(date)"

# Backup SQLite database (WAL checkpoint first)
if [ -f "$DB_PATH" ]; then
  echo "[BACKUP] Backing up database: $DB_PATH"
  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"
  cp "$DB_PATH" "$BACKUP_DIR/data-$DATE.db"
  gzip "$BACKUP_DIR/data-$DATE.db"
  echo "[BACKUP] Database backed up to data-$DATE.db.gz"
else
  echo "[BACKUP] WARNING: Database not found at $DB_PATH"
fi

# Backup public assets (screenshots, logos, uploads)
if [ -d "$PUBLIC_DIR" ]; then
  echo "[BACKUP] Backing up assets: $PUBLIC_DIR"
  tar -czf "$BACKUP_DIR/assets-$DATE.tar.gz" -C "$(dirname "$PUBLIC_DIR")" "$(basename "$PUBLIC_DIR")"
  echo "[BACKUP] Assets backed up to assets-$DATE.tar.gz"
else
  echo "[BACKUP] WARNING: Assets directory not found at $PUBLIC_DIR"
fi

# Clean up old backups (keep last 30 days)
echo "[BACKUP] Cleaning up backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name "data-*.db.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "assets-*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "[BACKUP] Backup completed at $(date)"

# List current backups
echo "[BACKUP] Current backups:"
ls -lh "$BACKUP_DIR" | tail -10
