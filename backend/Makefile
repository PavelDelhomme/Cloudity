# backend/Makefile - Backend Simplifié
.PHONY: help setup dev-core dev-email build-all test-all clean

include ../scripts/colors.mk

# Services essentiels uniquement (pas de password-service)
CORE_SERVICES := auth-service api-gateway admin-service
EMAIL_SERVICES := alias-service email-service mail-server
ALL_SERVICES := $(CORE_SERVICES) $(EMAIL_SERVICES)

COMPOSE = docker compose -f ../docker-compose.yml

help: ## Backend Services Cloudity
	@echo "$(PURPLE)🔧 Backend Services Cloudity$(NC)"
	@echo "$(CYAN)Services Core:$(NC) $(CORE_SERVICES)"
	@echo "$(CYAN)Services Email:$(NC) $(EMAIL_SERVICES)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## Setup backend services
	$(call log_info,"Setup services backend")
	@for service in $(CORE_SERVICES); do \
		if [ -d "$$service" ]; then \
			echo "$(CYAN)Setup $$service$(NC)"; \
			$(MAKE) -C $$service setup 2>/dev/null || echo "$(YELLOW)$$service: pas de setup$(NC)"; \
		fi; \
	done
	$(call log_success,"Backend setup terminé")

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGE PAR GROUPES
# ═══════════════════════════════════════════════════════════════

dev-core: ## Services core (auth + gateway + admin)
	$(call log_info,"Démarrage services core")
	@$(COMPOSE) up -d $(CORE_SERVICES)
	$(call log_success,"Services core démarrés")

dev-email: ## Services email complets
	$(call log_info,"Démarrage services email")
	@# Vérifier et démarrer seulement les services qui existent
	@for service in $(EMAIL_SERVICES); do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			echo "$(GREEN)Démarrage $$service$(NC)"; \
			$(COMPOSE) up -d $$service; \
		else \
			echo "$(YELLOW)$$service: non configuré$(NC)"; \
		fi; \
	done
	$(call log_success,"Services email traités")

dev-all: ## Tous les services backend
	$(call log_info,"Démarrage backend complet")
	@$(MAKE) dev-core
	@$(MAKE) dev-email
	$(call log_success,"Backend complet démarré")

# ═══════════════════════════════════════════════════════════════
# SERVICES INDIVIDUELS
# ═══════════════════════════════════════════════════════════════

auth-service: ## Service authentification
	$(call log_info,"Démarrage auth service")
	@$(COMPOSE) up -d auth-service
	$(call log_success,"Auth service: http://localhost:8081")

api-gateway: ## API Gateway
	$(call log_info,"Démarrage API Gateway")
	@$(COMPOSE) up -d api-gateway
	$(call log_success,"API Gateway: http://localhost:8000")

admin-service: ## Service administration
	$(call log_info,"Démarrage admin service")
	@$(COMPOSE) up -d admin-service
	$(call log_success,"Admin service: http://localhost:8082")

email-service: ## Service email Rust
	$(call log_info,"Démarrage email service")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "email-service"; then \
		$(COMPOSE) up -d email-service; \
		$(call log_success,"Email service: http://localhost:8091"); \
	else \
		$(call log_warning,"Email service non configuré dans docker-compose.yml"); \
	fi

alias-service: ## Service alias email
	$(call log_info,"Démarrage alias service")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "alias-service"; then \
		$(COMPOSE) up -d alias-service; \
		$(call log_success,"Alias service: http://localhost:8092"); \
	else \
		$(call log_warning,"Alias service non configuré dans docker-compose.yml"); \
	fi

mail-server: ## Serveur mail complet
	$(call log_info,"Démarrage mail server")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "mail-server"; then \
		$(COMPOSE) up -d mail-server; \
		$(call log_success,"Mail server opérationnel"); \
	else \
		$(call log_warning,"Mail server non configuré dans docker-compose.yml"); \
	fi

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test-all: ## Tests services core
	$(call log_info,"Tests backend")
	@for service in $(CORE_SERVICES); do \
		if [ -d "$$service" ]; then \
			echo "$(CYAN)Tests $$service$(NC)"; \
			$(MAKE) -C $$service test 2>/dev/null || echo "$(YELLOW)$$service: pas de tests$(NC)"; \
		fi; \
	done
	$(call log_success,"Tests terminés")

test-auth: ## Tests auth service
	@if [ -d "auth-service" ]; then $(MAKE) -C auth-service test; fi

