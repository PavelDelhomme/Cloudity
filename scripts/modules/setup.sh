#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE SETUP
# Scripts d'installation et configuration
# ═══════════════════════════════════════════════════════════════

# Sourcer les fonctions communes
source "$(dirname "$0")/common.sh"

# ═══════════════════════════════════════════════════════════════
# SETUP ENVIRONNEMENT DE DÉVELOPPEMENT
# ═══════════════════════════════════════════════════════════════

setup_development_environment() {
    print_title "SETUP ENVIRONNEMENT DÉVELOPPEMENT"
    
    # Vérifier les prérequis
    if ! check_prerequisites; then
        log_error "Prérequis manquants, arrêt du setup"
        exit 1
    fi
    
    # Créer les répertoires nécessaires
    log_info "Création des répertoires..."
    ensure_directory "storage/logs"
    ensure_directory "storage/backups"
    ensure_directory "storage/postgres"
    ensure_directory "storage/redis"
    ensure_directory ".tmp"
    
    # Configuration Git
    log_info "Configuration Git..."
    git config --local core.autocrlf input 2>/dev/null || true
    git config --local pull.rebase false 2>/dev/null || true
    
    # Créer le réseau Docker
    log_info "Configuration Docker..."
    docker network create cloudity-network 2>/dev/null || log_info "Réseau cloudity-network existe déjà"
    
    # Télécharger les images Docker de base
    log_info "Téléchargement des images Docker de base..."
    docker pull postgres:15 >/dev/null 2>&1 &
    docker pull redis:7-alpine >/dev/null 2>&1 &
    docker pull adminer:latest >/dev/null 2>&1 &
    wait
    
    log_success "Environnement de développement configuré"
}

# ═══════════════════════════════════════════════════════════════
# SETUP PRODUCTION
# ═══════════════════════════════════════════════════════════════

setup_production_environment() {
    print_title "SETUP ENVIRONNEMENT PRODUCTION"
    
    log_warning "Configuration pour environnement de production"
    
    if ! confirm "Continuer avec la configuration production?"; then
        log_info "Configuration annulée"
        return 1
    fi
    
    # Vérifier les prérequis
    if ! check_prerequisites; then
        log_error "Prérequis manquants, arrêt du setup"
        exit 1
    fi
    
    # Créer les répertoires de production
    log_info "Création des répertoires de production..."
    ensure_directory "/var/lib/cloudity/postgres"
    ensure_directory "/var/lib/cloudity/redis"
    ensure_directory "/var/log/cloudity"
    ensure_directory "/etc/cloudity"
    
    # Configuration des permissions
    log_info "Configuration des permissions..."
    sudo chown -R 999:999 /var/lib/cloudity/postgres 2>/dev/null || true
    sudo chown -R 999:999 /var/lib/cloudity/redis 2>/dev/null || true
    
    # Configuration firewall (si ufw est disponible)
    if command_exists ufw; then
        log_info "Configuration firewall..."
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
        sudo ufw allow 22/tcp
    fi
    
    log_success "Environnement de production configuré"
}

# ═══════════════════════════════════════════════════════════════
# INSTALLATION DES DÉPENDANCES
# ═══════════════════════════════════════════════════════════════

install_system_dependencies() {
    print_title "INSTALLATION DÉPENDANCES SYSTÈME"
    
    # Détecter le système d'exploitation
    if [ -f /etc/arch-release ]; then
        install_arch_dependencies
    elif [ -f /etc/debian_version ]; then
        install_debian_dependencies
    elif [ -f /etc/redhat-release ]; then
        install_redhat_dependencies
    else
        log_warning "Système non reconnu, installation manuelle requise"
        show_manual_installation_instructions
    fi
}

