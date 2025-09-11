# Makefile Principal - SANS COULEURS - VERSION FINALE
.PHONY: help setup dev clean status health

COMPOSE = docker compose

# Services essentiels
INFRASTRUCTURE_SERVICES := postgres redis
BACKEND_CORE_SERVICES := auth-service api-gateway admin-service
EMAIL_SERVICES := email-service alias-service
FRONTEND_SERVICES := admin-dashboard email-app

ALL_BACKEND := $(BACKEND_CORE_SERVICES) $(EMAIL_SERVICES)

help: ## Aide Cloudity - Système Email paul@delhomme.ovh
	@echo "🚀 CLOUDITY - Système Email paul@delhomme.ovh"
	@echo ""
	@echo "DÉMARRAGE RAPIDE:"
	@echo "make quick-start    # Infrastructure + Backend + Admin Dashboard"
	@echo "make dev-email      # + Email complet (paul@delhomme.ovh)"
	@echo ""
	@echo "COMMANDES DISPONIBLES:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "%-20s %s\n", $$1, $$2}'

# ═══════════════════════════════════════════════════════════════
# DÉMARRAGES ORCHESTRÉS
# ═══════════════════════════════════════════════════════════════

quick-start: ## Démarrage essentiel (infrastructure + backend + admin)
	@echo "🚀 Démarrage rapide Cloudity"
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@sleep 2
	@$(MAKE) admin-dashboard
	@echo ""
	@$(MAKE) show-urls
	@echo "✅ Cloudity essentiel opérationnel - paul@delhomme.ovh prêt!"

dev-email: ## Système email complet paul@delhomme.ovh
	@echo "⚙️ Démarrage système email paul@delhomme.ovh"
	@$(MAKE) infra-start
	@sleep 3
	@$(MAKE) backend-core
	@sleep 2
	@$(MAKE) email-app
	@echo ""
	@$(MAKE) show-urls
	@echo "✅ Système email paul@delhomme.ovh opérationnel!"

# ═══════════════════════════════════════════════════════════════
# INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════

infra-start: ## Infrastructure (PostgreSQL + Redis)
	@echo "ℹ️ Démarrage infrastructure"
	@$(COMPOSE) up -d $(INFRASTRUCTURE_SERVICES)
	@$(MAKE) wait-postgres
	@echo "✅ Infrastructure prête"

wait-postgres: ## Attendre PostgreSQL
	@echo "Attente PostgreSQL..."
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if docker compose exec postgres pg_isready -U cloudity_admin >/dev/null 2>&1; then \
			echo "PostgreSQL prêt!"; \
			break; \
		fi; \
		sleep 2; \
		timeout=$$((timeout-2)); \
	done; \
	if [ $$timeout -le 0 ]; then \
		echo "PostgreSQL timeout"; \
		exit 1; \
	fi

# ═══════════════════════════════════════════════════════════════
# BACKEND SERVICES
# ═══════════════════════════════════════════════════════════════

backend-core: ## Services backend core (auth + gateway + admin)
	@echo "ℹ️ Démarrage backend core"
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	@echo "✅ Backend core opérationnel"

auth-service: ## Service authentification
	@echo "ℹ️ Démarrage auth service"
	@$(COMPOSE) up -d auth-service
	@echo "✅ Auth service: http://localhost:8081"

api-gateway: ## API Gateway
	@echo "ℹ️ Démarrage API Gateway"
	@$(COMPOSE) up -d api-gateway
	@echo "✅ API Gateway: http://localhost:8000"

admin-service: ## Service administration
	@echo "ℹ️ Démarrage admin service"
	@$(COMPOSE) up -d admin-service
	@echo "✅ Admin service: http://localhost:8082"

# ═══════════════════════════════════════════════════════════════
# FRONTEND APPLICATIONS
# ═══════════════════════════════════════════════════════════════

admin-dashboard: ## Dashboard administration
	@echo "ℹ️ Démarrage admin dashboard"
	@$(COMPOSE) up -d admin-dashboard
	@echo "✅ Admin dashboard: http://localhost:3000"

