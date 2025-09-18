#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CLOUDITY - SCRIPT DATABASE PRINCIPAL
# Point d'entrée pour la gestion de la base de données
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# Obtenir le répertoire du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Sourcer le module database
source "$SCRIPT_DIR/modules/database.sh"

# ═══════════════════════════════════════════════════════════════
# FONCTION D'AIDE
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Cloudity Database Script v2.0"
    echo ""
    echo "Usage: $0 [ACTION] [PARAM]"
    echo ""
    echo "Actions:"
    echo "  init                Initialiser la base de données"
    echo "  backup [nom]        Créer une sauvegarde (nom optionnel)"
    echo "  restore <fichier>   Restaurer depuis une sauvegarde"
    echo "  reset               Réinitialiser complètement la BDD"
    echo "  maintenance         Maintenance et nettoyage"
    echo "  stats               Afficher les statistiques"
    echo "  list                Lister les sauvegardes disponibles"
    echo "  help                Afficher cette aide"
    echo ""
    echo "Variables d'environnement:"
    echo "  DB_HOST             Host PostgreSQL (défaut: localhost)"
    echo "  DB_PORT             Port PostgreSQL (défaut: 5432)"
    echo "  DB_NAME             Nom de la BDD (défaut: cloudity)"
    echo "  DB_USER             Utilisateur BDD (défaut: cloudity_admin)"
    echo "  DB_PASSWORD         Mot de passe BDD"
    echo ""
    echo "Exemples:"
    echo "  $0 init             # Initialiser la BDD"
    echo "  $0 backup           # Sauvegarde automatique"
    echo "  $0 backup prod_v1   # Sauvegarde nommée"
    echo "  $0 restore backup.sql"
}

# ═══════════════════════════════════════════════════════════════
# FONCTION PRINCIPALE
# ═══════════════════════════════════════════════════════════════

main() {
    # Changer vers le répertoire du projet
    cd "$PROJECT_ROOT"
    
    local action="${1:-init}"
    local param="$2"
    
    case "$action" in
        "help"|"-h"|"--help")
            show_help
            exit 0
            ;;
        *)
            main_database "$action" "$param"
            ;;
    esac
}

# Exécuter la fonction principale
main "$@"
