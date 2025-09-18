#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CLOUDITY - SCRIPT BUILD PRINCIPAL
# Point d'entrée pour le build du système
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# Obtenir le répertoire du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Sourcer le module build
source "$SCRIPT_DIR/modules/build.sh"

# ═══════════════════════════════════════════════════════════════
# FONCTION D'AIDE
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Cloudity Build Script v2.0"
    echo ""
    echo "Usage: $0 [ACTION] [PARAM]"
    echo ""
    echo "Actions:"
    echo "  all                 Build complet (infrastructure + backend + frontend)"
    echo "  infra               Build infrastructure uniquement"
    echo "  backend             Build backend uniquement"
    echo "  frontend            Build frontend uniquement"
    echo "  prod                Build optimisé pour production"
    echo "  deploy [tag]        Déployer vers registry avec tag (défaut: latest)"
    echo "  test                Tester les builds"
    echo "  clean               Nettoyer les artefacts de build"
    echo "  help                Afficher cette aide"
    echo ""
    echo "Variables d'environnement:"
    echo "  REGISTRY            Registry Docker pour le déploiement"
    echo ""
    echo "Exemples:"
    echo "  $0 all              # Build complet"
    echo "  $0 backend          # Build backend seulement"
    echo "  $0 deploy v1.0      # Déployer avec tag v1.0"
    echo "  REGISTRY=myregistry.com $0 deploy"
}

# ═══════════════════════════════════════════════════════════════
# FONCTION PRINCIPALE
# ═══════════════════════════════════════════════════════════════

main() {
    # Changer vers le répertoire du projet
    cd "$PROJECT_ROOT"
    
    local action="${1:-all}"
    local param="$2"
    
    case "$action" in
        "help"|"-h"|"--help")
            show_help
            exit 0
            ;;
        *)
            main_build "$action" "$param"
            ;;
    esac
}

# Exécuter la fonction principale
main "$@"
