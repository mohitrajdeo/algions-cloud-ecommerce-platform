param([string]$File)

if (-not $File) {
    $latest = Get-ChildItem (Join-Path $PSScriptRoot "..\backups\*.sql") | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) {
        Write-Error "No backup file found in backups directory."
        exit 1
    }
    $File = $latest.FullName
}

Write-Host "[RESTORE] Restoring database from $File..."
Get-Content $File | docker exec -i algions_ecommerce_db psql -U ecommerce_user -d ecommerce_db
Write-Host "✅ Database successfully restored from $File"
