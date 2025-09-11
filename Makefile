# Makefile principal - Cloudity Orchestrateur CORRIGÉ ET UNIFIÉ
.PHONY: help setup dev prod clean status health

include scripts/colors.mk

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

DOCKER_COMPOSE_VERSION := $(shell docker compose version 2>/dev/null)
ifdef DOCKER_COMPOSE_VERSION
	COMPOSE = docker compose
else
	COMPOSE = docker-compose
endif

# Services par catégorie - CORRIGÉS selon docker-compose.yml
INFRASTRUCTURE_SERVICES := postgres redis
BACKEND_CORE_SERVICES := auth-service api-gateway admin-service
EMAIL_SERVICES := alias-service email-service mail-server
PASSWORD_SERVICES := password-service
FRONTEND_SERVICES := admin-dashboard email-app password-app
ALL_BACKEND := $(BACKEND_CORE_SERVICES) $(EMAIL_SERVICES) $(PASSWORD_SERVICES)

help: ## Aide principale Cloudity - Gestion par Makefiles
	@printf "$(GREEN)🚀 CLOUDITY - Écosystème Cloud Multi-Tenant$(NC)\n"
	@printf "$(YELLOW)Architecture modulaire avec gestion granulaire$(NC)\n"
	@printf "\n"
	@printf "$(CYAN)═══ DÉMARRAGE RAPIDE ═══$(NC)\n"
	@printf "$(GREEN)make quick-start    $(NC)# Infrastructure + Auth + Admin (recommandé)\n"
	@printf "$(GREEN)make dev-full       $(NC)# Environnement complet\n"
	@printf "\n"
	@printf "$(CYAN)═══ GESTION PAR SERVICES ═══$(NC)\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@printf "\n"
	@printf "$(CYAN)═══ MODULES SPÉCIALISÉS ═══$(NC)\n"
	@printf "$(YELLOW)Infrastructure:$(NC) make -C infrastructure help\n"
	@printf "$(YELLOW)Backend:$(NC)       make -C backend help\n"  
	@printf "$(YELLOW)Frontend:$(NC)      make -C frontend help\n"

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGES ORCHESTRÉS
# ═══════════════════════════════════════════════════════════════

quick-start: ## Démarrage essentiel (infra + auth + admin)
	$(call log_info,"🚀 Démarrage rapide Cloudity")
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@sleep 2
	@$(MAKE) frontend-admin
	@printf "\n"
	@$(MAKE) show-urls
	$(call log_success,"Cloudity essentiel démarré!")

dev-full: ## Environnement développement complet (services existants)
	$(call log_info,"🔥 Démarrage environnement complet")
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-available
	@sleep 2
	@$(MAKE) frontend-available
	$(call log_success,"Environnement complet opérationnel")
	@$(MAKE) show-urls

dev-email: ## Environnement email (infra + backend + frontend email)
	$(call log_info,"📧 Démarrage système email")
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@$(MAKE) email-services-available
	@sleep 2
	@$(MAKE) email-frontend-available
	$(call log_success,"Système email opérationnel")

# ═══════════════════════════════════════════════════════════════
# GESTION INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════

infra-start: ## Infrastructure uniquement (PostgreSQL + Redis)
	$(call log_info,"🏗️ Démarrage infrastructure")
	@$(COMPOSE) up -d $(INFRASTRUCTURE_SERVICES)
	@$(MAKE) -C infrastructure wait-postgres
	$(call log_success,"Infrastructure prête")

infra-setup: ## Configuration initiale infrastructure + BDD
	$(call log_info,"⚙️ Setup infrastructure")
	@$(MAKE) -C infrastructure setup
	@$(MAKE) infra-start
	@$(MAKE) -C infrastructure db-init
	$(call log_success,"Infrastructure configurée")

infra-reset: ## Reset complet infrastructure + données
	$(call log_warning,"🔄 Reset infrastructure")
	@$(COMPOSE) down postgres redis -v
	@$(MAKE) infra-setup

# ═══════════════════════════════════════════════════════════════
# GESTION BACKEND - GRANULAIRE ET SÉCURISÉE
# ═══════════════════════════════════════════════════════════════

