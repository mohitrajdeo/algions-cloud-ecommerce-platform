# Windows PowerShell Backup Script
$backupDir = Join-Path $PSScriptRoot "..\backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir "ecommerce_backup_$timestamp.sql"

Write-Host "[BACKUP] Taking snapshot of database..."
docker exec -t algions_ecommerce_db pg_dump -U ecommerce_user -d ecommerce_db | Out-File -FilePath $backupFile -Encoding utf8

Write-Host "✅ Backup created successfully at $backupFile"
