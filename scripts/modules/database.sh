#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE DATABASE
# Scripts de gestion de base de données
# ═══════════════════════════════════════════════════════════════

# Sourcer les fonctions communes
source "$(dirname "$0")/common.sh"

# ═══════════════════════════════════════════════════════════════
# VARIABLES DE CONFIGURATION
# ═══════════════════════════════════════════════════════════════

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-cloudity}"
DB_USER="${DB_USER:-cloudity_admin}"
DB_PASSWORD="${DB_PASSWORD:-cloudity_secure_2024}"

COMPOSE_CMD="docker compose"

# ═══════════════════════════════════════════════════════════════
# INITIALISATION DE LA BASE DE DONNÉES
# ═══════════════════════════════════════════════════════════════

init_database() {
    print_title "INITIALISATION BASE DE DONNÉES"
    
    # Vérifier que PostgreSQL est démarré
    if ! $COMPOSE_CMD ps postgres --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then
        log_info "Démarrage de PostgreSQL..."
        $COMPOSE_CMD up -d postgres
        
        # Attendre que PostgreSQL soit prêt
        wait_for_service "PostgreSQL" "$DB_PORT" 60
    fi
    
    # Exécuter les scripts d'initialisation
    log_info "Exécution des scripts d'initialisation..."
    
    local init_scripts=(
        "infrastructure/postgresql/init/01-create-database.sql"
        "infrastructure/postgresql/init/02-create-tenants.sql"
        "infrastructure/postgresql/init/03-setup-rls.sql"
        "infrastructure/postgresql/init/04-email-system.sql"
        "infrastructure/postgresql/init/05-create-paul-admin.sql"
    )
    
    for script in "${init_scripts[@]}"; do
        if [ -f "$script" ]; then
            log_info "Exécution de $script..."
            $COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" < "$script"
        else
            log_warning "Script non trouvé: $script"
        fi
    done
    
    log_success "Base de données initialisée"
}

# ═══════════════════════════════════════════════════════════════
# SAUVEGARDE DE LA BASE DE DONNÉES
# ═══════════════════════════════════════════════════════════════

