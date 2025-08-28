# frontend/password-app/Makefile
.PHONY: help dev build test clean setup

include ../../scripts/colors.mk

help: ## Password Manager App Vue.js
	printf "$(PURPLE)🔐 Password Manager$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup Node.js
	$(call log_info,"Setup Password Manager")
	@npm install
	$(call log_success,"Password Manager configuré")

# ✅ DOCKER PAR DÉFAUT
dev: ## Démarrage développement avec Docker
	$(call log_info,"Démarrage Password Manager Docker")
	@docker compose -f ../../docker-compose.yml up -d password-app
	$(call log_success,"Password Manager: http://localhost:8095")

dev-docker: ## Démarrage avec Docker (alias)
	@$(MAKE) dev

dev-local: ## Démarrage local (sans Docker)
	$(call log_info,"Démarrage local Password Manager")
	@npm run dev &
	$(call log_success,"Password Manager local: http://localhost:8095")

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

logs: ## Logs développement
	@docker compose -f ../../docker-compose.yml logs -f password-app

status: ## Status du service
	@docker compose -f ../../docker-compose.yml ps password-app

shell: ## Shell dans container
	@docker compose -f ../../docker-compose.yml exec password-app /bin/sh

clean: ## Nettoyage
	@rm -rf node_modules/ dist/ .vite/
	@docker compose -f ../../docker-compose.yml stop password-app