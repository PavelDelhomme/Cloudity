# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MAKEFILE PRINCIPAL MODULAIRE
# Système de gestion intelligent des services - Version 2.0
# ═══════════════════════════════════════════════════════════════

# Inclusion de la configuration globale
include makefiles/config.mk

# Inclusion des modules
include makefiles/infra.mk
include makefiles/backend.mk
include makefiles/frontend.mk
include makefiles/api.mk
include makefiles/admin.mk
include makefiles/tools.mk

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
	@echo "$(PURPLE)🚀 CLOUDITY - Système de Gestion Centralisé v2.0$(NC)"
	@echo ""
	@echo "$(CYAN)═══ DÉMARRAGE RAPIDE ═══$(NC)"
	@echo "$(GREEN)make start$(NC)           # Démarrage intelligent (infra + backend + admin)"
	@echo "$(GREEN)make start-email$(NC)     # Stack email complète"
	@echo "$(GREEN)make start-frontend$(NC)  # Stack frontend complète"
	@echo "$(GREEN)make start-full$(NC)      # Tous les services"
	@echo ""
	@echo "$(CYAN)═══ GESTION DES SERVICES ═══$(NC)"
	@echo "$(GREEN)make start-<service>$(NC)     # Démarrer un service"
	@echo "$(GREEN)make stop-<service>$(NC)      # Arrêter un service"
	@echo "$(GREEN)make restart-<service>$(NC)   # Redémarrer un service"
	@echo "$(GREEN)make status$(NC)              # Status de tous les services"
	@echo "$(GREEN)make health$(NC)              # Health check des services"
	@echo ""
	@echo "$(CYAN)═══ LOGS ET MONITORING ═══$(NC)"
	@echo "$(GREEN)make logs$(NC)                # Logs de tous les services"
	@echo "$(GREEN)make logs-<service>$(NC)      # Logs d'un service"
	@echo "$(GREEN)make logs-backend$(NC)        # Logs backend"
	@echo "$(GREEN)make logs-frontend$(NC)       # Logs frontend"
	@echo "$(GREEN)make logs-infra$(NC)          # Logs infrastructure"
	@echo ""
	@echo "$(CYAN)═══ ACCÈS ET UTILITAIRES ═══$(NC)"
	@echo "$(GREEN)make shell-<service>$(NC)     # Accès shell à un service"
	@echo "$(GREEN)make urls$(NC)                # Afficher les URLs des services"
	@echo "$(GREEN)make clean$(NC)               # Nettoyer les services"
	@echo "$(GREEN)make clean-all$(NC)           # Nettoyage complet"
	@echo ""
	@echo "$(CYAN)═══ MODULES DISPONIBLES ═══$(NC)"
	@echo "$(YELLOW)Infrastructure:$(NC) make start-infra, make status-infra"
	@echo "$(YELLOW)Backend:$(NC) make start-backend, make health-backend"
	@echo "$(YELLOW)Frontend:$(NC) make start-frontend, make build-frontend"
	@echo "$(YELLOW)API:$(NC) make start-api, make test-api, make api-docs"
	@echo "$(YELLOW)Admin:$(NC) make start-admin, make admin-stats"
	@echo "$(YELLOW)Tools:$(NC) make dev-setup, make docker-clean"
	@echo ""
	@echo "$(CYAN)═══ SERVICES DISPONIBLES ═══$(NC)"
	@echo "$(YELLOW)Infrastructure:$(NC) $(INFRASTRUCTURE_SERVICES)"
	@echo "$(YELLOW)Backend Core:$(NC) $(BACKEND_CORE_SERVICES)"
	@echo "$(YELLOW)Backend Email:$(NC) $(BACKEND_EMAIL_SERVICES)"
	@echo "$(YELLOW)Frontend:$(NC) $(FRONTEND_SERVICES)"
	@echo ""
	@echo "$(CYAN)═══ STACKS PRÉDÉFINIES ═══$(NC)"
	@echo "$(GREEN)infra$(NC)      - Infrastructure (postgres, redis)"
	@echo "$(GREEN)backend$(NC)    - Backend complet"
	@echo "$(GREEN)frontend$(NC)   - Frontend complet"
	@echo "$(GREEN)email$(NC)      - Stack email complète"
	@echo "$(GREEN)admin$(NC)      - Stack administration"
	@echo "$(GREEN)full$(NC)       - Tous les services"

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGE INTELLIGENT DES SERVICES
# ═══════════════════════════════════════════════════════════════

start: ## Démarrage intelligent par défaut
	$(call log_rocket,"Démarrage Cloudity par défaut")
	@$(MAKE) start-admin

