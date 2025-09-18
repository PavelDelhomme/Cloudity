# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MAKEFILE PRINCIPAL CENTRALISÉ
# Système de gestion intelligent des services
# ═══════════════════════════════════════════════════════════════

.PHONY: help setup dev clean status health logs shell start stop restart

include scripts/colors.mk

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION GÉNÉRALE
# ═══════════════════════════════════════════════════════════════

COMPOSE = docker compose
COMPOSE_FILE = docker-compose.yml

# Services par catégorie
INFRASTRUCTURE_SERVICES := postgres redis
BACKEND_CORE_SERVICES := auth-service api-gateway admin-service
BACKEND_EMAIL_SERVICES := email-service alias-service
FRONTEND_SERVICES := admin-dashboard email-app password-app
ALL_BACKEND_SERVICES := $(BACKEND_CORE_SERVICES) $(BACKEND_EMAIL_SERVICES)
ALL_SERVICES := $(INFRASTRUCTURE_SERVICES) $(ALL_BACKEND_SERVICES) $(FRONTEND_SERVICES)

# ═══════════════════════════════════════════════════════════════
# AIDE ET INFORMATIONS
# ═══════════════════════════════════════════════════════════════

help: ## Aide complète Cloudity
	@echo "$(PURPLE)🚀 CLOUDITY - Système de Gestion Centralisé$(NC)"
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
	@echo "$(GREEN)full$(NC)       - Tous les services"

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGE INTELLIGENT DES SERVICES
# ═══════════════════════════════════════════════════════════════

start: ## Démarrage intelligent par défaut
	@$(MAKE) start-backend

start-infra: ## Démarrer l'infrastructure
	$(call log_rocket,"Démarrage infrastructure")
	@$(COMPOSE) up -d $(INFRASTRUCTURE_SERVICES)
	@$(call wait_for_postgres)
	$(call log_success,"Infrastructure prête")

start-backend: ## Démarrer le backend complet
	$(call log_rocket,"Démarrage backend complet")
	@/usr/bin/make start-infra
	@sleep 3
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	@sleep 2
	@/usr/bin/make urls
	$(call log_success,"Backend opérationnel")

start-frontend: ## Démarrer le frontend complet
	$(call log_rocket,"Démarrage frontend complet")
	@/usr/bin/make start-backend
	@sleep 2
	@$(COMPOSE) up -d $(FRONTEND_SERVICES)
	@sleep 2
	@/usr/bin/make urls
	$(call log_success,"Frontend opérationnel")

start-email: ## Démarrer la stack email complète
	$(call log_rocket,"Démarrage stack email")
	@/usr/bin/make start-backend
	@sleep 2
	@$(COMPOSE) up -d $(BACKEND_EMAIL_SERVICES) email-app
	@sleep 2
	@/usr/bin/make urls
	$(call log_success,"Stack email opérationnelle")

start-full: ## Démarrer tous les services
	$(call log_rocket,"Démarrage complet Cloudity")
	@/usr/bin/make start-infra
	@sleep 3
	@$(COMPOSE) up -d $(ALL_BACKEND_SERVICES)
	@sleep 2
	@$(COMPOSE) up -d $(FRONTEND_SERVICES)
	@sleep 2
	@/usr/bin/make urls
	$(call log_success,"Cloudity complet opérationnel")

# Services individuels
start-postgres: ## Démarrer PostgreSQL
	$(call log_info,"Démarrage PostgreSQL")
	@$(COMPOSE) up -d postgres
	@$(call wait_for_postgres)
	$(call log_success,"PostgreSQL démarré")

start-redis: ## Démarrer Redis
	$(call log_info,"Démarrage Redis")
	@$(COMPOSE) up -d redis
	$(call log_success,"Redis démarré")

start-auth-service: ## Démarrer auth-service
	$(call log_info,"Démarrage auth-service")
	@$(MAKE) start-infra
	@$(COMPOSE) up -d auth-service
	$(call log_success,"Auth service démarré")

start-api-gateway: ## Démarrer api-gateway
	$(call log_info,"Démarrage api-gateway")
	@$(MAKE) start-infra
	@$(COMPOSE) up -d api-gateway
	$(call log_success,"API Gateway démarré")

start-admin-service: ## Démarrer admin-service
	$(call log_info,"Démarrage admin-service")
	@$(MAKE) start-infra
	@$(COMPOSE) up -d admin-service
	$(call log_success,"Admin service démarré")

