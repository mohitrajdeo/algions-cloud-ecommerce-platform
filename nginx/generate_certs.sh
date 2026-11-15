#!/bin/sh
set -e

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/server.key" ]; then
  echo "Generating self-signed TLS certificate for localhost & al-ecommerce.mohitrajdeo.in..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -subj "/CN=al-ecommerce.mohitrajdeo.in/O=Algions DevOps/C=IN" \
    -addext "subjectAltName=DNS:localhost,DNS:al-ecommerce.mohitrajdeo.in,IP:127.0.0.1"
  echo "Certificates successfully generated at $CERT_DIR"
else
  echo "Certificates already exist in $CERT_DIR."
fi