start-full: ## Démarrer tous les services
	$(call log_rocket,"Démarrage complet Cloudity")
	@$(MAKE) start-infra
	@sleep 3
	@$(COMPOSE) up -d $(ALL_BACKEND_SERVICES)
	@sleep 2
	@$(COMPOSE) up -d $(FRONTEND_SERVICES)
	@sleep 2
	@$(MAKE) urls
	$(call log_success,"Cloudity complet opérationnel")

start-email: ## Démarrer la stack email complète
	$(call log_rocket,"Démarrage stack email")
	@$(MAKE) start-backend-email
	@sleep 2
	@$(COMPOSE) up -d email-app
	@sleep 2
	@$(MAKE) urls
	$(call log_success,"Stack email opérationnelle")

# ═══════════════════════════════════════════════════════════════
# ARRÊT DES SERVICES
# ═══════════════════════════════════════════════════════════════

stop: ## Arrêter tous les services
	$(call log_info,"Arrêt de tous les services")
	@$(COMPOSE) down
	$(call log_success,"Tous les services arrêtés")

stop-full: ## Arrêter tous les services avec nettoyage
	$(call log_info,"Arrêt complet avec nettoyage")
	@$(COMPOSE) down --remove-orphans
	$(call log_success,"Arrêt complet terminé")

stop-email: ## Arrêter la stack email
	$(call log_info,"Arrêt stack email")
	@$(COMPOSE) stop $(BACKEND_EMAIL_SERVICES) email-app
	$(call log_success,"Stack email arrêtée")

# ═══════════════════════════════════════════════════════════════
# REDÉMARRAGE DES SERVICES
# ═══════════════════════════════════════════════════════════════

restart: ## Redémarrer tous les services
	$(call log_info,"Redémarrage de tous les services")
	@$(MAKE) stop
	@sleep 2
	@$(MAKE) start
	$(call log_success,"Tous les services redémarrés")

restart-full: ## Redémarrer tous les services complets
	$(call log_info,"Redémarrage complet")
	@$(MAKE) stop-full
	@sleep 2
	@$(MAKE) start-full

restart-email: ## Redémarrer la stack email
	@$(MAKE) stop-email
	@sleep 2
	@$(MAKE) start-email

# ═══════════════════════════════════════════════════════════════
# MONITORING ET STATUS GLOBAL
# ═══════════════════════════════════════════════════════════════

status: ## Status de tous les services
	@echo "$(CYAN)═══ STATUS CLOUDITY GLOBAL ═══$(NC)"
	@echo ""
	@$(MAKE) status-infra
	@$(MAKE) status-backend
	@$(MAKE) status-frontend

health: ## Health check global des services
	$(call log_info,"Health check global")
	@$(MAKE) health-backend
	@$(MAKE) health-api

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
	@$(MAKE) docker-clean
	$(call log_success,"Nettoyage complet terminé")

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS ET ALIAS
# ═══════════════════════════════════════════════════════════════

up: start ## Alias pour start
down: stop ## Alias pour stop
ps: status ## Alias pour status

# Raccourcis par stack
infra: start-infra ## Raccourci infrastructure
backend: start-backend ## Raccourci backend
frontend: start-frontend ## Raccourci frontend
email: start-email ## Raccourci email
admin: start-admin ## Raccourci admin
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
		1) $(MAKE) shell-postgres ;; \
		2) $(MAKE) shell-redis ;; \
		3) $(MAKE) shell-auth-service ;; \
		4) $(MAKE) shell-api-gateway ;; \
		5) $(MAKE) shell-admin-service ;; \
		6) $(MAKE) shell-email-service ;; \
		7) $(MAKE) shell-alias-service ;; \
		8) $(MAKE) shell-admin-dashboard ;; \
		9) $(MAKE) shell-email-app ;; \
		10) $(MAKE) shell-password-app ;; \
		11) $(MAKE) dev-shell ;; \
		*) echo "$(RED)Choix invalide$(NC)" ;; \
	esac

# ═══════════════════════════════════════════════════════════════
# SETUP ET INITIALISATION
# ═══════════════════════════════════════════════════════════════

setup: ## Setup initial du projet
	$(call log_rocket,"Setup initial Cloudity")
	@$(MAKE) dev-setup
	@$(MAKE) tools-install
	$(call log_success,"Setup terminé")

# ═══════════════════════════════════════════════════════════════
# INFORMATIONS SYSTÈME
# ═══════════════════════════════════════════════════════════════

version: ## Afficher la version
	@echo "$(PURPLE)Cloudity v2.0 - Système Modulaire$(NC)"
	@echo "$(CYAN)Modules: infra, backend, frontend, api, admin, tools$(NC)"

info: ## Informations système
	@echo "$(CYAN)═══ INFORMATIONS SYSTÈME ═══$(NC)"
	@$(MAKE) version
	@echo ""
	@$(MAKE) debug-env
