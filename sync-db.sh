#!/bin/bash

# =============================================================
#  Max & Jacob — Production Database Sync
# =============================================================
#
#  Downloads the production database and replaces the local copy.
#  Production is the SINGLE SOURCE OF TRUTH.
#
#  Usage:
#    ./sync-db.sh            # Full sync (stop server → download → replace → restart)
#    ./sync-db.sh --force    # Skip confirmation prompt
#    ./sync-db.sh --dry-run  # Test connection without replacing local DB
#
#  Requirements:
#    - curl must be installed
#    - .env must contain ADMIN_PASSWORD
#    - PRODUCTION_URL must be set in .env (defaults to https://maxandjacob.com)
#
#  Safety:
#    - Local database is ALWAYS backed up before replacement
#    - Backups are stored in .db-backups/ (gitignored)
#    - Downloaded file is verified (SQLite header + table count)
#    - Local server is stopped during sync to prevent lock conflicts
#
# =============================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Paths
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DB="$PROJECT_DIR/data.db"
BACKUP_DIR="$PROJECT_DIR/.db-backups"
TEMP_DB="$PROJECT_DIR/.db-sync-temp.db"
PID_FILE="$PROJECT_DIR/.dev.pid"
ENV_FILE="$PROJECT_DIR/.env"

# Parse arguments
FORCE=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      echo "Usage: ./sync-db.sh [--force] [--dry-run] [--help]"
      echo ""
      echo "  --force     Skip confirmation prompt"
      echo "  --dry-run   Test connection without replacing local DB"
      echo "  --help      Show this help"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown argument: $arg${NC}"
      echo "Usage: ./sync-db.sh [--force] [--dry-run] [--help]"
      exit 1
      ;;
  esac
done

# Helper functions
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }
print_info()    { echo -e "${BLUE}ℹ${NC} $1"; }
print_warn()    { echo -e "${YELLOW}⚠${NC} $1"; }

cleanup() {
  rm -f "$TEMP_DB"
}
trap cleanup EXIT

# ============================================================
echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  Max & Jacob — Database Sync${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# Step 0: Load environment variables from .env
if [ ! -f "$ENV_FILE" ]; then
  print_error ".env file not found at $ENV_FILE"
  exit 1
fi

# Safely load .env (handle values with spaces/special chars)
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
  # Trim whitespace
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)
  # Export if not already set
  if [ -n "$key" ] && [ -n "$value" ]; then
    export "$key=$value" 2>/dev/null || true
  fi
done < "$ENV_FILE"

PROD_URL="${PRODUCTION_URL:-https://maxandjacob.com}"
ADMIN_PASS="${ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_PASS" ]; then
  print_error "ADMIN_PASSWORD not found in .env"
  print_info "Add ADMIN_PASSWORD=your_password to .env"
  exit 1
fi

print_info "Production server: ${BOLD}$PROD_URL${NC}"

# Step 1: Test production server connectivity
print_info "Testing connection to production server..."

HEALTH_RESPONSE=$(curl -s --max-time 15 "$PROD_URL/health" 2>/dev/null || echo "FAILED")

if [[ "$HEALTH_RESPONSE" == "FAILED" ]]; then
  print_error "Cannot reach production server at $PROD_URL"
  print_info "Check your internet connection and PRODUCTION_URL in .env"
  exit 1
fi

# Check if DB is healthy on production
DB_STATUS=$(echo "$HEALTH_RESPONSE" | grep -o '"db":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$DB_STATUS" != "ok" ]; then
  print_error "Production database is not healthy (status: $DB_STATUS)"
  print_info "Health response: $HEALTH_RESPONSE"
  exit 1
fi

print_success "Production server is healthy (DB: ok)"

# Step 2: Test authentication
print_info "Testing authentication..."

AUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
  -H "Authorization: Bearer $ADMIN_PASS" \
  "$PROD_URL/api/db-backup" 2>/dev/null || echo "000")

# We expect 200 (success) - any response means auth works
# For dry run, we'll check the header only
if [ "$AUTH_TEST" = "401" ]; then
  print_error "Authentication failed (HTTP 401)"
  print_info "Check that ADMIN_PASSWORD in .env matches the production server"
  exit 1
elif [ "$AUTH_TEST" = "000" ]; then
  print_error "Connection failed during auth test"
  exit 1
fi

print_success "Authentication successful"

if [ "$DRY_RUN" = true ]; then
  echo ""
  print_success "Dry run complete — connection and auth are working!"
  print_info "Run without --dry-run to actually sync the database"
  exit 0
fi

# Step 3: Confirmation prompt (unless --force)
if [ "$FORCE" != true ]; then
  echo ""
  print_warn "This will REPLACE your local database with production data."
  print_info "Your current local database will be backed up to .db-backups/"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Sync cancelled."
    exit 0
  fi
fi

# Step 4: Stop local server if running
SERVER_WAS_RUNNING=false
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1; then
    SERVER_WAS_RUNNING=true
    print_warn "Stopping local server (PID: $PID)..."
    kill "$PID" 2>/dev/null || true
    # Wait for process to exit
    for i in {1..10}; do
      if ! ps -p "$PID" > /dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
    # Force kill if still running
    if ps -p "$PID" > /dev/null 2>&1; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    print_success "Local server stopped"
  fi
