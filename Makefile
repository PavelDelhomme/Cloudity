.PHONY: help up down setup init dev prod build test tests clean logs backup restore services-only infrastructure-only

# Variables - Support docker-compose et docker compose
DOCKER_COMPOSE_VERSION := $(shell docker compose version 2>/dev/null)
ifdef DOCKER_COMPOSE_VERSION
    COMPOSE = docker compose
else
    COMPOSE = docker-compose
endif

COMPOSE_FILES = -f docker-compose.yml
COMPOSE_DEV = $(COMPOSE) $(COMPOSE_FILES) -f docker-compose.dev.yml
COMPOSE_PROD = $(COMPOSE) $(COMPOSE_FILES) -f docker-compose.prod.yml
COMPOSE_SERVICES = $(COMPOSE) -f docker-compose.services.yml

# Ports 60XX (voir STATUS.md)
PORT_GATEWAY = 6000
PORT_DASHBOARD = 6001
PORT_AUTH = 6081
PORT_ADMIN = 6082
PORT_POSTGRES = 6042
PORT_REDIS = 6079

help: ## Affiche ce message d'aide
	@echo 'Usage: make [target]'
	@echo ''
	@echo '  Première fois :  make setup   puis  make up-full   (stack + compte démo prêts à tester)'
	@echo ''
	@echo '  make setup      - Setup initial (.env, clés RSA, deps). À lancer une fois après clone.'
	@echo '  make up        - Démarre toute la stack (idempotent: relancer sans souci si déjà démarrée)'
	@echo '  make up-full   - Tout-en-un : down + up + seed + compte démo + make test (une seule commande)'
	@echo '  make down      - Arrête toute la stack'
	@echo '  make test       - Tests unitaires/applicatifs (Go, pytest, Vitest) — 112 tests'
	@echo '  make tests      - TOUT: unit/app + E2E + sécurité, avec rapport dans reports/test-YYYYMMDD-HHMMSS.log'
	@echo '  make test-e2e   - Tests E2E (health + proxy). Prérequis: make up puis 20-30 s'
	@echo '  make test-security - Audits deps (npm/pip/go) + checks auth 401'
	@echo '  make test-all   - TOUT: make test + test-e2e + test-security (stack up requise pour e2e)'
	@echo '  make test-full  - test-all + test-docker (tests dans les conteneurs). Stack up requise.'
	@echo '  make test-docker - Même batterie que test mais exécutée dans les conteneurs (make up avant)'
	@echo '  make quick-check - Vérifie que les services répondent (à lancer après make up)'
	@echo '  make logs       - Logs de tous les services en temps réel'
	@echo ''
	@echo 'Targets disponibles:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Démarre toute la stack (ports 60XX, profil dev pour Adminer/Redis Commander)
	@echo "🚀 Démarrage Cloudity..."
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev up -d
	@echo "✅ Stack démarrée. Accès:"
	@echo "   Dashboard:  http://localhost:$(PORT_DASHBOARD)"
	@echo "   API:        http://localhost:$(PORT_GATEWAY)"
	@echo "   Auth:       http://localhost:$(PORT_AUTH)"
	@echo "   Admin API:  http://localhost:$(PORT_ADMIN)"
	@echo "   Adminer:    http://localhost:6083  |  Redis Commander: http://localhost:6084"
	@echo ""
	@echo "Compte de démo (après make seed-admin): admin@cloudity.local / Admin123!"

up-full: down up wait-for-services seed seed-admin test ## Tout-en-un : down, up, seed, compte démo, puis lance les tests pour vérifier
	@echo "✅ Stack, compte démo et tests OK. Tester: http://localhost:$(PORT_DASHBOARD) (admin@cloudity.local / Admin123!)"

down: ## Arrête toute la stack
	@echo "🛑 Arrêt de Cloudity..."
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev down
	@echo "✅ Stack arrêtée."

setup: ## Setup initial (une fois après clone) : .env, clés RSA, deps. Puis lancer make up-full.
	@if [ ! -f scripts/setup.sh ]; then echo "❌ scripts/setup.sh introuvable."; exit 1; fi
	@./scripts/setup.sh
	@echo ""
	@echo "👉 Ensuite :  make up-full   pour démarrer la stack et créer le compte démo (prêt à tester)."

init: ## Initialisation complète du projet (première fois)
	@echo "🚀 Initialisation de Cloudity..."
	@make create-env
	@make create-go-projects
	@make create-python-project
	@make create-react-project
	@make create-flutter-project
	@make setup-infrastructure
	@echo "✅ Initialisation terminée!"

create-env: ## Crée le fichier .env
	@echo "📝 Création du fichier .env..."
	@if [ ! -f .env ]; then \
		echo "# Cloudity Environment Configuration" > .env; \
		echo "POSTGRES_USER=cloudity_admin" >> .env; \
		echo "POSTGRES_PASSWORD=cloudity_secure_password_2025" >> .env; \
		echo "POSTGRES_DB=cloudity" >> .env; \
		echo "REDIS_PASSWORD=redis_secure_password_2025" >> .env; \
		echo "JWT_SECRET=super_secret_jwt_key_change_this_in_production_2025" >> .env; \
		echo "BUILD_TARGET=dev" >> .env; \
		echo "NODE_ENV=development" >> .env; \
		echo "VITE_API_URL=" >> .env; \
		echo "✅ Fichier .env créé"; \
	else \
		echo "⚠️  Fichier .env existe déjà"; \
	fi