email-app: ## Application email paul@delhomme.ovh
	@echo "ℹ️ Démarrage email app"
	@$(COMPOSE) up -d email-app
	@echo "✅ Email app: http://localhost:8094"

# ═══════════════════════════════════════════════════════════════
# MONITORING SIMPLIFIÉ SANS COULEURS
# ═══════════════════════════════════════════════════════════════

status: ## Status services
	@echo "═══ STATUS CLOUDITY ═══"
	@echo ""
	@echo "Infrastructure:"
	@for service in $(INFRASTRUCTURE_SERVICES); do \
		if docker compose ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$$service: Running"; \
		else \
			echo "$$service: Stopped"; \
		fi; \
	done
	@echo ""
	@echo "Backend Services:"
	@for service in $(BACKEND_CORE_SERVICES); do \
		if docker compose ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$$service: Running"; \
		else \
			echo "$$service: Stopped"; \
		fi; \
	done
	@echo ""
	@echo "Frontend Applications:"
	@for service in $(FRONTEND_SERVICES); do \
		if docker compose ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$$service: Running"; \
		else \
			echo "$$service: Stopped"; \
		fi; \
	done

health: ## Health check services
	@echo "ℹ️ Health check global"
	@echo "Test des endpoints:"
	@if docker compose ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8000/health >/dev/null && echo "✓ API Gateway" || echo "✗ API Gateway"; \
	fi
	@if docker compose ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8081/health >/dev/null && echo "✓ Auth Service" || echo "✗ Auth Service"; \
	fi

show-urls: ## URLs d'accès aux services
	@echo ""
	@echo "═══ SERVICES PAUL@DELHOMME.OVH ═══"
	@if docker compose ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "📊 Admin Dashboard: http://localhost:3000"; \
	fi
	@if docker compose ps email-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "📧 Email App:       http://localhost:8094"; \
	fi
	@if docker compose ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "🌐 API Gateway:     http://localhost:8000"; \
	fi
	@if docker compose ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "🔐 Auth Service:    http://localhost:8081"; \
	fi
	@echo "🗄️  Adminer:        http://localhost:8083"
	@echo ""

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION UTILISATEUR ADMIN - UTILISE LES TABLES EXISTANTES
# ═══════════════════════════════════════════════════════════════

create-admin-paul: ## Créer l'utilisateur admin paul@delhomme.ovh
	@echo "ℹ️ Création utilisateur admin paul@delhomme.ovh"
	@docker compose exec postgres psql -U cloudity_admin -d cloudity -c "\
	-- Utilisateur avec le vrai email paul@delhomme.ovh \
	INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, created_at) \
	SELECT t.id, 'paul@delhomme.ovh', '\$$2b\$$12\$$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqyT4/OEo48wGCcFCCfr2JW', 'Paul', 'Delhomme', 'admin', true, NOW() \
	FROM tenants t WHERE t.name = 'Admin Tenant' \
	ON CONFLICT (tenant_id, email) DO UPDATE SET \
		password_hash = EXCLUDED.password_hash, \
		first_name = EXCLUDED.first_name, \
		last_name = EXCLUDED.last_name, \
		role = EXCLUDED.role, \
		is_active = true, \
		updated_at = NOW();"
	@echo "✅ Utilisateur admin créé: paul@delhomme.ovh"
	@echo "   Mot de passe: Pavel180400&Ovh@Delhomme"
	@echo "   Tenant: Admin Tenant (admin)"

show-admin-users: ## Voir les utilisateurs admin existants
	@echo "ℹ️ Utilisateurs admin existants:"
	@docker compose exec postgres psql -U cloudity_admin -d cloudity -c "\
	SELECT u.email, u.first_name, u.last_name, u.role, u.is_active, t.name as tenant_name \
	FROM users u \
	JOIN tenants t ON u.tenant_id = t.id \
	WHERE u.role = 'admin' \
	ORDER BY u.created_at DESC;"

# ═══════════════════════════════════════════════════════════════
# LOGS
# ═══════════════════════════════════════════════════════════════

logs-all: ## Logs tous les services
	@$(COMPOSE) logs -f

