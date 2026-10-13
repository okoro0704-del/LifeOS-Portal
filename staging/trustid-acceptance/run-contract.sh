#!/usr/bin/env bash
# Cross-process contract run over the staging stack: canary, TrustID outage, required, outage, disabled.
# Needs a freshly reset stack (./reset.sh canary). Stops the stack when done.
S="$(cd "$(dirname "$0")" && pwd)"
: "${TRUSTID_REPO:?Set TRUSTID_REPO to the TrustID checkout}"
run() { (cd "$TRUSTID_REPO" && NODE_EXTRA_CA_CERTS="$S/tls/ca.pem" IP_BASE="$2" node --require "$S/dns-guard.cjs" --import tsx "$S/contract.mts" "$1" > "$S/run-$1.log" 2>&1 < /dev/null); tail -1 "$S/run-$1.log"; grep -E "^FAIL|^ERROR" "$S/run-$1.log" || true; }
stop_port() { powershell -NoProfile -Command "\$c = Get-NetTCPConnection -LocalPort $1 -State Listen -ErrorAction SilentlyContinue; if (\$c) { Stop-Process -Id \$c[0].OwningProcess -Force -Confirm:\$false }" 2>/dev/null || fuser -k "$1/tcp" 2>/dev/null || true; }
run canary 1000
run hold 2000 >/dev/null; stop_port 4710; sleep 2; run outage-canary 3000
bash "$S/stop.sh" >/dev/null; bash "$S/start.sh" required >/dev/null; run required 4000
run hold 5000 >/dev/null; stop_port 4710; sleep 2; run outage-required 6000
bash "$S/stop.sh" >/dev/null; bash "$S/start.sh" disabled >/dev/null; run disabled 7000
bash "$S/stop.sh" >/dev/null; rm -f "$S/held-tokens.json"
