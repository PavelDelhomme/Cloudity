# Makefile principal - Cloudity CORRIGÉ
.PHONY: help setup dev clean status health

include scripts/colors.mk

COMPOSE = docker compose

# Services essentiels (pas de password-app)
INFRASTRUCTURE_SERVICES := postgres redis
BACKEND_CORE_SERVICES := auth-service api-gateway admin-service
EMAIL_SERVICES := email-service alias-service
FRONTEND_SERVICES := admin-dashboard email-app

ALL_BACKEND := $(BACKEND_CORE_SERVICES) $(EMAIL_SERVICES)

help: ## Aide Cloudity - Système Email paul@delhomme.ovh
	@echo "$(GREEN)🚀 CLOUDITY - Système Email paul@delhomme.ovh$(NC)"
	@echo ""
	@echo "$(CYAN)═══ DÉMARRAGE RAPIDE ═══$(NC)"
	@echo "$(GREEN)make quick-start    $(NC)# Infrastructure + Backend + Admin Dashboard"
	@echo "$(GREEN)make dev-email      $(NC)# + Email complet (paul@delhomme.ovh)"
	@echo ""
	@echo "$(CYAN)═══ COMMANDES DISPONIBLES ═══$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGES ORCHESTRÉS
# ═══════════════════════════════════════════════════════════════

quick-start: ## Démarrage essentiel (infrastructure + backend + admin)
	$(call log_rocket,"Démarrage rapide Cloudity")
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@sleep 2
	@$(MAKE) admin-dashboard
	@echo ""
	@$(MAKE) show-urls
	$(call log_success,"Cloudity essentiel opérationnel - paul@delhomme.ovh prêt!")

dev-email: ## Système email complet paul@delhomme.ovh
	$(call log_gear,"Démarrage système email paul@delhomme.ovh")
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@sleep 2
	@$(MAKE) email-service
	@$(MAKE) email-app
	@echo ""
	@$(MAKE) show-urls
	$(call log_success,"Système email paul@delhomme.ovh opérationnel!")

# ═══════════════════════════════════════════════════════════════
# INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════

infra-start: ## Infrastructure (PostgreSQL + Redis)
	$(call log_info,"Démarrage infrastructure")
	@$(COMPOSE) up -d $(INFRASTRUCTURE_SERVICES)
	@$(call wait_for_postgres)
	$(call log_success,"Infrastructure prête")

# ═══════════════════════════════════════════════════════════════
# BACKEND SERVICES
# ═══════════════════════════════════════════════════════════════

backend-core: ## Services backend core (auth + gateway + admin)
	$(call log_info,"Démarrage backend core")
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	$(call log_success,"Backend core opérationnel")

backend-all: ## Tous les services backend (core + email)
	$(call log_info,"Démarrage backend complet")
	@$(COMPOSE) up -d $(ALL_BACKEND)
	$(call log_success,"Backend complet opérationnel")

auth-service: ## Service authentification
	$(call log_info,"Démarrage auth service")
	@$(COMPOSE) up -d auth-service
	$(call log_success,"Auth service: http://localhost:8081")

api-gateway: ## API Gateway
	$(call log_info,"Démarrage API Gateway")
	@$(COMPOSE) up -d api-gateway
	$(call log_success,"API Gateway: http://localhost:8000")

admin-service: ## Service administration
	$(call log_info,"Démarrage admin service")
	@$(COMPOSE) up -d admin-service
	$(call log_success,"Admin service: http://localhost:8082")

email-service: ## Service email Rust
	$(call log_info,"Démarrage email service")
	@$(COMPOSE) up -d email-service
	$(call log_success,"Email service: http://localhost:8091")

alias-service: ## Service alias paul@delhomme.ovh
	$(call log_info,"Démarrage alias service")
	@$(COMPOSE) up -d alias-service
	$(call log_success,"Alias service: http://localhost:8092")