logs-backend: ## Logs services backend
	@$(COMPOSE) logs -f $(BACKEND_CORE_SERVICES)

logs-frontend: ## Logs applications frontend
	@$(COMPOSE) logs -f $(FRONTEND_SERVICES)

logs-admin: ## Logs admin complet
	@$(COMPOSE) logs -f admin-service admin-dashboard

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test-health: ## Test endpoints santé
	@echo "ℹ️ Test endpoints paul@delhomme.ovh"
	@if docker compose ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8000/health && echo "✅ API Gateway OK" || echo "❌ API Gateway KO"; \
	fi
	@if docker compose ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		curl -sf http://localhost:8081/health && echo "✅ Auth Service OK" || echo "❌ Auth Service KO"; \
	fi

test-admin-login: ## Test connexion admin paul@delhomme.ovh
	@echo "ℹ️ Test connexion admin paul@delhomme.ovh"
	@echo "Test de connexion sur l'API Gateway..."
	@curl -X POST http://localhost:8000/api/v1/auth/login \
		-H "Content-Type: application/json" \
		-H "X-Tenant-ID: admin" \
		-d '{"email":"paul@delhomme.ovh","password":"Pavel180400&Ovh@Delhomme"}' \
		&& echo "✅ Connexion admin OK" || echo "❌ Vérifier que l'utilisateur est créé avec create-admin-paul"

# ═══════════════════════════════════════════════════════════════
# NETTOYAGE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage services
	@echo "ℹ️ Nettoyage services"
	@$(COMPOSE) stop
	@$(COMPOSE) rm -f

clean-all: ## Nettoyage complet + volumes
	@echo "⚠️ Nettoyage complet"
	@$(COMPOSE) down -v --remove-orphans
	@docker system prune -f
	@echo "✅ Nettoyage terminé"

# ═══════════════════════════════════════════════════════════════
# UTILITAIRES
# ═══════════════════════════════════════════════════════════════

shell: ## Menu shell services
	@echo "Services disponibles:"
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
	@echo "ℹ️ Configuration initiale Cloudity"
	@mkdir -p {backend,frontend,infrastructure,scripts}
	@echo "✅ Configuration terminée"

# ═══════════════════════════════════════════════════════════════
# RACCOURCIS
# ═══════════════════════════════════════════════════════════════

start: quick-start ## Alias quick-start
up: dev-email ## Alias dev-email (système complet)
down: stop-all ## Alias stop-all
ps: status ## Alias status

# ═══════════════════════════════════════════════════════════════
# CONTRÔLES
# ═══════════════════════════════════════════════════════════════

restart-auth: ## Redémarrage auth service
	@$(COMPOSE) restart auth-service

stop-all: ## Arrêt complet
	@$(COMPOSE) down

# ═══════════════════════════════════════════════════════════════
# INIT DATABASE - POUR LES SCRIPTS SQL
# ═══════════════════════════════════════════════════════════════

init-db: ## Initialiser la base de données avec les scripts SQL
	@echo "ℹ️ Initialisation base de données"
	@echo "Les scripts SQL sont automatiquement exécutés au démarrage de PostgreSQL"
	@echo "Vérifiez que vos fichiers sont dans infrastructure/postgresql/init/"
	@$(MAKE) show-admin-users

# ═══════════════════════════════════════════════════════════════
# WORKFLOW COMPLET PAUL@DELHOMME.OVH
# ═══════════════════════════════════════════════════════════════

paul-setup: ## Setup complet pour paul@delhomme.ovh
	@echo "🚀 Configuration complète pour paul@delhomme.ovh"
	@$(MAKE) clean-all
	@sleep 2
	@$(MAKE) quick-start
	@sleep 5
	@$(MAKE) create-admin-paul
	@sleep 2
	@$(MAKE) test-admin-login
	@echo ""
	@echo "✅ Setup complet terminé!"
	@echo "🌐 Admin Dashboard: http://localhost:3000"
	@echo "👤 Email: paul@delhomme.ovh"
	@echo "🔑 Password: Pavel180400&Ovh@Delhomme"