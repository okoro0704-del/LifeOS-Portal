#!/usr/bin/env bash
for p in 4710 4720 8443; do powershell -NoProfile -Command "\$c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; if (\$c) { Stop-Process -Id \$c[0].OwningProcess -Force -Confirm:\$false }"; done
echo "staging stopped"
