#!/usr/bin/env bash
# Builds the three Portal surfaces and the TrustID web app for the staging hosts into ./dist.
set -euo pipefail
# Native (C:/...) path: with MSYS_NO_PATHCONV set below, a /c/... path would resolve to C:\c\...
S="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
: "${TRUSTID_REPO:?Set TRUSTID_REPO to the TrustID checkout}"
PORTAL_REPO="${PORTAL_REPO:-$(cd "$S/../.." && pwd)}"
export MSYS_NO_PATHCONV=1   # Git Bash would otherwise rewrite VITE_PORTAL_API=/api into a Windows path
(cd "$PORTAL_REPO" && npm run build -w @lifeos-portal/shared >/dev/null)
for spec in "portal-web:getlifeos.app:portal-web" "lifeos-platform-admin:admin.getlifeos.app:platform-admin" "lifeos-business-portal:business.getlifeos.app:business-portal"; do
  IFS=: read -r app host out <<< "$spec"
  (cd "$PORTAL_REPO/apps/$app" && VITE_ENABLE_TRUST_ID=true VITE_TRUSTID_MODE=remote VITE_BYPASS_AUTH_FOR_TESTING=false VITE_PORTAL_API=/api \
    VITE_TRUSTID_API=https://trustid.staging.test:8443/api VITE_TRUSTID_WEB=https://trustid.staging.test:8443 VITE_TRUSTID_REDIRECT_URI="https://$host/callback" \
    npx vite build --outDir "$S/dist/$out" --emptyOutDir >/dev/null)
  echo "built $out"
done
(cd "$TRUSTID_REPO" && npm run build -w @trustid/web >/dev/null && rm -rf "$S/dist/trustid-web" && cp -r apps/web/dist "$S/dist/trustid-web")
echo "built trustid-web"