create-go-projects: ## Initialise les projets Go
	@echo "🔧 Initialisation des projets Go..."
	@cd backend/auth-service && go mod init github.com/pavel/cloudity/auth-service 2>/dev/null || true
	@cd backend/auth-service && go mod tidy 2>/dev/null || true
	@cd backend/api-gateway && go mod init github.com/pavel/cloudity/api-gateway 2>/dev/null || true
	@cd backend/api-gateway && go mod tidy 2>/dev/null || true
	@echo "✅ Projets Go initialisés"

create-python-project: ## Initialise le projet Python
	@echo "🐍 Initialisation du projet Python..."
	@cd backend/admin-service && python -m venv venv 2>/dev/null || true
	@echo "✅ Projet Python initialisé"

create-react-project: ## Initialise le projet React
	@echo "⚛️  Initialisation du projet React..."
	@cd frontend/admin-dashboard && npm install 2>/dev/null || true
	@echo "✅ Projet React initialisé"

create-flutter-project: ## Initialise le projet Flutter
	@echo "📱 Initialisation du projet Flutter..."
	@if command -v flutter >/dev/null 2>&1; then \
		cd mobile/admin_app && flutter pub get 2>/dev/null || true; \
		echo "✅ Projet Flutter initialisé"; \
	else \
		echo "⚠️  Flutter non installé, projet Flutter ignoré"; \
	fi

