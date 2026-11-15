$CertDir = Join-Path $PSScriptRoot "certs"
if (-not (Test-Path $CertDir)) {
    New-Item -ItemType Directory -Path $CertDir -Force | Out-Null
}

$KeyFile = Join-Path $CertDir "server.key"
$CrtFile = Join-Path $CertDir "server.crt"

if (-not (Test-Path $KeyFile)) {
    Write-Host "Generating self-signed TLS certificates for development..." -ForegroundColor Cyan
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout $KeyFile -out $CrtFile -subj "/CN=al-ecommerce.mohitrajdeo.in/O=Algions DevOps/C=IN"
    Write-Host "Certificates created in $CertDir" -ForegroundColor Green
} else {
    Write-Host "Certificates already present in $CertDir" -ForegroundColor Yellow
}
