#!/usr/bin/env bash
# ==============================================================================
# Database Disaster Recovery & Restore Script
# Restores database from a designated SQL backup file
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  LATEST_BACKUP=$(ls -t backups/*.sql 2>/dev/null | head -n 1 || true)
  if [[ -z "${LATEST_BACKUP}" ]]; then
    echo "❌ Error: No backup file specified and no backups found in ./backups"
    echo "Usage: ./scripts/restore.sh ./backups/ecommerce_backup_YYYYMMDD_HHMMSS.sql"
    exit 1
  fi
  BACKUP_FILE="${LATEST_BACKUP}"
  echo "ℹ️ No file specified. Automatically using latest backup: ${BACKUP_FILE}"
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "❌ Error: Specified backup file '${BACKUP_FILE}' does not exist."
  exit 1
fi

echo "[RESTORE] Restoring database from ${BACKUP_FILE}..."

if docker ps | grep -q "algions_ecommerce_db"; then
  cat "${BACKUP_FILE}" | docker exec -i algions_ecommerce_db psql -U ecommerce_user -d ecommerce_db
  echo "✅ Database successfully restored from ${BACKUP_FILE}."
else
  echo "⚠️ Container 'algions_ecommerce_db' is not running. Restoring via local connection..."
  psql "${DATABASE_URL:-postgresql://ecommerce_user:secure_production_password_2026@localhost:5432/ecommerce_db}" < "${BACKUP_FILE}"
fi
