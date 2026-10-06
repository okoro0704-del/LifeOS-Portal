#!/usr/bin/env bash
# Boots the Portal API production image (Dockerfile.portal) against a real Postgres and proves it serves.
#
#   SMOKE_DATABASE_URL  Postgres reachable from inside the container (append ?sslmode=disable for a
#                       local/CI server without TLS). Required.
#   SMOKE_NETWORK=host  Use host networking (CI). Otherwise the port is published (Docker Desktop).
#   SMOKE_PORT          Host port to probe (default 18792).
#
# Usage: scripts/ci/portal-api-docker-smoke.sh <image>
set -euo pipefail

IMAGE="${1:?usage: portal-api-docker-smoke.sh <image>}"
DATABASE_URL="${SMOKE_DATABASE_URL:?SMOKE_DATABASE_URL is required}"
PORT="${SMOKE_PORT:-18792}"
NAME="portal-api-smoke-$$"
BASE="http://127.0.0.1:${PORT}"

cleanup() {
  echo "--- container log (tail) ---"
  docker logs "$NAME" 2>&1 | tail -n 40 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "1. @lifeos-portal/offline-kernel resolves inside the final image"
docker run --rm "$IMAGE" node --input-type=module -e \
  "const m = await import('@lifeos-portal/offline-kernel'); if (typeof m.createOfflineKernelClient !== 'function') { console.error('offline-kernel export missing'); process.exit(1); } console.log('offline-kernel import: ok');"

if [ "${SMOKE_NETWORK:-}" = "host" ]; then
  NET_ARGS=(--network host -e "PORT=${PORT}")
else
  NET_ARGS=(-p "${PORT}:8792")
fi

echo "2. production boot (migrations + row-level store) against Postgres"
docker run -d --name "$NAME" "${NET_ARGS[@]}" \
  -e GATEWAY_MODE=production \
  -e ENABLE_TRUST_ID=false \
  -e BYPASS_TRUST_ID=false \
  -e BYPASS_AUTH_FOR_TESTING=false \
  -e INSTALL_MODE=remote \
  -e DATAZONE_API_URL=https://datazone.smoke.invalid \
  -e FINPROVE_API_URL=https://finprove.smoke.invalid \
  -e MASTER_DISTRIBUTOR_URL=https://distributor.smoke.invalid \
  -e PORTAL_SECRET_KEY=smoke-portal-secret-key-at-least-32-chars \
  -e INTERNAL_PROVISION_TOKEN=smoke-provision-token-not-default \
  -e PORTAL_DOMAIN=https://getlifeos.app \
  -e CORS_ORIGINS=https://getlifeos.app,https://admin.getlifeos.app,https://business.getlifeos.app \
  -e LOCAL_ADMIN_EMAIL=owner@smoke.test \
  -e LOCAL_ADMIN_PASSWORD=smoke-owner-password-2026! \
  -e DATABASE_URL="$DATABASE_URL" \
  "$IMAGE" >/dev/null

echo "3. liveness (/health; readiness at /api/v1/health also checks the upstream engines, unreachable here)"
curl -fsS --retry 60 --retry-delay 1 --retry-all-errors "${BASE}/health"
echo

echo "4. unknown browser origin is refused"
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.example' "${BASE}/auth/status")
[ "$code" = "403" ] || { echo "expected 403 for unknown origin, got $code"; exit 1; }

echo "5. admin sign-in is cookie-only (no token in body; HttpOnly Secure SameSite=Strict cookie)"
headers=$(mktemp)
body=$(curl -fsS -D "$headers" -H 'Origin: https://admin.getlifeos.app' -H 'Content-Type: application/json' \
  -d '{"email":"owner@smoke.test","password":"smoke-owner-password-2026!"}' "${BASE}/auth/login")
if echo "$body" | grep -q sessionToken; then echo "admin login leaked sessionToken"; exit 1; fi
grep -i '^set-cookie: portal_session=' "$headers" | grep -qi 'httponly' || { echo "cookie not HttpOnly"; exit 1; }
grep -i '^set-cookie: portal_session=' "$headers" | grep -qi 'samesite=strict' || { echo "cookie not SameSite=Strict"; exit 1; }
cookie=$(grep -i '^set-cookie: portal_session=' "$headers" | sed -E 's/^[Ss]et-[Cc]ookie: (portal_session=[^;]*).*/\1/')
me=$(curl -s -o /dev/null -w '%{http_code}' -H 'Origin: https://admin.getlifeos.app' -H "Cookie: ${cookie}" "${BASE}/auth/me")
[ "$me" = "200" ] || { echo "cookie session not accepted: $me"; exit 1; }

echo "6. the session survives a container restart (state is in Postgres)"
docker restart "$NAME" >/dev/null
curl -fsS --retry 60 --retry-delay 1 --retry-all-errors "${BASE}/health" >/dev/null
me=$(curl -s -o /dev/null -w '%{http_code}' -H 'Origin: https://admin.getlifeos.app' -H "Cookie: ${cookie}" "${BASE}/auth/me")
[ "$me" = "200" ] || { echo "session lost across restart: $me"; exit 1; }

echo "Portal API Docker smoke: OK"