backend-core: ## Services backend essentiels (auth + gateway + admin)
	$(call log_info,"🔧 Démarrage backend core")
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	$(call log_success,"Backend core opérationnel")

backend-available: ## Tous les services backend disponibles
	$(call log_info,"🔧 Démarrage backend complet")
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	@# Démarrer seulement les services qui existent
	@services_to_start=""; \
	for service in email-service alias-service mail-server password-service; do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			services_to_start="$$services_to_start $$service"; \
		fi; \
	done; \
	if [ ! -z "$$services_to_start" ]; then \
		$(COMPOSE) up -d $$services_to_start; \
	fi
	$(call log_success,"Backend complet opérationnel")

auth-service: ## Service authentification uniquement
	$(call log_info,"🔐 Démarrage service authentification")
	@$(COMPOSE) up -d auth-service
	$(call log_success,"Auth service: http://localhost:8081")

api-gateway: ## API Gateway uniquement
	$(call log_info,"🌐 Démarrage API Gateway")
	@$(COMPOSE) up -d api-gateway
	$(call log_success,"API Gateway: http://localhost:8000")

admin-service: ## Service administration uniquement
	$(call log_info,"⚙️ Démarrage service admin")
	@$(COMPOSE) up -d admin-service
	$(call log_success,"Admin service: http://localhost:8082")

# ═══════════════════════════════════════════════════════════════
# GESTION EMAIL - COMPLET ET SÉCURISÉ
# ═══════════════════════════════════════════════════════════════

email-services-available: ## Services email backend disponibles
	$(call log_info,"📧 Démarrage services email")
	@services_to_start=""; \
	for service in email-service alias-service mail-server; do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			services_to_start="$$services_to_start $$service"; \
		fi; \
	done; \
	if [ ! -z "$$services_to_start" ]; then \
		$(COMPOSE) up -d $$services_to_start; \
		$(call log_success,"Services email opérationnels"); \
	else \
		$(call log_warning,"Aucun service email configuré dans docker-compose"); \
	fi

alias-service: ## Service alias uniquement (si disponible)
	$(call log_info,"🏷️ Démarrage service alias")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "alias-service"; then \
		$(COMPOSE) up -d alias-service; \
		$(call log_success,"Alias service: http://localhost:8092"); \
	else \
		$(call log_warning,"Alias service non configuré dans docker-compose"); \
	fi

email-rust: ## Service email Rust uniquement (si disponible)
	$(call log_info,"🦀 Démarrage service email Rust")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "email-service"; then \
		$(COMPOSE) up -d email-service; \
		$(call log_success,"Email service: http://localhost:8091"); \
	else \
		$(call log_warning,"Email service non configuré - aller dans backend/email-service et faire 'make init-project'"); \
	fi

mail-server: ## Serveur mail complet (si disponible)
	$(call log_info,"📮 Démarrage serveur mail")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "mail-server"; then \
		$(COMPOSE) up -d mail-server; \
		$(call log_success,"Mail server opérationnel"); \
	else \
		$(call log_warning,"Mail server non configuré dans docker-compose"); \
	fi

# ═══════════════════════════════════════════════════════════════
# GESTION FRONTEND - PAR APPLICATION
# ═══════════════════════════════════════════════════════════════

frontend-available: ## Frontends disponibles
	$(call log_info,"🎨 Démarrage frontends disponibles")
	@services_to_start=""; \
	for service in admin-dashboard email-app password-app; do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			services_to_start="$$services_to_start $$service"; \
		fi; \
	done; \
	if [ ! -z "$$services_to_start" ]; then \
		$(COMPOSE) up -d $$services_to_start; \
		$(call log_success,"Frontends opérationnels"); \
	else \
		$(call log_warning,"Aucun frontend configuré"); \
	fi

frontend-admin: admin-dashboard ## Dashboard admin (alias)

admin-dashboard: ## Dashboard administration
	$(call log_info,"📊 Démarrage admin dashboard")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "admin-dashboard"; then \
		$(COMPOSE) up -d admin-dashboard; \
		$(call log_success,"Admin dashboard: http://localhost:3000"); \
	else \
		$(call log_warning,"Admin dashboard non configuré dans docker-compose"); \
	fi