setup-infrastructure: ## Configure l'infrastructure
	@echo "🏗️  Configuration de l'infrastructure..."
	@mkdir -p storage/postgres storage/redis storage/logs storage/backups
	@chmod +x scripts/*.sh 2>/dev/null || true
	@echo "✅ Infrastructure configurée"

dev: ## Démarre l'environnement de développement (équivalent à make up)
	@$(MAKE) up

services-only: ## Démarre uniquement les services backend
	@echo "🛠️  Démarrage des services backend..."
	@$(COMPOSE_SERVICES) up -d
	@echo "✅ Services backend lancés!"

infrastructure-only: ## Démarre uniquement l'infrastructure (DB, Redis)
	@echo "🗄️  Démarrage de l'infrastructure..."
	@$(COMPOSE) $(COMPOSE_FILES) up -d postgres redis
	@echo "✅ Infrastructure lancée!"

frontend-only: ## Démarre uniquement le frontend
	@echo "🎨 Démarrage du frontend..."
	@$(COMPOSE) $(COMPOSE_FILES) up -d admin-dashboard
	@echo "✅ Frontend lancé!"

prod: ## Démarre l'environnement de production
	@echo "🚀 Démarrage de l'environnement de production..."
	@BUILD_TARGET=production $(COMPOSE_PROD) up -d
	@echo "✅ Environnement de production lancé!"

build: ## Build tous les services
	@echo "🔨 Build de tous les services..."
	@$(COMPOSE) $(COMPOSE_FILES) build --parallel --no-cache
	@echo "✅ Build terminé!"

build-auth: ## Build uniquement le service d'authentification
	@$(COMPOSE) $(COMPOSE_FILES) build auth-service

build-gateway: ## Build uniquement l'API Gateway
	@$(COMPOSE) $(COMPOSE_FILES) build api-gateway

build-admin: ## Build uniquement le service admin
	@$(COMPOSE) $(COMPOSE_FILES) build admin-service

build-dashboard: ## Build uniquement le dashboard
	@$(COMPOSE) $(COMPOSE_FILES) build admin-dashboard

# make test = unitaires + applicatifs uniquement (PAS les E2E). E2E = make test-e2e (après make up).
test: ## Lance tous les tests unitaires/applicatifs (Go, pytest, Vitest). Ne lance pas les E2E.
	@echo "🧪 Tests unitaires / applicatifs..."
	@echo "  [auth-service]"
	@(cd backend/auth-service && go test -v -count=1 ./...) || exit 1
	@echo "  [api-gateway]"
	@(cd backend/api-gateway && go test -v -count=1 ./...) || exit 1
	@echo "  [password-manager]"
	@(cd backend/password-manager && go test -v -count=1 ./...) || exit 1
	@echo "  [mail-directory-service]"
	@(cd backend/mail-directory-service && go test -v -count=1 ./...) || exit 1
	@echo "  [calendar-service]"
	@(cd backend/calendar-service && go test -v -count=1 ./...) || exit 1
	@echo "  [notes-service]"
	@(cd backend/notes-service && go test -v -count=1 ./...) || exit 1
	@echo "  [tasks-service]"
	@(cd backend/tasks-service && go test -v -count=1 ./...) || exit 1
	@echo "  [drive-service]"
	@(cd backend/drive-service && go test -v -count=1 ./...) || exit 1
	@echo "  [admin-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm admin-service python -m pytest tests/ -v --tb=short || exit 1
	@echo "  [admin-dashboard]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm admin-dashboard sh -c "npm install && npm run test" || exit 1
	@echo "✅ Tous les tests sont passés."

# make tests = tout (unit/app + E2E + sécurité) avec rapport dans reports/
tests: ## Lance tous les tests (unit/app + E2E + sécurité) et génère un rapport (reports/test-YYYYMMDD-HHMMSS.log)
	@chmod +x scripts/run-tests-with-report.sh
	@./scripts/run-tests-with-report.sh

test-all: test test-e2e test-security ## TOUT: unit/app + E2E + sécurité (stack up + 20-30 s pour E2E)

test-e2e: ## Tests E2E (stack doit être démarrée: make up; attendre 20-30 s que les services soient healthy)
	@chmod +x scripts/test-e2e.sh
	@./scripts/test-e2e.sh

test-security: ## Tests et vérifications sécurité (audits deps + checks auth)
	@chmod +x scripts/test-security.sh
	@./scripts/test-security.sh

test-docker: ## Lance les tests dans les conteneurs (make up avant). Même batterie que make test.
	@echo "🧪 Tests dans les conteneurs..."
	@$(COMPOSE) $(COMPOSE_FILES) exec -T auth-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T api-gateway go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T password-manager go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T mail-directory-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T calendar-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T notes-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T tasks-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T drive-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) run --rm admin-service python -m pytest tests/ -v --tb=short || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) run --rm admin-dashboard sh -c "npm install && npm run test" || exit 1
	@echo "✅ Tests Docker terminés."

test-full: test-all test-docker ## TOUT + tests dans les conteneurs (make up avant, puis 20-30 s)

clean: ## Arrête et supprime conteneurs + volumes
	@echo "🧹 Nettoyage complet..."
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev down -v --remove-orphans
	@$(COMPOSE_SERVICES) down -v --remove-orphans 2>/dev/null || true
	@$(COMPOSE_PROD) down -v --remove-orphans 2>/dev/null || true
	@docker system prune -f
	@echo "✅ Nettoyage terminé."

stop: ## Arrête tous les services sans supprimer les volumes (équivalent à make down)
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev stop
	@echo "✅ Services arrêtés."

restart: ## Redémarre tous les services
	@make down
	@make up

logs: ## Logs de tous les services en temps réel (Ctrl+C pour quitter)
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev logs -f

logs-auth: ## Logs du service d'authentification
	@$(COMPOSE) $(COMPOSE_FILES) logs -f auth-service

logs-gateway: ## Logs de l'API Gateway
	@$(COMPOSE) $(COMPOSE_FILES) logs -f api-gateway

logs-admin: ## Logs du service admin
	@$(COMPOSE) $(COMPOSE_FILES) logs -f admin-service

logs-dashboard: ## Logs du dashboard
	@$(COMPOSE) $(COMPOSE_FILES) logs -f admin-dashboard

logs-db: ## Logs PostgreSQL
	@$(COMPOSE) $(COMPOSE_FILES) logs -f postgres

logs-redis: ## Logs Redis
	@$(COMPOSE) $(COMPOSE_FILES) logs -f redis

shell-auth: ## Shell dans le service d'authentification
	@$(COMPOSE) $(COMPOSE_FILES) exec auth-service sh

shell-gateway: ## Shell dans l'API Gateway
	@$(COMPOSE) $(COMPOSE_FILES) exec api-gateway sh

shell-admin: ## Shell dans le service admin
	@$(COMPOSE) $(COMPOSE_FILES) exec admin-service bash

shell-dashboard: ## Shell dans le dashboard
	@$(COMPOSE) $(COMPOSE_FILES) exec admin-dashboard sh

psql: ## Se connecte à PostgreSQL
	@$(COMPOSE) $(COMPOSE_FILES) exec postgres psql -U cloudity_admin -d cloudity

redis-cli: ## Se connecte à Redis (mot de passe depuis .env)
	@$(COMPOSE) $(COMPOSE_FILES) exec redis sh -c 'redis-cli -a "$$REDIS_PASSWORD"'

migrate-mail: ## Applique le schéma mail sur une base existante (make up avant)
	@echo "📧 Application du schéma mail..."
	@cat infrastructure/postgresql/migrations/20250225_mail_schema.sql | $(COMPOSE) $(COMPOSE_FILES) exec -T postgres psql -U cloudity_admin -d cloudity -v ON_ERROR_STOP=1
	@echo "✅ Schéma mail appliqué."

migrate: ## Applique toutes les migrations non appliquées (exécuté automatiquement au make up via le service db-migrate)
	@echo "📦 Application des migrations DB..."
	@$(COMPOSE) $(COMPOSE_FILES) run --rm db-migrate
	@echo "✅ Migrations appliquées."

health: ## Vérifie la santé des services (ports 60XX)
	@echo "🏥 Vérification des services (ports 60XX)..."
	@$(COMPOSE) $(COMPOSE_FILES) ps
	@echo ""
	@echo "Connectivité:"
	@curl -s -f http://localhost:$(PORT_GATEWAY)/health >/dev/null && echo "  ✅ API Gateway (6000): OK" || echo "  ❌ API Gateway (6000): FAIL"
	@curl -s -f http://localhost:$(PORT_AUTH)/health >/dev/null && echo "  ✅ Auth Service (6081): OK" || echo "  ❌ Auth Service (6081): FAIL"
	@curl -s -f http://localhost:$(PORT_ADMIN)/health >/dev/null && echo "  ✅ Admin Service (6082): OK" || echo "  ❌ Admin Service (6082): FAIL"
	@curl -s -f http://localhost:$(PORT_DASHBOARD) >/dev/null && echo "  ✅ Dashboard (6001): OK" || echo "  ❌ Dashboard (6001): FAIL"

backup: ## Sauvegarde la base de données
	@echo "💾 Sauvegarde de la base de données..."
	@mkdir -p storage/backups
	@$(COMPOSE) $(COMPOSE_FILES) exec postgres pg_dump -U cloudity_admin cloudity | gzip > storage/backups/cloudity_$(shell date +%Y%m%d_%H%M%S).sql.gz
	@echo "✅ Sauvegarde créée dans storage/backups/"

restore: ## Restaure la dernière sauvegarde
	@echo "📥 Restauration de la base de données..."
	@gunzip -c $(shell ls -t storage/backups/*.sql.gz | head -1) | $(COMPOSE) $(COMPOSE_FILES) exec -T postgres psql -U cloudity_admin cloudity
	@echo "✅ Base de données restaurée!"

seed: ## Insère des données de test (tenants)
	@$(COMPOSE) $(COMPOSE_FILES) exec postgres psql -U cloudity_admin -d cloudity -c "INSERT INTO tenants (name, domain, database_url) VALUES ('Admin Tenant', 'admin.cloudity.local', 'postgresql://admin@localhost/admin_db'), ('Test Tenant', 'test.cloudity.local', 'postgresql://test@localhost/test_db') ON CONFLICT (domain) DO NOTHING;"
	@echo "✅ Seed OK."

seed-admin: ## Crée le compte de démo admin@cloudity.local / Admin123! (stack up, tenant 1 doit exister)
	@echo "👤 Création du compte de démo (admin@cloudity.local)..."
	@curl -sf -X POST http://localhost:$(PORT_GATEWAY)/auth/register \
	  -H "Content-Type: application/json" \
	  -d '{"email":"admin@cloudity.local","password":"Admin123!","tenant_id":"1"}' >/dev/null && \
	  echo "✅ Compte créé. Connexion: admin@cloudity.local / Admin123!" || \
	  (echo "⚠️  Le compte existe peut‑être déjà. Utilisez: admin@cloudity.local / Admin123!"; exit 0)

format: ## Formate le code de tous les services
	@echo "✨ Formatage du code..."
	@$(COMPOSE) $(COMPOSE_FILES) exec auth-service go fmt ./... 2>/dev/null || echo "⚠️  Formatage Go auth-service échoué"
	@$(COMPOSE) $(COMPOSE_FILES) exec api-gateway go fmt ./... 2>/dev/null || echo "⚠️  Formatage Go api-gateway échoué"
	@$(COMPOSE) $(COMPOSE_FILES) exec admin-service black . 2>/dev/null || echo "⚠️  Formatage Python échoué"
	@$(COMPOSE) $(COMPOSE_FILES) exec admin-dashboard npm run format 2>/dev/null || echo "⚠️  Formatage React échoué"
	@echo "✅ Formatage terminé!"

update-deps: ## Met à jour les dépendances
	@echo "🔄 Mise à jour des dépendances..."
	@cd backend/auth-service && go mod tidy && go get -u ./... 2>/dev/null || true
	@cd backend/api-gateway && go mod tidy && go get -u ./... 2>/dev/null || true
	@cd frontend/admin-dashboard && npm update 2>/dev/null || true
	@cd mobile/admin_app && flutter pub upgrade 2>/dev/null || true
	@echo "✅ Dépendances mises à jour!"

reset: ## Reset complet (clean + init + up)
	@make clean
	@make init
	@make up
	@echo "✅ Reset terminé."


diagnose: ## Lance le diagnostic complet du projet
	@echo "🔍 Diagnostic Cloudity..."
	@chmod +x scripts/diagnose.sh
	@./scripts/diagnose.sh

fix-project: ## Répare automatiquement les problèmes du projet
	@echo "🔧 Réparation automatique..."
	@chmod +x scripts/fix-project.sh
	@./scripts/fix-project.sh

step-by-step: ## Démarrage étape par étape (recommandé pour premier run)
	@echo "🏗️  Démarrage étape par étape..."
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev down -v --remove-orphans 2>/dev/null || true
	@$(COMPOSE) $(COMPOSE_FILES) build --no-cache --progress=plain
	@$(COMPOSE) $(COMPOSE_FILES) up -d postgres redis
	@echo "Attente 15 s (init DB)..."
	@sleep 15
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev up -d
	@echo "✅ Terminé."
	@make quick-check

quick-check: ## Test rapide de tous les services (ports 60XX). Lancer après: make up
	@echo "🏥 Vérification rapide (ports 60XX)..."
	@$(COMPOSE) $(COMPOSE_FILES) exec postgres pg_isready -U cloudity_admin -d cloudity 2>/dev/null && echo "  ✅ PostgreSQL (6042): OK" || echo "  ❌ PostgreSQL: FAIL"
	@$(COMPOSE) $(COMPOSE_FILES) exec redis sh -c 'redis-cli -a "$$REDIS_PASSWORD" ping' 2>/dev/null | grep -q PONG && echo "  ✅ Redis (6079): OK" || echo "  ❌ Redis: FAIL"
	@sleep 2
	@curl -sf http://localhost:$(PORT_AUTH)/health >/dev/null && echo "  ✅ Auth (6081): OK" || echo "  ❌ Auth: FAIL"
	@curl -sf http://localhost:$(PORT_GATEWAY)/health >/dev/null && echo "  ✅ API Gateway (6000): OK" || echo "  ❌ API Gateway: FAIL"
	@curl -sf http://localhost:$(PORT_ADMIN)/health >/dev/null && echo "  ✅ Admin (6082): OK" || echo "  ❌ Admin: FAIL"
	@curl -sf http://localhost:$(PORT_DASHBOARD) >/dev/null && echo "  ✅ Dashboard (6001): OK" || echo "  ❌ Dashboard: FAIL"
	@curl -sf http://localhost:6084 >/dev/null && echo "  ✅ Redis Commander (6084): OK" || echo "  ⚠️  Redis Commander (6084): non démarré (make up avec profil dev)"
	@curl -sf http://localhost:6083 >/dev/null && echo "  ✅ Adminer (6083): OK" || echo "  ⚠️  Adminer (6083): non démarré (make up avec profil dev)"

debug-logs: ## Affiche les logs des services qui posent problème
	@echo "🐛 Debug des services..."
	@echo "=== Auth Service Logs ==="
	@$(COMPOSE) $(COMPOSE_FILES) logs --tail=20 auth-service 2>/dev/null || echo "Auth service non démarré"
	@echo ""
	@echo "=== API Gateway Logs ==="
	@$(COMPOSE) $(COMPOSE_FILES) logs --tail=20 api-gateway 2>/dev/null || echo "API Gateway non démarré"
	@echo ""
	@echo "=== Admin Service Logs ==="
	@$(COMPOSE) $(COMPOSE_FILES) logs --tail=20 admin-service 2>/dev/null || echo "Admin service non démarré"
	@echo ""
	@echo "=== Frontend Logs ==="
	@$(COMPOSE) $(COMPOSE_FILES) logs --tail=20 admin-dashboard 2>/dev/null || echo "Frontend non démarré"

rebuild-force: ## Rebuild complet sans cache
	@echo "🔨 Rebuild forcé de tous les services..."
	@$(COMPOSE) $(COMPOSE_FILES) down -v --remove-orphans
	@docker system prune -f
	@$(COMPOSE) $(COMPOSE_FILES) build --no-cache --parallel
	@echo "✅ Rebuild terminé!"

status: ## Affiche l'état détaillé de tous les services
	@echo "📊 État des services Cloudity:"
	@echo "=============================="
	@$(COMPOSE) $(COMPOSE_FILES) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "Volumes:"
	@docker volume ls --filter name=cloudity --format "table {{.Name}}\t{{.Size}}"
	@echo ""
	@echo "Réseaux:"
	@docker network ls --filter name=cloudity --format "table {{.Name}}\t{{.Driver}}"

wait-for-services: ## Attend que les services soient prêts (ports 60XX)
	@echo "⏳ Attente des services (60XX)..."
	@timeout=60; \
	while [ $$timeout -gt 0 ]; do \
		if curl -sf http://localhost:$(PORT_AUTH)/health >/dev/null && \
		   curl -sf http://localhost:$(PORT_GATEWAY)/health >/dev/null && \
		   curl -sf http://localhost:$(PORT_ADMIN)/health >/dev/null; then \
			echo "✅ Services prêts."; \
			break; \
		fi; \
		echo "Attente... ($$timeout s)"; \
		sleep 5; \
		timeout=$$((timeout-5)); \
	done; \
	if [ $$timeout -eq 0 ]; then make debug-logs; fi

backend-only: ## Lance uniquement les services backend (sans frontend)
	@$(COMPOSE) $(COMPOSE_FILES) up -d postgres redis auth-service api-gateway admin-service
	@make wait-for-services

test-api: ## Test les API (ports 60XX)
	@echo "🧪 Test des API..."
	@curl -s http://localhost:$(PORT_GATEWAY)/health && echo ""
	@curl -s http://localhost:$(PORT_AUTH)/health && echo ""
	@curl -s http://localhost:$(PORT_ADMIN)/health && echo ""

emergency-reset: ## Reset d'urgence complet
	@echo "🚨 Reset d'urgence..."
	@docker stop $$(docker ps -aq --filter name=cloudity) 2>/dev/null || true
	@docker rm $$(docker ps -aq --filter name=cloudity) 2>/dev/null || true
	@docker volume rm $$(docker volume ls -q --filter name=cloudity) 2>/dev/null || true
	@docker network rm cloudity-network 2>/dev/null || true
	@docker system prune -af
	@echo "✅ Reset d'urgence terminé!"

full-setup: ## Setup complet du projet de A à Z
	@echo "🚀 Setup complet de Cloudity..."
	@make emergency-reset
	@make init
	@make step-by-step
	@make quick-check
	@echo "🎉 Setup complet terminé!"

dev-watch: ## Lance up + suivi des logs
	@$(MAKE) up
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev logs -f

# Vérifier les fichiers Dockerfile.dev
check-dockerfiles: ## Vérifie la présence et le contenu des Dockerfiles
	@echo "🔍 Vérification des Dockerfiles..."
	@if [ ! -s backend/auth-service/Dockerfile.dev ]; then \
		echo "⚠️  backend/auth-service/Dockerfile.dev est vide ou n'existe pas"; \
	else \
		echo "✅ backend/auth-service/Dockerfile.dev OK"; \
	fi
	@if [ ! -s backend/api-gateway/Dockerfile.dev ]; then \
		echo "⚠️  backend/api-gateway/Dockerfile.dev est vide ou n'existe pas"; \
	else \
		echo "✅ backend/api-gateway/Dockerfile.dev OK"; \
	fi
	@if [ ! -s backend/admin-service/Dockerfile.dev ]; then \
		echo "⚠️  backend/admin-service/Dockerfile.dev est vide ou n'existe pas"; \
	else \
		echo "✅ backend/admin-service/Dockerfile.dev OK"; \
	fi
	@if [ ! -s frontend/admin-dashboard/Dockerfile.dev ]; then \
		echo "⚠️  frontend/admin-dashboard/Dockerfile.dev est vide ou n'existe pas"; \
	else \
		echo "✅ frontend/admin-dashboard/Dockerfile.dev OK"; \
	fi

# Créer/corriger les Dockerfiles manquants
fix-dockerfiles: ## Répare ou crée les Dockerfiles manquants
	@echo "🔧 Réparation des Dockerfiles..."
	@if [ ! -s backend/auth-service/Dockerfile.dev ]; then \
		echo "FROM golang:1.21-alpine\n\nWORKDIR /app\n\nRUN apk add --no-cache git\n\nRUN go install github.com/cosmtrek/air@v1.42.0\n\nCOPY go.mod go.sum ./\nRUN go mod download\n\nCOPY . .\n\nEXPOSE 8081\n\nCMD [\"air\", \"-c\", \".air.toml\"]" > backend/auth-service/Dockerfile.dev; \
		echo "✅ backend/auth-service/Dockerfile.dev créé"; \
	fi
	@if [ ! -s backend/api-gateway/Dockerfile.dev ]; then \
		echo "FROM golang:1.21-alpine\n\nWORKDIR /app\n\nRUN apk add --no-cache git\n\nRUN go install github.com/cosmtrek/air@v1.42.0\n\nCOPY go.mod go.sum ./\nRUN go mod download\n\nCOPY . .\n\nEXPOSE 8000\n\nCMD [\"air\", \"-c\", \".air.toml\"]" > backend/api-gateway/Dockerfile.dev; \
		echo "✅ backend/api-gateway/Dockerfile.dev créé"; \
	fi
	@if [ ! -s backend/admin-service/Dockerfile.dev ]; then \
		echo "FROM python:3.11-slim\n\nENV PYTHONUNBUFFERED=1\nENV PYTHONDONTWRITEBYTECODE=1\nENV PIP_NO_CACHE_DIR=1\n\nRUN apt-get update && apt-get install -y \\\n    curl \\\n    gcc \\\n    libpq-dev \\\n    && rm -rf /var/lib/apt/lists/*\n\nWORKDIR /app\n\nRUN pip install uvicorn[standard] watchfiles\n\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\n\nCOPY . .\n\nEXPOSE 8082\n\nCMD [\"uvicorn\", \"main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8082\", \"--reload\", \"--reload-dir\", \"/app\"]" > backend/admin-service/Dockerfile.dev; \
		echo "✅ backend/admin-service/Dockerfile.dev créé"; \
	fi
	@if [ ! -s frontend/admin-dashboard/Dockerfile.dev ]; then \
		echo "FROM node:18-alpine\n\nWORKDIR /app\n\nCOPY package.json package-lock.json* ./\nRUN npm install\n\nCOPY . .\n\nEXPOSE 3000\n\nCMD [\"npm\", \"run\", \"dev\", \"--\", \"--host\", \"0.0.0.0\"]" > frontend/admin-dashboard/Dockerfile.dev; \
		echo "✅ frontend/admin-dashboard/Dockerfile.dev créé"; \
	fi

# Reconstruire un service spécifique
rebuild-service: ## Menu pour reconstruire un service spécifique
	@echo "🔄 Reconstruire un service"
	@echo "1) auth-service"
	@echo "2) api-gateway"
	@echo "3) admin-service"
	@echo "4) admin-dashboard"
	@read -p "Choisir un service (1-4): " choice; \
	case $$choice in \
		1) make rebuild-auth ;; \
		2) make rebuild-gateway ;; \
		3) make rebuild-admin ;; \
		4) make rebuild-dashboard ;; \
		*) echo "Choix invalide" ;; \
	esac

rebuild-auth: ## Reconstruit auth-service
	@$(COMPOSE) $(COMPOSE_FILES) stop auth-service 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache auth-service && $(COMPOSE) $(COMPOSE_FILES) up -d auth-service && echo "✅ auth-service OK"

rebuild-gateway: ## Reconstruit api-gateway
	@$(COMPOSE) $(COMPOSE_FILES) stop api-gateway 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache api-gateway && $(COMPOSE) $(COMPOSE_FILES) up -d api-gateway && echo "✅ api-gateway OK"

rebuild-admin: ## Reconstruit admin-service
	@$(COMPOSE) $(COMPOSE_FILES) stop admin-service 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache admin-service && $(COMPOSE) $(COMPOSE_FILES) up -d admin-service && echo "✅ admin-service OK"

rebuild-dashboard: ## Reconstruit admin-dashboard
	@$(COMPOSE) $(COMPOSE_FILES) stop admin-dashboard 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache admin-dashboard && $(COMPOSE) $(COMPOSE_FILES) up -d admin-dashboard && echo "✅ admin-dashboard OK"

setup-infra-only: ## Démarre uniquement Postgres + Redis
	@$(COMPOSE) $(COMPOSE_FILES) up -d postgres redis
	@echo "✅ Postgres (6042), Redis (6079) démarrés."

start-service: ## Démarre un service spécifique
	@echo "🚀 Démarrer un service"
	@echo "1) auth-service"
	@echo "2) api-gateway"
	@echo "3) admin-service" 
	@echo "4) admin-dashboard"
	@echo "5) postgres"
	@echo "6) redis"
	@read -p "Choisir un service (1-6): " choice; \
	case $$choice in \
		1) docker compose up -d auth-service ;; \
		2) docker compose up -d api-gateway ;; \
		3) docker compose up -d admin-service ;; \
		4) docker compose up -d admin-dashboard ;; \
		5) docker compose up -d postgres ;; \
		6) docker compose up -d redis ;; \
		*) echo "Choix invalide" ;; \
	esac

soft-restart: ## Redémarrage en douceur (sans reconstruire)
	@echo "🔄 Redémarrage en douceur..."
	@docker compose restart
	@echo "✅ Services redémarrés!"

# Gestion individuelle des services
stop-service: ## Arrête un service spécifique
	@echo "🛑 Arrêter un service"
	@echo "1) auth-service"
	@echo "2) api-gateway"
	@echo "3) admin-service" 
	@echo "4) admin-dashboard"
	@echo "5) postgres"
	@echo "6) redis"
	@echo "7) tous les services"
	@read -p "Choisir un service (1-7): " choice; \
	case $$choice in \
		1) docker compose stop auth-service ;; \
		2) docker compose stop api-gateway ;; \
		3) docker compose stop admin-service ;; \
		4) docker compose stop admin-dashboard ;; \
		5) docker compose stop postgres ;; \
		6) docker compose stop redis ;; \
		7) docker compose stop ;; \
		*) echo "Choix invalide" ;; \
	esac

restart-service: ## Redémarre un service spécifique
	@echo "🔄 Redémarrer un service"
	@echo "1) auth-service"
	@echo "2) api-gateway"
	@echo "3) admin-service" 
	@echo "4) admin-dashboard"
	@echo "5) postgres"
	@echo "6) redis"
	@echo "7) tous les services"
	@read -p "Choisir un service (1-7): " choice; \
	case $$choice in \
		1) docker compose restart auth-service ;; \
		2) docker compose restart api-gateway ;; \
		3) docker compose restart admin-service ;; \
		4) docker compose restart admin-dashboard ;; \
		5) docker compose restart postgres ;; \
		6) docker compose restart redis ;; \
		7) docker compose restart ;; \
		*) echo "Choix invalide" ;; \
	esac

logs-service: ## Affiche les logs d'un service spécifique
	@echo "📋 Logs d'un service"
	@echo "1) auth-service"
	@echo "2) api-gateway"
	@echo "3) admin-service" 
	@echo "4) admin-dashboard"
	@echo "5) postgres"
	@echo "6) redis"
	@echo "7) tous les services"
	@read -p "Choisir un service (1-7): " choice; \
	case $$choice in \
		1) docker compose logs -f auth-service ;; \
		2) docker compose logs -f api-gateway ;; \
		3) docker compose logs -f admin-service ;; \
		4) docker compose logs -f admin-dashboard ;; \
		5) docker compose logs -f postgres ;; \
		6) docker compose logs -f redis ;; \
		7) docker compose logs -f ;; \
		*) echo "Choix invalide" ;; \
	esac

# Gestion des applications mobiles
init-mobile: ## Initialise toutes les applications mobiles
	@echo "📱 Initialisation des applications mobiles..."
	@if command -v flutter >/dev/null 2>&1; then \
		for app in mobile/admin_app mobile/calendar mobile/chat mobile/drive mobile/mail mobile/notes; do \
			if [ -d "$$app" ]; then \
				echo "Initialisation de $$app"; \
				cd $$app && flutter pub get; \
			fi; \
		done; \
		echo "✅ Applications mobiles initialisées"; \
	else \
		echo "⚠️  Flutter non installé, applications mobiles ignorées"; \
	fi

build-mobile: ## Build toutes les applications mobiles
	@echo "🔨 Build des applications mobiles..."
	@if command -v flutter >/dev/null 2>&1; then \
		for app in mobile/admin_app mobile/calendar mobile/chat mobile/drive mobile/mail mobile/notes; do \
			if [ -d "$$app" ]; then \
				echo "Build de $$app"; \
				cd $$app && flutter build apk --debug; \
			fi; \
		done; \
		echo "✅ Applications mobiles construites"; \
	else \
		echo "⚠️  Flutter non installé, applications mobiles ignorées"; \
	fi

run-mobile: ## Exécute une application mobile en mode développement
	@echo "📱 Exécuter une application mobile"
	@if command -v flutter >/dev/null 2>&1; then \
		echo "Choisissez une application mobile:"; \
		apps=(); \
		i=1; \
		for app in mobile/admin_app mobile/calendar mobile/chat mobile/drive mobile/mail mobile/notes; do \
			if [ -d "$$app" ]; then \
				apps[$$i]=$$app; \
				echo "$$i) $${app#mobile/}"; \
				i=$$((i+1)); \
			fi; \
		done; \
		read -p "Choisir une application (1-$$((i-1))): " choice; \
		if [ -n "$${apps[$$choice]}" ]; then \
			cd $${apps[$$choice]} && flutter run; \
		else \
			echo "Choix invalide"; \
		fi; \
	else \
		echo "⚠️  Flutter non installé"; \
	fi

# Gestion de l'infrastructure
create-volume: ## Crée un volume Docker
	@echo "💾 Création d'un volume..."
	@read -p "Nom du volume (préfixe cloudity- sera ajouté): " name; \
	if [ -n "$$name" ]; then \
		docker volume create cloudity-$$name; \
		echo "✅ Volume cloudity-$$name créé"; \
	else \
		echo "⚠️  Nom de volume requis"; \
	fi

create-network: ## Crée un réseau Docker
	@echo "🌐 Création d'un réseau..."
	@read -p "Nom du réseau (préfixe cloudity- sera ajouté): " name; \
	if [ -n "$$name" ]; then \
		docker network create cloudity-$$name; \
		echo "✅ Réseau cloudity-$$name créé"; \
	else \
		echo "⚠️  Nom de réseau requis"; \
	fi

list-resources: ## Liste les ressources Docker (conteneurs, volumes, réseaux)
	@echo "📋 Ressources Docker:"
	@echo "Conteneurs:"
	@docker ps -a --filter name=cloudity
	@echo ""
	@echo "Volumes:"
	@docker volume ls --filter name=cloudity
	@echo ""
	@echo "Réseaux:"
	@docker network ls --filter name=cloudity

# Gestion du stockage
init-storage: ## Initialise les dossiers de stockage
	@echo "🗄️  Initialisation du stockage..."
	@mkdir -p storage/postgres storage/redis storage/mongodb storage/media storage/logs storage/backups storage/uploads storage/certs
	@chmod -R 755 storage
	@echo "✅ Stockage initialisé"

backup-all: ## Sauvegarde toutes les données
	@echo "💾 Sauvegarde complète..."
	@mkdir -p storage/backups/$(shell date +%Y%m%d)
	@if docker compose ps postgres | grep -q Up; then \
		echo "Sauvegarde PostgreSQL..."; \
		docker compose exec postgres pg_dump -U cloudity_admin cloudity | gzip > storage/backups/$(shell date +%Y%m%d)/postgres_$(shell date +%Y%m%d_%H%M%S).sql.gz; \
	fi
	@if docker compose ps mongodb | grep -q Up; then \
		echo "Sauvegarde MongoDB..."; \
		docker compose exec mongodb mongodump --archive | gzip > storage/backups/$(shell date +%Y%m%d)/mongodb_$(shell date +%Y%m%d_%H%M%S).gz; \
	fi
	@echo "Sauvegarde des fichiers..."
	@tar -czf storage/backups/$(shell date +%Y%m%d)/files_$(shell date +%Y%m%d_%H%M%S).tar.gz -C storage media uploads
	@echo "✅ Sauvegarde complète terminée dans storage/backups/$(shell date +%Y%m%d)/"

restore-latest: ## Restaure la dernière sauvegarde
	@echo "📥 Restauration de la dernière sauvegarde..."
	@latest_dir=$$(ls -td storage/backups/*/ | head -1); \
	echo "Dossier de sauvegarde: $$latest_dir"; \
	if [ -f "$$(ls -t $$latest_dir/postgres_*.sql.gz | head -1)" ]; then \
		echo "Restauration PostgreSQL..."; \
		gunzip -c $$(ls -t $$latest_dir/postgres_*.sql.gz | head -1) | docker compose exec -T postgres psql -U cloudity_admin cloudity; \
	fi; \
	if [ -f "$$(ls -t $$latest_dir/mongodb_*.gz | head -1)" ]; then \
		echo "Restauration MongoDB..."; \
		gunzip -c $$(ls -t $$latest_dir/mongodb_*.gz | head -1) | docker compose exec -T mongodb mongorestore --archive; \
	fi; \
	if [ -f "$$(ls -t $$latest_dir/files_*.tar.gz | head -1)" ]; then \
		echo "Restauration des fichiers..."; \
		tar -xzf $$(ls -t $$latest_dir/files_*.tar.gz | head -1) -C storage; \
	fi; \
	echo "✅ Restauration terminée"