# ═══════════════════════════════════════════════════════════════
# FRONTEND APPLICATIONS
# ═══════════════════════════════════════════════════════════════

frontend-all: ## Toutes les applications frontend
	$(call log_info,"Démarrage frontend complet")
	@$(COMPOSE) up -d $(FRONTEND_SERVICES)
	$(call log_success,"Frontend opérationnel")

admin-dashboard: ## Dashboard administration
	$(call log_info,"Démarrage admin dashboard")
	@$(COMPOSE) up -d admin-dashboard
	$(call log_success,"Admin dashboard: http://localhost:3000")

email-app: ## Application email paul@delhomme.ovh
	$(call log_info,"Démarrage email app")
	@$(COMPOSE) up -d email-app
	$(call log_success,"Email app: http://localhost:8094")

# ═══════════════════════════════════════════════════════════════
# MONITORING - CORRIGÉ
# ═══════════════════════════════════════════════════════════════

status: ## Status services
	@echo "$(CYAN)═══ STATUS CLOUDITY ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Infrastructure:$(NC)"
	@for service in $(INFRASTRUCTURE_SERVICES); do \
		$(call check_service_status,$$service); \
	done
	@echo ""
	@echo "$(PURPLE)Backend Services:$(NC)"
	@for service in $(ALL_BACKEND); do \
		$(call check_service_status,$$service); \
	done
	@echo ""
	@echo "$(PURPLE)Frontend Applications:$(NC)"
	@for service in $(FRONTEND_SERVICES); do \
		$(call check_service_status,$$service); \
	done

health: ## Health check services
	$(call log_info,"Health check global")
	@echo "$(CYAN)Test des endpoints:$(NC)"
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8000/health >/dev/null && echo "$(GREEN)✓ API Gateway$(NC)" || echo "$(RED)✗ API Gateway$(NC)"; \
	fi
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8081/health >/dev/null && echo "$(GREEN)✓ Auth Service$(NC)" || echo "$(RED)✗ Auth Service$(NC)"; \
	fi
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8091/health >/dev/null && echo "$(GREEN)✓ Email Service$(NC)" || echo "$(RED)✗ Email Service$(NC)"; \
	fi

show-urls: ## URLs d'accès aux services
	@echo ""
	@echo "$(CYAN)═══ SERVICES PAUL@DELHOMME.OVH ═══$(NC)"
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)📊 Admin Dashboard: $(NC)http://localhost:3000"; \
	fi
	@if $(COMPOSE) ps email-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)📧 Email App:       $(NC)http://localhost:8094"; \
	fi
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🌐 API Gateway:     $(NC)http://localhost:8000"; \
	fi
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🔐 Auth Service:    $(NC)http://localhost:8081"; \
	fi
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🦀 Email Service:   $(NC)http://localhost:8091"; \
	fi
	@if $(COMPOSE) ps alias-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🏷️  Alias Service:   $(NC)http://localhost:8092"; \
	fi
	@echo "$(GREEN)🗄️  Adminer:        $(NC)http://localhost:8083"
	@echo ""

# ═══════════════════════════════════════════════════════════════
# LOGS
# ═══════════════════════════════════════════════════════════════

logs-all: ## Logs tous les services
	@$(COMPOSE) logs -f

logs-backend: ## Logs services backend
	@$(COMPOSE) logs -f $(ALL_BACKEND)

logs-frontend: ## Logs applications frontend
	@$(COMPOSE) logs -f $(FRONTEND_SERVICES)

logs-email: ## Logs système email complet
	@$(COMPOSE) logs -f email-service email-app

