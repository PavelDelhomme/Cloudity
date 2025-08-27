# Makefile principal - Orchestrateur Cloudity
.PHONY: help setup dev prod clean status health

include scripts/colors.mk

DOCKER_COMPOSE_VERSION := $(shell docker compose version 2>/dev/null)
ifdef DOCKER_COMPOSE_VERSION
    COMPOSE = docker compose
else
    COMPOSE = docker-compose
endif

# Services disponibles
BACKEND_SERVICES := auth-service api-gateway admin-service
FRONTEND_SERVICES := admin-dashboard
INFRASTRUCTURE_SERVICES := postgres redis
ALL_SERVICES := $(INFRASTRUCTURE_SERVICES) $(BACKEND_SERVICES) $(FRONTEND_SERVICES)

help: ## Aide principale Cloudity
	@echo "$(GREEN)🚀 Cloudity - Écosystème Cloud Multi-Tenant$(NC)"
	@echo "$(YELLOW)Architecture modulaire avec Makefiles séparés$(NC)"
	@echo ""
	@echo "$(CYAN)═══ COMMANDES PRINCIPALES ═══$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-25s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(CYAN)═══ MODULES DISPONIBLES ═══$(NC)"
	@echo "$(YELLOW)Infrastructure:$(NC) make -C infrastructure help"
	@echo "$(YELLOW)Backend:$(NC)       make -C backend help"
	@echo "$(YELLOW)Frontend:$(NC)      make -C frontend help"
	@echo "$(YELLOW)Mobile:$(NC)        make -C mobile help"
	@echo "$(YELLOW)Tests:$(NC)         make -C tests help"

# ═══════════════════════════════════════════════════════════════
# ORCHESTRATION GLOBALE
# ═══════════════════════════════════════════════════════════════

setup: ## Configuration initiale complète
	$(call log_info,"Setup initial Cloudity")
	@$(MAKE) -C infrastructure setup
	@$(MAKE) -C backend setup
	@$(MAKE) -C frontend setup
	@$(MAKE) -C mobile setup
	$(call log_success,"Setup Cloudity terminé!")

dev-full: ## Environnement développement complet
	$(call log_info,"Démarrage environnement complet")
	@$(MAKE) -C infrastructure dev
	@$(MAKE) -C backend dev-all
	@$(MAKE) -C frontend dev-all
	$(call log_success,"Environnement complet démarré")
	@$(MAKE) status

dev-core: ## Environnement développement core (infra + auth)
	$(call log_info,"Démarrage environnement core")
	@$(MAKE) -C infrastructure dev
	@$(MAKE) -C backend dev-auth
	@$(MAKE) -C frontend dev-admin
	$(call log_success,"Environnement core démarré")

dev-mobile: ## Environnement pour développement mobile
	$(call log_info,"Démarrage environnement mobile")
	@$(MAKE) -C infrastructure dev
	@$(MAKE) -C backend dev-api
	@$(MAKE) -C mobile dev
	$(call log_success,"Environnement mobile démarré")

# ═══════════════════════════════════════════════════════════════
# GESTION FINE DES SERVICES
# ═══════════════════════════════════════════════════════════════

infra-only: ## Infrastructure uniquement
	@$(MAKE) -C infrastructure dev

backend-only: ## Services backend uniquement
	@$(MAKE) -C backend dev-all

frontend-only: ## Services frontend uniquement
	@$(MAKE) -C frontend dev-all

auth-only: ## Service authentification uniquement
	@$(MAKE) -C backend dev-auth

admin-only: ## Admin dashboard uniquement
	@$(MAKE) -C frontend dev-admin

# ═══════════════════════════════════════════════════════════════
# TESTS & QUALITÉ
# ═══════════════════════════════════════════════════════════════

test-all: ## Tests complets du système
	$(call log_info,"Lancement des tests complets")
	@$(MAKE) -C backend test-all
	@$(MAKE) -C frontend test-all
	@$(MAKE) -C mobile test-all
	$(call log_success,"Tests complets terminés")

test-unit: ## Tests unitaires uniquement
	@$(MAKE) -C backend test-unit
	@$(MAKE) -C frontend test-unit

test-integration: ## Tests d'intégration
	@$(MAKE) -C tests integration

test-security: ## Tests de sécurité
	@$(MAKE) -C tests security

test-load: ## Tests de charge
	@$(MAKE) -C tests load

# ═══════════════════════════════════════════════════════════════
# MONITORING & LOGS
# ═══════════════════════════════════════════════════════════════

status: ## Status global du système
	@echo "$(CYAN)═══ STATUS GLOBAL CLOUDITY ═══$(NC)"
	@$(MAKE) -C infrastructure status
	@$(MAKE) -C backend status
	@$(MAKE) -C frontend status
	@$(MAKE) -C mobile status

health: ## Health check complet
	$(call log_info,"Health check global")
	@$(MAKE) -C infrastructure health
	@$(MAKE) -C backend health
	@$(MAKE) -C frontend health

logs-all: ## Logs de tous les services
	@$(COMPOSE) logs -f

logs-backend: ## Logs backend uniquement
	@$(MAKE) -C backend logs-all

logs-auth: ## Logs service auth
	@$(MAKE) -C backend logs-auth

