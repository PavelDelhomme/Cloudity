#!/usr/bin/env bash
# Affiche l'aide Make groupée (sans perdre aucune cible ## du Makefile).
# Usage :
#   ./scripts/dev/make-help.sh              # vue d'ensemble + index
#   ./scripts/dev/make-help.sh TOPIC=android
#   ./scripts/dev/make-help.sh --android
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MF="${MAKEFILE:-$ROOT/Makefile}"
TOPIC="${TOPIC:-}"
WIDTH="${HELP_WIDTH:-28}"

for arg in "$@"; do
  case "$arg" in
    --android|--mobile|android|mobile) TOPIC=android ;;
    --stack|stack) TOPIC=stack ;;
    --test|test|tests) TOPIC=test ;;
    --deploy|deploy) TOPIC=deploy ;;
    --env|env) TOPIC=env ;;
    --git|git) TOPIC=git ;;
    --pass|pass) TOPIC=pass ;;
    --mail|mail) TOPIC=mail ;;
    --all|all) TOPIC=all ;;
    --help|-h)
      echo "make help [TOPIC=android|mobile|stack|test|deploy|env|git|pass|mail|all]"
      echo "make android-help   # alias TOPIC=android"
      exit 0
      ;;
    TOPIC=*) TOPIC="${arg#TOPIC=}" ;;
  esac
done

# Normalise alias
case "${TOPIC,,}" in
  mobile|flutter|adb) TOPIC=android ;;
esac

categorize() {
  local t="$1"
  case "$t" in
    help|android-help|mobile-help|help-*) echo meta ;;
    run-mobile|run-mibile|ensure-flutter*|mobile-*|test-mobile*|android-*) echo android ;;
    up|up-*|down|dev|prod|rebuild|rebuild-*|deploy-*|build|build-*|status|status-*|statys|stats|stat|logs|clean|ports*|check-ports|wait-for*|services-only|infrastructure-only|frontend-only|stack-heal|doctor|quick-check) echo stack ;;
    test|tests|test-*|pass-j8*) echo test ;;
    migrate*|seed*|clean-test*|clean-pass*) echo data ;;
    sync-public*|env-prod|env-preprod|portainer-env|secrets*|create-env|ensure-*-key|ensure-mta*|sync-mail*|dev-https|dev-certs*|cert-*|mtls*|https*|up-tls|up-https*|preprod-*|internalsec*|smoke-prod) echo env ;;
    build-pass*|test-pass*|deploy-pass) echo pass ;;
    *mail*|verify-mail*|rebuild-mail|mail-*) echo mail ;;
    feature-finish|git-*) echo git ;;
    dashboard-npm*|frontend-npm*|frontend-install|install|setup|init|create-*|setup-infrastructure) echo setup ;;
    *) echo other ;;
  esac
}

cat_label() {
  case "$1" in
    meta) echo "Aide" ;;
    android) echo "Android / Flutter / ADB" ;;
    stack) echo "Stack Docker (up/down/deploy/logs)" ;;
    test) echo "Tests" ;;
    data) echo "Migrations / seeds / cleanup" ;;
    env) echo "Env, secrets, URLs, TLS / mTLS" ;;
    pass) echo "Pass (coffre + extension)" ;;
    mail) echo "Mail / MTA" ;;
    git) echo "Git / branches" ;;
    setup) echo "Setup / install deps" ;;
    other) echo "Autres" ;;
    *) echo "$1" ;;
  esac
}

# Parse "target: ## desc" (ignore .PHONY)
mapfile -t LINES < <(awk -F':.*?## ' '
  /^[a-zA-Z0-9_.-]+:/ && /##/ {
    t=$1
    sub(/:.*/,"",t)
    if (t ~ /^\./) next
    desc=$2
    gsub(/\r/,"",desc)
    print t "\t" desc
  }
' "$MF" | sort -u -t$'\t' -k1,1)

print_group() {
  local cat="$1"
  local title
  title="$(cat_label "$cat")"
  local any=0
  local line t desc c
  for line in "${LINES[@]}"; do
    t="${line%%$'\t'*}"
    desc="${line#*$'\t'}"
    c="$(categorize "$t")"
    if [[ "$c" != "$cat" ]]; then
      continue
    fi
    if [[ "$TOPIC" != "" && "$TOPIC" != "all" && "$TOPIC" != "$cat" ]]; then
      continue
    fi
    if [[ $any -eq 0 ]]; then
      echo ""
      echo "── $title ──"
      any=1
    fi
    printf "  %-${WIDTH}s %s\n" "$t" "$desc"
  done
}

echo "Cloudity — commandes Make"
echo "Fichier : $MF"
echo ""
echo "Essentiels"
printf "  %-${WIDTH}s %s\n" "make setup" "Première fois après clone (.env, clés, deps)"
printf "  %-${WIDTH}s %s\n" "make up-ready" "Stack + seed (quotidien)"
printf "  %-${WIDTH}s %s\n" "make status / status-watch" "Santé stack (+ IP LAN)"
printf "  %-${WIDTH}s %s\n" "make sync-public-urls" "Aligne VITE / mobile / CORS depuis CLOUDITY_PUBLIC_*"
printf "  %-${WIDTH}s %s\n" "make run-mobile APP=Mail" "Lance une app Flutter (voir android-help)"
printf "  %-${WIDTH}s %s\n" "make android-help" "Toutes les cibles Android / Flutter / ADB"
printf "  %-${WIDTH}s %s\n" "make help TOPIC=test" "Filtrer une catégorie (android|stack|test|deploy|env|git|pass|mail|all)"
echo ""
echo "Catégories : android · stack · test · data · env · pass · mail · git · setup · other"
echo "Astuce : make help TOPIC=all  — liste complète groupée"

if [[ -z "$TOPIC" ]]; then
  # Vue courte : aide + stack, puis rappel des filtres
  print_group meta
  print_group stack
  echo ""
  echo "→ Liste complète : make help TOPIC=all"
  echo "→ Mobile / Android : make android-help"
  echo "→ Autres filtres   : make help TOPIC=test|env|git|pass|mail|data|setup"
  exit 0
fi

ORDER=(meta android stack test data env pass mail git setup other)
for cat in "${ORDER[@]}"; do
  print_group "$cat"
done

echo ""
echo "($(printf '%s\n' "${LINES[@]}" | wc -l) cibles documentées avec ##)"
