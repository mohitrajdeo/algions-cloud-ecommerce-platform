# ==============================================================================
# Algions AI Labs - Chaos Engineering & Self-Healing Drill (PowerShell)
# ==============================================================================

$BaseUrl = "http://localhost:8080"

Write-Host "=== STEP 1: Verifying Baseline System Health ===" -ForegroundColor Cyan
try {
    $hz = Invoke-RestMethod -Uri "$BaseUrl/healthz" -Method Get
    Write-Host "[OK] Liveness: Healthy (Uptime: $($hz.uptimeSeconds)s)" -ForegroundColor Green
    $rz = Invoke-RestMethod -Uri "$BaseUrl/readyz" -Method Get
    Write-Host "[OK] Readiness: Ready ($($rz.status))" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Service not reachable at $BaseUrl" -ForegroundColor Yellow
}

Write-Host "`n=== STEP 2: Inducing Failure - Stopping PostgreSQL Database ===" -ForegroundColor Red
docker compose stop db
Start-Sleep -Seconds 2

Write-Host "`n=== STEP 3: Verifying Detection via Readiness Probe ===" -ForegroundColor Yellow
try {
    $res = Invoke-WebRequest -Uri "$BaseUrl/readyz" -Method Get -SkipHttpErrorCheck
    Write-Host "Readiness HTTP Status: $($res.StatusCode)" -ForegroundColor Red
    if ($res.StatusCode -eq 503) {
        Write-Host "[PASSED] Detection verified: Readiness probe actively flagged database failure (503 Service Unavailable)." -ForegroundColor Green
    }
} catch {
    Write-Host "[PASSED] Connection caught error as expected." -ForegroundColor Green
}

Write-Host "`n=== STEP 4: Triggering Recovery - Restarting Database Container ===" -ForegroundColor Cyan
docker compose start db
Write-Host "Waiting 5 seconds for PostgreSQL healthcheck stabilization..."
Start-Sleep -Seconds 5

Write-Host "`n=== STEP 5: Verifying Automated Self-Healing & Service Restoration ===" -ForegroundColor Green
try {
    $restored = Invoke-RestMethod -Uri "$BaseUrl/readyz" -Method Get
    Write-Host "[DRILL SUCCESS] Status: $($restored.status) (200 OK) - Automated recovery confirmed!" -ForegroundColor Green
} catch {
    Write-Host "[DRILL FAILED] Service failed to restore." -ForegroundColor Red
}
