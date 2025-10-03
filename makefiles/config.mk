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
# STACKS PRÉDÉFINIES AVEC DÉPENDANCES
# ═══════════════════════════════════════════════════════════════

# Stacks de base
STACK_INFRA := $(INFRASTRUCTURE_SERVICES)
STACK_BACKEND := $(ALL_BACKEND_SERVICES)
STACK_FRONTEND := $(FRONTEND_SERVICES)

# Stacks applicatives complètes
STACK_ADMIN := postgres redis auth-service api-gateway admin-service admin-dashboard
STACK_EMAIL := postgres redis auth-service api-gateway email-service alias-service email-app
STACK_PASSWORD := postgres redis auth-service api-gateway password-service password-app

# Stacks futures (structure préparée)
STACK_2FA := postgres redis auth-service api-gateway 2fa-service 2fa-app
STACK_CALENDAR := postgres redis auth-service api-gateway calendar-service calendar-app
STACK_DRIVE := postgres redis auth-service api-gateway drive-service drive-app
STACK_OFFICE := postgres redis auth-service api-gateway office-service office-app
STACK_GALLERY := postgres redis auth-service api-gateway gallery-service gallery-app

# Stack complète par défaut
STACK_FULL := $(ALL_SERVICES)

# Ordre de démarrage pour les dépendances
INFRA_ORDER := postgres redis
BACKEND_CORE_ORDER := auth-service api-gateway admin-service
BACKEND_EMAIL_ORDER := email-service alias-service
BACKEND_PASSWORD_ORDER := password-service
FRONTEND_ORDER := admin-dashboard email-app password-app

# Services individuels avec leurs dépendances
DEPS_auth-service := postgres redis
DEPS_api-gateway := auth-service
DEPS_admin-service := postgres redis
DEPS_email-service := postgres redis
DEPS_alias-service := postgres
DEPS_password-service := postgres
DEPS_admin-dashboard := api-gateway
DEPS_email-app := api-gateway
DEPS_password-app := api-gateway

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

# Fonction pour démarrer un service avec ses dépendances
define start_service_with_deps
	@echo "$(CYAN)Démarrage $(1) avec dépendances...$(NC)"
	@deps="$(DEPS_$(1))"; \
	if [ -n "$$deps" ]; then \
		echo "$(YELLOW)Dépendances détectées: $$deps$(NC)"; \
		for dep in $$deps; do \
			if ! $(COMPOSE) ps $$dep --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
				echo "$(BLUE)Démarrage dépendance: $$dep$(NC)"; \
				$(COMPOSE) up -d $$dep; \
				if [ "$$dep" = "postgres" ]; then \
					$(call wait_for_postgres); \
				else \
					sleep 2; \
				fi; \
			fi; \
		done; \
	fi; \
	echo "$(GREEN)Démarrage $(1)...$(NC)"; \
	$(COMPOSE) up -d $(1); \
	sleep 2
	$(call log_success,"$(1) démarré avec succès")
endef

# Fonction pour arrêter un service
define stop_service
	@echo "$(YELLOW)Arrêt $(1)...$(NC)"
	@$(COMPOSE) stop $(1)
	$(call log_success,"$(1) arrêté")
endef

# Fonction pour redémarrer un service avec ses dépendances
define restart_service_with_deps
	@echo "$(CYAN)Redémarrage $(1)...$(NC)"
	@$(call stop_service,$(1))
	@$(call start_service_with_deps,$(1))
endef

# Fonction pour démarrer une stack complète dans l'ordre
define start_stack_ordered
	@echo "$(PURPLE)Démarrage stack $(1)...$(NC)"
	@services="$(2)"; \
	for service in $$services; do \
		if ! $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$(BLUE)Démarrage $$service...$(NC)"; \
			$(COMPOSE) up -d $$service; \
			if [ "$$service" = "postgres" ]; then \
				timeout=30; \
				while [ $$timeout -gt 0 ]; do \
					if $(COMPOSE) exec postgres pg_isready -U cloudity_admin >/dev/null 2>&1; then \
						echo "$(GREEN)PostgreSQL prêt!$(NC)"; \
						break; \
					fi; \
					sleep 2; \
					timeout=$$((timeout-2)); \
				done; \
			else \
				sleep 2; \
			fi; \
		else \
			echo "$(GREEN)$$service déjà en cours$(NC)"; \
		fi; \
	done; \
	echo "$(GREEN)✅ Stack $(1) opérationnelle$(NC)"
endef
