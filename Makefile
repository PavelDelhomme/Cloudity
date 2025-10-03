# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MAKEFILE PRINCIPAL MODULAIRE
# Système de gestion intelligent des services - Version 2.0
# ═══════════════════════════════════════════════════════════════

# Inclusion de la configuration globale
include makefiles/config.mk

# Inclusion des modules
include makefiles/services.mk
include makefiles/stacks.mk
include makefiles/infrastructure/services.mk
include makefiles/backend/services.mk
include makefiles/frontend/apps.mk
include makefiles/api/endpoints.mk
include makefiles/admin/management.mk
include makefiles/tools/dev.mk

# ═══════════════════════════════════════════════════════════════
# TARGETS .PHONY - ÉVITER LES CONFLITS
# ═══════════════════════════════════════════════════════════════

.PHONY: help setup clean clean-all status health logs urls
.PHONY: start stop restart up down ps
.PHONY: start-full stop-full restart-full
.PHONY: start-email stop-email restart-email
.PHONY: infra backend frontend email admin full
.PHONY: shell dev test build install update

# ═══════════════════════════════════════════════════════════════
# AIDE PRINCIPALE
# ═══════════════════════════════════════════════════════════════

help: ## Aide complète Cloudity
	@echo "$(PURPLE)🚀 CLOUDITY - Système de Gestion Modulaire v3.1$(NC)"
	@echo ""
	@echo "$(CYAN)═══ DÉMARRAGE RAPIDE ═══$(NC)"
	@echo "$(GREEN)make stack-start-admin$(NC)       # Stack administration complète"
	@echo "$(GREEN)make stack-start-email$(NC)       # Stack email complète"
	@echo "$(GREEN)make stack-start-password$(NC)    # Stack gestion mots de passe"
	@echo "$(GREEN)make start-infra$(NC)             # Infrastructure seulement"
	@echo "$(GREEN)make stack-start-full$(NC)        # Tous les services"
	@echo ""
	@echo "$(CYAN)═══ GESTION DES SERVICES ═══$(NC)"
	@echo "$(GREEN)make service-start-<nom>$(NC)     # Démarrer un service avec dépendances"
	@echo "$(GREEN)make service-stop-<nom>$(NC)      # Arrêter un service"
	@echo "$(GREEN)make service-restart-<nom>$(NC)   # Redémarrer un service"
	@echo "$(GREEN)make service-status-<nom>$(NC)    # Status d'un service"
	@echo "$(GREEN)make service-logs-<nom>$(NC)      # Logs d'un service"
	@echo ""
	@echo "$(CYAN)═══ GESTION DES STACKS ═══$(NC)"
	@echo "$(GREEN)make stack-start-<nom>$(NC)       # Démarrer une stack"
	@echo "$(GREEN)make stack-stop-<nom>$(NC)        # Arrêter une stack"
	@echo "$(GREEN)make stack-restart-<nom>$(NC)     # Redémarrer une stack"
	@echo "$(GREEN)make stack-status-<nom>$(NC)      # Status d'une stack"
	@echo ""
	@echo "$(CYAN)═══ UTILITAIRES ═══$(NC)"
	@echo "$(GREEN)make status$(NC)                  # Status global de tous les services"
	@echo "$(GREEN)make urls$(NC)                    # Afficher les URLs des services"
	@echo "$(GREEN)make clean$(NC)                   # Nettoyer les services"
	@echo ""
	@echo "$(CYAN)═══ AIDE CONTEXTUELLE ═══$(NC)"
	@echo "$(GREEN)make service$(NC)                 # Aide détaillée des services"
	@echo "$(GREEN)make stack$(NC)                   # Aide détaillée des stacks"
	@echo "$(GREEN)make infra$(NC)                   # Aide infrastructure"
	@echo ""
	@echo "$(CYAN)═══ STACKS DISPONIBLES ═══$(NC)"
	@echo "$(YELLOW)admin:$(NC) Dashboard d'administration complet"
	@echo "$(YELLOW)email:$(NC) Système email complet avec interface"
	@echo "$(YELLOW)password:$(NC) Gestionnaire de mots de passe"
	@echo "$(YELLOW)infra:$(NC) Infrastructure (postgres + redis)"
	@echo ""
	@echo "$(CYAN)═══ EXEMPLES D'USAGE ═══$(NC)"
	@echo "$(GRAY)make stack-start-admin$(NC)        # Pour tester le dashboard"
	@echo "$(GRAY)make service-start-auth-service$(NC) # Un service spécifique"
	@echo "$(GRAY)make service-logs-postgres$(NC)    # Logs d'un service"

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGE INTELLIGENT DES SERVICES
# ═══════════════════════════════════════════════════════════════

start: ## Démarrage par défaut (stack admin)
	$(call log_rocket,"Démarrage Cloudity par défaut")
	@make start-admin

