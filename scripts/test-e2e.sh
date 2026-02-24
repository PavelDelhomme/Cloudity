#!/bin/bash
# Tests E2E : vérifie que les endpoints répondent (stack doit être up: make up)
# Usage: ./scripts/test-e2e.sh

set -e

PORT_GATEWAY="${PORT_GATEWAY:-6000}"
PORT_AUTH="${PORT_AUTH:-6081}"
PORT_ADMIN="${PORT_ADMIN:-6082}"
PORT_DASHBOARD="${PORT_DASHBOARD:-6001}"

echo "🧪 Tests E2E (ports 60XX)..."
failed=0

check() {
  local name="$1"
  local url="$2"
  if curl -sf --connect-timeout 2 "$url" >/dev/null; then
    echo "  ✅ $name"
  else
    echo "  ❌ $name ($url)"
    failed=1
  fi
}

check "API Gateway /health" "http://localhost:${PORT_GATEWAY}/health"
check "Auth Service /health" "http://localhost:${PORT_AUTH}/health"
check "Admin Service /health" "http://localhost:${PORT_ADMIN}/health"
check "Dashboard" "http://localhost:${PORT_DASHBOARD}/"

if [ $failed -eq 1 ]; then
  echo ""
  echo "💡 Lancez 'make up' puis réessayez."
  exit 1
fi
echo ""
echo "✅ E2E OK"
exit 0
