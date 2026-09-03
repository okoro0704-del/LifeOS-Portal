#!/usr/bin/env bash
# Post-deployment smoke tests against the live Portal / LifeOS Gateway stack.
set -euo pipefail

BASE="${NEXT_PUBLIC_GATEWAY_URL:-${VITE_GATEWAY_URL:-${GATEWAY_URL:-http://localhost:4210}}}"
BASE="${BASE%/}"
FAILS=0

pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1" >&2; FAILS=$((FAILS + 1)); }

need_curl() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required" >&2
    exit 1
  fi
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v n="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { FS=": " }
    {
      k = $1
      gsub(/\r/, "", k)
      if (tolower(k) == n) {
        sub(/^[^:]+:[[:space:]]*/, "")
        gsub(/\r/, "")
        print
        exit
      }
    }
  ' "$file"
}

json_status() {
  local body="$1"
  if command -v python >/dev/null 2>&1; then
    python -c 'import json,sys; print(json.load(sys.stdin).get("status",""))' <<<"$body" 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))' <<<"$body" 2>/dev/null || true
  else
    printf '%s' "$body" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
  fi
}

curl_capture() {
  local method="$1"
  local path="$2"
  local body_file="$3"
  local hdr_file="$4"
  shift 4
  local code
  code="$(curl -sS -D "$hdr_file" -o "$body_file" -w '%{http_code}' \
    -X "$method" \
    -H 'content-type: application/json' \
    -H 'x-forwarded-proto: https' \
    "$@" \
    "${BASE}${path}" || true)"
  printf '%s' "$code"
}

need_curl
echo "Smoke testing ${BASE}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- Health & upstream probe ---
HEALTH_BODY="$TMP/health.body"
HEALTH_HDR="$TMP/health.hdr"
HEALTH_CODE="$(curl_capture GET /api/v1/health "$HEALTH_BODY" "$HEALTH_HDR")"
HEALTH_STATUS="$(json_status "$(cat "$HEALTH_BODY")")"
if [[ "$HEALTH_CODE" == "200" && "$HEALTH_STATUS" == "healthy" ]]; then
  pass "GET /api/v1/health → 200 healthy"
else
  fail "GET /api/v1/health → HTTP ${HEALTH_CODE} status=${HEALTH_STATUS:-missing} (want 200 healthy)"
fi

# --- Security headers (use HTTPS-forwarded health response) ---
HSTS="$(header_value "$HEALTH_HDR" "strict-transport-security")"
XFO="$(header_value "$HEALTH_HDR" "x-frame-options")"
CSP="$(header_value "$HEALTH_HDR" "content-security-policy")"
if [[ "$HSTS" == *max-age=* ]]; then
  pass "HSTS present (${HSTS})"
else
  fail "HSTS missing (Strict-Transport-Security)"
fi
XFO_UP="$(printf '%s' "$XFO" | tr '[:lower:]' '[:upper:]')"
if [[ "$XFO_UP" == "DENY" ]]; then
  pass "X-Frame-Options: DENY"
else
  fail "X-Frame-Options is '${XFO}' (want DENY)"
fi
if [[ -n "$CSP" && "$CSP" == *default-src* ]]; then
  pass "Content-Security-Policy is strict (${CSP})"
else
  fail "Content-Security-Policy missing or not strict"
fi

# --- Dev-hook pruning ---
DEV_BODY="$TMP/dev.body"
DEV_HDR="$TMP/dev.hdr"
DEV_CODE="$(curl_capture POST /auth/dev-session "$DEV_BODY" "$DEV_HDR" \
  --data '{"trustId":"TD-PORTAL-DEV"}')"
if [[ "$DEV_CODE" == "404" ]]; then
  pass "POST /auth/dev-session → 404"
else
  fail "POST /auth/dev-session → HTTP ${DEV_CODE} (want 404)"
fi

# --- Rate limit on Trust ID paths ---
LIMIT=""
BURST_OK=0
for i in 1 2 3 4 5; do
  BURST_HDR="$TMP/burst.$i.hdr"
  BURST_BODY="$TMP/burst.$i.body"
  curl_capture GET "/api/v1/trust-id/test" "$BURST_BODY" "$BURST_HDR" >/dev/null
  LIMIT="$(header_value "$BURST_HDR" "x-ratelimit-limit")"
  if [[ "$LIMIT" == "100" ]]; then
    BURST_OK=1
  fi
done
if [[ "$BURST_OK" == "1" ]]; then
  pass "X-RateLimit-Limit: 100 on /api/v1/trust-id/test"
else
  fail "X-RateLimit-Limit on /api/v1/trust-id/test is '${LIMIT}' (want 100)"
fi

# --- Master Device guard (no session / no step-up headers) ---
DISB_BODY="$TMP/disburse.body"
DISB_HDR="$TMP/disburse.hdr"
DISB_CODE="$(curl_capture POST /api/v1/finprove/disburse "$DISB_BODY" "$DISB_HDR" \
  --data '{"trustId":"TD-X","amount":1,"currency":"NGN","reference":"smoke","purpose":"smoke","destination":"acct-1"}')"
if [[ "$DISB_CODE" == "403" ]]; then
  pass "POST /api/v1/finprove/disburse without headers → 403"
else
  fail "POST /api/v1/finprove/disburse without headers → HTTP ${DISB_CODE} (want 403)"
fi

echo
if [[ "$FAILS" -gt 0 ]]; then
  echo "Smoke test failed (${FAILS} check(s))."
  exit 1
fi
echo "Smoke test passed."
