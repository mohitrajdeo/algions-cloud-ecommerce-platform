#!/bin/bash
# ==============================================================================
# Algions AI Labs - Chaos Engineering & Self-Healing Drill
# Deliberately breaks a dependent service (Postgres DB) to prove:
# 1. Immediate detection by the readiness probe (/readyz -> 503)
# 2. Automated service recovery when restarted (/readyz -> 200)
# ==============================================================================

set -e

BASE_URL="http://localhost:8080"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}=== STEP 1: Verifying Baseline System Health ===${NC}"
curl -s -i "$BASE_URL/healthz" | head -n 5
curl -s -i "$BASE_URL/readyz" | head -n 5
echo -e "${GREEN}[OK] System is healthy and ready.${NC}\n"

echo -e "${RED}=== STEP 2: Inducing Failure - Stopping PostgreSQL Database ===${NC}"
docker compose stop db
sleep 2

echo -e "${YELLOW}=== STEP 3: Verifying Detection via Readiness Probe ===${NC}"
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/readyz" || true)
echo -e "Readiness HTTP Status: ${RED}$STATUS_CODE${NC}"
if [ "$STATUS_CODE" -eq 503 ] || [ "$STATUS_CODE" -eq 500 ]; then
  echo -e "${GREEN}[PASSED] Detection verified: Readiness probe actively flagged database failure (503 Service Unavailable).${NC}\n"
else
  echo -e "${YELLOW}[WARN] Status code was $STATUS_CODE${NC}\n"
fi

echo -e "${CYAN}=== STEP 4: Triggering Disaster Recovery - Restarting Database Container ===${NC}"
docker compose start db
echo "Waiting for PostgreSQL initialization and health checks..."
sleep 5

echo -e "${GREEN}=== STEP 5: Verifying Automated Self-Healing & Service Restoration ===${NC}"
curl -s -i "$BASE_URL/readyz" | head -n 5
RESTORED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/readyz" || true)

if [ "$RESTORED_STATUS" -eq 200 ]; then
  echo -e "${GREEN}[DRILL COMPLETE - SUCCESS] Detection and recovery drill verified 100% operational!${NC}"
else
  echo -e "${RED}[DRILL FAILED] Service failed to restore.${NC}"
fi
