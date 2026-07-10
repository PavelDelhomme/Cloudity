#!/usr/bin/env bash
# Wrapper hôte → script Vitest dans le volume frontend (monté /ws dans Docker).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export ROOT_WS="${ROOT_WS:-$ROOT/frontend}"
exec "$ROOT/frontend/scripts/vitest-cloudity-web.sh" "$@"