backup_database() {
    local backup_name="${1:-cloudity_$(date +%Y%m%d_%H%M%S)}"
    local backup_dir="storage/backups"
    
    print_title "SAUVEGARDE BASE DE DONNÉES"
    
    # Créer le répertoire de sauvegarde
    ensure_directory "$backup_dir"
    
    # Vérifier que PostgreSQL est accessible
    if ! $COMPOSE_CMD exec postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; then
        log_error "PostgreSQL n'est pas accessible"
        return 1
    fi
    
    local backup_file="$backup_dir/${backup_name}.sql"
    
    log_info "Création de la sauvegarde: $backup_file"
    
    # Créer la sauvegarde
    if $COMPOSE_CMD exec postgres pg_dump -U "$DB_USER" "$DB_NAME" > "$backup_file"; then
        log_success "Sauvegarde créée: $backup_file"
        
        # Compresser la sauvegarde
        if command_exists gzip; then
            gzip "$backup_file"
            log_info "Sauvegarde compressée: ${backup_file}.gz"
        fi
        
        # Afficher la taille
        local size
        if [ -f "${backup_file}.gz" ]; then
            size=$(ls -lh "${backup_file}.gz" | awk '{print $5}')
            log_info "Taille de la sauvegarde: $size"
        fi
        
    else
        log_error "Échec de la sauvegarde"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# RESTAURATION DE LA BASE DE DONNÉES
# ═══════════════════════════════════════════════════════════════

restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "Fichier de sauvegarde requis"
        list_available_backups
        return 1
    fi
    
    print_title "RESTAURATION BASE DE DONNÉES"
    
    # Vérifier que le fichier existe
    if [ ! -f "$backup_file" ]; then
        # Essayer avec l'extension .gz
        if [ -f "${backup_file}.gz" ]; then
            log_info "Décompression de ${backup_file}.gz..."
            gunzip "${backup_file}.gz"
        else
            log_error "Fichier de sauvegarde non trouvé: $backup_file"
            list_available_backups
            return 1
        fi
    fi
    
    log_warning "Cette opération va écraser la base de données existante"
    if ! confirm "Continuer avec la restauration?"; then
        log_info "Restauration annulée"
        return 1
    fi
    
    # Vérifier que PostgreSQL est accessible
    if ! $COMPOSE_CMD exec postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; then
        log_error "PostgreSQL n'est pas accessible"
        return 1
    fi
    
    log_info "Restauration de la base de données depuis: $backup_file"
    
    # Restaurer la base de données
    if $COMPOSE_CMD exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" < "$backup_file"; then
        log_success "Base de données restaurée avec succès"
    else
        log_error "Échec de la restauration"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# RESET DE LA BASE DE DONNÉES
# ═══════════════════════════════════════════════════════════════

reset_database() {
    print_title "RESET BASE DE DONNÉES"
    
    log_warning "Cette opération va supprimer TOUTES les données"
    if ! confirm "Êtes-vous sûr de vouloir réinitialiser la base de données?"; then
        log_info "Reset annulé"
        return 1
    fi
    
    # Créer une sauvegarde avant le reset
    log_info "Création d'une sauvegarde de sécurité..."
    backup_database "pre_reset_$(date +%Y%m%d_%H%M%S)"
    
    # Arrêter PostgreSQL
    log_info "Arrêt de PostgreSQL..."
    $COMPOSE_CMD stop postgres
    
    # Supprimer le volume de données
    log_info "Suppression du volume de données..."
    $COMPOSE_CMD rm -f postgres
    docker volume rm cloudity_postgres_data 2>/dev/null || true
    
    # Redémarrer PostgreSQL
    log_info "Redémarrage de PostgreSQL..."
    $COMPOSE_CMD up -d postgres
    
    # Attendre que PostgreSQL soit prêt
    wait_for_service "PostgreSQL" "$DB_PORT" 60
    
    # Réinitialiser la base de données
    init_database
    
    log_success "Base de données réinitialisée"
}

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE DE LA BASE DE DONNÉES
# ═══════════════════════════════════════════════════════════════

maintenance_database() {
    print_title "MAINTENANCE BASE DE DONNÉES"
    
    # Vérifier que PostgreSQL est accessible
    if ! $COMPOSE_CMD exec postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; then
        log_error "PostgreSQL n'est pas accessible"
        return 1
    fi
    
    log_info "Nettoyage des sessions expirées..."
    $COMPOSE_CMD exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "DELETE FROM sessions WHERE expires_at < NOW();" 2>/dev/null || true
    
    log_info "Nettoyage des logs anciens (> 30 jours)..."
    $COMPOSE_CMD exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days';" 2>/dev/null || true
    
    log_info "Analyse et optimisation des tables..."
    $COMPOSE_CMD exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "ANALYZE;" 2>/dev/null || true
    
    log_info "Nettoyage des statistiques..."
    $COMPOSE_CMD exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "VACUUM ANALYZE;" 2>/dev/null || true
    
    log_success "Maintenance terminée"
}

# ═══════════════════════════════════════════════════════════════
# UTILITAIRES
# ═══════════════════════════════════════════════════════════════

list_available_backups() {
    log_info "Sauvegardes disponibles:"
    if [ -d "storage/backups" ]; then
        ls -la storage/backups/*.sql* 2>/dev/null | awk '{print "  " $9 " (" $5 ", " $6 " " $7 " " $8 ")"}'
    else
        log_info "Aucune sauvegarde trouvée"
    fi
}

show_database_stats() {
    print_title "STATISTIQUES BASE DE DONNÉES"
    
    if ! $COMPOSE_CMD exec postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; then
        log_error "PostgreSQL n'est pas accessible"
        return 1
    fi
    
    log_info "Statistiques des tables:"
    $COMPOSE_CMD exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples
        FROM pg_stat_user_tables 
        ORDER BY n_live_tup DESC;
    " 2>/dev/null || log_warning "Impossible d'obtenir les statistiques"
    
    log_info "Taille de la base de données:"
    $COMPOSE_CMD exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            pg_database.datname,
            pg_size_pretty(pg_database_size(pg_database.datname)) AS size
        FROM pg_database
        WHERE pg_database.datname = '$DB_NAME';
    " 2>/dev/null || log_warning "Impossible d'obtenir la taille"
}

# ═══════════════════════════════════════════════════════════════
# FONCTION PRINCIPALE
# ═══════════════════════════════════════════════════════════════

main_database() {
    local action="${1:-init}"
    local param="$2"
    
    setup_cleanup
    check_project_root
    
    case "$action" in
        "init"|"initialize")
            init_database
            ;;
        "backup")
            backup_database "$param"
            ;;
        "restore")
            restore_database "$param"
            ;;
        "reset")
            reset_database
            ;;
        "maintenance"|"maintain")
            maintenance_database
            ;;
        "stats"|"statistics")
            show_database_stats
            ;;
        "list"|"list-backups")
            list_available_backups
            ;;
        *)
            log_error "Action non reconnue: $action"
            echo "Usage: $0 [init|backup|restore|reset|maintenance|stats|list] [param]"
            exit 1
            ;;
    esac
}

# Exécuter si le script est appelé directement
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main_database "$@"
fi
