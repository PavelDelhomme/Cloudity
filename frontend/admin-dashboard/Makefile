# frontend/admin-dashboard/Makefile
.PHONY: help dev build test clean setup

include ../../scripts/colors.mk

help: ## Admin Dashboard Vue.js
	@echo "$(PURPLE)📊 Admin Dashboard$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup Node.js
	$(call log_info,"Setup Admin Dashboard")
	@npm install
	$(call log_success,"Admin Dashboard configuré")

dev: ## Démarrage développement
	$(call log_info,"Démarrage Admin Dashboard")
	@docker compose -f ../../docker-compose.yml up -d admin-dashboard
	$(call log_success,"Admin Dashboard: http://localhost:3000")

dev-local: ## Démarrage local (sans Docker)
	$(call log_info,"Démarrage local Admin Dashboard")
	@npm run dev &
	$(call log_success,"Dashboard local: http://localhost:3000")

build: ## Build production
	$(call log_info,"Build Admin Dashboard")
	@npm run build
	$(call log_success,"Build terminé")

build-docker: ## Build image Docker
	@docker compose -f ../../docker-compose.yml build admin-dashboard

preview: ## Preview production
	@npm run preview

test: ## Tests Vue.js
	$(call log_info,"Tests Admin Dashboard")
	@npm run test:unit
	$(call log_success,"Tests terminés")

test-e2e: ## Tests end-to-end
	@npm run test:e2e

lint: ## Linting Vue/JS
	@npm run lint

format: ## Formatage code
	@npm run format

analyze: ## Analyse bundle
	@npm run analyze

logs: ## Logs du service
	@docker compose -f ../../docker-compose.yml logs -f admin-dashboard

status: ## Status du service
	@docker compose -f ../../docker-compose.yml ps admin-dashboard

shell: ## Shell dans container
	@docker compose -f ../../docker-compose.yml exec admin-dashboard /bin/sh

clean: ## Nettoyage
	@rm -rf node_modules/ dist/ .vite/
	@npm cache clean --force