# backend/Makefile - Services Backend CORRIGÉ ET UNIFIÉ
.PHONY: help setup dev-all build-all test-all clean

include ../scripts/colors.mk

# Services correctement nommés selon docker-compose.yml
SERVICES := auth-service api-gateway admin-service
EMAIL_SERVICES := alias-service email-service mail-server  
PASSWORD_SERVICES := password-service
ALL_SERVICES := $(SERVICES) $(EMAIL_SERVICES) $(PASSWORD_SERVICES)

COMPOSE = docker compose -f ../docker-compose.yml

help: ## Services Backend Cloudity
	@printf "$(PURPLE)🔧 Services Backend Cloudity$(NC)\n"
	@printf "$(CYAN)Services Core:$(NC) $(SERVICES)\n"
	@printf "$(CYAN)Services Email:$(NC) $(EMAIL_SERVICES)\n"
	@printf "$(CYAN)Services Password:$(NC) $(PASSWORD_SERVICES)\n"
	@printf "\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## Setup backend services
	$(call log_info,"⚙️ Setup services backend")
	@for service in $(SERVICES); do \
		$(call log_info,"Setup $$service"); \
		if [ -d "$$service" ]; then $(MAKE) -C $$service setup; fi; \
	done
	$(call log_success,"Backend setup terminé")

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGE PAR GROUPES
# ═══════════════════════════════════════════════════════════════

dev-all: ## Tous les services backend disponibles
	$(call log_info,"🔧 Démarrage backend complet")
	@# Démarrer seulement les services qui existent dans docker-compose.yml
	@$(COMPOSE) up -d auth-service api-gateway admin-service
	@# Démarrer les services email s'ils existent
	@if $(COMPOSE) config --services | grep -q "email-service"; then $(COMPOSE) up -d email-service; fi
	@if $(COMPOSE) config --services | grep -q "alias-service"; then $(COMPOSE) up -d alias-service; fi
	$(call log_success,"Backend complet démarré")

dev-core: ## Services core uniquement (auth + gateway + admin)
	$(call log_info,"🔧 Démarrage services core")
	@$(COMPOSE) up -d $(SERVICES)
	$(call log_success,"Services core démarrés")

dev-auth: ## Service auth + API gateway
	$(call log_info,"🔐 Démarrage services auth")
	@$(COMPOSE) up -d auth-service api-gateway
	$(call log_success,"Services auth opérationnels")

dev-email: ## Services email complets (si disponibles)
	$(call log_info,"📧 Démarrage services email")
	@if $(COMPOSE) config --services | grep -q "email-service"; then \
		$(COMPOSE) up -d email-service; \
		$(call log_success,"Email service démarré"); \
	else \
		$(call log_warning,"Email service non configuré dans docker-compose"); \
	fi
	@if $(COMPOSE) config --services | grep -q "alias-service"; then \
		$(COMPOSE) up -d alias-service; \
		$(call log_success,"Alias service démarré"); \
	else \
		$(call log_warning,"Alias service non configuré dans docker-compose"); \
	fi

# ═══════════════════════════════════════════════════════════════
# SERVICES INDIVIDUELS
# ═══════════════════════════════════════════════════════════════

auth-service: ## Service authentification
	$(call log_info,"🔐 Démarrage auth service")
	@$(COMPOSE) up -d auth-service
	$(call log_success,"Auth service: http://localhost:8081")

api-gateway: ## API Gateway
	$(call log_info,"🌐 Démarrage API Gateway")
	@$(COMPOSE) up -d api-gateway
	$(call log_success,"API Gateway: http://localhost:8000")

admin-service: ## Service administration
	$(call log_info,"⚙️ Démarrage admin service")
	@$(COMPOSE) up -d admin-service
	$(call log_success,"Admin service: http://localhost:8082")

# ═══════════════════════════════════════════════════════════════
# SERVICES EMAIL - GRANULAIRES
# ═══════════════════════════════════════════════════════════════

email-service: ## Service email Rust (si disponible)
	$(call log_info,"🦀 Démarrage email service Rust")
	@if $(COMPOSE) config --services | grep -q "email-service"; then \
		$(COMPOSE) up -d email-service; \
		$(call log_success,"Email service: http://localhost:8091"); \
	else \
		$(call log_warning,"Email service non configuré - utiliser 'make -C email-service init-project'"); \
	fi