start-email-service: ## Démarrer email-service
	$(call log_info,"Démarrage email-service")
	@$(MAKE) start-infra
	@$(COMPOSE) up -d email-service
	$(call log_success,"Email service démarré")

start-alias-service: ## Démarrer alias-service
	$(call log_info,"Démarrage alias-service")
	@$(MAKE) start-infra
	@$(COMPOSE) up -d alias-service
	$(call log_success,"Alias service démarré")

start-admin-dashboard: ## Démarrer admin-dashboard
	$(call log_info,"Démarrage admin-dashboard")
	@/usr/bin/make start-backend
	@$(COMPOSE) up -d admin-dashboard
	$(call log_success,"Admin dashboard démarré")

start-email-app: ## Démarrer email-app
	$(call log_info,"Démarrage email-app")
	@/usr/bin/make start-backend
	@$(COMPOSE) up -d email-app
	$(call log_success,"Email app démarré")

start-password-app: ## Démarrer password-app
	$(call log_info,"Démarrage password-app")
	@/usr/bin/make start-backend
	@$(COMPOSE) up -d password-app
	$(call log_success,"Password app démarré")

# ═══════════════════════════════════════════════════════════════
# ARRÊT DES SERVICES
# ═══════════════════════════════════════════════════════════════

stop: ## Arrêter tous les services
	$(call log_info,"Arrêt de tous les services")
	@$(COMPOSE) down
	$(call log_success,"Tous les services arrêtés")

stop-infra: ## Arrêter l'infrastructure
	$(call log_info,"Arrêt infrastructure")
	@$(COMPOSE) stop $(INFRASTRUCTURE_SERVICES)
	$(call log_success,"Infrastructure arrêtée")

stop-backend: ## Arrêter le backend
	$(call log_info,"Arrêt backend")
	@$(COMPOSE) stop $(ALL_BACKEND_SERVICES)
	$(call log_success,"Backend arrêté")

stop-frontend: ## Arrêter le frontend
	$(call log_info,"Arrêt frontend")
	@$(COMPOSE) stop $(FRONTEND_SERVICES)
	$(call log_success,"Frontend arrêté")

stop-email: ## Arrêter la stack email
	$(call log_info,"Arrêt stack email")
	@$(COMPOSE) stop $(BACKEND_EMAIL_SERVICES) email-app
	$(call log_success,"Stack email arrêtée")

# Services individuels
stop-postgres: ## Arrêter PostgreSQL
	@$(COMPOSE) stop postgres

stop-redis: ## Arrêter Redis
	@$(COMPOSE) stop redis

stop-auth-service: ## Arrêter auth-service
	@$(COMPOSE) stop auth-service

stop-api-gateway: ## Arrêter api-gateway
	@$(COMPOSE) stop api-gateway

stop-admin-service: ## Arrêter admin-service
	@$(COMPOSE) stop admin-service

stop-email-service: ## Arrêter email-service
	@$(COMPOSE) stop email-service

stop-alias-service: ## Arrêter alias-service
	@$(COMPOSE) stop alias-service

stop-admin-dashboard: ## Arrêter admin-dashboard
	@$(COMPOSE) stop admin-dashboard

stop-email-app: ## Arrêter email-app
	@$(COMPOSE) stop email-app

stop-password-app: ## Arrêter password-app
	@$(COMPOSE) stop password-app

# ═══════════════════════════════════════════════════════════════
# REDÉMARRAGE DES SERVICES
# ═══════════════════════════════════════════════════════════════

restart: ## Redémarrer tous les services
	$(call log_info,"Redémarrage de tous les services")
	@$(MAKE) stop
	@sleep 2
	@$(MAKE) start
	$(call log_success,"Tous les services redémarrés")

restart-infra: ## Redémarrer l'infrastructure
	@$(MAKE) stop-infra
	@sleep 2
	@$(MAKE) start-infra

restart-backend: ## Redémarrer le backend
	@$(MAKE) stop-backend
	@sleep 2
	@$(MAKE) start-backend

restart-frontend: ## Redémarrer le frontend
	@$(MAKE) stop-frontend
	@sleep 2
	@$(MAKE) start-frontend

restart-email: ## Redémarrer la stack email
	@$(MAKE) stop-email
	@sleep 2
	@$(MAKE) start-email

# Services individuels
restart-postgres: ## Redémarrer PostgreSQL
	@$(COMPOSE) restart postgres

restart-redis: ## Redémarrer Redis
	@$(COMPOSE) restart redis

restart-auth-service: ## Redémarrer auth-service
	@$(COMPOSE) restart auth-service

