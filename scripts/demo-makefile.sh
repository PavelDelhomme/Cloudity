#!/bin/bash

# Script de démonstration du Makefile centralisé Cloudity
# Montre toutes les fonctionnalités disponibles

set -e

echo "🚀 DÉMONSTRATION DU MAKEFILE CENTRALISÉ CLOUDITY"
echo "================================================"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Fonction pour afficher les sections
show_section() {
    echo ""
    echo -e "${CYAN}═══ $1 ═══${NC}"
    echo ""
}

# Fonction pour exécuter une commande avec description
run_demo() {
    echo -e "${YELLOW}📋 $1${NC}"
    echo -e "${BLUE}Commande: $2${NC}"
    echo ""
    eval "$2"
    echo ""
    read -p "Appuyez sur Entrée pour continuer..."
    echo ""
}

# Démarrer la démonstration
show_section "AIDE ET INFORMATIONS"
run_demo "Afficher l'aide complète" "/usr/bin/make help"

show_section "STATUS DES SERVICES"
run_demo "Vérifier le status de tous les services" "/usr/bin/make status"

show_section "URLS DES SERVICES"
run_demo "Afficher les URLs des services actifs" "/usr/bin/make urls"

show_section "DÉMARRAGE DE SERVICES INDIVIDUELS"
run_demo "Démarrer un service spécifique (password-app)" "/usr/bin/make start-password-app"

show_section "STATUS APRÈS DÉMARRAGE"
run_demo "Vérifier le status après démarrage" "/usr/bin/make status"

show_section "URLS APRÈS DÉMARRAGE"
run_demo "Afficher les URLs mises à jour" "/usr/bin/make urls"

show_section "LOGS EN TEMPS RÉEL"
echo -e "${YELLOW}📋 Afficher les logs d'un service (Ctrl+C pour arrêter)${NC}"
echo -e "${BLUE}Commande: /usr/bin/make logs-password-app${NC}"
echo ""
echo -e "${PURPLE}Note: Cette commande va afficher les logs en temps réel.${NC}"
echo -e "${PURPLE}Appuyez sur Ctrl+C pour arrêter et continuer la démo.${NC}"
echo ""
read -p "Appuyez sur Entrée pour démarrer les logs..."
/usr/bin/make logs-password-app &
LOG_PID=$!
sleep 5
kill $LOG_PID 2>/dev/null || true
echo ""
echo -e "${GREEN}Logs arrêtés${NC}"
echo ""

show_section "ARRÊT DE SERVICES"
run_demo "Arrêter un service spécifique" "/usr/bin/make stop-password-app"

show_section "STATUS APRÈS ARRÊT"
run_demo "Vérifier le status après arrêt" "/usr/bin/make status"

show_section "REDÉMARRAGE DE SERVICES"
run_demo "Redémarrer un service" "/usr/bin/make restart-admin-dashboard"

show_section "DÉMARRAGE DE STACKS COMPLÈTES"
run_demo "Démarrer la stack email complète" "/usr/bin/make start-email"

show_section "STATUS STACK EMAIL"
run_demo "Vérifier le status de la stack email" "/usr/bin/make status"

show_section "URLS STACK EMAIL"
run_demo "Afficher les URLs de la stack email" "/usr/bin/make urls"

show_section "LOGS PAR GROUPE"
echo -e "${YELLOW}📋 Afficher les logs du backend (Ctrl+C pour arrêter)${NC}"
echo -e "${BLUE}Commande: /usr/bin/make logs-backend${NC}"
echo ""
echo -e "${PURPLE}Note: Cette commande va afficher les logs du backend.${NC}"
echo -e "${PURPLE}Appuyez sur Ctrl+C pour arrêter et continuer la démo.${NC}"
echo ""
read -p "Appuyez sur Entrée pour démarrer les logs backend..."
/usr/bin/make logs-backend &
LOG_PID=$!
sleep 5
kill $LOG_PID 2>/dev/null || true
echo ""
echo -e "${GREEN}Logs arrêtés${NC}"
echo ""

show_section "SHELL INTERACTIF"
echo -e "${YELLOW}📋 Accès shell interactif${NC}"
echo -e "${BLUE}Commande: /usr/bin/make shell${NC}"
echo ""
echo -e "${PURPLE}Note: Cette commande va ouvrir un menu interactif pour choisir un service.${NC}"
echo -e "${PURPLE}Choisissez '1' pour PostgreSQL, puis tapez '\\q' pour quitter.${NC}"
echo ""
read -p "Appuyez sur Entrée pour ouvrir le shell interactif..."
echo "1" | /usr/bin/make shell || true
echo ""

show_section "SHELL DIRECT"
run_demo "Accès shell direct à Redis" "/usr/bin/make shell-redis"

show_section "HEALTH CHECK"
run_demo "Vérifier la santé des services" "/usr/bin/make health"

show_section "NETTOYAGE"
run_demo "Nettoyer les services (sans supprimer les volumes)" "/usr/bin/make clean"

show_section "STATUS FINAL"
run_demo "Vérifier le status final" "/usr/bin/make status"

echo ""
echo -e "${GREEN}🎉 DÉMONSTRATION TERMINÉE !${NC}"
echo ""
echo -e "${CYAN}RÉCAPITULATIF DES FONCTIONNALITÉS:${NC}"
echo ""
echo -e "${GREEN}✅ Démarrage intelligent des services${NC}"
echo -e "${GREEN}✅ Gestion individuelle des services${NC}"
echo -e "${GREEN}✅ Stacks prédéfinies (infra, backend, frontend, email, full)${NC}"
echo -e "${GREEN}✅ Monitoring et status en temps réel${NC}"
echo -e "${GREEN}✅ Logs en temps réel par service ou groupe${NC}"
echo -e "${GREEN}✅ Accès shell aux services${NC}"
echo -e "${GREEN}✅ Affichage des URLs des services${NC}"
echo -e "${GREEN}✅ Health check des services${NC}"
echo -e "${GREEN}✅ Nettoyage intelligent${NC}"
echo ""
echo -e "${PURPLE}🚀 Votre système Cloudity est maintenant entièrement centralisé !${NC}"
echo -e "${PURPLE}   Utilisez 'make help' pour voir toutes les commandes disponibles.${NC}"
echo ""
