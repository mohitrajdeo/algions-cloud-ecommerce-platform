#!/usr/bin/env bash
# ==============================================================================
# Automated Database Backup Script (PostgreSQL / Docker)
# Generates timestamped SQL dump into ./backups directory
# ==============================================================================

set -euo pipefail

BACKUP_DIR="$(pwd)/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/ecommerce_backup_${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"

echo "[BACKUP] Initiating database snapshot..."

if docker ps | grep -q "algions_ecommerce_db"; then
  docker exec -t algions_ecommerce_db pg_dump -U ecommerce_user -d ecommerce_db > "${BACKUP_FILE}"
  echo "✅ Backup successfully created at: ${BACKUP_FILE}"
  echo "📊 File size: $(du -h "${BACKUP_FILE}" | cut -f1)"
else
  echo "⚠️ Container 'algions_ecommerce_db' is not running. Starting quick backup from local host..."
  pg_dump "${DATABASE_URL:-postgresql://ecommerce_user:secure_production_password_2026@localhost:5432/ecommerce_db}" > "${BACKUP_FILE}" || true
fi
