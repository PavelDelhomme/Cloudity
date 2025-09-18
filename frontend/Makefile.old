# frontend/Makefile - Applications Frontend Optimisé
.PHONY: help dev-all build-all test-all clean

include ../scripts/colors.mk

FRONTEND_APPS := admin-dashboard email-app password-app
COMPOSE = docker compose -f ../docker-compose.yml

help: ## Applications Frontend Cloudity
	@echo "$(PURPLE)🎨 Frontend Applications Cloudity$(NC)"
	@echo "$(CYAN)Applications:$(NC) $(FRONTEND_APPS)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGE PAR APPLICATIONS
# ═══════════════════════════════════════════════════════════════

dev-all: ## Toutes les applications frontend
	$(call log_info,"🎨 Démarrage frontend complet")
	@$(COMPOSE) up -d $(FRONTEND_APPS)
	$(call log_success,"Frontend complet opérationnel")
	@$(MAKE) show-urls

dev-admin: admin-dashboard ## Alias pour admin-dashboard

admin-dashboard: ## Dashboard administration
	$(call log_info,"📊 Démarrage admin dashboard")
	@$(COMPOSE) up -d admin-dashboard
	$(call log_success,"Admin dashboard: http://localhost:3000")

email-app: ## Application email
	$(call log_info,"📧 Démarrage application email")
	@$(COMPOSE) up -d email-app
	$(call log_success,"Email app: http://localhost:8094")

password-app: ## Application password manager  
	$(call log_info,"🔒 Démarrage application password")
	@$(COMPOSE) up -d password-app
	$(call log_success,"Password app: http://localhost:8095")

# ═══════════════════════════════════════════════════════════════
# DÉVELOPPEMENT LOCAL (sans Docker)
# ═══════════════════════════════════════════════════════════════

dev-admin-local: ## Admin dashboard local (npm)
	$(call log_info,"📊 Démarrage admin dashboard local")
	@cd admin-dashboard && npm install && npm run dev &
	$(call log_success,"Admin dashboard local: http://localhost:3000")

dev-email-local: ## Email app local (npm)
	$(call log_info,"📧 Démarrage email app local")  
	@cd email-app && npm install && npm run dev &
	$(call log_success,"Email app local: http://localhost:8094")

dev-password-local: ## Password app local (npm)
	$(call log_info,"🔒 Démarrage password app local")
	@cd password-app && npm install && npm run dev &
	$(call log_success,"Password app local: http://localhost:8095")

# ═══════════════════════════════════════════════════════════════
# CONTRÔLES INDIVIDUELS
# ═══════════════════════════════════════════════════════════════

restart-admin: ## Redémarrage admin dashboard
	$(call log_info,"🔄 Redémarrage admin dashboard")
	@$(COMPOSE) restart admin-dashboard

restart-email: ## Redémarrage email app
	$(call log_info,"🔄 Redémarrage email app")
	@$(COMPOSE) restart email-app

restart-password: ## Redémarrage password app
	$(call log_info,"🔄 Redémarrage password app") 
	@$(COMPOSE) restart password-app

stop-admin: ## Arrêt admin dashboard
	@$(COMPOSE) stop admin-dashboard

stop-email: ## Arrêt email app
	@$(COMPOSE) stop email-app

stop-password: ## Arrêt password app
	@$(COMPOSE) stop password-app

stop-all: ## Arrêt toutes les applications
	@$(COMPOSE) stop $(FRONTEND_APPS)

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test-all: ## Tests toutes les applications
	$(call log_info,"🧪 Tests frontend complet")
	@for app in $(FRONTEND_APPS); do \
		if [ -d "$$app" ]; then \
			$(call log_info,"Tests $$app"); \
			$(MAKE) -C $$app test; \
		fi; \
	done
	$(call log_success,"Tests frontend terminés")

test-admin: ## Tests admin dashboard
	@if [ -d "admin-dashboard" ]; then $(MAKE) -C admin-dashboard test; fi

test-email: ## Tests email app
	@if [ -d "email-app" ]; then $(MAKE) -C email-app test; fi

test-password: ## Tests password app
	@if [ -d "password-app" ]; then $(MAKE) -C password-app test; fi

# ═══════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════

build-all: ## Build toutes les applications
	$(call log_info,"🔨 Build frontend complet")
	@for app in $(FRONTEND_APPS); do \
		if [ -d "$$app" ]; then \
			$(call log_info,"Build $$app"); \
			$(MAKE) -C $$app build; \
		fi; \
	done
	$(call log_success,"Build frontend terminé")

build-admin: ## Build admin dashboard
	@if [ -d "admin-dashboard" ]; then $(MAKE) -C admin-dashboard build; fi

