#!/usr/bin/env bash
# Starts the disposable staging stack: TrustID API, Portal API (TRUSTID_AUTH_MODE=$1, default canary), TLS edge.
S="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-canary}"
: "${TRUSTID_REPO:?Set TRUSTID_REPO to the TrustID checkout}"
PORTAL_REPO="${PORTAL_REPO:-$(cd "$S/../.." && pwd)}"
wait_up() { for i in $(seq 1 60); do curl -sk -m 2 "$1" >/dev/null && return 0; sleep 2; done; echo "timeout: $1"; return 1; }
(cd "$TRUSTID_REPO/apps/api" && nohup node --require "$S/dns-guard.cjs" --env-file="$S/trustid.env" --import tsx src/index.ts > "$S/trustid.log" 2>&1 &)
wait_up http://127.0.0.2:4710/.well-known/jwks.json
(cd "$S" && nohup node serve.mjs > "$S/edge.log" 2>&1 &)
wait_up https://127.0.0.1:8443/
(cd "$PORTAL_REPO/apps/portal-api" && TRUSTID_AUTH_MODE="$MODE" NODE_EXTRA_CA_CERTS="$S/tls/ca.pem" nohup node --require "$S/dns-guard.cjs" --env-file="$S/portal.env" --import tsx src/server.ts > "$S/portal-$MODE.log" 2>&1 &)
wait_up http://127.0.0.1:4720/health
echo "staging up (mode=$MODE)"