restart-api-gateway: ## Redémarrer api-gateway
	@$(COMPOSE) restart api-gateway

restart-admin-service: ## Redémarrer admin-service
	@$(COMPOSE) restart admin-service

restart-email-service: ## Redémarrer email-service
	@$(COMPOSE) restart email-service

restart-alias-service: ## Redémarrer alias-service
	@$(COMPOSE) restart alias-service

restart-admin-dashboard: ## Redémarrer admin-dashboard
	@$(COMPOSE) restart admin-dashboard

restart-email-app: ## Redémarrer email-app
	@$(COMPOSE) restart email-app

restart-password-app: ## Redémarrer password-app
	@$(COMPOSE) restart password-app

# ═══════════════════════════════════════════════════════════════
# MONITORING ET STATUS
# ═══════════════════════════════════════════════════════════════

status: ## Status de tous les services
	@echo "$(CYAN)═══ STATUS CLOUDITY ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Infrastructure:$(NC)"
	@for service in $(INFRASTRUCTURE_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$(GREEN)$$service: Running$(NC)"; \
		else \
			echo "$(RED)$$service: Stopped$(NC)"; \
		fi; \
	done
	@echo ""
	@echo "$(PURPLE)Backend Core:$(NC)"
	@for service in $(BACKEND_CORE_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$(GREEN)$$service: Running$(NC)"; \
		else \
			echo "$(RED)$$service: Stopped$(NC)"; \
		fi; \
	done
	@echo ""
	@echo "$(PURPLE)Backend Email:$(NC)"
	@for service in $(BACKEND_EMAIL_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$(GREEN)$$service: Running$(NC)"; \
		else \
			echo "$(RED)$$service: Stopped$(NC)"; \
		fi; \
	done
	@echo ""
	@echo "$(PURPLE)Frontend:$(NC)"
	@for service in $(FRONTEND_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$(GREEN)$$service: Running$(NC)"; \
		else \
			echo "$(RED)$$service: Stopped$(NC)"; \
		fi; \
	done

health: ## Health check des services
	$(call log_info,"Health check global")
	@echo "$(CYAN)Test des endpoints:$(NC)"
	@for service in $(BACKEND_CORE_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			port=$$($(COMPOSE) ps $$service --format "{{.Ports}}" 2>/dev/null | grep -o ":[0-9]*->" | cut -d: -f2 | cut -d- -f1 | head -1); \
			if [ ! -z "$$port" ]; then \
				curl -sf http://localhost:$$port/health >/dev/null && echo "$(GREEN)✓ $$service (port $$port)$(NC)" || echo "$(RED)✗ $$service (port $$port)$(NC)"; \
			fi; \
		fi; \
	done

# ═══════════════════════════════════════════════════════════════
# AFFICHAGE DES URLs
# ═══════════════════════════════════════════════════════════════

urls: ## Afficher les URLs des services
	@echo ""
	@echo "$(CYAN)═══ SERVICES CLOUDITY ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Frontend Applications:$(NC)"
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)📊 Admin Dashboard: $(NC)http://localhost:3000"; \
	fi
	@if $(COMPOSE) ps email-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)📧 Email App:       $(NC)http://localhost:8094"; \
	fi
	@if $(COMPOSE) ps password-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🔒 Password App:    $(NC)http://localhost:8095"; \
	fi
	@echo ""
	@echo "$(PURPLE)Backend Services:$(NC)"
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🌐 API Gateway:     $(NC)http://localhost:8000"; \
	fi
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🔐 Auth Service:    $(NC)http://localhost:8081"; \
	fi
	@if $(COMPOSE) ps admin-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)⚙️  Admin Service:   $(NC)http://localhost:8082"; \
	fi
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🦀 Email Service:   $(NC)http://localhost:8091"; \
	fi
	@if $(COMPOSE) ps alias-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🏷️  Alias Service:   $(NC)http://localhost:8092"; \
	fi
	@echo ""
	@echo "$(PURPLE)Outils de développement:$(NC)"
	@echo "$(GREEN)🗄️  Adminer:        $(NC)http://localhost:8083"
	@echo "$(GREEN)🔧 Redis Commander: $(NC)http://localhost:8084"
	@echo ""

# ═══════════════════════════════════════════════════════════════
# LOGS EN TEMPS RÉEL
# ═══════════════════════════════════════════════════════════════

logs: ## Logs de tous les services
	@$(COMPOSE) logs -f

logs-infra: ## Logs infrastructure
	@$(COMPOSE) logs -f $(INFRASTRUCTURE_SERVICES)

logs-backend: ## Logs backend
	@$(COMPOSE) logs -f $(ALL_BACKEND_SERVICES)

logs-frontend: ## Logs frontend
	@$(COMPOSE) logs -f $(FRONTEND_SERVICES)

logs-email: ## Logs stack email
	@$(COMPOSE) logs -f $(BACKEND_EMAIL_SERVICES) email-app

# Logs services individuels
logs-postgres: ## Logs PostgreSQL
	@$(COMPOSE) logs -f postgres

logs-redis: ## Logs Redis
	@$(COMPOSE) logs -f redis

logs-auth-service: ## Logs auth-service
	@$(COMPOSE) logs -f auth-service

logs-api-gateway: ## Logs api-gateway
	@$(COMPOSE) logs -f api-gateway

logs-admin-service: ## Logs admin-service
	@$(COMPOSE) logs -f admin-service

logs-email-service: ## Logs email-service
	@$(COMPOSE) logs -f email-service

logs-alias-service: ## Logs alias-service
	@$(COMPOSE) logs -f alias-service

logs-admin-dashboard: ## Logs admin-dashboard
	@$(COMPOSE) logs -f admin-dashboard

logs-email-app: ## Logs email-app
	@$(COMPOSE) logs -f email-app

logs-password-app: ## Logs password-app
	@$(COMPOSE) logs -f password-app

# ═══════════════════════════════════════════════════════════════
# ACCÈS SHELL AUX SERVICES
# ═══════════════════════════════════════════════════════════════

shell: ## Menu interactif pour accès shell
	@echo "$(CYAN)Services disponibles pour shell:$(NC)"
	@echo "1) postgres       2) redis          3) auth-service"
	@echo "4) api-gateway    5) admin-service  6) email-service"
	@echo "7) alias-service  8) admin-dashboard 9) email-app"
	@echo "10) password-app"
	@read -p "Choisir (1-10): " choice; \
	case $$choice in \
		1) $(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity ;; \
		2) $(COMPOSE) exec redis redis-cli ;; \
		3) $(COMPOSE) exec auth-service /bin/sh ;; \
		4) $(COMPOSE) exec api-gateway /bin/sh ;; \
		5) $(COMPOSE) exec admin-service /bin/bash ;; \
		6) $(COMPOSE) exec email-service /bin/sh ;; \
		7) $(COMPOSE) exec alias-service /bin/sh ;; \
		8) $(COMPOSE) exec admin-dashboard /bin/sh ;; \
		9) $(COMPOSE) exec email-app /bin/sh ;; \
		10) $(COMPOSE) exec password-app /bin/sh ;; \
		*) echo "Choix invalide" ;; \
	esac

