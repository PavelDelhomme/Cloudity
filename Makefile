# Makefile principal - Cloudity SIMPLIFIÉ ET CORRIGÉ
.PHONY: help setup dev clean status health

include scripts/colors.mk

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION - SERVICES ESSENTIELS UNIQUEMENT
# ═══════════════════════════════════════════════════════════════

COMPOSE = docker compose

# Services essentiels uniquement
INFRASTRUCTURE_SERVICES := postgres redis
BACKEND_CORE_SERVICES := auth-service api-gateway admin-service
EMAIL_SERVICES := alias-service email-service mail-server
FRONTEND_SERVICES := admin-dashboard email-app

# Services complets
BACKEND_SERVICES := $(BACKEND_CORE_SERVICES) $(EMAIL_SERVICES)
ALL_SERVICES := $(BACKEND_SERVICES) $(FRONTEND_SERVICES)

help: ## Aide Cloudity - Services Essentiels
	@echo "$(GREEN)🚀 CLOUDITY - Services Essentiels$(NC)"
	@echo ""
	@echo "$(CYAN)═══ DÉMARRAGE RAPIDE ═══$(NC)"
	@echo "$(GREEN)make quick-start    $(NC)# Infrastructure + Auth + Admin Dashboard"
	@echo "$(GREEN)make dev-email      $(NC)# + Services Email complets"
	@echo ""
	@echo "$(CYAN)═══ COMMANDES DISPONIBLES ═══$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGES ORCHESTRÉS
# ═══════════════════════════════════════════════════════════════

quick-start: ## Démarrage essentiel (infra + backend core + admin dashboard)
	$(call log_rocket,"Démarrage rapide Cloudity")
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@sleep 2
	@$(MAKE) admin-dashboard
	@echo ""
	@$(MAKE) show-urls
	$(call log_success,"Cloudity essentiel opérationnel!")

dev-email: ## Environnement email complet (infra + backend + email frontend)
	$(call log_gear,"Démarrage système email complet")
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@$(MAKE) email-services
	@sleep 2
	@$(MAKE) email-app
	@echo ""
	@$(MAKE) show-urls
	$(call log_success,"Système email opérationnel!")

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

backend-core: ## Services backend essentiels (auth + gateway + admin)
	$(call log_info,"Démarrage backend core")
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	$(call log_success,"Backend core opérationnel")

email-services: ## Services email backend
	$(call log_info,"Démarrage services email")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "email-service"; then \
		$(COMPOSE) up -d email-service; \
		echo "$(GREEN)Email service démarré$(NC)"; \
	else \
		echo "$(YELLOW)Email service non configuré$(NC)"; \
	fi
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "alias-service"; then \
		$(COMPOSE) up -d alias-service; \
		echo "$(GREEN)Alias service démarré$(NC)"; \
	else \
		echo "$(YELLOW)Alias service non configuré$(NC)"; \
	fi
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "mail-server"; then \
		$(COMPOSE) up -d mail-server; \
		echo "$(GREEN)Mail server démarré$(NC)"; \
	else \
		echo "$(YELLOW)Mail server non configuré$(NC)"; \
	fi
	$(call log_success,"Services email opérationnels")

# Services individuels
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

# ═══════════════════════════════════════════════════════════════
# FRONTEND APPLICATIONS
# ═══════════════════════════════════════════════════════════════

admin-dashboard: ## Dashboard administration
	$(call log_info,"Démarrage admin dashboard")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "admin-dashboard"; then \
		$(COMPOSE) up -d admin-dashboard; \
		$(call log_success,"Admin dashboard: http://localhost:3000"); \
	else \
		$(call log_warning,"Admin dashboard non configuré dans docker-compose.yml"); \
		echo "$(YELLOW)Ajoutez la configuration admin-dashboard à docker-compose.yml$(NC)"; \
	fi

email-app: ## Application email frontend
	$(call log_info,"Démarrage email app")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "email-app"; then \
		$(COMPOSE) up -d email-app; \
		$(call log_success,"Email app: http://localhost:8094"); \
	else \
		$(call log_warning,"Email app non configurée dans docker-compose.yml"); \
	fi

# ═══════════════════════════════════════════════════════════════
# CONTRÔLES
# ═══════════════════════════════════════════════════════════════

restart-auth: ## Redémarrage auth service
	@$(COMPOSE) restart auth-service

restart-gateway: ## Redémarrage API gateway
	@$(COMPOSE) restart api-gateway

restart-admin: ## Redémarrage admin service + dashboard
	@$(COMPOSE) restart admin-service
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		$(COMPOSE) restart admin-dashboard; \
	fi

stop-backend: ## Arrêt services backend
	@$(COMPOSE) stop $(BACKEND_SERVICES)

stop-frontend: ## Arrêt applications frontend
	@$(COMPOSE) stop $(FRONTEND_SERVICES)

stop-all: ## Arrêt complet
	@$(COMPOSE) down

# ═══════════════════════════════════════════════════════════════
# MONITORING
# ═══════════════════════════════════════════════════════════════