test-gateway: ## Tests API gateway
	@if [ -d "api-gateway" ]; then $(MAKE) -C api-gateway test; fi

test-admin: ## Tests admin service
	@if [ -d "admin-service" ]; then $(MAKE) -C admin-service test; fi

# ═══════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════

build-all: ## Build tous les services
	$(call log_info,"Build backend")
	@for service in $(CORE_SERVICES); do \
		if [ -d "$$service" ]; then \
			echo "$(CYAN)Build $$service$(NC)"; \
			$(MAKE) -C $$service build 2>/dev/null || echo "$(YELLOW)$$service: pas de build$(NC)"; \
		fi; \
	done
	$(call log_success,"Build terminé")

# ═══════════════════════════════════════════════════════════════
# STATUS ET MONITORING
# ═══════════════════════════════════════════════════════════════

status: ## Status services backend
	@echo "$(PURPLE)Backend Services Status:$(NC)"
	@for service in $(ALL_SERVICES); do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
				echo "$(GREEN)$$service: Running$(NC)"; \
			else \
				echo "$(RED)$$service: Stopped$(NC)"; \
			fi; \
		else \
			echo "$(GRAY)$$service: Non configuré$(NC)"; \
		fi; \
	done

health: ## Health check backend
	$(call log_info,"Health check backend")
	@for service in $(CORE_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			if [ -d "$$service" ] && $(MAKE) -C $$service health 2>/dev/null; then \
				echo "$(GREEN)$$service: Health OK$(NC)"; \
			fi; \
		fi; \
	done

# ═══════════════════════════════════════════════════════════════
# LOGS
# ═══════════════════════════════════════════════════════════════

logs-all: ## Logs tous les services actifs
	@services=""; \
	for service in $(ALL_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			services="$$services $$service"; \
		fi; \
	done; \
	if [ ! -z "$$services" ]; then \
		$(COMPOSE) logs -f $$services; \
	else \
		echo "$(YELLOW)Aucun service backend actif$(NC)"; \
	fi

logs-core: ## Logs services core
	@$(COMPOSE) logs -f $(CORE_SERVICES)

logs-auth: ## Logs auth service
	@$(COMPOSE) logs -f auth-service

logs-gateway: ## Logs API gateway
	@$(COMPOSE) logs -f api-gateway

logs-admin: ## Logs admin service
	@$(COMPOSE) logs -f admin-service

logs-email: ## Logs services email
	@services=""; \
	for service in $(EMAIL_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			services="$$services $$service"; \
		fi; \
	done; \
	if [ ! -z "$$services" ]; then \
		$(COMPOSE) logs -f $$services; \
	else \
		echo "$(YELLOW)Aucun service email actif$(NC)"; \
	fi

# ═══════════════════════════════════════════════════════════════
# SHELLS
# ═══════════════════════════════════════════════════════════════

shell-auth: ## Shell auth service
	@$(COMPOSE) exec auth-service /bin/sh

shell-gateway: ## Shell API gateway
	@$(COMPOSE) exec api-gateway /bin/sh

shell-admin: ## Shell admin service
	@$(COMPOSE) exec admin-service /bin/bash

shell-email: ## Shell email service
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		$(COMPOSE) exec email-service /bin/sh; \
	else \
		echo "$(YELLOW)Email service non démarré$(NC)"; \
	fi

# ═══════════════════════════════════════════════════════════════
# CONTRÔLES
# ═══════════════════════════════════════════════════════════════

restart-auth: ## Redémarrage auth service
	@$(COMPOSE) restart auth-service

restart-gateway: ## Redémarrage API gateway
	@$(COMPOSE) restart api-gateway

restart-admin: ## Redémarrage admin service
	@$(COMPOSE) restart admin-service

stop-core: ## Arrêt services core
	@$(COMPOSE) stop $(CORE_SERVICES)

stop-email: ## Arrêt services email
	@for service in $(EMAIL_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			$(COMPOSE) stop $$service; \
		fi; \
	done

stop-all: ## Arrêt tous les services backend
	@$(COMPOSE) stop $(CORE_SERVICES)
	@$(MAKE) stop-email

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage backend
	$(call log_info,"Nettoyage backend")
	@$(COMPOSE) stop $(CORE_SERVICES)
	@$(COMPOSE) rm -f $(CORE_SERVICES)
	@$(MAKE) stop-email
	$(call log_success,"Backend nettoyé")

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS
# ═══════════════════════════════════════════════════════════════

up: dev-core ## Alias dev-core
down: stop-all ## Alias stop-all
ps: status ## Alias status