build-email: ## Build email app
	@if [ -d "email-app" ]; then $(MAKE) -C email-app build; fi

build-password: ## Build password app
	@if [ -d "password-app" ]; then $(MAKE) -C password-app build; fi

# ═══════════════════════════════════════════════════════════════
# STATUS & MONITORING
# ═══════════════════════════════════════════════════════════════

status: ## Status applications frontend
	@echo "$(PURPLE)Frontend Applications Status:$(NC)"
	@for app in $(FRONTEND_APPS); do \
		printf "$(CYAN)%-18s$(NC) " "$$app:"; \
		if $(COMPOSE) ps $$app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			printf "$(GREEN)Running$(NC)"; \
			port=$$($(COMPOSE) ps $$app --format "{{.Ports}}" 2>/dev/null | grep -o ":[0-9]*->" | cut -d: -f2 | cut -d- -f1 | head -1); \
			if [ ! -z "$$port" ]; then \
				printf " $(YELLOW)(port $$port)$(NC)"; \
			fi; \
		else \
			printf "$(RED)Stopped$(NC)"; \
		fi; \
		printf "\n"; \
	done

show-urls: ## Affichage des URLs frontend
	@echo ""
	@echo "$(CYAN)═══ FRONTEND APPLICATIONS ═══$(NC)"
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)📊 Admin Dashboard: $(NC)http://localhost:3000"; \
	fi
	@if $(COMPOSE) ps email-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)📧 Email App:       $(NC)http://localhost:8094"; \
	fi
	@if $(COMPOSE) ps password-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🔒 Password App:    $(NC)http://localhost:8095"; \
	fi

logs-all: ## Logs toutes les applications
	@$(COMPOSE) logs -f $(FRONTEND_APPS)

logs-admin: ## Logs admin dashboard
	@$(COMPOSE) logs -f admin-dashboard

logs-email: ## Logs email app
	@$(COMPOSE) logs -f email-app

logs-password: ## Logs password app
	@$(COMPOSE) logs -f password-app

# ═══════════════════════════════════════════════════════════════
# SHELLS - ACCÈS CONTENEURS
# ═══════════════════════════════════════════════════════════════

shell-admin: ## Shell admin dashboard
	@$(COMPOSE) exec admin-dashboard /bin/sh

shell-email: ## Shell email app
	@$(COMPOSE) exec email-app /bin/sh

shell-password: ## Shell password app
	@$(COMPOSE) exec password-app /bin/sh

# ═══════════════════════════════════════════════════════════════
# INSTALLATION & SETUP
# ═══════════════════════════════════════════════════════════════

setup: ## Setup toutes les applications
	$(call log_info,"⚙️ Setup frontend applications")
	@for app in $(FRONTEND_APPS); do \
		if [ -d "$$app" ]; then \
			$(call log_info,"Setup $$app"); \
			if [ -f "$$app/package.json" ]; then \
				cd $$app && npm install; \
				cd ..; \
			fi; \
		fi; \
	done
	$(call log_success,"Frontend setup terminé")

setup-admin: ## Setup admin dashboard
	@if [ -d "admin-dashboard" ]; then \
		cd admin-dashboard && npm install; \
	fi

setup-email: ## Setup email app
	@if [ -d "email-app" ]; then \
		cd email-app && npm install; \
	fi

setup-password: ## Setup password app
	@if [ -d "password-app" ]; then \
		cd password-app && npm install; \
	fi

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage applications frontend
	$(call log_info,"🧹 Nettoyage frontend")
	@$(COMPOSE) stop $(FRONTEND_APPS)
	@$(COMPOSE) rm -f $(FRONTEND_APPS)
	$(call log_success,"Frontend nettoyé")

clean-node-modules: ## Suppression node_modules
	$(call log_warning,"🧹 Suppression node_modules")
	@for app in $(FRONTEND_APPS); do \
		if [ -d "$$app/node_modules" ]; then \
			echo "Suppression $$app/node_modules"; \
			rm -rf $$app/node_modules; \
		fi; \
	done
	$(call log_success,"node_modules supprimés")

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS PRATIQUES
# ═══════════════════════════════════════════════════════════════

up: dev-all ## Alias pour dev-all

down: stop-all ## Alias pour stop-all

ps: status ## Alias pour status

restart: ## Redémarrage complet frontend
	@$(MAKE) stop-all
	@sleep 2
	@$(MAKE) dev-all

# Raccourcis par application
admin: admin-dashboard ## Raccourci admin dashboard

email: email-app ## Raccourci email app

password: password-app ## Raccourci password app