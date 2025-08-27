# backend/Makefile - Services Backend
.PHONY: help setup dev-all build-all test-all clean

include ../scripts/colors.mk

SERVICES := auth-service api-gateway admin-service
COMPOSE = docker compose -f ../docker-compose.yml

help: ## Services Backend Cloudity
	@echo "$(PURPLE)🔧 Services Backend$(NC)"
	@echo "Services: $(SERVICES)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## Setup backend services
	$(call log_info,"Setup services backend")
	@for service in $(SERVICES); do \
		$(call log_info,"Setup $$service"); \
		$(MAKE) -C $$service setup; \
	done
	$(call log_success,"Backend setup terminé")

dev-all: ## Tous les services backend
	$(call log_info,"Démarrage backend complet")
	@$(COMPOSE) up -d $(SERVICES)
	$(call log_success,"Backend complet démarré")

dev-auth: ## Service auth uniquement
	@$(MAKE) -C auth-service dev

dev-api: ## Services API (auth + gateway)
	$(call log_info,"Démarrage services API")
	@$(COMPOSE) up -d auth-service api-gateway
	$(call log_success,"Services API démarrés")

build-all: ## Build tous les services
	$(call log_info,"Build backend complet")
	@for service in $(SERVICES); do \
		$(call log_info,"Build $$service"); \
		$(MAKE) -C $$service build; \
	done
	$(call log_success,"Build backend terminé")

test-all: ## Tests tous les services
	$(call log_info,"Tests backend complet")
	@for service in $(SERVICES); do \
		$(call log_info,"Tests $$service"); \
		$(MAKE) -C $$service test || exit 1; \
	done
	$(call log_success,"Tests backend terminés")

test-unit: ## Tests unitaires
	@for service in $(SERVICES); do \
		$(MAKE) -C $$service test-unit; \
	done

test-api: ## Tests API
	@for service in $(SERVICES); do \
		$(MAKE) -C $$service test-api; \
	done

db-migrate-all: ## Migrations BDD
	@$(MAKE) -C auth-service db-migrate

status: ## Status services backend
	@echo "$(PURPLE)Backend Services:$(NC)"
	@for service in $(SERVICES); do \
		echo -n "$$service: "; \
		$(MAKE) -C $$service status 2>/dev/null || echo "$(RED)Stopped$(NC)"; \
	done

health: ## Health check backend
	@for service in $(SERVICES); do \
		$(MAKE) -C $$service health; \
	done

logs-all: ## Logs tous les services
	@$(COMPOSE) logs -f $(SERVICES)

logs-auth: ## Logs auth service
	@$(MAKE) -C auth-service logs

shell-auth: ## Shell auth service
	@$(MAKE) -C auth-service shell

shell-gateway: ## Shell API gateway
	@$(MAKE) -C api-gateway shell

shell-admin: ## Shell admin service
	@$(MAKE) -C admin-service shell

clean: ## Nettoyage backend
	@for service in $(SERVICES); do \
		$(MAKE) -C $$service clean; \
	done

stop: ## Arrêt backend
	@$(COMPOSE) stop $(SERVICES)