fi

# Step 5: Back up local database
echo ""
print_info "Backing up local database..."
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

BACKED_UP=false
if [ -f "$LOCAL_DB" ]; then
  LOCAL_SIZE=$(wc -c < "$LOCAL_DB" | tr -d ' ')
  cp "$LOCAL_DB" "$BACKUP_DIR/data.db.backup-$TIMESTAMP"
  BACKED_UP=true
  print_success "Local DB backed up: .db-backups/data.db.backup-$TIMESTAMP ($(( LOCAL_SIZE / 1024 / 1024 ))MB)"
fi

# Also back up WAL and SHM files
if [ -f "$LOCAL_DB-wal" ]; then
  cp "$LOCAL_DB-wal" "$BACKUP_DIR/data.db-wal.backup-$TIMESTAMP"
fi
if [ -f "$LOCAL_DB-shm" ]; then
  cp "$LOCAL_DB-shm" "$BACKUP_DIR/data.db-shm.backup-$TIMESTAMP"
fi

if [ "$BACKED_UP" = false ]; then
  print_info "No existing local database to back up (first sync)"
fi

# Step 6: Download production database
echo ""
print_info "Downloading production database..."
print_info "This may take a moment depending on database size..."

HTTP_CODE=$(curl -s -w "%{http_code}" -o "$TEMP_DB" --max-time 120 \
  -H "Authorization: Bearer $ADMIN_PASS" \
  "$PROD_URL/api/db-backup" 2>/dev/null)

if [ "$HTTP_CODE" != "200" ]; then
  print_error "Download failed (HTTP $HTTP_CODE)"
  if [ -f "$TEMP_DB" ]; then
    # Show error response if it's small (likely JSON error)
    TEMP_SIZE=$(wc -c < "$TEMP_DB" | tr -d ' ')
    if [ "$TEMP_SIZE" -lt 1000 ]; then
      echo "  Response: $(cat "$TEMP_DB")"
    fi
  fi
  rm -f "$TEMP_DB"
  exit 1
fi

# Step 7: Verify downloaded database
DOWNLOAD_SIZE=$(wc -c < "$TEMP_DB" | tr -d ' ')

if [ "$DOWNLOAD_SIZE" -lt 4096 ]; then
  print_error "Downloaded file is too small ($DOWNLOAD_SIZE bytes) — likely an error response"
  if [ "$DOWNLOAD_SIZE" -lt 1000 ]; then
    echo "  Content: $(cat "$TEMP_DB")"
  fi
  rm -f "$TEMP_DB"
  exit 1
fi

# Check SQLite magic header (first 16 bytes should contain "SQLite format 3")
HEADER=$(head -c 16 "$TEMP_DB" 2>/dev/null | strings 2>/dev/null || echo "")
if [[ "$HEADER" != *"SQLite"* ]]; then
  print_error "Downloaded file is NOT a valid SQLite database"
  print_info "First bytes: $(head -c 100 "$TEMP_DB" | strings | head -1)"
  rm -f "$TEMP_DB"
  exit 1
fi

print_success "Downloaded database: $(( DOWNLOAD_SIZE / 1024 / 1024 ))MB ($(( DOWNLOAD_SIZE / 1024 ))KB)"

# Verify table count using sqlite3 if available
if command -v sqlite3 > /dev/null 2>&1; then
  TABLE_COUNT=$(sqlite3 "$TEMP_DB" "SELECT count(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "?")
  AUDIT_COUNT=$(sqlite3 "$TEMP_DB" "SELECT count(*) FROM audit_jobs;" 2>/dev/null || echo "?")
  print_success "Verified: $TABLE_COUNT tables, $AUDIT_COUNT audit jobs"
else
  print_info "sqlite3 CLI not found — skipping deep verification (file header OK)"
fi

# Step 8: Replace local database
echo ""
print_info "Replacing local database with production copy..."

# Remove old WAL and SHM files (they belong to the old database)
rm -f "$LOCAL_DB-wal" "$LOCAL_DB-shm"

# Replace the main database file
mv "$TEMP_DB" "$LOCAL_DB"

print_success "Local database replaced with production data!"

# Step 9: Clean up old backups (keep last 10)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/data.db.backup-* 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 10 ]; then
  ls -1t "$BACKUP_DIR"/data.db.backup-* | tail -n +11 | xargs rm -f
  print_info "Cleaned old backups (kept last 10)"
fi

# Step 10: Optionally restart server
if [ "$SERVER_WAS_RUNNING" = true ]; then
  echo ""
  print_info "Restarting local server..."
  "$PROJECT_DIR/dev.sh" start
fi

# Done!
echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${GREEN}${BOLD}  Sync complete!${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
print_success "Production database is now your local database"
print_info "Backup of old data: .db-backups/"
print_info "To restore: cp .db-backups/data.db.backup-$TIMESTAMP data.db"
echo ""
