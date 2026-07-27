#!/usr/bin/env bash
# Supprime les conteneurs éphémères créés par `docker compose run` (tests CI, Vitest, go test…).
# Noms typiques : cloudity-<service>-run-<id>  ou  cloudity-cloudity-web-run-<id>
set -euo pipefail

prune_compose_run_containers() {
  local names removed=0
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    docker rm -f "$name" >/dev/null 2>&1 || true
    removed=$((removed + 1))
  done < <(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E '(^cloudity-.*-run-|^cloudity-cloudity-.*-run-)' || true)
  if [ "$removed" -gt 0 ]; then
    echo "🧹 ${removed} conteneur(s) compose run (*-run-*) supprimé(s)."
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  prune_compose_run_containers
fi