# Gestion du frontend
frontend-menu: ## Menu des services frontend
	@echo "🎨 Services frontend"
	@echo "1) Démarrer admin-dashboard"
	@echo "2) Démarrer tous les frontends"
	@echo "3) Arrêter admin-dashboard"
	@echo "4) Arrêter tous les frontends"
	@echo "5) Rebuild admin-dashboard"
	@read -p "Choisir une action (1-5): " choice; \
	case $$choice in \
		1) docker compose up -d admin-dashboard ;; \
		2) docker compose up -d admin-dashboard ;; \
		3) docker compose stop admin-dashboard ;; \
		4) docker compose stop admin-dashboard ;; \
		5) make rebuild-dashboard ;; \
		*) echo "Choix invalide" ;; \
	esac

create-frontend: ## Crée un nouveau service frontend
	@echo "🎨 Création d'un nouveau service frontend..."
	@read -p "Nom du service (ex: user-dashboard): " name; \
	if [ -n "$$name" ]; then \
		mkdir -p frontend/$$name/src; \
		cp -r frontend/admin-dashboard/Dockerfile* frontend/$$name/; \
		cp frontend/admin-dashboard/package.json frontend/admin-dashboard/vite.config.js frontend/$$name/; \
		cp -r frontend/admin-dashboard/src/App.tsx frontend/admin-dashboard/src/main.tsx frontend/$$name/src/; \
		cp frontend/admin-dashboard/index.html frontend/$$name/; \
		sed -i "s/admin-dashboard/$$name/g" frontend/$$name/package.json; \
		echo "✅ Service frontend $$name créé"; \
	else \
		echo "⚠️  Nom de service requis"; \
	fi