email-frontend-available: ## Frontend application email (si disponible)
	$(call log_info,"📧 Démarrage frontend email")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "email-app"; then \
		$(COMPOSE) up -d email-app; \
		$(call log_success,"Email app: http://localhost:8094"); \
	else \
		$(call log_warning,"Email app non configurée dans docker-compose"); \
	fi

password-frontend: ## Frontend password manager (si disponible)
	$(call log_info,"🔒 Démarrage frontend password")
	@if $(COMPOSE) config --services 2>/dev/null | grep -q "password-app"; then \
		$(COMPOSE) up -d password-app; \
		$(call log_success,"Password app: http://localhost:8095"); \
	else \
		$(call log_warning,"Password app non configurée dans docker-compose"); \
	fi

# ═══════════════════════════════════════════════════════════════
# CONTRÔLES INDIVIDUELS - START/STOP/RESTART
# ═══════════════════════════════════════════════════════════════

restart-auth: ## Redémarrage service auth
	$(call log_info,"🔄 Redémarrage auth service")
	@$(COMPOSE) restart auth-service

restart-gateway: ## Redémarrage API gateway  
	$(call log_info,"🔄 Redémarrage API gateway")
	@$(COMPOSE) restart api-gateway

restart-admin: ## Redémarrage admin service
	$(call log_info,"🔄 Redémarrage admin service")
	@$(COMPOSE) restart admin-service

restart-admin-dashboard: ## Redémarrage admin dashboard
	$(call log_info,"🔄 Redémarrage admin dashboard")
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		$(COMPOSE) restart admin-dashboard; \
	else \
		$(call log_warning,"Admin dashboard non démarré"); \
	fi

stop-backend: ## Arrêt services backend disponibles
	@$(COMPOSE) stop auth-service api-gateway admin-service
	@for service in email-service alias-service mail-server password-service; do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			$(COMPOSE) stop $$service; \
		fi; \
	done

stop-frontend: ## Arrêt frontends disponibles
	@for service in admin-dashboard email-app password-app; do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			$(COMPOSE) stop $$service; \
		fi; \
	done

stop-infra: ## Arrêt infrastructure
	@$(COMPOSE) stop $(INFRASTRUCTURE_SERVICES)

stop-all: ## Arrêt complet
	@$(COMPOSE) down

# ═══════════════════════════════════════════════════════════════
# MONITORING & STATUS
# ═══════════════════════════════════════════════════════════════

status: ## Status détaillé de tous les services
	@printf "$(CYAN)═══ STATUS CLOUDITY ═══$(NC)\n"
	@printf "\n"
	@printf "$(PURPLE)Infrastructure:$(NC)\n"
	@$(COMPOSE) ps postgres redis --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || printf "Aucun service infrastructure\n"
	@printf "\n"
	@printf "$(PURPLE)Backend Services:$(NC)\n"
	@$(COMPOSE) ps auth-service api-gateway admin-service --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || printf "Aucun service backend\n"
	@# Services email s'ils existent
	@services_found=false; \
	for service in email-service alias-service mail-server; do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			if [ "$$services_found" = false ]; then \
				printf "\n$(PURPLE)Email Services:$(NC)\n"; \
				services_found=true; \
			fi; \
			$(COMPOSE) ps $$service --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null; \
		fi; \
	done
	@printf "\n"
	@printf "$(PURPLE)Frontend Services:$(NC)\n"
	@services_found=false; \
	for service in admin-dashboard email-app password-app; do \
		if $(COMPOSE) config --services 2>/dev/null | grep -q "$$service"; then \
			services_found=true; \
			$(COMPOSE) ps $$service --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null; \
		fi; \
	done; \
	if [ "$$services_found" = false ]; then \
		printf "Aucun service frontend configuré\n"; \
	fi

health: ## Health check complet
	$(call log_info,"🩺 Health check global")
	@if [ -f "infrastructure/Makefile" ]; then $(MAKE) -C infrastructure health; fi
	@if [ -f "backend/Makefile" ]; then $(MAKE) -C backend health; fi

