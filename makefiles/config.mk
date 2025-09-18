# ═══════════════════════════════════════════════════════════════
# CLOUDITY - CONFIGURATION GLOBALE
# Variables et constantes partagées par tous les modules
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# COULEURS - VERSION CORRIGÉE POUR MANJARO
# ═══════════════════════════════════════════════════════════════

# Couleurs avec echo -e pour Manjaro/Linux
RED     := $(shell echo -e "\033[0;31m")
GREEN   := $(shell echo -e "\033[0;32m")
YELLOW  := $(shell echo -e "\033[1;33m")
BLUE    := $(shell echo -e "\033[0;34m")
PURPLE  := $(shell echo -e "\033[0;35m")
CYAN    := $(shell echo -e "\033[0;36m")
WHITE   := $(shell echo -e "\033[1;37m")
GRAY    := $(shell echo -e "\033[0;37m")
NC      := $(shell echo -e "\033[0m")

# Émojis
EMOJI_SUCCESS := ✅
EMOJI_ERROR   := ❌
EMOJI_WARNING := ⚠️
EMOJI_INFO    := ℹ️
EMOJI_ROCKET  := 🚀
EMOJI_GEAR    := ⚙️
EMOJI_DATABASE := 🗄️
EMOJI_WEB     := 🌐
EMOJI_LOCK    := 🔒
EMOJI_EMAIL   := 📧
EMOJI_ADMIN   := 📊

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION DOCKER
# ═══════════════════════════════════════════════════════════════

COMPOSE := docker compose
COMPOSE_FILE := docker-compose.yml
COMPOSE_DEV_FILE := docker-compose.dev.yml
COMPOSE_PROD_FILE := docker-compose.prod.yml

# ═══════════════════════════════════════════════════════════════
# DÉFINITION DES SERVICES PAR CATÉGORIE
# ═══════════════════════════════════════════════════════════════

# Infrastructure
INFRASTRUCTURE_SERVICES := postgres redis

# Backend
BACKEND_CORE_SERVICES := auth-service api-gateway admin-service
BACKEND_EMAIL_SERVICES := email-service alias-service
BACKEND_PASSWORD_SERVICES := password-service
ALL_BACKEND_SERVICES := $(BACKEND_CORE_SERVICES) $(BACKEND_EMAIL_SERVICES) $(BACKEND_PASSWORD_SERVICES)

# Frontend
FRONTEND_SERVICES := admin-dashboard email-app password-app
FRONTEND_MOBILE := admin-mobile-app

# Tous les services
ALL_SERVICES := $(INFRASTRUCTURE_SERVICES) $(ALL_BACKEND_SERVICES) $(FRONTEND_SERVICES)

# ═══════════════════════════════════════════════════════════════
# PORTS ET URLS
# ═══════════════════════════════════════════════════════════════

# Ports Backend
API_GATEWAY_PORT := 8000
AUTH_SERVICE_PORT := 8081
ADMIN_SERVICE_PORT := 8082
EMAIL_SERVICE_PORT := 8091
ALIAS_SERVICE_PORT := 8092
PASSWORD_SERVICE_PORT := 8093

# Ports Frontend
ADMIN_DASHBOARD_PORT := 3000
EMAIL_APP_PORT := 8094
PASSWORD_APP_PORT := 8095

# Ports Infrastructure
POSTGRES_PORT := 5432
REDIS_PORT := 6379
ADMINER_PORT := 8083
REDIS_COMMANDER_PORT := 8084

# ═══════════════════════════════════════════════════════════════
# STACKS PRÉDÉFINIES
# ═══════════════════════════════════════════════════════════════

STACK_INFRA := $(INFRASTRUCTURE_SERVICES)
STACK_BACKEND := $(ALL_BACKEND_SERVICES)
STACK_FRONTEND := $(FRONTEND_SERVICES)
STACK_EMAIL := $(BACKEND_EMAIL_SERVICES) email-app
STACK_ADMIN := $(INFRASTRUCTURE_SERVICES) $(BACKEND_CORE_SERVICES) admin-dashboard
STACK_FULL := $(ALL_SERVICES)

# ═══════════════════════════════════════════════════════════════
# FONCTIONS DE LOGGING
# ═══════════════════════════════════════════════════════════════

define log_info
	@echo "$(BLUE)$(EMOJI_INFO) $(1)$(NC)"
endef

define log_success
	@echo "$(GREEN)$(EMOJI_SUCCESS) $(1)$(NC)"
endef

define log_warning
	@echo "$(YELLOW)$(EMOJI_WARNING) $(1)$(NC)"
endef

define log_error
	@echo "$(RED)$(EMOJI_ERROR) $(1)$(NC)"
endef

define log_rocket
	@echo "$(PURPLE)$(EMOJI_ROCKET) $(1)$(NC)"
endef

define log_gear
	@echo "$(CYAN)$(EMOJI_GEAR) $(1)$(NC)"
endef

# ═══════════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES
# ═══════════════════════════════════════════════════════════════

define wait_for_postgres
	@echo "$(YELLOW)Attente PostgreSQL...$(NC)"
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if $(COMPOSE) exec postgres pg_isready -U cloudity_admin >/dev/null 2>&1; then \
			echo "$(GREEN)PostgreSQL prêt!$(NC)"; \
			break; \
		fi; \
		sleep 2; \
		timeout=$$((timeout-2)); \
	done; \
	if [ $$timeout -le 0 ]; then \
		echo "$(RED)PostgreSQL timeout$(NC)"; \
		exit 1; \
	fi
endef

define check_service_status
	@if $(COMPOSE) ps $(1) --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)$(1): Running$(NC)"; \
	else \
		echo "$(RED)$(1): Stopped$(NC)"; \
	fi
endef

define show_service_url
	@if $(COMPOSE) ps $(1) --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)$(3) $(1): $(NC)$(2)"; \
	fi
endef
