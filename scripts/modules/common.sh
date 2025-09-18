#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE SCRIPTS COMMUNS
# Fonctions et utilitaires partagés
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# COULEURS ET LOGGING
# ═══════════════════════════════════════════════════════════════

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Émojis
EMOJI_SUCCESS="✅"
EMOJI_ERROR="❌"
EMOJI_WARNING="⚠️"
EMOJI_INFO="ℹ️"
EMOJI_ROCKET="🚀"
EMOJI_GEAR="⚙️"

# ═══════════════════════════════════════════════════════════════
# FONCTIONS DE LOGGING
# ═══════════════════════════════════════════════════════════════

log_info() {
    echo -e "${BLUE}${EMOJI_INFO} $1${NC}"
}

log_success() {
    echo -e "${GREEN}${EMOJI_SUCCESS} $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}${EMOJI_WARNING} $1${NC}"
}

log_error() {
    echo -e "${RED}${EMOJI_ERROR} $1${NC}"
}

log_rocket() {
    echo -e "${PURPLE}${EMOJI_ROCKET} $1${NC}"
}

log_gear() {
    echo -e "${CYAN}${EMOJI_GEAR} $1${NC}"
}

# ═══════════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES
# ═══════════════════════════════════════════════════════════════

# Vérifier si une commande existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Attendre qu'un service soit prêt
wait_for_service() {
    local service="$1"
    local port="$2"
    local timeout="${3:-30}"
    
    log_info "Attente du service $service sur le port $port..."
    
    local count=0
    while [ $count -lt $timeout ]; do
        if nc -z localhost "$port" 2>/dev/null; then
            log_success "Service $service prêt!"
            return 0
        fi
        sleep 2
        count=$((count + 2))
    done
    
    log_error "Timeout: Service $service non disponible après ${timeout}s"
    return 1
}

# Vérifier si Docker est disponible
check_docker() {
    if ! command_exists docker; then
        log_error "Docker n'est pas installé"
        return 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker n'est pas démarré"
        return 1
    fi
    
    return 0
}

# Vérifier si Docker Compose est disponible
check_docker_compose() {
    if command_exists "docker compose"; then
        COMPOSE_CMD="docker compose"
        return 0
    elif command_exists "docker-compose"; then
        COMPOSE_CMD="docker-compose"
        return 0
    else
        log_error "Docker Compose n'est pas installé"
        return 1
    fi
}

# Créer un répertoire s'il n'existe pas
ensure_directory() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        log_info "Répertoire créé: $dir"
    fi
}

# Sauvegarder un fichier avec timestamp
backup_file() {
    local file="$1"
    if [ -f "$file" ]; then
        local backup="${file}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$file" "$backup"
        log_info "Fichier sauvegardé: $backup"
    fi
}

# Vérifier les prérequis système
check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    local missing=0
    
    if ! check_docker; then
        missing=$((missing + 1))
    fi
    
    if ! check_docker_compose; then
        missing=$((missing + 1))
    fi
    
    if ! command_exists curl; then
        log_warning "curl n'est pas installé (recommandé)"
    fi
    
    if ! command_exists jq; then
        log_warning "jq n'est pas installé (recommandé pour JSON)"
    fi
    
    if [ $missing -eq 0 ]; then
        log_success "Tous les prérequis sont satisfaits"
        return 0
    else
        log_error "$missing prérequis manquants"
        return 1
    fi
}

# Afficher un séparateur
print_separator() {
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
}

# Afficher un titre
print_title() {
    local title="$1"
    echo ""
    print_separator
    echo -e "${PURPLE}$title${NC}"
    print_separator
    echo ""
}

# Demander confirmation à l'utilisateur
confirm() {
    local message="$1"
    local default="${2:-n}"
    
    if [ "$default" = "y" ]; then
        local prompt="[Y/n]"
    else
        local prompt="[y/N]"
    fi
    
    while true; do
        read -p "$message $prompt: " response
        
        if [ -z "$response" ]; then
            response="$default"
        fi
        
        case "$response" in
            [Yy]|[Yy][Ee][Ss])
                return 0
                ;;
            [Nn]|[Nn][Oo])
                return 1
                ;;
            *)
                echo "Veuillez répondre par 'y' ou 'n'."
                ;;
        esac
    done
}

# Nettoyer à la sortie
cleanup_on_exit() {
    log_info "Nettoyage en cours..."
    # Ajouter ici les actions de nettoyage si nécessaire
}

# Configurer le trap pour le nettoyage
setup_cleanup() {
    trap cleanup_on_exit EXIT
}

# Vérifier si le script est exécuté depuis la racine du projet
check_project_root() {
    if [ ! -f "Makefile" ] || [ ! -f "docker-compose.yml" ]; then
        log_error "Ce script doit être exécuté depuis la racine du projet Cloudity"
        exit 1
    fi
}
