#!/bin/bash

# Script de démarrage pour l'intégration complète Cloudity
# Démarre tous les services dans le bon ordre

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Fonction de log
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_header() {
    echo -e "${PURPLE}🚀 $1${NC}"
}

# Vérification des prérequis
check_prerequisites() {
    log_header "Vérification des prérequis"
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker n'est pas installé"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose n'est pas installé"
        exit 1
    fi
    
    log_success "Prérequis OK"
}

# Nettoyage des containers existants
cleanup() {
    log_header "Nettoyage des containers existants"
    docker-compose down --remove-orphans || true
    log_success "Nettoyage terminé"
}

# Démarrage de l'infrastructure
start_infrastructure() {
    log_header "Démarrage de l'infrastructure"
    
    log_info "Démarrage PostgreSQL et Redis..."
    docker-compose up -d postgres redis
    
    log_info "Attente de la disponibilité de la base de données..."
    sleep 10
    
    # Vérification de la santé des services
    until docker-compose exec postgres pg_isready -U cloudity_admin -d cloudity; do
        log_warning "En attente de PostgreSQL..."
        sleep 2
    done
    
    log_success "Infrastructure démarrée"
}

# Démarrage des services backend
start_backend_services() {
    log_header "Démarrage des services backend"
    
    log_info "Démarrage auth-service..."
    docker-compose up -d auth-service
    sleep 5
    
    log_info "Démarrage admin-service..."
    docker-compose up -d admin-service
    sleep 5
    
    log_info "Démarrage email-service..."
    docker-compose up -d email-service
    sleep 5
    
    log_info "Démarrage alias-service..."
    docker-compose up -d alias-service
    sleep 5
    
    log_info "Démarrage password-service..."
    docker-compose up -d password-service
    sleep 5
    
    log_success "Services backend démarrés"
}

# Démarrage de l'API Gateway
start_api_gateway() {
    log_header "Démarrage de l'API Gateway"
    
    docker-compose up -d api-gateway
    sleep 5
    
    log_success "API Gateway démarré"
}

# Démarrage des applications frontend
start_frontend_apps() {
    log_header "Démarrage des applications frontend"
    
    log_info "Démarrage admin-dashboard..."
    docker-compose up -d admin-dashboard
    sleep 5
    
    log_info "Démarrage email-app..."
    docker-compose up -d email-app
    sleep 5
    
    log_info "Démarrage password-app..."
    docker-compose up -d password-app
    sleep 5
    
    log_success "Applications frontend démarrées"
}

# Vérification de la santé des services
check_health() {
    log_header "Vérification de la santé des services"
    
    services=(
        "http://localhost:8000/health:API Gateway"
        "http://localhost:8081/health:Auth Service"
        "http://localhost:8082/health:Admin Service"
        "http://localhost:8091/health:Email Service"
    )
    
    for service in "${services[@]}"; do
        IFS=':' read -r url name <<< "$service"
        log_info "Vérification de $name..."
        
        if curl -f -s "$url" > /dev/null; then
            log_success "$name est en bonne santé"
        else
            log_warning "$name n'est pas encore disponible"
        fi
    done
}

# Affichage des informations de connexion
show_connection_info() {
    log_header "🌐 Informations de connexion"
    
    echo ""
    echo -e "${GREEN}📊 Admin Dashboard:${NC} http://localhost:3000"
    echo -e "${GREEN}📧 Email App:${NC} http://localhost:8094"
    echo -e "${GREEN}🔐 Password App:${NC} http://localhost:8095"
    echo ""
    echo -e "${BLUE}🌐 API Gateway:${NC} http://localhost:8000"
    echo -e "${BLUE}🔐 Auth Service:${NC} http://localhost:8081"
    echo -e "${BLUE}🏢 Admin Service:${NC} http://localhost:8082"
    echo -e "${BLUE}📧 Email Service:${NC} http://localhost:8091"
    echo -e "${BLUE}🔗 Alias Service:${NC} http://localhost:8092"
    echo -e "${BLUE}🔑 Password Service:${NC} http://localhost:8093"
    echo ""
    echo -e "${YELLOW}🗄️  Adminer (DB):${NC} http://localhost:8080"
    echo -e "${YELLOW}📊 Redis Commander:${NC} http://localhost:8081"
    echo ""
    echo -e "${PURPLE}Credentials par défaut:${NC}"
    echo -e "  Admin: admin@cloudity.com / admin123"
    echo -e "  Email: paul@delhomme.ovh / password"
    echo ""
}

# Fonction principale
main() {
    log_header "🚀 Démarrage de l'intégration complète Cloudity"
    
    check_prerequisites
    cleanup
    start_infrastructure
    start_backend_services
    start_api_gateway
    start_frontend_apps
    
    log_info "Attente de la stabilisation des services..."
    sleep 10
    
    check_health
    show_connection_info
    
    log_success "🎉 Intégration complète démarrée avec succès !"
    log_info "Utilisez 'docker-compose logs -f [service]' pour voir les logs"
    log_info "Utilisez 'docker-compose down' pour arrêter tous les services"
}

# Gestion des signaux
trap 'log_warning "Arrêt demandé..."; docker-compose down; exit 0' SIGINT SIGTERM

# Exécution
main "$@"
