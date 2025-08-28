# frontend/Makefile - Version complète
.PHONY: help dev-admin dev-all email-frontend password-frontend

include ../scripts/colors.mk

help: ## Frontend Cloudity
	printf "$(PURPLE)🎨 Frontend Cloudity$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\\n", $$1, $$2}'

# ═══════════════════════════════════════════════════════════════
# APPLICATIONS INDIVIDUELLES
# ═══════════════════════════════════════════════════════════════

admin-dashboard: ## Admin dashboard
	@$(MAKE) -C admin-dashboard dev

email-app: ## Email application
	@$(MAKE) -C email-app dev-docker

password-app: ## Password manager
	@$(MAKE) -C password-app dev-docker

dev-admin: ## Admin dashboard
	$(call log_info,"Démarrage admin dashboard")
	@docker compose -f ../docker-compose.yml up -d admin-dashboard  
	$(call log_success,"Admin dashboard: http://localhost:3000")

dev-all: ## Tous les frontends
	$(call log_info,"Démarrage frontends")
	@$(MAKE) dev-admin
	@if [ -d "email-app" ]; then $(MAKE) email-app; fi
	@if [ -d "password-app" ]; then $(MAKE) password-app; fi
	$(call log_success,"Frontends démarrés")

email-frontend: ## Frontend email avec Docker
	$(call log_info,"Démarrage frontend email")
	@docker compose -f ../docker-compose.yml up -d email-app
	$(call log_success,"Email app: http://localhost:8094")

password-frontend: ## Frontend password avec Docker
	$(call log_info,"Démarrage frontend password")
	@docker compose -f ../docker-compose.yml up -d password-app
	$(call log_success,"Password app: http://localhost:8095")

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test-admin-dashboard: ## Tests dashboard
	@$(MAKE) -C admin-dashboard test

test-email-app: ## Tests email app
	@$(MAKE) -C email-app test

test-password-app: ## Tests password app
	@$(MAKE) -C password-app test

test-all: ## Tests tous les frontends
	@for app in admin-dashboard email-app password-app; do \
		if [ -d "$$app" ]; then \
			$(MAKE) -C $$app test; \
		fi; \
	done

# ═══════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════

build-admin-dashboard: ## Build dashboard
	@$(MAKE) -C admin-dashboard build

build-email-app: ## Build email app
	@$(MAKE) -C email-app build

build-password-app: ## Build password app
	@$(MAKE) -C password-app build

build-all: ## Build tous les frontends
	@for app in admin-dashboard email-app password-app; do \
		if [ -d "$$app" ]; then \
			$(MAKE) -C $$app build; \
		fi; \
	done

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE
# ═══════════════════════════════════════════════════════════════

status: ## Status frontend
	@printf "$(PURPLE)Frontend Status:$(NC)\n"
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)✅$(NC) admin-dashboard: Running\n"; \
	else \
		printf "$(RED)❌$(NC) admin-dashboard: Stopped\n"; \
	fi
	@if [ -d "email-app" ]; then \
		if $(COMPOSE) ps email-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			printf "$(GREEN)✅$(NC) email-app: Running\n"; \
		else \
			printf "$(YELLOW)⚠️$(NC) email-app: Stopped\n"; \
		fi; \
	else \
		printf "$(RED)❌$(NC) email-app: À créer\n"; \
	fi
	@if [ -d "password-app" ]; then \
		if $(COMPOSE) ps password-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			printf "$(GREEN)✅$(NC) password-app: Running\n"; \
		else \
			printf "$(YELLOW)⚠️$(NC) password-app: Stopped\n"; \
		fi; \
	else \
		printf "$(RED)❌$(NC) password-app: À créer\n"; \
	fi

clean: ## Nettoyage frontend
	@docker compose -f ../docker-compose.yml stop admin-dashboard email-app password-app
	@for app in admin-dashboard email-app password-app; do \
		if [ -d "$$app/node_modules" ]; then rm -rf $$app/node_modules; fi; \
	done

logs: ## Logs frontend
	@docker compose -f ../docker-compose.yml logs -f admin-dashboard email-app password-app