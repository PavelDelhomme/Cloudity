#!/bin/bash
# CLOUDITY - SCRIPT DIAGNOSTIC v2.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/modules/common.sh"

diagnose_quick() {
    print_title "DIAGNOSTIC RAPIDE"
    
    local issues=0
    
    if ! command_exists docker; then
        log_error "Docker manquant"
        issues=$((issues + 1))
    fi
    
    if ! command_exists "docker compose" && ! command_exists "docker-compose"; then
        log_error "Docker Compose manquant"
        issues=$((issues + 1))
    fi
    
    if [ ! -f "Makefile" ]; then
        log_error "Makefile manquant"
        issues=$((issues + 1))
    fi
    
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml manquant"
        issues=$((issues + 1))
    fi
    
    local running_services
    running_services=$(docker compose ps --services --filter "status=running" 2>/dev/null | wc -l)
    log_info "$running_services services en cours d'exécution"
    
    if [ $issues -eq 0 ]; then
        log_success "Système semble fonctionnel"
    else
        log_error "$issues problèmes détectés"
        return 1
    fi
}

main() {
    cd "$PROJECT_ROOT"
    local action="${1:-quick}"
    
    case "$action" in
        "quick")
            diagnose_quick
            ;;
        *)
            echo "Usage: $0 [quick]"
            exit 1
            ;;
    esac
}

main "$@"
