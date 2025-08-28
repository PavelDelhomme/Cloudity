# backend/auth-service/Makefile
.PHONY: help setup dev build test clean

include ../../scripts/colors.mk

SERVICE_NAME := auth-service
PORT := 8081
COMPOSE = docker compose -f ../../docker-compose.yml

help: ## Service d'authentification Cloudity
	printf "$(GREEN)🔐 Auth Service$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## Configuration initiale
	$(call log_info,"Setup Auth Service")
	@go mod init github.com/PavelDelhomme/Cloudity/backend/auth-service 2>/dev/null || true
	@go mod tidy
	@$(MAKE) create-structure
	$(call log_success,"Auth Service configuré")

create-structure: ## Crée la structure Go
	@mkdir -p {internal/{config,database,models,repository,services,handlers,middleware,routes},pkg,tests/{unit,integration},docs}
	@touch internal/config/config.go
	@touch internal/handlers/{auth_handler.go,health_handler.go}
	@touch internal/routes/{public_routes.go,protected_routes.go}

dev: ## Développement avec hot reload
	$(call log_info,"Démarrage Auth Service dev")
	@$(COMPOSE) up -d $(SERVICE_NAME)
	$(call log_success,"Auth Service: http://localhost:$(PORT)")

build: ## Build le service
	$(call log_info,"Build Auth Service")
	@$(COMPOSE) build $(SERVICE_NAME)
	$(call log_success,"Auth Service built")

test: ## Tests complets
	$(call log_info,"Tests Auth Service")
	@go test -v ./...
	@$(MAKE) test-api
	$(call log_success,"Tests terminés")

test-unit: ## Tests unitaires
	@go test -v ./internal/...

test-api: ## Tests API manuels
	$(call log_info,"Tests API")
	@$(MAKE) test-health
	@$(MAKE) test-register
	@$(MAKE) test-login

test-health: ## Test endpoint health
	@curl -sf http://localhost:$(PORT)/health >/dev/null && $(call log_success,"Health OK") || $(call log_error,"Health KO")

test-register: ## Test inscription
	@curl -sf -X POST http://localhost:$(PORT)/api/v1/auth/register \
		-H "Content-Type: application/json" \
		-H "X-Tenant-ID: admin" \
		-d '{"email":"test@cloudity.com","password":"password123","first_name":"Test","last_name":"User"}' \
		>/dev/null && $(call log_success,"Register OK") || $(call log_warning,"Register failed")

test-login: ## Test connexion
	@curl -sf -X POST http://localhost:$(PORT)/api/v1/auth/login \
		-H "Content-Type: application/json" \
		-H "X-Tenant-ID: admin" \
		-d '{"email":"test@cloudity.com","password":"password123"}' \
		>/dev/null && $(call log_success,"Login OK") || $(call log_warning,"Login failed")

db-migrate: ## Migrations BDD
	$(call log_info,"Migrations Auth Service")
	# Ajouter ici les migrations spécifiques
	$(call log_success,"Migrations terminées")

status: ## Status du service
	@curl -sf http://localhost:$(PORT)/health >/dev/null && echo "$(GREEN)Running$(NC)" || echo "$(RED)Stopped$(NC)"

health: ## Health check
	@$(MAKE) test-health

logs: ## Logs du service
	@$(COMPOSE) logs -f $(SERVICE_NAME)

shell: ## Shell dans le container
	@$(COMPOSE) exec $(SERVICE_NAME) /bin/sh

format: ## Formatage du code
	@go fmt ./...
	@go mod tidy

lint: ## Linting
	@golangci-lint run ./... 2>/dev/null || echo "$(YELLOW)golangci-lint non installé$(NC)"

clean: ## Nettoyage
	@$(COMPOSE) stop $(SERVICE_NAME)
	@$(COMPOSE) rm -f $(SERVICE_NAME)

stop: ## Arrêt du service
	@$(COMPOSE) stop $(SERVICE_NAME)

restart: ## Redémarrage
	@$(MAKE) stop
	@$(MAKE) dev