show-urls: ## Affichage des URLs d'accès
	@printf "\n"
	@printf "$(CYAN)═══ ACCÈS AUX SERVICES ═══$(NC)\n"
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)📊 Admin Dashboard: $(NC)http://localhost:3000\n"; \
	fi
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)🌐 API Gateway:     $(NC)http://localhost:8000\n"; \
	fi
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)🔐 Auth Service:    $(NC)http://localhost:8081\n"; \
	fi
	@if $(COMPOSE) ps admin-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)⚙️  Admin Service:   $(NC)http://localhost:8082\n"; \
	fi
	@if $(COMPOSE) ps email-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)📧 Email App:       $(NC)http://localhost:8094\n"; \
	fi
	@if $(COMPOSE) ps password-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)🔒 Password App:    $(NC)http://localhost:8095\n"; \
	fi
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)🦀 Email Service:   $(NC)http://localhost:8091\n"; \
	fi
	@if $(COMPOSE) ps alias-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)🏷️  Alias Service:   $(NC)http://localhost:8092\n"; \
	fi
	@printf "$(GREEN)🗄️  Adminer:        $(NC)http://localhost:8083\n"
	@printf "\n"

# ═══════════════════════════════════════════════════════════════
# LOGS & DEBUGGING
# ═══════════════════════════════════════════════════════════════

logs-all: ## Logs tous les services
	@$(COMPOSE) logs -f

logs-backend: ## Logs services backend
	@$(COMPOSE) logs -f auth-service api-gateway admin-service

logs-frontend: ## Logs services frontend
	@services=""; \
	for service in admin-dashboard email-app password-app; do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			services="$$services $$service"; \
		fi; \
	done; \
	if [ ! -z "$$services" ]; then \
		$(COMPOSE) logs -f $$services; \
	else \
		$(call log_warning,"Aucun frontend démarré"); \
	fi

logs-auth: ## Logs service auth
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
		$(call log_warning,"Aucun service email démarré"); \
	fi

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test-health: ## Test des endpoints de santé
	$(call log_info,"🧪 Test des endpoints")
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8000/health >/dev/null && printf "✅ API Gateway OK\n" || printf "❌ API Gateway KO\n"; \
	fi
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8081/health >/dev/null && printf "✅ Auth Service OK\n" || printf "❌ Auth Service KO\n"; \
	fi
	@if $(COMPOSE) ps admin-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8082/health >/dev/null && printf "✅ Admin Service OK\n" || printf "❌ Admin Service KO\n"; \
	fi

test-auth: ## Test authentification
	$(call log_info,"🔐 Test authentification")
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf -X POST http://localhost:8000/api/v1/auth/register \
			-H "Content-Type: application/json" \
			-H "X-Tenant-ID: admin" \
			-d '{"email":"test@cloudity.com","password":"password123"}' \
			>/dev/null && printf "✅ Register OK\n" || printf "⚠️ Register failed\n"; \
	else \
		$(call log_warning,"API Gateway non démarré"); \
	fi

# ═══════════════════════════════════════════════════════════════
# BASE DE DONNÉES
# ═══════════════════════════════════════════════════════════════

db-migrate: ## Migrations base de données
	@if [ -f "infrastructure/Makefile" ]; then $(MAKE) -C infrastructure db-migrate-all; fi

db-seed: ## Données par défaut
	@if [ -f "infrastructure/Makefile" ]; then $(MAKE) -C infrastructure db-seed-tenants; fi

db-reset: ## Reset complet BDD
	$(call log_warning,"🔄 Reset bases de données")
	@if [ -f "infrastructure/Makefile" ]; then $(MAKE) -C infrastructure db-reset-all; fi

db-backup: ## Sauvegarde BDD
	@if [ -f "infrastructure/Makefile" ]; then $(MAKE) -C infrastructure backup-all; fi

# ═══════════════════════════════════════════════════════════════
# NETTOYAGE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage services uniquement
	$(call log_info,"🧹 Nettoyage services")
	@$(COMPOSE) stop
	@$(COMPOSE) rm -f

clean-all: ## Nettoyage complet + volumes + images
	$(call log_warning,"🧹 Nettoyage complet")
	@$(COMPOSE) down -v --remove-orphans
	@docker system prune -af
	$(call log_success,"Nettoyage terminé")

