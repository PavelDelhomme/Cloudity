# frontend/Makefile
.PHONY: help email-frontend

include ../scripts/colors.mk

email-frontend: ## Démarrer frontend email
	$(call log_info,"Démarrage frontend email")
	@cd email-app && npm run dev &
	$(call log_success,"Frontend email: http://localhost:8093")

dev-admin: ## Démarrer admin dashboard
	$(call log_info,"Démarrage admin dashboard")
	@docker compose -f ../docker-compose.yml up -d admin-dashboard
	$(call log_success,"Admin dashboard: http://localhost:3000")

help: ## Afficher les aides
	@echo "make email-frontend"
	@echo "make help"