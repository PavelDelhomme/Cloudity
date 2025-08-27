# frontend/password-app/Makefile
.PHONY: help dev build test clean setup

include ../../scripts/colors.mk

help: ## Password Manager App Vue.js
	@echo "$(PURPLE)🔐 Password Manager$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup Node.js
	$(call log_info,"Setup Password Manager")
	@npm install
	$(call log_success,"Password Manager configuré")

dev: ## Démarrage développement
	$(call log_info,"Démarrage Password Manager")
	@npm run dev &
	$(call log_success,"Password Manager: http://localhost:8095")

dev-docker: ## Démarrage avec Docker
	@docker compose -f ../../docker-compose.yml up -d password-app

build: ## Build production
	$(call log_info,"Build Password Manager")
	@npm run build
	$(call log_success,"Build terminé")

preview: ## Preview production
	@npm run preview

test: ## Tests Vue.js
	$(call log_info,"Tests Password Manager")
	@npm run test:unit
	$(call log_success,"Tests terminés")

test-crypto: ## Tests cryptographie
	@npm run test:crypto

test-security: ## Tests sécurité
	@npm run test:security

lint: ## Linting Vue/JS
	@npm run lint

format: ## Formatage code
	@npm run format

security-audit: ## Audit sécurité
	@npm audit
	@npm run audit:security

clean: ## Nettoyage
	@rm -rf node_modules/ dist/ .vite/
	@npm cache clean --force