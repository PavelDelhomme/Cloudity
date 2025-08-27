# mobile/Makefile - Applications mobiles Cloudity
.PHONY: help setup dev clean

include ../scripts/colors.mk

MOBILE_APPS := admin_app email_app password_app

help: ## Mobile Cloudity
	@echo "$(CYAN)📱 Mobile Cloudity$(NC)"
	@echo "Applications: $(MOBILE_APPS)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup mobile apps
	$(call log_info,"Setup applications mobiles")
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			$(call log_info,"Setup $$app"); \
			cd $$app && flutter pub get && cd ..; \
		fi; \
	done
	$(call log_success,"Mobile setup terminé")

dev: ## Développement mobile
	$(call log_info,"Mode développement mobile")
	@echo "$(CYAN)Applications disponibles:$(NC)"
	@echo "1) admin_app - Dashboard administrateur"
	@echo "2) email_app - Client email mobile"  
	@echo "3) password_app - Gestionnaire mots de passe"

clean: ## Nettoyage mobile
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			cd $$app && flutter clean && cd ..; \
		fi; \
	done

status: ## Status applications mobiles
	@echo "$(CYAN)Mobile Apps Status:$(NC)"
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			echo "$$app: $(GREEN)Présent$(NC)"; \
		else \
			echo "$$app: $(RED)À créer$(NC)"; \
		fi; \
	done