logs-admin: ## Logs admin complet
	@$(COMPOSE) logs -f admin-service admin-dashboard

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test-health: ## Test endpoints santé
	$(call log_info,"Test endpoints paul@delhomme.ovh")
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8000/health && echo "$(GREEN)✅ API Gateway OK$(NC)" || echo "$(RED)❌ API Gateway KO$(NC)"; \
	fi
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8081/health && echo "$(GREEN)✅ Auth Service OK$(NC)" || echo "$(RED)❌ Auth Service KO$(NC)"; \
	fi
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8091/health && echo "$(GREEN)✅ Email Service OK$(NC)" || echo "$(RED)❌ Email Service KO$(NC)"; \
	fi

# ═══════════════════════════════════════════════════════════════
# NETTOYAGE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage services
	$(call log_info,"Nettoyage services")
	@$(COMPOSE) stop
	@$(COMPOSE) rm -f

clean-all: ## Nettoyage complet + volumes
	$(call log_warning,"Nettoyage complet")
	@$(COMPOSE) down -v --remove-orphans
	@docker system prune -f
	$(call log_success,"Nettoyage terminé")

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION PAUL@DELHOMME.OVH
# ═══════════════════════════════════════════════════════════════

setup-delhomme: ## Configuration DNS paul@delhomme.ovh
	$(call log_info,"Configuration DNS paul@delhomme.ovh")
	@echo "$(YELLOW)DNS Records à configurer pour delhomme.ovh:$(NC)"
	@echo "MX    10 mail.delhomme.ovh"
	@echo "A     mail.delhomme.ovh -> [votre_ip_serveur]" 
	@echo "A     alias.delhomme.ovh -> [votre_ip_serveur]"
	@echo "TXT   \"v=spf1 mx ~all\""
	@echo "TXT   _dmarc \"v=DMARC1; p=none; rua=mailto:paul@delhomme.ovh\""
	$(call log_success,"Configuration DNS documentée")

# ═══════════════════════════════════════════════════════════════
# UTILITAIRES
# ═══════════════════════════════════════════════════════════════

shell: ## Menu shell services
	@echo "$(CYAN)Services disponibles:$(NC)"
	@echo "1) auth-service    2) api-gateway    3) admin-service"
	@echo "4) email-service   5) admin-dashboard 6) email-app"
	@echo "7) postgres        8) redis"
	@read -p "Choisir (1-8): " choice; \
	case $$choice in \
		1) $(COMPOSE) exec auth-service /bin/sh ;; \
		2) $(COMPOSE) exec api-gateway /bin/sh ;; \
		3) $(COMPOSE) exec admin-service /bin/bash ;; \
		4) $(COMPOSE) exec email-service /bin/sh ;; \
		5) $(COMPOSE) exec admin-dashboard /bin/sh ;; \
		6) $(COMPOSE) exec email-app /bin/sh ;; \
		7) $(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity ;; \
		8) $(COMPOSE) exec redis redis-cli ;; \
		*) echo "Choix invalide" ;; \
	esac

setup: ## Configuration initiale
	$(call log_info,"Configuration initiale Cloudity")
	@mkdir -p {backend,frontend,infrastructure,scripts}
	$(call log_success,"Configuration terminée")

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS
# ═══════════════════════════════════════════════════════════════

start: quick-start ## Alias quick-start
up: dev-email ## Alias dev-email (système complet)
down: stop-all ## Alias stop-all
ps: status ## Alias status

# Raccourcis spécialisés
email: dev-email ## Alias système email complet
admin: admin-dashboard ## Alias admin dashboard

# ═══════════════════════════════════════════════════════════════
# CONTRÔLES
# ═══════════════════════════════════════════════════════════════

restart-auth: ## Redémarrage auth service
	@$(COMPOSE) restart auth-service

restart-email: ## Redémarrage services email
	@$(COMPOSE) restart email-service email-app

stop-backend: ## Arrêt services backend
	@$(COMPOSE) stop $(ALL_BACKEND)

stop-frontend: ## Arrêt applications frontend
	@$(COMPOSE) stop $(FRONTEND_SERVICES)

stop-all: ## Arrêt complet
	@$(COMPOSE) down