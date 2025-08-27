# backend/password-service/Makefile
.PHONY: help dev build test clean

include ../../scripts/colors.mk

help: ## Password Service
	@echo "$(PURPLE)🔐 Password Service$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

dev: ## Démarrage développement
	$(call log_info,"Démarrage Password Service")
	@docker compose -f ../../docker-compose.yml up -d password-service
	$(call log_success,"Password Service: http://localhost:8093")

build: ## Build du service
	@cargo build

test: ## Tests
	@cargo test

clean: ## Nettoyage
	@cargo clean

logs: ## Logs
	@docker compose -f ../../docker-compose.yml logs -f password-service