# Shell services individuels
shell-postgres: ## Shell PostgreSQL
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity

shell-redis: ## Shell Redis
	@$(COMPOSE) exec redis redis-cli

shell-auth-service: ## Shell auth-service
	@$(COMPOSE) exec auth-service /bin/sh

shell-api-gateway: ## Shell api-gateway
	@$(COMPOSE) exec api-gateway /bin/sh

shell-admin-service: ## Shell admin-service
	@$(COMPOSE) exec admin-service /bin/bash

shell-email-service: ## Shell email-service
	@$(COMPOSE) exec email-service /bin/sh

shell-alias-service: ## Shell alias-service
	@$(COMPOSE) exec alias-service /bin/sh

shell-admin-dashboard: ## Shell admin-dashboard
	@$(COMPOSE) exec admin-dashboard /bin/sh

shell-email-app: ## Shell email-app
	@$(COMPOSE) exec email-app /bin/sh

shell-password-app: ## Shell password-app
	@$(COMPOSE) exec password-app /bin/sh

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
	@docker system prune -f
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
full: start-full ## Raccourci full

# ═══════════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES
# ═══════════════════════════════════════════════════════════════

define wait_for_postgres
	@echo "$(YELLOW)Attente PostgreSQL...$(NC)"
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if $(COMPOSE) exec postgres pg_isready -U cloudity_admin >/dev/null 2>&1; then \
			echo "$(GREEN)PostgreSQL prêt!$(NC)"; \
			break; \
		fi; \
		sleep 2; \
		timeout=$$((timeout-2)); \
	done; \
	if [ $$timeout -le 0 ]; then \
		echo "$(RED)PostgreSQL timeout$(NC)"; \
		exit 1; \
	fi
endef