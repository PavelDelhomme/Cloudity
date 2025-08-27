# frontend/Makefile
.PHONY: help dev-admin dev-all email-frontend password-frontend

include ../scripts/colors.mk


help: ## Frontend Cloudity
	@echo "$(PURPLE)🎨 Frontend Cloudity$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

dev-admin: ## Démarrer admin dashboard
	$(call log_info,"Démarrage admin dashboard")
	@docker compose -f ../docker-compose.yml up -d admin-dashboard
	$(call log_success,"Admin dashboard: http://localhost:3000")

dev-all: ## Tous les frontends
	$(call log_info, "Démarrage frontends")
	@$(MAKE) dev-admin
	@if [ -d "email-app" ]; then $(MAKE) email-frontend; fi
	@if [ -d "password-app" ]; then $(MAKE) password-frontend; fi
	$(call log_success, "Frontends démarrés")

email-frontend: ## Démarrer frontend email
	$(call log_info,"Démarrage frontend email")
	@if [ -d "email-app" ]; then \
		cd email-app && npm install && npm run dev & \
		$(call log_success, "Email app: http://localhost:8094"); \
	else \
		$(call log_warning, "email-app n'existe pas encore"); \
	fi

password-frontend: ## Frontend password
	$(call log_info,"Démarrage frontend password")
	@if [ -d "password-app" ]; then \
		cd password-app && npm install && npm run dev & \
		$(call log_success,"Password app: http://localhost:8095"); \
	else \
		$(call log_warning,"password-app n'existe pas encore"); \
	fi