reset-project: ## Reset complet du projet
	$(call log_warning,"♻️ Reset complet projet")
	@$(MAKE) clean-all
	@$(MAKE) infra-setup
	@$(MAKE) quick-start

# ═══════════════════════════════════════════════════════════════
# UTILITAIRES
# ═══════════════════════════════════════════════════════════════

shell: ## Menu interactif shell services
	@printf "$(CYAN)Services disponibles:$(NC)\n"
	@printf "1) auth-service      2) api-gateway      3) admin-service\n"
	@printf "4) admin-dashboard   5) postgres         6) redis\n"
	@printf "7) email-service     8) alias-service\n"
	@read -p "Choisir service (1-8): " choice; \
	case $$choice in \
		1) $(COMPOSE) exec auth-service /bin/sh ;; \
		2) $(COMPOSE) exec api-gateway /bin/sh ;; \
		3) $(COMPOSE) exec admin-service /bin/bash ;; \
		4) $(COMPOSE) exec admin-dashboard /bin/sh ;; \
		5) if [ -f "infrastructure/Makefile" ]; then $(MAKE) -C infrastructure shell-postgres; fi ;; \
		6) if [ -f "infrastructure/Makefile" ]; then $(MAKE) -C infrastructure shell-redis; fi ;; \
		7) if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then $(COMPOSE) exec email-service /bin/sh; else printf "Email service non démarré\n"; fi ;; \
		8) if $(COMPOSE) ps alias-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then $(COMPOSE) exec alias-service /bin/sh; else printf "Alias service non démarré\n"; fi ;; \
		*) printf "Choix invalide\n" ;; \
	esac

setup: ## Configuration initiale complète
	$(call log_info,"⚙️ Configuration initiale Cloudity")
	@if [ -f "infrastructure/Makefile" ]; then $(MAKE) -C infrastructure setup; fi
	@if [ -f "backend/Makefile" ]; then $(MAKE) -C backend setup; fi
	@if [ -f "frontend/Makefile" ]; then $(MAKE) -C frontend setup; fi
	$(call log_success,"Configuration terminée")

# ═══════════════════════════════════════════════════════════════
# DÉVELOPPEMENT EMAIL SPÉCIALISÉ
# ═══════════════════════════════════════════════════════════════

dev-email-complete: ## Développement email complet (backend + frontend)
	$(call log_info,"📧 Environnement email complet")
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@$(MAKE) email-services-available
	@sleep 2
	@$(MAKE) email-frontend-available
	@printf "\n"
	@printf "$(GREEN)📧 Système Email Opérationnel:$(NC)\n"
	@printf "$(YELLOW)• Admin Dashboard:$(NC) http://localhost:3000\n"
	@printf "$(YELLOW)• Email App:$(NC)       http://localhost:8094\n"
	@printf "$(YELLOW)• API Gateway:$(NC)     http://localhost:8000\n"
	@printf "$(YELLOW)• Alias Service:$(NC)   http://localhost:8092\n"

email-service: email-rust ## Alias pour email-rust

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION EMAIL DELHOMME.OVH
# ═══════════════════════════════════════════════════════════════

setup-delhomme: ## Configuration pour paul@delhomme.ovh
	$(call log_info,"🏷️ Configuration domaine delhomme.ovh")
	@printf "$(YELLOW)Configuration DNS requise:$(NC)\n"
	@printf "MX    10 mail.delhomme.ovh\n"
	@printf "A     mail.delhomme.ovh -> [votre_ip_serveur]\n"
	@printf "A     alias.delhomme.ovh -> [votre_ip_serveur]\n"
	@printf "TXT   delhomme.ovh \"v=spf1 mx ~all\"\n"
	@printf "TXT   _dmarc.delhomme.ovh \"v=DMARC1; p=none; rua=mailto:postmaster@delhomme.ovh\"\n"
	$(call log_success,"Configuration domaine documentée")

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS PRATIQUES
# ═══════════════════════════════════════════════════════════════

start: quick-start ## Alias pour quick-start

up: dev-full ## Alias pour dev-full

down: stop-all ## Alias pour stop-all

ps: status ## Alias pour status