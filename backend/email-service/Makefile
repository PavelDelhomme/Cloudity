.PHONY: help dev build test clean

include ../../scripts/colors.mk

help: ## Email Service
	@echo "$(PURPLE)📧 Email Service$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

dev: ## Démarrage développement
	$(call log_info,"Démarrage Email Service")
	@docker compose -f ../../docker-compose.yml up -d email-service
	$(call log_success,"Email Service: http://localhost:8091")

build: ## Build du service
	$(call log_info,"Build Email Service")
	@cargo build
	$(call log_success,"Build terminé")

test: ## Tests
	@cargo test

clean: ## Nettoyage
	@cargo clean

logs: ## Logs
	@docker compose -f ../../docker-compose.yml logs -f email-service

status: ## Status
	@docker compose -f ../../docker-compose.yml ps email-service

shell: ## Shell dans container
	@docker compose -f ../../docker-compose.yml exec email-service /bin/sh