install_arch_dependencies() {
    log_info "Installation des dépendances pour Arch Linux/Manjaro..."
    
    local packages=(
        "docker"
        "docker-compose"
        "curl"
        "jq"
        "netcat"
        "git"
    )
    
    if command_exists yay; then
        log_info "Installation avec yay..."
        yay -S --noconfirm "${packages[@]}"
    elif command_exists pacman; then
        log_info "Installation avec pacman..."
        sudo pacman -S --noconfirm "${packages[@]}"
    else
        log_error "Gestionnaire de paquets non trouvé"
        return 1
    fi
    
    # Démarrer et activer Docker
    sudo systemctl enable docker
    sudo systemctl start docker
    
    # Ajouter l'utilisateur au groupe docker
    sudo usermod -aG docker "$USER"
    
    log_success "Dépendances Arch Linux installées"
    log_warning "Redémarrage de session requis pour le groupe docker"
}

install_debian_dependencies() {
    log_info "Installation des dépendances pour Debian/Ubuntu..."
    
    sudo apt update
    sudo apt install -y \
        docker.io \
        docker-compose \
        curl \
        jq \
        netcat \
        git
    
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker "$USER"
    
    log_success "Dépendances Debian/Ubuntu installées"
    log_warning "Redémarrage de session requis pour le groupe docker"
}

install_redhat_dependencies() {
    log_info "Installation des dépendances pour Red Hat/CentOS..."
    
    sudo yum install -y \
        docker \
        docker-compose \
        curl \
        jq \
        nc \
        git
    
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker "$USER"
    
    log_success "Dépendances Red Hat/CentOS installées"
    log_warning "Redémarrage de session requis pour le groupe docker"
}

show_manual_installation_instructions() {
    log_info "Instructions d'installation manuelle:"
    echo ""
    echo "Veuillez installer manuellement:"
    echo "- Docker"
    echo "- Docker Compose"
    echo "- curl"
    echo "- jq"
    echo "- netcat (nc)"
    echo "- git"
    echo ""
    echo "Puis relancer ce script."
}

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION FRONTEND
# ═══════════════════════════════════════════════════════════════

setup_frontend_dependencies() {
    print_title "SETUP DÉPENDANCES FRONTEND"
    
    # Vérifier si Node.js est installé
    if ! command_exists node; then
        log_warning "Node.js n'est pas installé"
        if confirm "Installer Node.js avec nvm?"; then
            install_nodejs_with_nvm
        else
            log_info "Installation Node.js ignorée"
            return 1
        fi
    fi
    
    # Installer les dépendances des applications frontend
    local frontend_apps=("admin-dashboard" "email-app" "password-app")
    
    for app in "${frontend_apps[@]}"; do
        local app_path="frontend/$app"
        if [ -d "$app_path" ] && [ -f "$app_path/package.json" ]; then
            log_info "Installation dépendances pour $app..."
            (cd "$app_path" && npm install)
        fi
    done
    
    log_success "Dépendances frontend installées"
}

install_nodejs_with_nvm() {
    log_info "Installation de Node.js avec nvm..."
    
    # Installer nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    
    # Sourcer nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Installer la dernière version LTS de Node.js
    nvm install --lts
    nvm use --lts
    
    log_success "Node.js installé avec nvm"
}

# ═══════════════════════════════════════════════════════════════
# FONCTION PRINCIPALE
# ═══════════════════════════════════════════════════════════════

main_setup() {
    local setup_type="${1:-dev}"
    
    setup_cleanup
    check_project_root
    
    case "$setup_type" in
        "dev"|"development")
            setup_development_environment
            ;;
        "prod"|"production")
            setup_production_environment
            ;;
        "deps"|"dependencies")
            install_system_dependencies
            ;;
        "frontend")
            setup_frontend_dependencies
            ;;
        "all")
            install_system_dependencies
            setup_development_environment
            setup_frontend_dependencies
            ;;
        *)
            log_error "Type de setup non reconnu: $setup_type"
            echo "Usage: $0 [dev|prod|deps|frontend|all]"
            exit 1
            ;;
    esac
    
    log_success "Setup terminé avec succès!"
}

# Exécuter si le script est appelé directement
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main_setup "$@"
fi
