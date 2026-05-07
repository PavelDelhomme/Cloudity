#!/usr/bin/env bash
set -euo pipefail

# Nettoie des tenants de test de manière sécurisée.
# - dry-run par défaut
# - backup SQL auto en mode --apply
# - confirmation explicite obligatoire
#
# Usage:
#   ./scripts/cleanup-test-tenants.sh
#   ./scripts/cleanup-test-tenants.sh --apply
#   ./scripts/cleanup-test-tenants.sh --apply --yes
#   ./scripts/cleanup-test-tenants.sh --apply --include-domain "acme.cloudity.io"
#   ./scripts/cleanup-test-tenants.sh --apply --include-name-like "%e2e tenant%"

APPLY=0
YES=0

DB_USER="${POSTGRES_USER:-cloudity_admin}"
DB_NAME="${POSTGRES_DB:-cloudity}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-storage/backups}"

DEFAULT_DOMAIN_PATTERNS=(
  "acme.cloudity.io"
  "e2e-tenant-%"
  "global.cloudity.io"
  "gllobal.cououdity.io"
  "techstart.cloudity.io"
  "techstart.%.cloudity.io"
)
DEFAULT_NAME_PATTERNS=(
  "%e2e tenant%"
)
PROTECTED_DOMAINS=(
  "admin.cloudity.local"
)

INCLUDE_DOMAINS=()
INCLUDE_NAME_LIKES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --yes)
      YES=1
      shift
      ;;
    --include-domain)
      if [[ -z "${2:-}" ]]; then
        echo "❌ --include-domain nécessite une valeur."
        exit 1
      fi
      INCLUDE_DOMAINS+=("$2")
      shift 2
      ;;
    --include-name-like)
      if [[ -z "${2:-}" ]]; then
        echo "❌ --include-name-like nécessite une valeur."
        exit 1
      fi
      INCLUDE_NAME_LIKES+=("$2")
      shift 2
      ;;
    -h|--help)
      echo "Usage:"
      echo "  $0                          # dry-run (safe)"
      echo "  $0 --apply                  # suppression + prompt de confirmation"
      echo "  $0 --apply --yes            # suppression sans prompt interactif"
      echo "  $0 --apply --include-domain \"acme.cloudity.io\""
      echo "  $0 --apply --include-name-like \"%e2e tenant%\""
      exit 0
      ;;
    *)
      echo "❌ Option inconnue: $1"
      echo "   Utilise --help pour voir les options."
      exit 1
      ;;
  esac
done

DOMAIN_PATTERNS=("${DEFAULT_DOMAIN_PATTERNS[@]}")
NAME_PATTERNS=("${DEFAULT_NAME_PATTERNS[@]}")

if [[ ${#INCLUDE_DOMAINS[@]} -gt 0 || ${#INCLUDE_NAME_LIKES[@]} -gt 0 ]]; then
  DOMAIN_PATTERNS=("${INCLUDE_DOMAINS[@]}")
  NAME_PATTERNS=("${INCLUDE_NAME_LIKES[@]}")
fi

if [[ ${#DOMAIN_PATTERNS[@]} -eq 0 && ${#NAME_PATTERNS[@]} -eq 0 ]]; then
  echo "❌ Aucune cible de nettoyage fournie."
  exit 1
fi

echo "🧹 Recherche des tenants ciblés…"

WHERE_SQL=""
for p in "${DOMAIN_PATTERNS[@]}"; do
  [[ -n "${WHERE_SQL}" ]] && WHERE_SQL+=" OR "
  WHERE_SQL+="domain ILIKE '${p}'"
done
for p in "${NAME_PATTERNS[@]}"; do
  [[ -n "${WHERE_SQL}" ]] && WHERE_SQL+=" OR "
  WHERE_SQL+="name ILIKE '${p}'"
done

PROTECT_SQL=""
for p in "${PROTECTED_DOMAINS[@]}"; do
  [[ -n "${PROTECT_SQL}" ]] && PROTECT_SQL+=" OR "
  PROTECT_SQL+="domain ILIKE '${p}'"
done

FINAL_WHERE="(${WHERE_SQL})"
if [[ -n "${PROTECT_SQL}" ]]; then
  FINAL_WHERE+=" AND NOT (${PROTECT_SQL})"
fi

LIST_SQL="SELECT id, name, domain, is_active FROM tenants WHERE ${FINAL_WHERE} ORDER BY id;"
COUNT_SQL="SELECT COUNT(*) AS tenants_match FROM tenants WHERE ${FINAL_WHERE};"
DELETE_SQL="DELETE FROM tenants WHERE ${FINAL_WHERE};"

docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -c "${LIST_SQL}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -c "${COUNT_SQL}"

if [[ $APPLY -eq 0 ]]; then
  echo "Mode dry-run (aucune suppression)."
  echo "👉 Suppression réelle: $0 --apply"
  echo "👉 Ciblage précis: $0 --apply --include-domain \"acme.cloudity.io\""
  exit 0
fi

mkdir -p "${BACKUP_DIR}"
backup_file="${BACKUP_DIR}/cleanup-test-tenants-$(date +%Y%m%d_%H%M%S).sql.gz"
echo "💾 Backup SQL avant suppression: ${backup_file}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${backup_file}"

if [[ $YES -ne 1 ]]; then
  echo ""
  echo "⚠️  Suppression réelle activée."
  echo "Tape EXACTEMENT: DELETE TEST TENANTS"
  read -r confirm
  if [[ "${confirm}" != "DELETE TEST TENANTS" ]]; then
    echo "Annulé (confirmation invalide)."
    exit 1
  fi
fi

docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -c "${DELETE_SQL}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -c "${COUNT_SQL}"
echo "✅ Nettoyage terminé."
