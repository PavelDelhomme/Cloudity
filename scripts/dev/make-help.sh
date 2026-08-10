#!/usr/bin/env bash
# Affiche l'aide Make groupée (toutes les cibles ## du Makefile).
# Usage :
#   ./scripts/dev/make-help.sh                 # vue d'ensemble (local / VPS / mobile)
#   ./scripts/dev/make-help.sh TOPIC=all       # liste complète groupée
#   ./scripts/dev/make-help.sh TOPIC=android
#   ./scripts/dev/make-help.sh --android
#   make help | make android-help | make help TOPIC=env|deploy|test|…
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MF="${MAKEFILE:-$ROOT/Makefile}"
TOPIC="${TOPIC:-}"
WIDTH="${HELP_WIDTH:-36}"

for arg in "$@"; do
  case "$arg" in
    --android|--mobile|android|mobile) TOPIC=android ;;
    --stack|stack) TOPIC=stack ;;
    --test|test|tests) TOPIC=test ;;
    --deploy|deploy|vps|prod|preprod) TOPIC=deploy ;;
    --env|env) TOPIC=env ;;
    --git|git) TOPIC=git ;;
    --pass|pass) TOPIC=pass ;;
    --mail|mail) TOPIC=mail ;;
    --all|all) TOPIC=all ;;
    --help|-h)
      echo "make help [TOPIC=android|mobile|stack|test|deploy|env|git|pass|mail|data|setup|all]"
      echo "make android-help          # alias TOPIC=android (AVD, run-mobile, tests)"
      echo "make help TOPIC=deploy     # push-prod / préprod / Portainer / GHCR"
      echo "make help TOPIC=all        # toutes les cibles ## groupées"
      exit 0
      ;;
    TOPIC=*) TOPIC="${arg#TOPIC=}" ;;
  esac
done

# Normalise alias
case "${TOPIC,,}" in
  mobile|flutter|adb) TOPIC=android ;;
  vps|prod|preprod|portainer|ghcr|zoneforge) TOPIC=deploy ;;
esac

categorize() {
  local t="$1"
  case "$t" in
    help|android-help|mobile-help|help-*) echo meta ;;
    # Mobile / AVD / ADB
    run-mobile|run-mibile|ensure-flutter*|mobile-*|test-mobile*|android-*) echo android ;;
    # Push VPS / env Portainer / GHCR (séparé de « stack Docker locale »)
    push-prod|push-preprod|publish-ghcr|env-prod|env-preprod|portainer-env*|h14-https-check|smoke-prod|preprod-*|up-tls|up-https*|sync-public*) echo deploy ;;
    # Stack Docker locale
    up|up-*|down|dev|prod|rebuild|rebuild-*|deploy-*|build|build-*|status|status-*|statys|stats|stat|logs|clean|ports*|check-ports|wait-for*|services-only|infrastructure-only|frontend-only|stack-heal|doctor|quick-check) echo stack ;;
    test|tests|test-*|pass-j8*) echo test ;;
    migrate*|seed*|clean-test*|clean-pass*) echo data ;;
    secrets*|create-env|ensure-*-key|ensure-mta*|sync-mail*|dev-https|dev-certs*|cert-*|mtls*|https*|internalsec*) echo env ;;
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
    android) echo "Android / Flutter / ADB / AVD" ;;
    deploy) echo "Déploiement VPS (push-prod, Portainer, GHCR, préprod)" ;;
    stack) echo "Stack Docker locale (up/down/deploy-service/logs)" ;;
    test) echo "Tests" ;;
    data) echo "Migrations / seeds / cleanup" ;;
    env) echo "Secrets, TLS / mTLS, certificats locaux" ;;
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
echo "═══════════════ Chemins utiles ═══════════════"
printf "  %-${WIDTH}s %s\n" "make setup" "1ʳᵉ fois après clone (.env, clés, deps)"
printf "  %-${WIDTH}s %s\n" "make up-ready" "Stack locale + seed (quotidien, sans tests)"
printf "  %-${WIDTH}s %s\n" "make up-full" "up-ready + batterie de tests (si KO → make up-ready)"
printf "  %-${WIDTH}s %s\n" "make status" "Santé stack + URLs (LAN : CLOUDITY_STATUS_HOST=…)"
echo ""
printf "  %-${WIDTH}s %s\n" "make push-preprod REF=dev" "Préprod VPS : .env.preprod + publish GHCR + checklist Portainer"
printf "  %-${WIDTH}s %s\n" "make push-prod" "Prod VPS : .env.prod + GHCR + checklist (≠ make prod local)"
printf "  %-${WIDTH}s %s\n" "make publish-ghcr" "Déclenche seulement le workflow GHCR (REF=branche)"
printf "  %-${WIDTH}s %s\n" "make h14-https-check" "Smoke HTTPS prod (DNS/TLS/health/CORS)"
echo ""
printf "  %-${WIDTH}s %s\n" "make mobile-emulator-cloudity-start" "AVD Cloudity_S21_FE :5556 (réutilise si déjà up)"
printf "  %-${WIDTH}s %s\n" "make test-mobile-avd" "Suite Photos→Drive→Mail sur emulator-5556 (pas le Samsung)"
printf "  %-${WIDTH}s %s\n" "make mobile-emulator-cloudity-stop" "Arrêt EXPLICITE de l’AVD (les tests ne l’arrêtent jamais)"
printf "  %-${WIDTH}s %s\n" "make run-mobile APP=Mail" "Lance une app Flutter (APP=Photos|Drive|Mail|…)"
echo ""
echo "Variables fréquentes :"
echo "  WAIT=1 SMOKE=1 SKIP_GHCR=1 REF=dev|main DOMAIN=… FORCE=1"
echo "  CLOUDITY_AVD_COLD_BOOT=1   # cold boot AVD si snapshot cassé"
echo "  UP_FULL_SKIP_TESTS=1      # up-full sans la batterie de tests"
echo ""
echo "Filtres : make help TOPIC=all|android|deploy|stack|test|env|pass|mail|git|data|setup"
echo "Alias   : make android-help  ·  make help TOPIC=deploy"
echo "Doc     : docs/operations/DEPLOIEMENT.md"

if [[ -z "$TOPIC" ]]; then
  print_group meta
  print_group deploy
  print_group android
  echo ""
  echo "→ Liste complète groupée : make help TOPIC=all"
  echo "→ Stack Docker locale    : make help TOPIC=stack"
  echo "→ Tests                  : make help TOPIC=test"
  exit 0
fi

ORDER=(meta deploy android stack test data env pass mail git setup other)
for cat in "${ORDER[@]}"; do
  print_group "$cat"
done

echo ""
echo "($(printf '%s\n' "${LINES[@]}" | wc -l) cibles documentées avec ## dans le Makefile)"
echo "Astuce : chaque cible porte un commentaire « target: ## description » — source de cette aide."
