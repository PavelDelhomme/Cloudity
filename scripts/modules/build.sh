#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE BUILD
# Scripts de build et déploiement
# ═══════════════════════════════════════════════════════════════

# Sourcer les fonctions communes
source "$(dirname "$0")/common.sh"

# ═══════════════════════════════════════════════════════════════
# VARIABLES DE CONFIGURATION
# ═══════════════════════════════════════════════════════════════

COMPOSE_CMD="docker compose"
BUILD_DIR=".build"
REGISTRY="${REGISTRY:-}"

# ═══════════════════════════════════════════════════════════════
# BUILD COMPLET
# ═══════════════════════════════════════════════════════════════

build_all() {
    print_title "BUILD COMPLET CLOUDITY"
    
    # Créer le répertoire de build
    ensure_directory "$BUILD_DIR"
    
    # Build de l'infrastructure
    build_infrastructure
    
    # Build du backend
    build_backend
    
    # Build du frontend
    build_frontend
    
    log_success "Build complet terminé"
}

# ═══════════════════════════════════════════════════════════════
# BUILD INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════

build_infrastructure() {
    print_title "BUILD INFRASTRUCTURE"
    
    log_info "Téléchargement des images d'infrastructure..."
    
    local infra_images=(
        "postgres:15"
        "redis:7-alpine"
        "adminer:latest"
        "rediscommander/redis-commander:latest"
    )
    
    for image in "${infra_images[@]}"; do
        log_info "Téléchargement de $image..."
        docker pull "$image" || log_warning "Échec du téléchargement de $image"
    done
    
    log_success "Infrastructure buildée"
}

# ═══════════════════════════════════════════════════════════════
# BUILD BACKEND
# ═══════════════════════════════════════════════════════════════

build_backend() {
    print_title "BUILD BACKEND"
    
    # Services backend à builder
    local backend_services=(
        "auth-service"
        "api-gateway"
        "admin-service"
        "email-service"
        "alias-service"
        "password-service"
    )
    
    for service in "${backend_services[@]}"; do
        build_backend_service "$service"
    done
    
    log_success "Backend buildé"
}

build_backend_service() {
    local service="$1"
    local service_path="backend/$service"
    
    if [ ! -d "$service_path" ]; then
        log_warning "Service non trouvé: $service_path"
        return 1
    fi
    
    log_info "Build de $service..."
    
    # Vérifier le type de service et builder accordingly
    if [ -f "$service_path/Cargo.toml" ]; then
        build_rust_service "$service" "$service_path"
    elif [ -f "$service_path/go.mod" ]; then
        build_go_service "$service" "$service_path"
    elif [ -f "$service_path/requirements.txt" ]; then
        build_python_service "$service" "$service_path"
    else
        log_warning "Type de service non reconnu: $service"
        return 1
    fi
}

build_rust_service() {
    local service="$1"
    local service_path="$2"
    
    log_info "Build Rust service: $service"
    
    # Build avec Docker
    $COMPOSE_CMD build "$service" || {
        log_error "Échec du build de $service"
        return 1
    }
    
    log_success "$service (Rust) buildé"
}

build_go_service() {
    local service="$1"
    local service_path="$2"
    
    log_info "Build Go service: $service"
    
    # Build avec Docker
    $COMPOSE_CMD build "$service" || {
        log_error "Échec du build de $service"
        return 1
    }
    
    log_success "$service (Go) buildé"
}

build_python_service() {
    local service="$1"
    local service_path="$2"
    
    log_info "Build Python service: $service"
    
    # Build avec Docker
    $COMPOSE_CMD build "$service" || {
        log_error "Échec du build de $service"
        return 1
    }
    
    log_success "$service (Python) buildé"
}

# ═══════════════════════════════════════════════════════════════
# BUILD FRONTEND
# ═══════════════════════════════════════════════════════════════

build_frontend() {
    print_title "BUILD FRONTEND"
    
    local frontend_apps=(
        "admin-dashboard"
        "email-app"
        "password-app"
    )
    
    for app in "${frontend_apps[@]}"; do
        build_frontend_app "$app"
    done
    
    log_success "Frontend buildé"
}

build_frontend_app() {
    local app="$1"
    local app_path="frontend/$app"
    
    if [ ! -d "$app_path" ]; then
        log_warning "Application non trouvée: $app_path"
        return 1
    fi
    
    log_info "Build de $app..."
    
    # Vérifier si Node.js est disponible
    if command_exists node && [ -f "$app_path/package.json" ]; then
        # Build local avec Node.js
        log_info "Build local de $app avec Node.js..."
        (
            cd "$app_path"
            npm install
            npm run build
        ) || {
            log_warning "Échec du build local, tentative avec Docker..."
            build_frontend_app_docker "$app"
        }
    else
        # Build avec Docker
        build_frontend_app_docker "$app"
    fi
    
    log_success "$app buildé"
}

build_frontend_app_docker() {
    local app="$1"
    
    log_info "Build Docker de $app..."
    
    $COMPOSE_CMD build "$app" || {
        log_error "Échec du build Docker de $app"
        return 1
    }
}

