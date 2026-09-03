#!/usr/bin/env bash
# Generate production secrets. Prefer Node (works on Windows npm).
# --railway prints `railway variables set ...` for dashboard / CLI import.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v node >/dev/null 2>&1; then
  exec node "$ROOT/scripts/generate-secrets.mjs" "$@"
fi

OUT="${ENV_FILE:-$ROOT/.env.production}"
RAILWAY=0
FORCE="${FORCE:-0}"
for arg in "$@"; do
  case "$arg" in
    --railway) RAILWAY=1 ;;
    --force|-f) FORCE=1 ;;
  esac
done

if [[ -f "$OUT" && "$FORCE" != "1" && "$RAILWAY" != "1" ]]; then
  echo "Refusing to overwrite $OUT (set FORCE=1 or pass --force)." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "node or openssl is required." >&2
  exit 1
fi

rand_alnum() {
  local length="$1"
  local out=""
  while [[ ${#out} -lt $length ]]; do
    out+="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9')"
  done
  printf '%s' "${out:0:$length}"
}

PORTAL_SECRET_KEY="$(openssl rand -hex 32)"
POSTGRES_USER="${POSTGRES_USER:-portal}"
POSTGRES_PASSWORD="$(rand_alnum 32)"
POSTGRES_DB="${POSTGRES_DB:-lifeos_db}"
INTERNAL_PROVISION_TOKEN="$(openssl rand -hex 24)"
DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=portal"

PORTAL_DOMAIN="${PORTAL_DOMAIN:-https://portal.getlifeos.app}"
CORS_ORIGINS="${CORS_ORIGINS:-https://portal.getlifeos.app,https://admin.getlifeos.app,https://business.getlifeos.app}"
DATAZONE_API_URL="${DATAZONE_API_URL:-https://datazone.getlifeos.app}"
TRUST_ID_API_URL="${TRUST_ID_API_URL:-https://trust.getlifeos.app}"
if [[ "$RAILWAY" == "1" ]]; then
  FINPROVE_API_URL="${FINPROVE_API_URL:-http://finprove-engine.railway.internal:4220}"
else
  FINPROVE_API_URL="${FINPROVE_API_URL:-https://finprove.getlifeos.app}"
fi
NEXT_PUBLIC_GATEWAY_URL="${NEXT_PUBLIC_GATEWAY_URL:-http://localhost:4210}"

umask 077
if [[ "$RAILWAY" != "1" || "$FORCE" == "1" || ! -f "$OUT" ]]; then
  cat > "$OUT" <<EOF
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) — do not commit.
# Review public URLs before deploying.

NODE_ENV=production
GATEWAY_MODE=production
TRUSTID_MODE=remote
HOST=0.0.0.0
PORT=8792

PORTAL_SECRET_KEY=${PORTAL_SECRET_KEY}
COOKIE_SECRET=${PORTAL_SECRET_KEY}
INTERNAL_PROVISION_TOKEN=${INTERNAL_PROVISION_TOKEN}

POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}

PORTAL_DOMAIN=${PORTAL_DOMAIN}
CORS_ORIGINS=${CORS_ORIGINS}
DATAZONE_API_URL=${DATAZONE_API_URL}
TRUST_ID_API_URL=${TRUST_ID_API_URL}
FINPROVE_API_URL=${FINPROVE_API_URL}

NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
VITE_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
VITE_PORTAL_API=${NEXT_PUBLIC_GATEWAY_URL}
VITE_TRUSTID_MODE=remote
EOF
  echo "Wrote $OUT"
fi

echo "PORTAL_SECRET_KEY length: ${#PORTAL_SECRET_KEY}"
echo "POSTGRES_PASSWORD length: ${#POSTGRES_PASSWORD}"
echo "DATABASE_URL=postgres://${POSTGRES_USER}:***@postgres:5432/${POSTGRES_DB}?schema=portal"

if [[ "$RAILWAY" == "1" ]]; then
  cat <<EOF

# Railway CLI bulk import — do not set PORT or DATABASE_URL (Railway injects them)
railway variables set \\
  PORTAL_SECRET_KEY=${PORTAL_SECRET_KEY} \\
  COOKIE_SECRET=${PORTAL_SECRET_KEY} \\
  INTERNAL_PROVISION_TOKEN=${INTERNAL_PROVISION_TOKEN} \\
  POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \\
  NODE_ENV=production \\
  GATEWAY_MODE=production \\
  TRUSTID_MODE=remote \\
  FINPROVE_API_URL=http://finprove-engine.railway.internal:4220 \\
  PORTAL_DOMAIN=${PORTAL_DOMAIN} \\
  CORS_ORIGINS=${CORS_ORIGINS} \\
  DATAZONE_API_URL=${DATAZONE_API_URL} \\
  TRUST_ID_API_URL=${TRUST_ID_API_URL}
EOF
fi