# ═══════════════════════════════════════════════════════════════
# COMMANDES GLOBALES (DÉLÉGATION AUX STACKS)
# ═══════════════════════════════════════════════════════════════

stop: ## Arrêter tous les services
	@make stop-full

restart: ## Redémarrer par défaut (stack admin)
	@make restart-admin

# ═══════════════════════════════════════════════════════════════
# MONITORING ET STATUS GLOBAL
# ═══════════════════════════════════════════════════════════════

status: ## Status de tous les services
	@echo "$(CYAN)═══ STATUS CLOUDITY GLOBAL ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Services Infrastructure:$(NC)"
	@$(call check_service_status,postgres)
	@$(call check_service_status,redis)
	@echo ""
	@echo "$(PURPLE)Services Backend Core:$(NC)"
	@$(call check_service_status,auth-service)
	@$(call check_service_status,api-gateway)
	@$(call check_service_status,admin-service)
	@echo ""
	@echo "$(PURPLE)Services Backend Email:$(NC)"
	@$(call check_service_status,email-service)
	@$(call check_service_status,alias-service)
	@echo ""
	@echo "$(PURPLE)Services Backend Password:$(NC)"
	@$(call check_service_status,password-service)
	@echo ""
	@echo "$(PURPLE)Applications Frontend:$(NC)"
	@$(call check_service_status,admin-dashboard)
	@$(call check_service_status,email-app)
	@$(call check_service_status,password-app)

health: ## Health check global des services
	$(call log_info,"Health check global")
	@make health-backend
	@make health-api

# ═══════════════════════════════════════════════════════════════
# LOGS GLOBAUX
# ═══════════════════════════════════════════════════════════════

logs: ## Logs de tous les services
	@$(COMPOSE) logs -f

# ═══════════════════════════════════════════════════════════════
# NETTOYAGE ET MAINTENANCE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage des services
	$(call log_info,"Nettoyage des services")
	@$(COMPOSE) stop
	@$(COMPOSE) rm -f
	$(call log_success,"Services nettoyés")

clean-all: ## Nettoyage complet avec volumes
	$(call log_warning,"Nettoyage complet avec volumes")
	@$(COMPOSE) down -v --remove-orphans
	@make docker-clean
	$(call log_success,"Nettoyage complet terminé")

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS ET ALIAS
# ═══════════════════════════════════════════════════════════════

up: start ## Alias pour start
down: stop ## Alias pour stop
ps: status ## Alias pour status

# Raccourcis par stack (délégation)
infra: infra-help ## Aide infrastructure contextuelle
backend: start-backend ## Raccourci backend
frontend: start-frontend ## Raccourci frontend
email: start-email ## Raccourci email
admin: start-admin ## Raccourci admin
password: start-password ## Raccourci password
full: start-full ## Raccourci full

# Raccourcis développement
dev: dev-setup ## Raccourci dev-setup
test: dev-test ## Raccourci dev-test
build: build-frontend ## Raccourci build-frontend
install: install-frontend ## Raccourci install-frontend
update: tools-update ## Raccourci tools-update

# ═══════════════════════════════════════════════════════════════
# SHELL INTERACTIF
# ═══════════════════════════════════════════════════════════════

shell: ## Menu interactif pour accès shell
	@echo "$(CYAN)Services disponibles pour shell:$(NC)"
	@echo "1) postgres       2) redis          3) auth-service"
	@echo "4) api-gateway    5) admin-service  6) email-service"
	@echo "7) alias-service  8) admin-dashboard 9) email-app"
	@echo "10) password-app  11) dev-shell"
	@read -p "Choisir (1-11): " choice; \
	case $$choice in \
		1) make shell-postgres ;; \
		2) make shell-redis ;; \
		3) make shell-auth-service ;; \
		4) make shell-api-gateway ;; \
		5) make shell-admin-service ;; \
		6) make shell-email-service ;; \
		7) make shell-alias-service ;; \
		8) make shell-admin-dashboard ;; \
		9) make shell-email-app ;; \
		10) make shell-password-app ;; \
		11) make dev-shell ;; \
		*) echo "$(RED)Choix invalide$(NC)" ;; \
	esac

# ═══════════════════════════════════════════════════════════════
# SETUP ET INITIALISATION
# ═══════════════════════════════════════════════════════════════

setup: ## Setup initial du projet
	$(call log_rocket,"Setup initial Cloudity")
	@make dev-setup
	@make tools-install
	$(call log_success,"Setup terminé")

# ═══════════════════════════════════════════════════════════════
# INFORMATIONS SYSTÈME
# ═══════════════════════════════════════════════════════════════

version: ## Afficher la version
	@echo "$(PURPLE)Cloudity v2.0 - Système Modulaire$(NC)"
	@echo "$(CYAN)Modules: infra, backend, frontend, api, admin, tools$(NC)"

info: ## Informations système
	@echo "$(CYAN)═══ INFORMATIONS SYSTÈME ═══$(NC)"
	@make version
	@echo ""
	@make debug-env
