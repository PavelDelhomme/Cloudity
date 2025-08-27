# frontend/email-app/Makefile
.PHONY: help dev build test clean setup

include ../../scripts/colors.mk

help: ## Email App Vue.js
	@echo "$(PURPLE)📧 Email App$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup Node.js
	$(call log_info,"Setup Email App")
	@npm install
	$(call log_success,"Email App configuré")

# ✅ DOCKER PAR DÉFAUT
dev: ## Démarrage développement avec Docker
	$(call log_info,"Démarrage Email App Docker")
	@docker compose -f ../../docker-compose.yml up -d email-app
	$(call log_success,"Email App: http://localhost:8094")

dev-docker: ## Démarrage avec Docker (alias)
	@$(MAKE) dev

dev-local: ## Démarrage local (sans Docker)
	$(call log_info,"Démarrage local Email App")
	@npm run dev &
	$(call log_success,"Email App local: http://localhost:8094")

build: ## Build production
	$(call log_info,"Build Email App")
	@npm run build
	$(call log_success,"Build terminé")

preview: ## Preview production
	@npm run preview

test: ## Tests Vue.js
	$(call log_info,"Tests Email App")
	@npm run test:unit
	$(call log_success,"Tests terminés")

test-components: ## Tests composants
	@npm run test:components

test-store: ## Tests store Pinia
	@npm run test:store

lint: ## Linting Vue/JS
	@npm run lint

format: ## Formatage code
	@npm run format

storybook: ## Storybook composants
	@npm run storybook

logs: ## Logs développement
	@docker compose -f ../../docker-compose.yml logs -f email-app

status: ## Status du service
	@docker compose -f ../../docker-compose.yml ps email-app

shell: ## Shell dans container
	@docker compose -f ../../docker-compose.yml exec email-app /bin/sh

clean: ## Nettoyage
	@rm -rf node_modules/ dist/ .vite/
	@docker compose -f ../../docker-compose.yml stop email-app