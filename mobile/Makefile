# mobile/Makefile - Applications mobiles Cloudity
.PHONY: help setup dev clean

include ../scripts/colors.mk

MOBILE_APPS := admin_app email_app password_app

help: ## Mobile Cloudity
	@echo "$(CYAN)📱 Mobile Cloudity$(NC)"
	@echo "Applications: $(MOBILE_APPS)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

setup: ## Setup toutes les apps
	$(call log_info,"Setup applications mobiles")
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			$(call log_info,"Setup $$app"); \
			$(MAKE) -C $$app setup; \
		fi; \
	done
	$(call log_success,"Mobile setup terminé")

# ═══════════════════════════════════════════════════════════════
# APPLICATIONS INDIVIDUELLES
# ═══════════════════════════════════════════════════════════════

admin-app: ## Admin app mobile
	@$(MAKE) -C admin_app dev

email-app: ## Email app mobile  
	@$(MAKE) -C email_app dev

password-app: ## Password app mobile
	@$(MAKE) -C password_app dev

# ═══════════════════════════════════════════════════════════════
# DÉVELOPPEMENT
# ═══════════════════════════════════════════════════════════════

dev: ## Menu développement mobile
	@echo "$(CYAN)Applications disponibles:$(NC)"
	@echo "1) make admin-app - Dashboard administrateur"
	@echo "2) make email-app - Client email mobile"  
	@echo "3) make password-app - Gestionnaire mots de passe"

dev-all: ## Développement toutes apps
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			$(MAKE) -C $$app dev & \
		fi; \
	done

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test: ## Tests toutes les apps
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			$(MAKE) -C $$app test; \
		fi; \
	done

test-admin: ## Tests admin app
	@$(MAKE) -C admin_app test

test-email: ## Tests email app
	@$(MAKE) -C email_app test

test-password: ## Tests password app
	@$(MAKE) -C password_app test

# ═══════════════════════════════════════════════════════════════
# BUILDS
# ═══════════════════════════════════════════════════════════════

build: ## Build toutes les apps
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			$(MAKE) -C $$app build; \
		fi; \
	done

build-android: ## Build Android toutes apps
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			$(MAKE) -C $$app build-android; \
		fi; \
	done

build-ios: ## Build iOS toutes apps
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			$(MAKE) -C $$app build-ios; \
		fi; \
	done

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage toutes apps
	@for app in $(MOBILE_APPS); do \
		if [ -d "$$app" ]; then \
			$(MAKE) -C $$app clean; \
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

doctor: ## Flutter doctor toutes apps
	@flutter doctor -v