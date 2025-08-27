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

dev: ## Démarrage développement
	$(call log_info,"Démarrage Email App")
	@npm run dev &
	$(call log_success,"Email App: http://localhost:8094")

dev-docker: ## Démarrage avec Docker
	$(call log_info,"Démarrage Email App Docker")
	@docker compose -f ../../docker-compose.yml up -d email-app
	$(call log_success,"Email App: http://localhost:8094")

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
	@tail -f logs/email-app.log 2>/dev/null || echo "Pas de logs"

clean: ## Nettoyage
	@rm -rf node_modules/ dist/ .vite/