# ═══════════════════════════════════════════════════════════════
# BUILD POUR PRODUCTION
# ═══════════════════════════════════════════════════════════════

build_production() {
    print_title "BUILD PRODUCTION"
    
    log_info "Build optimisé pour la production..."
    
    # Build sans cache pour s'assurer de la fraîcheur
    $COMPOSE_CMD build --no-cache || {
        log_error "Échec du build production"
        return 1
    }
    
    # Optimisation des images
    optimize_docker_images
    
    log_success "Build production terminé"
}

optimize_docker_images() {
    log_info "Optimisation des images Docker..."
    
    # Nettoyer les images intermédiaires
    docker image prune -f
    
    # Afficher la taille des images
    log_info "Taille des images:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep cloudity || true
}

# ═══════════════════════════════════════════════════════════════
# DÉPLOIEMENT
# ═══════════════════════════════════════════════════════════════

deploy_to_registry() {
    local tag="${1:-latest}"
    
    if [ -z "$REGISTRY" ]; then
        log_error "Variable REGISTRY non définie"
        return 1
    fi
    
    print_title "DÉPLOIEMENT VERS REGISTRY"
    
    log_info "Tag et push vers $REGISTRY avec tag $tag..."
    
    # Services à déployer
    local services=(
        "auth-service"
        "api-gateway"
        "admin-service"
        "email-service"
        "alias-service"
        "password-service"
        "admin-dashboard"
        "email-app"
        "password-app"
    )
    
    for service in "${services[@]}"; do
        local image_name="cloudity_$service"
        local registry_name="$REGISTRY/$service:$tag"
        
        log_info "Tag et push de $service..."
        
        # Tag l'image
        docker tag "$image_name" "$registry_name" || {
            log_warning "Échec du tag de $service"
            continue
        }
        
        # Push vers le registry
        docker push "$registry_name" || {
            log_warning "Échec du push de $service"
            continue
        }
        
        log_success "$service déployé vers $registry_name"
    done
    
    log_success "Déploiement vers registry terminé"
}

# ═══════════════════════════════════════════════════════════════
# TESTS DE BUILD
# ═══════════════════════════════════════════════════════════════

test_build() {
    print_title "TESTS DE BUILD"
    
    log_info "Vérification des images buildées..."
    
    # Vérifier que toutes les images existent
    local services=(
        "cloudity_auth-service"
        "cloudity_api-gateway"
        "cloudity_admin-service"
        "cloudity_admin-dashboard"
    )
    
    local missing=0
    for service in "${services[@]}"; do
        if docker images --format "{{.Repository}}" | grep -q "^$service$"; then
            log_success "✓ Image trouvée: $service"
        else
            log_error "✗ Image manquante: $service"
            missing=$((missing + 1))
        fi
    done
    
    if [ $missing -eq 0 ]; then
        log_success "Tous les services sont buildés"
        
        # Test de démarrage rapide
        log_info "Test de démarrage rapide..."
        $COMPOSE_CMD up -d postgres redis
        sleep 5
        $COMPOSE_CMD up -d auth-service api-gateway
        sleep 10
        
        # Test de connectivité
        if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
            log_success "✓ API Gateway répond"
        else
            log_warning "✗ API Gateway ne répond pas"
        fi
        
        # Arrêt des services de test
        $COMPOSE_CMD down
        
    else
        log_error "$missing services manquants"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# NETTOYAGE
# ═══════════════════════════════════════════════════════════════

clean_build() {
    print_title "NETTOYAGE BUILD"
    
    log_info "Nettoyage des artefacts de build..."
    
    # Nettoyer les images de build intermédiaires
    docker image prune -f
    
    # Nettoyer le répertoire de build
    if [ -d "$BUILD_DIR" ]; then
        rm -rf "$BUILD_DIR"
        log_info "Répertoire $BUILD_DIR supprimé"
    fi
    
    # Nettoyer les volumes non utilisés
    docker volume prune -f
    
    log_success "Nettoyage terminé"
}

# ═══════════════════════════════════════════════════════════════
# FONCTION PRINCIPALE
# ═══════════════════════════════════════════════════════════════

main_build() {
    local action="${1:-all}"
    local param="$2"
    
    setup_cleanup
    check_project_root
    
    case "$action" in
        "all")
            build_all
            ;;
        "infra"|"infrastructure")
            build_infrastructure
            ;;
        "backend")
            build_backend
            ;;
        "frontend")
            build_frontend
            ;;
        "prod"|"production")
            build_production
            ;;
        "deploy")
            deploy_to_registry "$param"
            ;;
        "test")
            test_build
            ;;
        "clean")
            clean_build
            ;;
        *)
            log_error "Action non reconnue: $action"
            echo "Usage: $0 [all|infra|backend|frontend|prod|deploy|test|clean] [param]"
            exit 1
            ;;
    esac
}

# Exécuter si le script est appelé directement
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main_build "$@"
fi