alias-service: alias-dev ## Alias pour alias-dev

alias-dev: ## Service alias email (si disponible)
	$(call log_info,"🏷️ Démarrage service alias")
	@if $(COMPOSE) config --services | grep -q "alias-service"; then \
		$(COMPOSE) up -d alias-service; \
		$(call log_success,"Alias service: http://localhost:8092"); \
	else \
		$(call log_warning,"Alias service non configuré dans docker-compose"); \
	fi

mail-server: ## Serveur mail complet (si disponible)
	$(call log_info,"📮 Démarrage mail server")
	@if $(COMPOSE) config --services | grep -q "mail-server"; then \
		$(COMPOSE) up -d mail-server; \
		$(call log_success,"Mail server opérationnel"); \
	else \
		$(call log_warning,"Mail server non configuré dans docker-compose"); \
	fi

password-service: ## Service password manager (si disponible)
	$(call log_info,"🔒 Démarrage password service")
	@if $(COMPOSE) config --services | grep -q "password-service"; then \
		$(COMPOSE) up -d password-service; \
		$(call log_success,"Password service opérationnel"); \
	else \
		$(call log_warning,"Password service non configuré dans docker-compose"); \
	fi

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test-all: ## Tests tous les services
	$(call log_info,"🧪 Tests backend complet")
	@for service in $(SERVICES); do \
		$(call log_info,"Tests $$service"); \
		if [ -d "$$service" ]; then \
			$(MAKE) -C $$service test || exit 1; \
		fi; \
	done
	$(call log_success,"Tests backend terminés")

test-unit: ## Tests unitaires
	@for service in $(SERVICES); do \
		if [ -d "$$service" ]; then $(MAKE) -C $$service test-unit; fi; \
	done

test-api: ## Tests API
	@for service in $(SERVICES); do \
		if [ -d "$$service" ]; then $(MAKE) -C $$service test-api; fi; \
	done

test-auth: ## Tests auth service
	@if [ -d "auth-service" ]; then $(MAKE) -C auth-service test; fi

test-gateway: ## Tests API gateway
	@if [ -d "api-gateway" ]; then $(MAKE) -C api-gateway test; fi

test-admin: ## Tests admin service
	@if [ -d "admin-service" ]; then $(MAKE) -C admin-service test; fi

email-test: ## Tests services email
	@if [ -d "email-service" ]; then $(MAKE) -C email-service test; fi
	@if [ -d "alias-service" ]; then $(MAKE) -C alias-service test; fi

# ═══════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════

build-all: ## Build tous les services
	$(call log_info,"🔨 Build backend complet")
	@for service in $(SERVICES); do \
		$(call log_info,"Build $$service"); \
		if [ -d "$$service" ]; then $(MAKE) -C $$service build; fi; \
	done
	$(call log_success,"Build backend terminé")

build-core: ## Build services core
	@for service in $(SERVICES); do \
		if [ -d "$$service" ]; then $(MAKE) -C $$service build; fi; \
	done

build-auth: ## Build auth service
	@if [ -d "auth-service" ]; then $(MAKE) -C auth-service build; fi

build-gateway: ## Build API gateway
	@if [ -d "api-gateway" ]; then $(MAKE) -C api-gateway build; fi

build-admin: ## Build admin service
	@if [ -d "admin-service" ]; then $(MAKE) -C admin-service build; fi

# ═══════════════════════════════════════════════════════════════
# LOGS ET STATUS
# ═══════════════════════════════════════════════════════════════

status: ## Status services backend
	@printf "$(PURPLE)Backend Services Status:$(NC)\n"
	@for service in auth-service api-gateway admin-service; do \
		printf "$(CYAN)%-18s$(NC) " "$$service:"; \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			printf "$(GREEN)Running$(NC)"; \
			port=$$($(COMPOSE) ps $$service --format "{{.Ports}}" 2>/dev/null | grep -o ":[0-9]*->" | cut -d: -f2 | cut -d- -f1 | head -1); \
			if [ ! -z "$$port" ]; then \
				printf " $(YELLOW)(port $$port)$(NC)"; \
			fi; \
		else \
			printf "$(RED)Stopped$(NC)"; \
		fi; \
		printf "\n"; \
	done
	@# Status services email s'ils existent
	@for service in email-service alias-service; do \
		if $(COMPOSE) config --services | grep -q "$$service"; then \
			printf "$(CYAN)%-18s$(NC) " "$$service:"; \
			if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
				printf "$(GREEN)Running$(NC)"; \
			else \
				printf "$(RED)Stopped$(NC)"; \
			fi; \
			printf "\n"; \
		fi; \
	done