add-service: ## Ajoute un nouveau service au docker-compose.yml
	@echo "➕ Ajout d'un nouveau service..."
	@echo "Type de service:"
	@echo "1) Backend Go"
	@echo "2) Backend Python"
	@echo "3) Backend Rust"
	@echo "4) Frontend"
	@read -p "Choisir un type (1-4): " type; \
	read -p "Nom du service: " name; \
	if [ -n "$$name" ]; then \
		case $$type in \
			1) \
				mkdir -p backend/$$name; \
				echo "# Service $$name (Go)" >> docker-compose.services.yml; \
				echo "  $$name:" >> docker-compose.services.yml; \
				echo "    build:" >> docker-compose.services.yml; \
				echo "      context: ./backend/$$name" >> docker-compose.services.yml; \
				echo "      dockerfile: Dockerfile.dev" >> docker-compose.services.yml; \
				echo "    container_name: cloudity-$$name" >> docker-compose.services.yml; \
				echo "    restart: unless-stopped" >> docker-compose.services.yml; \
				echo "    volumes:" >> docker-compose.services.yml; \
				echo "      - ./backend/$$name:/app:cached" >> docker-compose.services.yml; \
				echo "    networks:" >> docker-compose.services.yml; \
				echo "      - cloudity-network" >> docker-compose.services.yml; \
				echo "    depends_on:" >> docker-compose.services.yml; \
				echo "      - postgres" >> docker-compose.services.yml; \
				echo "      - redis" >> docker-compose.services.yml; \
				;; \
			2) \
				mkdir -p backend/$$name; \
				# Similaire à Go mais avec différentes dépendances \
				;; \
			3) \
				mkdir -p backend/$$name; \
				# Configuration pour Rust \
				;; \
			4) \
				mkdir -p frontend/$$name; \
				# Configuration pour Frontend \
				;; \
			*) echo "Type invalide" ;; \
		esac; \
		echo "✅ Service $$name ajouté au docker-compose.yml"; \
	else \
		echo "⚠️  Nom de service requis"; \
	fi