status: ## Status détaillé services
	$(call show_header,"STATUS CLOUDITY")
	@echo "$(PURPLE)Infrastructure:$(NC)"
	@for service in $(INFRASTRUCTURE_SERVICES); do \
		$(call check_service_status,$$service); \
	done
	@echo ""
	@echo "$(PURPLE)Backend Services:$(NC)"
	@for service in $(BACKEND_CORE_SERVICES); do \
		$(call check_service_status,$$service); \
	done
	@echo ""
	@echo "$(PURPLE)Email Services:$(NC)"
	@for service in $(EMAIL_SERVICES); do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			$(call check_service_status,$$service); \
		else \
			echo "$(GRAY)$$service: Non configuré$(NC)"; \
		fi; \
	done
	@echo ""
	@echo "$(PURPLE)Frontend Services:$(NC)"
	@for service in $(FRONTEND_SERVICES); do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			$(call check_service_status,$$service); \
		else \
			echo "$(GRAY)$$service: Non configuré$(NC)"; \
		fi; \
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
	@if $(COMPOSE) ps admin-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8082/health >/dev/null && echo "$(GREEN)✓ Admin Service$(NC)" || echo "$(RED)✗ Admin Service$(NC)"; \
	fi

show-urls: ## URLs d'accès aux services
	@echo ""
	@echo "$(CYAN)═══ SERVICES DISPONIBLES ═══$(NC)"
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)📊 Admin Dashboard: $(NC)http://localhost:3000"; \
	fi
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🌐 API Gateway:     $(NC)http://localhost:8000"; \
	fi
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🔐 Auth Service:    $(NC)http://localhost:8081"; \
	fi
	@if $(COMPOSE) ps admin-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)⚙️  Admin Service:   $(NC)http://localhost:8082"; \
	fi
	@if $(COMPOSE) ps email-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)📧 Email App:       $(NC)http://localhost:8094"; \
	fi
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🦀 Email Service:   $(NC)http://localhost:8091"; \
	fi
	@echo "$(GREEN)🗄️  Adminer:        $(NC)http://localhost:8083"
	@echo ""

# ═══════════════════════════════════════════════════════════════
# LOGS
# ═══════════════════════════════════════════════════════════════

logs-all: ## Logs tous les services
	@$(COMPOSE) logs -f

logs-backend: ## Logs services backend
	@$(COMPOSE) logs -f $(BACKEND_CORE_SERVICES)

logs-auth: ## Logs auth service
	@$(COMPOSE) logs -f auth-service

logs-admin: ## Logs admin service + dashboard
	@services="admin-service"; \
	if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		services="$$services admin-dashboard"; \
	fi; \
	$(COMPOSE) logs -f $$services

logs-email: ## Logs services email
	@services=""; \
	for service in email-service alias-service mail-server email-app; do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			services="$$services $$service"; \
		fi; \
	done; \
	if [ ! -z "$$services" ]; then \
		$(COMPOSE) logs -f $$services; \
	else \
		echo "$(YELLOW)Aucun service email démarré$(NC)"; \
	fi

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test-health: ## Test endpoints santé
	$(call log_info,"Test endpoints")
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8000/health && echo "$(GREEN)✅ API Gateway OK$(NC)" || echo "$(RED)❌ API Gateway KO$(NC)"; \
	fi
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8081/health && echo "$(GREEN)✅ Auth Service OK$(NC)" || echo "$(RED)❌ Auth Service KO$(NC)"; \
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
# UTILITAIRES
# ═══════════════════════════════════════════════════════════════

shell: ## Menu shell services
	@echo "$(CYAN)Services disponibles:$(NC)"
	@echo "1) auth-service    2) api-gateway    3) admin-service"
	@echo "4) admin-dashboard 5) postgres       6) redis"
	@read -p "Choisir (1-6): " choice; \
	case $$choice in \
		1) $(COMPOSE) exec auth-service /bin/sh ;; \
		2) $(COMPOSE) exec api-gateway /bin/sh ;; \
		3) $(COMPOSE) exec admin-service /bin/bash ;; \
		4) $(COMPOSE) exec admin-dashboard /bin/sh ;; \
		5) $(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity ;; \
		6) $(COMPOSE) exec redis redis-cli ;; \
		*) echo "Choix invalide" ;; \
	esac

setup: ## Configuration initiale
	$(call log_info,"Configuration initiale Cloudity")
	$(call check_docker)
	@mkdir -p {backend,frontend,infrastructure,scripts}
	$(call log_success,"Configuration terminée")

# Configuration DNS pour delhomme.ovh
setup-delhomme: ## Configuration DNS delhomme.ovh
	$(call log_info,"Configuration DNS delhomme.ovh")
	@echo "$(YELLOW)DNS Records à configurer:$(NC)"
	@echo "MX    10 mail.delhomme.ovh"
	@echo "A     mail.delhomme.ovh -> [votre_ip]"
	@echo "A     alias.delhomme.ovh -> [votre_ip]"
	@echo "TXT   \"v=spf1 mx ~all\""
	@echo "TXT   _dmarc \"v=DMARC1; p=none; rua=mailto:paul@delhomme.ovh\""
	$(call log_success,"Configuration DNS documentée")

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS
# ═══════════════════════════════════════════════════════════════

start: quick-start ## Alias quick-start
up: quick-start ## Alias quick-start  
down: stop-all ## Alias stop-all
ps: status ## Alias status