#!/usr/bin/env bash
# Disposable local CA + leaf certificate for the staging edge (7 days). Never used outside this kit.
set -euo pipefail
S="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$S/tls"; cd "$S/tls"
export MSYS_NO_PATHCONV=1
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout ca.key -out ca.pem -days 7 -subj "/CN=LifeOS disposable staging CA (local only)" 2>/dev/null
printf "subjectAltName=DNS:getlifeos.app,DNS:admin.getlifeos.app,DNS:business.getlifeos.app,DNS:trustid.staging.test\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\n" > leaf.ext
openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout leaf.key -out leaf.csr -subj "/CN=staging.local" 2>/dev/null
openssl x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out leaf.pem -days 7 -extfile leaf.ext 2>/dev/null
openssl x509 -in leaf.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64 > spki.txt
echo "tls ready (spki $(cat spki.txt))"