health: ## Health check backend
	$(call log_info,"🩺 Health check backend")
	@for service in $(SERVICES); do \
		if [ -d "$$service" ] && $(MAKE) -C $$service health 2>/dev/null; then \
			printf ""; \
		fi; \
	done

logs-all: ## Logs tous les services disponibles
	@$(COMPOSE) logs -f auth-service api-gateway admin-service

logs-core: ## Logs services core
	@$(COMPOSE) logs -f $(SERVICES)

logs-auth: ## Logs auth service
	@$(COMPOSE) logs -f auth-service

logs-gateway: ## Logs API gateway
	@$(COMPOSE) logs -f api-gateway

logs-admin: ## Logs admin service
	@$(COMPOSE) logs -f admin-service

logs-email: ## Logs services email (si disponibles)
	@services=""; \
	for service in email-service alias-service; do \
		if $(COMPOSE) config --services | grep -q "$$service"; then \
			services="$$services $$service"; \
		fi; \
	done; \
	if [ ! -z "$$services" ]; then \
		$(COMPOSE) logs -f $$services; \
	else \
		$(call log_warning,"Aucun service email configuré"); \
	fi

# ═══════════════════════════════════════════════════════════════
# SHELLS - ACCÈS CONTENEURS
# ═══════════════════════════════════════════════════════════════

shell-auth: ## Shell auth service
	@$(COMPOSE) exec auth-service /bin/sh

shell-gateway: ## Shell API gateway
	@$(COMPOSE) exec api-gateway /bin/sh

shell-admin: ## Shell admin service
	@$(COMPOSE) exec admin-service /bin/bash

shell-email: ## Shell email service (si disponible)
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		$(COMPOSE) exec email-service /bin/sh; \
	else \
		$(call log_warning,"Email service non démarré"); \
	fi

shell-alias: ## Shell alias service (si disponible)
	@if $(COMPOSE) ps alias-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		$(COMPOSE) exec alias-service /bin/sh; \
	else \
		$(call log_warning,"Alias service non démarré"); \
	fi

# ═══════════════════════════════════════════════════════════════
# CONTRÔLES INDIVIDUELS
# ═══════════════════════════════════════════════════════════════

restart-auth: ## Redémarrage auth service
	@$(COMPOSE) restart auth-service

restart-gateway: ## Redémarrage API gateway
	@$(COMPOSE) restart api-gateway

restart-admin: ## Redémarrage admin service
	@$(COMPOSE) restart admin-service

stop-all: ## Arrêt tous les services backend
	@$(COMPOSE) stop auth-service api-gateway admin-service
	@# Arrêt des services email s'ils existent
	@for service in email-service alias-service; do \
		if $(COMPOSE) config --services | grep -q "$$service"; then \
			$(COMPOSE) stop $$service; \
		fi; \
	done

stop-core: ## Arrêt services core
	@$(COMPOSE) stop $(SERVICES)

stop-email: ## Arrêt services email
	@for service in email-service alias-service; do \
		if $(COMPOSE) config --services | grep -q "$$service"; then \
			$(COMPOSE) stop $$service; \
		fi; \
	done

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE
# ═══════════════════════════════════════════════════════════════

db-migrate-all: ## Migrations BDD
	@if [ -d "auth-service" ]; then $(MAKE) -C auth-service db-migrate; fi

clean: ## Nettoyage backend
	$(call log_info,"🧹 Nettoyage backend")
	@$(COMPOSE) stop auth-service api-gateway admin-service
	@$(COMPOSE) rm -f auth-service api-gateway admin-service
	$(call log_success,"Backend nettoyé")

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS PRATIQUES
# ═══════════════════════════════════════════════════════════════

up: dev-core ## Alias pour dev-core (services existants)

down: stop-all ## Alias pour stop-all

ps: status ## Alias pour status

restart: ## Redémarrage complet backend
	@$(MAKE) stop-all
	@sleep 2
	@$(MAKE) dev-core