logs-infra: ## Logs infrastructure
	@$(MAKE) -C infrastructure logs

# ═══════════════════════════════════════════════════════════════
# BASE DE DONNÉES & MIGRATIONS
# ═══════════════════════════════════════════════════════════════

db-reset: ## Reset complet des BDD
	$(call log_warning,"Reset des bases de données")
	@$(MAKE) -C infrastructure db-reset-all
	@$(MAKE) -C backend db-migrate-all
	$(call log_success,"Bases de données réinitialisées")

db-migrate: ## Migrations de toutes les BDD
	@$(MAKE) -C infrastructure db-migrate-all

db-seed: ## Seed des données par défaut
	@$(MAKE) -C infrastructure db-seed-tenants

db-backup: ## Sauvegarde complète
	@$(MAKE) -C infrastructure backup-all

db-restore: ## Restauration dernière sauvegarde
	@$(MAKE) -C infrastructure restore-latest

# ═══════════════════════════════════════════════════════════════
# PRODUCTION & DÉPLOIEMENT
# ═══════════════════════════════════════════════════════════════

prod-deploy: ## Déploiement production
	$(call log_info,"Déploiement production")
	@$(MAKE) -C infrastructure prod
	@$(MAKE) -C backend prod
	@$(MAKE) -C frontend prod
	$(call log_success,"Déploiement production terminé")

build-all: ## Build complet de tous les services
	$(call log_info,"Build complet")
	@$(MAKE) -C backend build-all
	@$(MAKE) -C frontend build-all
	$(call log_success,"Build complet terminé")

# ═══════════════════════════════════════════════════════════════
# NETTOYAGE & MAINTENANCE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage complet
	$(call log_warning,"Nettoyage complet")
	@$(MAKE) -C infrastructure clean
	@$(MAKE) -C backend clean
	@$(MAKE) -C frontend clean
	@$(MAKE) -C mobile clean
	@docker system prune -af
	$(call log_success,"Nettoyage terminé")

stop: ## Arrêt de tous les services
	$(call log_info,"Arrêt des services")
	@$(COMPOSE) stop
	$(call log_success,"Services arrêtés")

restart: ## Redémarrage complet
	@$(MAKE) stop
	@$(MAKE) dev-full

# ═══════════════════════════════════════════════════════════════
# UTILITAIRES
# ═══════════════════════════════════════════════════════════════

shell: ## Menu shell services
	@echo "$(CYAN)Services disponibles:$(NC)"
	@echo "1) auth-service    2) api-gateway    3) admin-service"
	@echo "4) postgres        5) redis          6) admin-dashboard"
	@read -p "Choisir service (1-6): " choice; \
	case $$choice in \
		1) $(MAKE) -C backend shell-auth ;; \
		2) $(MAKE) -C backend shell-gateway ;; \
		3) $(MAKE) -C backend shell-admin ;; \
		4) $(MAKE) -C infrastructure shell-postgres ;; \
		5) $(MAKE) -C infrastructure shell-redis ;; \
		6) $(MAKE) -C frontend shell-admin ;; \
		*) echo "Choix invalide" ;; \
	esac

quick-start: ## Démarrage rapide (recommandé)
	$(call log_info,"Démarrage rapide Cloudity")
	@$(MAKE) dev-core
	@sleep 5
	@$(MAKE) health


# Commandes Email System
.PHONY: email-dev email-build email-up email-down email-logs email-migrate

email-dev: ## Démarrer le système email complet
	$(call log_info,"Démarrage système email")
	@$(MAKE) -C infrastructure dev
	@$(MAKE) -C backend email-services
	@$(MAKE) -C frontend email-frontend
	$(call log_success,"Système email démarré!")

email-migrate: ## Migrations email
	$(call log_info,"Migration base de données email")
	@$(MAKE) -C infrastructure email-migrate
	$(call log_success,"Migrations email terminées!")

email-build: ## Construire les images email
	@echo "$(YELLOW)🔨 Construction images email...$(NC)"
	docker compose -f docker-compose.email.yml build

email-up: email-build ## Démarrer tous les services email
	docker compose -f docker-compose.yml -f docker-compose.email.yml up -d

email-down: ## Arrêter les services email
	docker compose -f docker-compose.email.yml down

email-logs: ## Voir les logs des services email
	docker compose -f docker-compose.email.yml logs -f

# Commandes de développement spécifiques
email-rust-dev: ## Mode dev pour services Rust
	cd backend/email-service && cargo watch -x run &
	cd backend/alias-service && cargo watch -x run &

email-vue-dev: ## Mode dev pour frontend Vue
	cd frontend/email-app && npm run dev


email-test: ## Tests système email
	@$(MAKE) -C backend email-test

# Nettoyage
email-clean: ## Nettoyer le système email
	docker compose -f docker-compose.email.yml down -v
	docker system prune -f


# Service Alias
.PHONY: alias-dev alias-build alias-test

alias-dev: ## Service alias uniquement
	@$(MAKE) -C backend alias-dev

alias-build: ## Construire le service alias
	@echo "$(YELLOW)🔨 Construction service alias...$(NC)"
	docker compose build alias-service

alias-test: ## Tests du service alias
	cd backend/alias-service && cargo test

alias-logs: ## Logs du service alias
	docker compose logs -f alias-service
