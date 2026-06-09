.PHONY: help up up-lean down setup install init dev prod build test tests test-mobile-photos test-mobile-drive test-mobile-mail test-mobile-suite test-mobile-app test-mobile-desktop-linux test-dashboard test-dashboard-lint test-dashboard-one test-go-one test-auth migrate migrate-mail dashboard-npm-ci dashboard-npm-install frontend-npm-ci frontend-install test-e2e test-e2e-playwright test-e2e-playwright-calendar test-e2e-playwright-mail test-e2e-playwright-admin test-e2e-playwright-webauthn test-e2e-playwright-pass test-e2e-playwright-pass-extension test-pass test-pass-extension pass-j8-prep status status-watch statys stats stat clean logs backup restore services-only infrastructure-only run-mobile mobile-devices mobile-adb-authorize mobile-doctor mobile-logcat-clear mobile-logcat mobile-logcat-mail mobile-mail-debug mail-security-check host-redis-sysctl feature-finish git-fetch-prune git-delete-remote-branch clean-test-tenants clean-pass-e2e-vaults wait-for-backends wait-for-dashboard wait-for-services mtls-up sync-mail-mta-env test-mail-mta-local mail-mta-local-up mail-mta-local-down mail-mta-local-logs mtls-down seed-mtls mtls-status mtls-issue mtls-verify mtls-poc internalsec-test preprod-up preprod-down preprod-status up-tls up-https up-https-internal mtls-issue-postgres mtls-issue-redis mtls-issue-admin mtls-issue-auth mtls-chown-internal-certs https-status secrets secrets-print secrets-scan secrets-scan-staged dev-https cert-renewer-status cert-renewer-restart check-versioning smoke-prod ensure-mail-encryption-key ensure-alias-encryption-key ensure-mta-internal-token build-pass-extension stack-heal doctor

# Variables - Support docker-compose et docker compose
DOCKER_COMPOSE_VERSION := $(shell docker compose version 2>/dev/null)
ifdef DOCKER_COMPOSE_VERSION
    COMPOSE = docker compose
else
    COMPOSE = docker-compose
endif

COMPOSE_FILES = -f docker-compose.yml
COMPOSE_DEV = $(COMPOSE) $(COMPOSE_FILES) -f docker-compose.dev.yml

# Pseudo-TTY pour `docker compose run` : couleurs Go (-v), pytest, Vitest si `make` a un terminal.
# Sans TTY (CI), la variable reste vide.
DOCKER_IT := $(shell test -t 1 && printf '%s' '-it' || true)
COMPOSE_PROD = $(COMPOSE) $(COMPOSE_FILES) -f docker-compose.prod.yml
COMPOSE_SERVICES = $(COMPOSE) -f docker-compose.services.yml

# Ports 60XX (voir STATUS.md)
PORT_GATEWAY ?= 6080
PORT_DASHBOARD ?= 6001
PORT_AUTH ?= 6081
PORT_ADMIN ?= 6082
PORT_POSTGRES ?= 6042
PORT_REDIS ?= 6079
PORT_ADMINER ?= 6083
PORT_REDIS_COMMANDER ?= 6084

help: ## Affiche ce message d'aide
	@echo 'Usage: make [target]'
	@echo ''
	@echo '  Première fois :  make setup   puis  make up-full   (stack + compte démo prêts à tester)'
	@echo ''
	@echo '  make install    - Installe toutes les dépendances (Go, Python, Node). À lancer après clone ou après ajout de paquets.'
	@echo '  make setup      - Setup initial (.env, clés RSA, deps). À lancer une fois après clone.'
	@echo '  make up        - Démarre toute la stack (+ clé mail IMAP si besoin + build extension Pass MV3 dans extensions/cloudity-pass/dist)'
	@echo '  make migrate   - Applique les migrations SQL (docker compose run db-migrate ; Postgres doit être joignable)'
	@echo '  make rebuild   - Reconstruit tous les services, migrations, clé mail IMAP si besoin, build extension Pass MV3'
	@echo '  make up-full   - Tout-en-un : down + up + seed + compte démo + make test (une seule commande)'
	@echo '  make down      - Arrête toute la stack'
	@echo '  make test       - Tests unitaires/applicatifs **dans Docker** (compose run --no-deps : Go + pytest + Vitest) — sans E2E ; Docker doit tourner'
	@echo '  make tests      - TOUT: unit/app + E2E + E2E Playwright + sécurité + mobile Flutter Photos+Drive+Mail (test-mobile-suite), rapport dans reports/'
	@echo '  make test-dashboard - Vitest @cloudity/web **dans le conteneur** (monorepo frontend/). Pour toute la batterie: make test.'
	@echo '  make test-dashboard-one FILE=src/... - Un seul fichier Vitest dans le conteneur (ex. MailPage.test.tsx)'
	@echo '  make test-dashboard-lint - ESLint @cloudity/web dans le conteneur'
	@echo '  make test-auth      - Smoke : go test auth-service seul (Docker --no-deps)'
	@echo '  make test-go-one SERVICE=drive-service - Smoke Go pour UN service (nom = clé docker-compose.yml)'
	@echo '  make test-e2e   - Tests E2E (health + proxy). Prérequis: make up puis 20-30 s'
	@echo '  make test-e2e-playwright - Tests E2E navigateur (Playwright: Hub, Drive, Calendrier, Mail…). Prérequis: make up + make seed-admin'
	@echo '  make test-e2e-playwright-calendar - E2E Playwright, fichier e2e/calendar.spec.ts uniquement'
	@echo '  make test-e2e-playwright-mail - E2E Playwright, fichier e2e/mail.spec.ts uniquement (stabilité React § TESTS 4.8)'
	@echo '  make test-e2e-playwright-admin - E2E Playwright, fichier e2e/admin.spec.ts uniquement (smoke /4dm1n connexion admin -> back-office)'
	@echo '  make test-e2e-playwright-webauthn - E2E Playwright, fichier e2e/webauthn.spec.ts (passkeys + authentificateur virtuel CDP)'
	@echo '  make dashboard-npm-ci - npm ci à la racine frontend/ (workspaces, comme le Dockerfile prod)'
	@echo '  make dashboard-npm-install - npm install dans apps/cloudity-web (ou utiliser frontend-install à la racine)'
	@echo '  make frontend-npm-ci / frontend-install - npm workspaces à la racine frontend/ (STATUS §0b A1)'
	@echo '  make test-security - Audits deps (npm/pip/go) + gosec + checks auth 401'
	@echo '  make status       - Tableau services (port, URL, Up/Down) + bloc URLs (/app, /login, Pass, Mail, gateway, Adminer… ; CLOUDITY_STATUS_HOST=IP_LAN)'
	@echo '  make statys | stats | stat - Alias de make status (évite « Aucune règle » si faute)'
	@echo '  make status-watch - Statut toutes les 10 s (watch + couleurs Up/Down)'
	@echo '  make test-all   - TOUT: make test + … + test-mobile-suite Photos/Drive/Mail (stack up + seed-admin pour E2E)'
	@echo '  make test-full  - test-all + test-docker (tests dans les conteneurs). Stack up requise.'
	@echo '  make test-docker - Même batterie que test mais via **exec** (conteneurs déjà up — make up avant)'
	@echo '  make quick-check - Vérifie que les services répondent (à lancer après make up)'
	@echo '  make logs       - Logs de tous les services en temps réel'
	@echo ''
	@echo '  make rebuild-mail  - Reconstruit le service mail (fix 404 sur la page Mail)'
	@echo '  make verify-mail-api - Vérifie que GET /mail/health passe par le gateway'
	@echo '  make ensure-mail-encryption-key - Ajoute MAIL_PASSWORD_ENCRYPTION_KEY au .env si absente / placeholder (fix sync IMAP 400/503)'
	@echo '  make ensure-alias-encryption-key - Ajoute ALIAS_ENCRYPTION_KEY (base64) au .env si absente (parité VPS / futur)'
	@echo '  make ensure-mta-internal-token - Ajoute/décommente MTA_INTERNAL_TOKEN (lookup MTA alias)'
	@echo '  make sync-mail-mta-env - Aligne deploy/mail-mta/.env avec le .env racine'
	@echo '  make test-mail-mta-local - Smoke API alias-resolve + SMTP local (prérequis: make deploy-mail)'
	@echo '  make mail-mta-local-up|down|logs - Stack Maddy locale (deploy/mail-mta, port SMTP_PORT)'
	@echo '  make build-pass-extension - npm install + build MV3 → extensions/cloudity-pass/dist (Charger extension non empaquetée)'
	@echo '  make deploy-web | deploy-mail | deploy-gateway | deploy-auth | deploy-admin | deploy-pass | deploy-drive | deploy-photos - Un service (docs/operations/DEPLOIEMENT-ENVIRONNEMENTS.md)'
	@echo '  make test-pass - Tests Pass (passwords-service + pass-crypto + import Proton Vitest)'
	@echo '  make test-pass-extension - Tests extension Pass MV3 (domain matcher MP-06)'
	@echo '  make pass-j8-prep - Préparation migration J8 Proton (test-pass + checklist runbook)'
	@echo '  make test-e2e-playwright-pass - E2E Playwright Pass uniquement (e2e/pass.spec.ts)'
	@echo '  make test-e2e-playwright-pass-extension - E2E Chromium extension Pass autofill (MP-07)'
	@echo '  make stack-heal | make doctor - Clé mail + recrée mail-directory + build extension (sans rebuild toutes les images)'
	@echo '  make mail-clean-dev - Supprime les comptes mail du compte démo (pour retester une boîte)'
	@echo '  make clean-pass-e2e-vaults - Supprime les coffres Pass « e2e-* » (restes Playwright sur le compte démo)'
	@echo '  make clean-test-tenants APPLY=1 - Nettoyage safe tenants (backup + confirmation, dry-run sinon)'
	@echo '  make run-mobile APP=Admin|Drive|Photos|Mail|… - Flutter (Photos+Drive+Admin dans le dépôt ; Mail → scaffold MOBILES.md)'
	@echo '  make mobile-devices - Liste les appareils ADB'
	@echo '  make mobile-adb-authorize - Redémarre ADB et aide à autoriser le téléphone'
	@echo '  make mobile-doctor - Vérifie Flutter/ADB/SDK local pour mobile'
	@echo '  make test-mobile-desktop-linux - Valide Drive/Photos Linux desktop (test + build debug)'
	@echo '  make mobile-logcat-clear - Vide le buffer logcat du device ADB'
	@echo '  make mobile-logcat - Suit logcat en direct (ADB_SERIAL optionnel)'
	@echo '  make mobile-logcat-mail - Suit logcat filtré Cloudity/Mail/Flutter'
	@echo '  make mobile-mail-debug - Session complète: clear logcat + test mobile mail + export logs'
	@echo '  make mail-security-check - Vérifie sécurité Mail (PJ sans auth + HTML sanitizé)'
	@echo '  make host-redis-sysctl - Warning Redis overcommit : sysctl hôte (APPLY=1 pour sudo sysctl session)'
	@echo '  make feature-finish MSG="…" — git add -A, commit, push, renomme la branche en feat/finish-<slug> et met GitHub à jour (voir docs/operations/BRANCHES.md)'
	@echo '  make git-fetch-prune — git fetch --prune (nettoyer refs distantes supprimées)'
	@echo '  make git-delete-remote-branch BRANCH=nom — supprime origin/nom (ex. branche Cursor obsolète)'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

feature-finish: ## Commit final + push + renommage feat/finish-… : make feature-finish MSG="message de commit"
	@if [ -z "$(MSG)" ]; then echo '❌ Indiquez MSG="votre message" (ex. make feature-finish MSG="feat(mail): PJ liste")'; exit 1; fi
	@chmod +x scripts/dev/feature-finish.sh
	@MSG="$(MSG)" NO_RENAME="$(NO_RENAME)" ALLOW_MAIN="$(ALLOW_MAIN)" ./scripts/dev/feature-finish.sh

git-fetch-prune: ## git fetch origin --prune (refs distantes alignées après suppressions sur GitHub)
	@git fetch origin --prune
	@echo '✅ fetch --prune terminé.'

git-delete-remote-branch: ## Supprime une branche sur origin : make git-delete-remote-branch BRANCH=cursor/…
	@if [ -z "$(BRANCH)" ]; then echo '❌ Indiquez BRANCH=nom-complet (ex. BRANCH=cursor/fix-cors-and-api-errors-on-dashboard-a59d)'; exit 1; fi
	@git push origin --delete "$(BRANCH)"
	@git fetch origin --prune
	@echo "✅ Branche distante supprimée : $(BRANCH)"

run-mobile: ## Lance une app Flutter : make run-mobile APP=Photos|Drive|Admin (prérequis : flutter). Mail/… → dossier mobile/* ; voir docs/produit/MOBILES.md
	@chmod +x scripts/mobile/run-mobile.sh 2>/dev/null || true
	@APP="$(APP)" ./scripts/mobile/run-mobile.sh

mobile-devices: ## Liste les appareils ADB détectés
	@adb devices -l

mobile-adb-authorize: ## Redémarre ADB puis affiche les devices (autorisation USB)
	@adb kill-server || true
	@adb start-server
	@echo "👉 Déverrouillez le téléphone et acceptez la clé RSA « Autoriser le débogage USB »."
	@adb devices -l

mobile-doctor: ## Vérifie Flutter/ADB et fallback SDK local
	@chmod +x scripts/mobile/mobile-doctor.sh scripts/mobile/mobile-flutter-env.sh scripts/mobile/check-flutter-sdk-writable.sh
	@./scripts/mobile/mobile-doctor.sh

mobile-logcat-clear: ## Vide logcat du device ADB (ADB_SERIAL optionnel)
	@adb $(if $(ADB_SERIAL),-s $(ADB_SERIAL),) logcat -c
	@echo "✅ logcat vidé."

mobile-logcat: ## Suit logcat en direct (ADB_SERIAL optionnel)
	@adb $(if $(ADB_SERIAL),-s $(ADB_SERIAL),) logcat -v time

mobile-logcat-mail: ## Suit logcat filtré Mail/Cloudity/Flutter (ADB_SERIAL optionnel)
	@adb $(if $(ADB_SERIAL),-s $(ADB_SERIAL),) logcat -v time | rg --line-buffered -i "cloudity|mail|flutter|dart|imap|notification"

mobile-mail-debug: ## Session debug Mail mobile: clear logcat + test + export logs
	@chmod +x scripts/mobile/mobile-mail-debug.sh scripts/mobile/mobile-test-common.inc.sh scripts/mobile/test-mobile-mail.sh scripts/mobile/test-mobile-app.sh
	@ADB_SERIAL="$(ADB_SERIAL)" ./scripts/mobile/mobile-mail-debug.sh

mail-security-check: ## Vérifie sécurité Mail: PJ non accessible sans auth + sanitation HTML
	@chmod +x scripts/dev/mail-security-check.sh
	@./scripts/dev/mail-security-check.sh

host-redis-sysctl: ## Vérifie vm.overcommit_memory (warning Redis) ; APPLY=1 pour sudo sysctl (hôte Linux)
	@chmod +x scripts/dev/redis-host-sysctl.sh
	@APPLY="$(APPLY)" ./scripts/dev/redis-host-sysctl.sh

dev-https: ## Lance Vite en HTTPS local via mkcert (https://localhost:5173). Stack backend doit être up.
	@chmod +x scripts/dev/dev-https.sh
	@./scripts/dev/dev-https.sh

dev-certs-docker: ## Génère .certs/ pour HTTPS Vite dans Docker (https://localhost:6001)
	@chmod +x scripts/dev/mkcert-docker-certs.sh
	@./scripts/dev/mkcert-docker-certs.sh

up: ensure-mail-encryption-key ensure-alias-encryption-key build-pass-extension ## Démarre toute la stack (ports 60XX ; profil **dev** = Adminer + Redis Commander — UIs de debug uniquement)
	@echo "🚀 Démarrage Cloudity..."
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev up -d
	@echo "✅ Stack démarrée. Accès:"
	@echo "   Dashboard:  http://localhost:$(PORT_DASHBOARD)  (HTTPS : make dev-certs-docker puis https://localhost:$(PORT_DASHBOARD))"
	@echo "   Quand :$(PORT_DASHBOARD) répond :  make wait-for-dashboard   (optionnel, timeout ~4 min)"
	@echo "   API:        http://localhost:$(PORT_GATEWAY)"
	@echo "   Auth:       http://localhost:$(PORT_AUTH)"
	@echo "   Admin API:  http://localhost:$(PORT_ADMIN)"
	@echo "   Adminer:    http://localhost:$(PORT_ADMINER)  |  Redis Commander: http://localhost:$(PORT_REDIS_COMMANDER)  (profil dev — pas en prod ; voir docs/architecture/SERVICES.md)"
	@echo "   Sans ces UIs :  make up-lean"
	@echo ""
	@echo "Compte de démo (après make seed-admin): admin@cloudity.local / Admin123!"

up-lean: ensure-mail-encryption-key ensure-alias-encryption-key build-pass-extension ## Démarre la stack **sans** Adminer ni Redis Commander (pas de --profile dev)
	@echo "🚀 Démarrage Cloudity (sans outils dev Adminer / Redis Commander)..."
	@$(COMPOSE) $(COMPOSE_FILES) up -d
	@echo "✅ Stack démarrée (sans profil dev). Dashboard: http://localhost:$(PORT_DASHBOARD) — API: http://localhost:$(PORT_GATEWAY)"

up-full: down up wait-for-services seed seed-admin test ## Tout-en-un : down, up, seed, compte démo, puis lance les tests pour vérifier
	@echo "✅ Stack, compte démo et tests OK. Tester: http://localhost:$(PORT_DASHBOARD) (admin@cloudity.local / Admin123!)"

down: ## Arrête toute la stack
	@echo "🛑 Arrêt de Cloudity..."
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev down --remove-orphans
	@echo "✅ Stack arrêtée."

install: ## Installe toutes les dépendances (Go, Python, Node). À lancer après clone ou après ajout de paquets (ex. docx, xlsx).
	@chmod +x scripts/dev/install-deps.sh 2>/dev/null || true
	@./scripts/dev/install-deps.sh

setup: ## Setup initial (une fois après clone) : .env, clés RSA, deps. Puis lancer make up-full.
	@if [ ! -f scripts/dev/setup.sh ]; then echo "❌ scripts/dev/setup.sh introuvable."; exit 1; fi
	@./scripts/dev/setup.sh
	@echo ""
	@echo "👉 Ensuite :  make up-full   pour démarrer la stack et créer le compte démo (prêt à tester)."

secrets: ## Génère un .env avec des secrets robustes (CSPRNG : Postgres, Redis, JWT, PERF ingest, MAIL + ALIAS) — voir SECRETS.md
	@if [ ! -f scripts/dev/gen-secrets.sh ]; then echo "❌ scripts/dev/gen-secrets.sh introuvable."; exit 1; fi
	@chmod +x scripts/dev/gen-secrets.sh
	@./scripts/dev/gen-secrets.sh

secrets-print: ## Affiche un set de secrets fraîchement générés (sans écrire .env)
	@chmod +x scripts/dev/gen-secrets.sh
	@./scripts/dev/gen-secrets.sh --print

secrets-scan: ## Scan gitleaks (historique git) — voir docs/securite/SECRETS.md
	@docker run --rm -v "$(CURDIR):/repo" -w /repo zricethezav/gitleaks:latest detect --redact -v --config /repo/.gitleaks.toml

secrets-scan-staged: ## Scan gitleaks staged (à utiliser avant commit)
	@docker run --rm -v "$(CURDIR):/repo" -w /repo zricethezav/gitleaks:latest protect --redact --staged -v --config /repo/.gitleaks.toml

ensure-mail-encryption-key: ## Ajoute MAIL_PASSWORD_ENCRYPTION_KEY (64 hex) au .env si absente ou placeholder — requis pour sync IMAP
	@chmod +x scripts/dev/ensure-mail-encryption-key.sh 2>/dev/null || true
	@./scripts/dev/ensure-mail-encryption-key.sh

ensure-alias-encryption-key: ## Ajoute ALIAS_ENCRYPTION_KEY (openssl rand -base64 32) au .env si absente — parité prod / futur
	@chmod +x scripts/dev/ensure-alias-encryption-key.sh 2>/dev/null || true
	@./scripts/dev/ensure-alias-encryption-key.sh

ensure-mta-internal-token: ## Ajoute/décommente MTA_INTERNAL_TOKEN (openssl rand -hex 32) — lookup MTA alias
	@chmod +x scripts/dev/ensure-mta-internal-token.sh 2>/dev/null || true
	@./scripts/dev/ensure-mta-internal-token.sh

sync-mail-mta-env: ensure-mta-internal-token ## Copie MTA_INTERNAL_TOKEN + domaine alias vers deploy/mail-mta/.env
	@chmod +x scripts/dev/sync-mail-mta-env.sh 2>/dev/null || true
	@./scripts/dev/sync-mail-mta-env.sh

test-mail-mta-local: sync-mail-mta-env ## Smoke MTA : /health, alias-resolve, port SMTP (ALIAS_TEST_EMAIL optionnel)
	@chmod +x scripts/dev/test-mail-mta-local.sh 2>/dev/null || true
	@./scripts/dev/test-mail-mta-local.sh

mail-mta-local-up: sync-mail-mta-env ## Démarre Maddy local (deploy/mail-mta/docker-compose.local.yml)
	@cd deploy/mail-mta && $(COMPOSE) -f docker-compose.local.yml up -d --build alias-router maddy
	@echo "✅ Maddy local — SMTP hôte : port $$(sed -n 's/^SMTP_PORT=//p' deploy/mail-mta/.env 2>/dev/null | tail -1 | grep -E '.+' || echo 2526)"

mail-mta-local-down: ## Arrête la stack Maddy locale
	@cd deploy/mail-mta && $(COMPOSE) -f docker-compose.local.yml down

mail-mta-local-logs: ## Logs Maddy local
	@cd deploy/mail-mta && $(COMPOSE) -f docker-compose.local.yml logs -f --tail=80 alias-router maddy

build-pass-extension: ## Build l’extension navigateur MV3 (extensions/cloudity-pass/dist)
	@echo "🔌 Build extension Cloudity Pass (MV3)…"
	@if ! command -v npm >/dev/null 2>&1; then \
		echo "❌ npm requis (install Node.js) pour build-pass-extension."; exit 1; \
	fi
	@cd extensions/cloudity-pass && npm install --no-audit --fund=false && npm run build
	@echo "✅ Extension : extensions/cloudity-pass/dist (Chrome → Mode développeur → Charger l’extension non empaquetée)"

build-pass-extension-firefox: ## Build extension Pass pour Firefox (MP-08, dist dérivé de cloudity-pass)
	@echo "🦊 Build extension Cloudity Pass (Firefox)…"
	@if ! command -v npm >/dev/null 2>&1; then \
		echo "❌ npm requis pour build-pass-extension-firefox."; exit 1; \
	fi
	@cd extensions/cloudity-pass-firefox && npm run build
	@echo "✅ Extension Firefox : extensions/cloudity-pass-firefox/dist (about:debugging → module temporaire)"

test-pass-extension: ## Tests extension Pass MV3 (domain matcher MP-06)
	@echo "🧪 Extension Cloudity Pass (MV3)…"
	@if ! command -v npm >/dev/null 2>&1; then \
		echo "❌ npm requis (install Node.js) pour test-pass-extension."; exit 1; \
	fi
	@cd extensions/cloudity-pass && npm test && npm run build
	@echo "✅ Extension Pass OK."

stack-heal: ## Réparation dev : clés MAIL + ALIAS dans .env, recrée mail-directory, build extension Pass (sans rebuild toutes les images)
	@chmod +x scripts/dev/stack-heal.sh 2>/dev/null || true
	@./scripts/dev/stack-heal.sh

doctor: stack-heal ## Alias de make stack-heal (réparation dev mail + extension)

init: ## Initialisation complète du projet (première fois)
	@echo "🚀 Initialisation de Cloudity..."
	@make create-env
	@make create-go-projects
	@make create-python-project
	@make create-react-project
	@make create-flutter-project
	@make setup-infrastructure
	@echo "✅ Initialisation terminée!"

create-env: ## Crée le fichier .env (secrets 256 bits via gen-secrets.sh ; voir docs/securite/SECRETS.md)
	@echo "📝 Création du fichier .env (secrets aléatoires 256 bits)..."
	@if [ ! -f .env ]; then \
		if [ -x scripts/dev/gen-secrets.sh ]; then \
			OUTPUT=.env ./scripts/dev/gen-secrets.sh; \
		else \
			echo "# Cloudity Environment Configuration (placeholders dev only)" > .env; \
			echo "POSTGRES_USER=cloudity_admin" >> .env; \
			echo "POSTGRES_PASSWORD=dev_only_change_me_via_make_secrets" >> .env; \
			echo "POSTGRES_DB=cloudity" >> .env; \
			echo "REDIS_PASSWORD=dev_only_change_me_via_make_secrets" >> .env; \
			echo "JWT_SECRET=dev_only_change_me_via_make_secrets" >> .env; \
			echo "PERFORMANCE_INGEST_TOKEN=dev_only_change_me_via_make_secrets" >> .env; \
			echo "BUILD_TARGET=dev" >> .env; \
			echo "NODE_ENV=development" >> .env; \
			echo "VITE_API_URL=" >> .env; \
			chmod 600 .env; \
		fi; \
		echo "✅ Fichier .env créé"; \
	else \
		echo "⚠️  Fichier .env existe déjà — non écrasé."; \
	fi
	@chmod +x scripts/dev/ensure-mail-encryption-key.sh 2>/dev/null || true
	@./scripts/dev/ensure-mail-encryption-key.sh || true
	@chmod +x scripts/dev/ensure-alias-encryption-key.sh 2>/dev/null || true
	@./scripts/dev/ensure-alias-encryption-key.sh || true
	@(git rm --cached .env 2>/dev/null && echo "✅ .env retiré du suivi Git (fichier conservé).") || true

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
	@if [ -f frontend/package.json ]; then \
		cd frontend && npm install 2>/dev/null || true; \
	else \
		cd frontend && npm install 2>/dev/null || true; \
	fi
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
	@find scripts -type f -name '*.sh' -exec chmod +x {} \; 2>/dev/null || true
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
	@$(COMPOSE) $(COMPOSE_FILES) up -d cloudity-web
	@echo "✅ Frontend lancé!"

prod: ## Démarre l'environnement de production
	@echo "🚀 Démarrage de l'environnement de production..."
	@BUILD_TARGET=production $(COMPOSE_PROD) up -d
	@echo "✅ Environnement de production lancé!"

build: ## Build tous les services
	@echo "🔨 Build de tous les services..."
	@$(COMPOSE) $(COMPOSE_FILES) build --parallel --no-cache
	@echo "✅ Build terminé!"

rebuild: ensure-mail-encryption-key ensure-alias-encryption-key build-pass-extension ## Reconstruit tous les services Cloudity, redémarre et applique les migrations (tout-en-un)
	@echo "🔨 Rebuild de tous les services Cloudity..."
	@$(COMPOSE) $(COMPOSE_FILES) build --no-cache --parallel
	@echo "🔄 Redémarrage des services avec les nouvelles images..."
	@$(COMPOSE) $(COMPOSE_FILES) --profile dev up -d
	@echo "📦 Application des migrations DB (nouvelles ou en attente)..."
	@$(COMPOSE) $(COMPOSE_FILES) run --rm db-migrate
	@echo "✅ Rebuild terminé ! Services à jour, migrations appliquées."

build-auth: ## Build uniquement le service d'authentification
	@$(COMPOSE) $(COMPOSE_FILES) build auth-service

build-gateway: ## Build uniquement l'API Gateway
	@$(COMPOSE) $(COMPOSE_FILES) build api-gateway

build-admin: ## Build uniquement le service admin
	@$(COMPOSE) $(COMPOSE_FILES) build admin-service

build-dashboard: ## Build uniquement le dashboard
	@$(COMPOSE) $(COMPOSE_FILES) build cloudity-web

# Déploiement partiel (build + up -d un service) — docs/operations/DEPLOIEMENT-PAR-SERVICE.md
deploy-web: build-dashboard ## Rebuild + redémarre cloudity-web (front SPA)
	@$(COMPOSE) $(COMPOSE_FILES) up -d cloudity-web
	@echo "✅ cloudity-web redéployé — http://localhost:$(PORT_DASHBOARD)"

deploy-gateway: build-gateway ## Rebuild + redémarre api-gateway
	@$(COMPOSE) $(COMPOSE_FILES) up -d api-gateway
	@echo "✅ api-gateway redéployé"

deploy-auth: build-auth ## Rebuild + redémarre auth-service
	@$(COMPOSE) $(COMPOSE_FILES) up -d auth-service
	@echo "✅ auth-service redéployé"

deploy-admin: build-admin ## Rebuild + redémarre admin-service
	@$(COMPOSE) $(COMPOSE_FILES) up -d admin-service
	@echo "✅ admin-service redéployé"

deploy-mail: ## Rebuild + redémarre mail-directory-service
	@$(COMPOSE) $(COMPOSE_FILES) build mail-directory-service
	@$(COMPOSE) $(COMPOSE_FILES) up -d mail-directory-service
	@echo "✅ mail-directory-service redéployé"

deploy-pass: ## Rebuild + redémarre passwords-service (coffre Pass API)
	@$(COMPOSE) $(COMPOSE_FILES) build passwords-service
	@$(COMPOSE) $(COMPOSE_FILES) up -d passwords-service
	@echo "✅ passwords-service redéployé"

deploy-drive: ## Rebuild + redémarre drive-service
	@$(COMPOSE) $(COMPOSE_FILES) build drive-service
	@$(COMPOSE) $(COMPOSE_FILES) up -d drive-service
	@echo "✅ drive-service redéployé"

deploy-photos: ## Rebuild + redémarre photos-service
	@$(COMPOSE) $(COMPOSE_FILES) build photos-service
	@$(COMPOSE) $(COMPOSE_FILES) up -d photos-service
	@echo "✅ photos-service redéployé"

# make test = unitaires + applicatifs uniquement (PAS les E2E), **dans Docker** (sauf Playwright E2E = host).
# Toutes les cibles test (test, tests, test-dashboard, etc.) se lancent depuis la racine du dépôt
# et vous laissent dans la racine à la fin, avec code de sortie 0 (succès) ou 1 (échec).
test: ## Tests dans Docker (couleurs si terminal : pseudo-TTY + FORCE_COLOR Vitest). Prérequis: Docker. Pas d’E2E.
	@echo "🧪 Tests unitaires / applicatifs (conteneurs Docker, même toolchain que la stack)..."
	@if ! docker info >/dev/null 2>&1; then echo "❌ Docker doit être disponible (démarrer le démon Docker)."; exit 1; fi
	@echo "  [auth-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps auth-service go test -v -count=1 ./... || exit 1
	@echo "  [api-gateway]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps api-gateway go test -v -count=1 ./... || exit 1
	@echo "  [passwords-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps passwords-service go test -v -count=1 ./... || exit 1
	@echo "  [mail-directory-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps mail-directory-service go test -v -count=1 ./... || exit 1
	@echo "  [calendar-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps calendar-service go test -v -count=1 ./... || exit 1
	@echo "  [contacts-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps contacts-service go test -v -count=1 ./... || exit 1
	@echo "  [notes-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps notes-service go test -v -count=1 ./... || exit 1
	@echo "  [tasks-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps tasks-service go test -v -count=1 ./... || exit 1
	@echo "  [photos-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps photos-service go test -v -count=1 ./... || exit 1
	@echo "  [drive-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps drive-service go test -v -count=1 ./... || exit 1
	@echo "  [admin-service]"
	@if $(COMPOSE) $(COMPOSE_FILES) ps -q admin-service 2>/dev/null | grep -q .; then \
		echo "    → exec dans admin-service (stack déjà up, évite un 2e Postgres sur le port hôte)"; \
		$(COMPOSE) $(COMPOSE_FILES) exec -T admin-service python -m pytest tests/ -v --tb=short || exit 1; \
	else \
		echo "    → compose run (démarre Postgres / Redis / migrate pour pytest)"; \
		$(COMPOSE) $(COMPOSE_FILES) run --rm admin-service python -m pytest tests/ -v --tb=short || exit 1; \
	fi
	@echo "  [cloudity-web]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps cloudity-web sh -c "cd /ws && npm install && cd apps/cloudity-web && FORCE_COLOR=1 npm run test" || exit 1
	@echo "✅ Tous les tests sont passés."

# Même image que la stack ; pas besoin de npm install local pour valider le dashboard.
test-dashboard: ## Vitest @cloudity/web dans le conteneur (compose run --no-deps, monorepo /ws)
	@echo "🧪 Tests dashboard (Vitest via Docker)..."
	@if ! docker info >/dev/null 2>&1; then echo "❌ Docker doit être disponible."; exit 1; fi
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps cloudity-web sh -c "cd /ws && npm install && cd apps/cloudity-web && FORCE_COLOR=1 npm run test" || exit 1
	@echo "✅ Tests dashboard OK."

test-dashboard-lint: ## ESLint @cloudity/web dans le conteneur (npm install racine + lint app)
	@echo "🧪 ESLint dashboard (Docker)..."
	@if ! docker info >/dev/null 2>&1; then echo "❌ Docker doit être disponible."; exit 1; fi
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps cloudity-web sh -c "cd /ws && npm install && cd apps/cloudity-web && npm run lint" || exit 1
	@echo "✅ ESLint dashboard OK."

test-dashboard-one: ## Un fichier Vitest : FILE=src/pages/app/mail/MailPage.test.tsx make test-dashboard-one
	@if [ -z "$(FILE)" ]; then \
		echo "Usage: make test-dashboard-one FILE=src/pages/app/mail/MailPage.test.tsx"; \
		exit 1; \
	fi
	@if ! docker info >/dev/null 2>&1; then echo "❌ Docker doit être disponible."; exit 1; fi
	@echo "🧪 Vitest (Docker) — $(FILE)..."
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps cloudity-web sh -c "cd /ws && npm install && cd apps/cloudity-web && npx vitest run $(FILE)" || exit 1
	@echo "✅ Vitest $(FILE) OK."

# Smoke Go : un service à la fois (même flags que la première étape de make test)
test-go-one: ## Go tests d’un service : make test-go-one SERVICE=auth-service (clé = nom du service dans docker-compose.yml)
	@if [ -z "$(SERVICE)" ]; then \
		echo "Usage: make test-go-one SERVICE=auth-service"; \
		echo "Exemples: api-gateway, mail-directory-service, drive-service, photos-service, …"; \
		exit 1; \
	fi
	@if ! docker info >/dev/null 2>&1; then echo "❌ Docker doit être disponible."; exit 1; fi
	@echo "🧪 $(SERVICE) (Docker go test -v -count=1 ./...)..."
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps $(SERVICE) go test -v -count=1 ./... || exit 1
	@echo "✅ $(SERVICE) OK."

test-auth: ## Raccourci : go test auth-service seul dans Docker (équivalent à compose run --no-deps auth-service)
	@if ! docker info >/dev/null 2>&1; then echo "❌ Docker doit être disponible."; exit 1; fi
	@echo "🧪 auth-service (Docker go test -v -count=1 ./...)..."
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps auth-service go test -v -count=1 ./... || exit 1
	@echo "✅ auth-service OK."

# make tests = tout (unit/app + E2E + sécurité) avec rapport dans reports/
tests: ## Lance tous les tests (unit/app + E2E + E2E Playwright + sécurité + mobile Photos+Drive+Mail), sortie en direct + rapport dans reports/
	@chmod +x scripts/ci/run-tests-with-report.sh
	@./scripts/ci/run-tests-with-report.sh

test-mobile-suite: ## Flutter Photos → Drive → Mail : hôte + integration_test ADB (gateway auto). SKIP: CLOUDITY_SKIP_MOBILE_DRIVE / CLOUDITY_SKIP_MOBILE_MAIL
	@chmod +x scripts/mobile/test-mobile-suite.sh scripts/mobile/test-mobile-app.sh scripts/mobile/test-mobile-mail.sh scripts/mobile/mobile-test-common.inc.sh
	@./scripts/mobile/test-mobile-suite.sh

test-mobile-photos: ## Flutter mobile/photos uniquement (wrapper test-mobile-app.sh photos)
	@chmod +x scripts/mobile/test-mobile-photos.sh scripts/mobile/test-mobile-app.sh scripts/mobile/mobile-test-common.inc.sh
	@./scripts/mobile/test-mobile-photos.sh

test-mobile-drive: ## Flutter mobile/drive uniquement (wrapper test-mobile-app.sh drive)
	@chmod +x scripts/mobile/test-mobile-drive.sh scripts/mobile/test-mobile-app.sh scripts/mobile/mobile-test-common.inc.sh
	@./scripts/mobile/test-mobile-drive.sh

test-mobile-mail: ## Flutter mobile/mail uniquement (wrapper test-mobile-app.sh mail)
	@chmod +x scripts/mobile/test-mobile-mail.sh scripts/mobile/test-mobile-app.sh scripts/mobile/mobile-test-common.inc.sh
	@./scripts/mobile/test-mobile-mail.sh

test-mobile-desktop-linux: ## Flutter Linux desktop Drive/Photos : pub get + test + build debug (run smoke: CLOUDITY_DESKTOP_RUN_SMOKE=1)
	@chmod +x scripts/mobile/test-mobile-desktop-linux.sh
	@./scripts/mobile/test-mobile-desktop-linux.sh

test-mobile-2fa: ## Flutter 2FA sur ADB (Drive+Mail+Photos, compte e2e-2fa@cloudity.local). Prérequis: make up, téléphone USB/Wi‑Fi
	@chmod +x scripts/mobile/test-mobile-2fa.sh scripts/dev/prepare-e2e-2fa-mobile.sh scripts/dev/generate-totp.mjs
	@./scripts/mobile/test-mobile-2fa.sh

test-local-realistic: seed-admin seed-e2e-2fa test-pass-extension test-e2e-playwright-twofa test-mobile-suite test-mobile-2fa ## Batterie « vie réelle » locale (web+mobile+2FA). Long (~15–40 min)

test-all: test test-e2e test-e2e-playwright test-security test-mobile-suite ## TOUT: unit/app + E2E + E2E Playwright + sécurité + mobile P+D+M (stack up + seed-admin pour E2E web)

test-e2e: ## Tests E2E (stack doit être démarrée: make up; attendre 20-30 s que les services soient healthy)
	@chmod +x scripts/ci/test-e2e.sh
	@./scripts/ci/test-e2e.sh

test-e2e-playwright: ## Tests E2E navigateur (Playwright). Prérequis: make up, make seed-admin, attendre 20-30 s
	@echo "🎭 Tests E2E Playwright (login, Hub, Drive, Office, Mail, Pass, Calendrier)..."
	@cd frontend/apps/cloudity-web && BASE_URL=http://localhost:$(PORT_DASHBOARD) FORCE_COLOR=0 NO_COLOR=1 npx playwright test
	@echo "✅ E2E Playwright OK"

test-e2e-playwright-calendar: ## E2E Playwright — calendrier uniquement (e2e/calendar.spec.ts). Prérequis: make up, make seed-admin
	@echo "🎭 Tests E2E Playwright — Calendrier..."
	@cd frontend/apps/cloudity-web && BASE_URL=http://localhost:$(PORT_DASHBOARD) npx playwright test e2e/calendar.spec.ts
	@echo "✅ E2E Calendrier OK"

test-e2e-playwright-mail: ## E2E Playwright — Mail uniquement (e2e/mail.spec.ts). Prérequis: make up, make seed-admin
	@echo "🎭 Tests E2E Playwright — Mail..."
	@cd frontend/apps/cloudity-web && BASE_URL=http://localhost:$(PORT_DASHBOARD) npx playwright test e2e/mail.spec.ts
	@echo "✅ E2E Mail OK"

test-e2e-playwright-admin: ## E2E Playwright — back-office /4dm1n uniquement (e2e/admin.spec.ts). Prérequis: make up, make seed-admin
	@echo "🎭 Tests E2E Playwright — Back-office /4dm1n..."
	@cd frontend && ./node_modules/.bin/playwright install chromium 2>/dev/null || true
	@cd frontend/apps/cloudity-web && BASE_URL=http://localhost:$(PORT_DASHBOARD) FORCE_COLOR=0 NO_COLOR=1 npx playwright test e2e/admin.spec.ts
	@echo "✅ E2E Admin OK"

test-e2e-playwright-webauthn: ## E2E Playwright — WebAuthn / passkeys (e2e/webauthn.spec.ts, CDP virtual authenticator). Prérequis: make up, make migrate, make seed-admin
	@echo "🎭 Tests E2E Playwright — WebAuthn (passkeys)..."
	@cd frontend && ./node_modules/.bin/playwright install chromium 2>/dev/null || true
	@cd frontend/apps/cloudity-web && BASE_URL=http://localhost:$(PORT_DASHBOARD) FORCE_COLOR=0 NO_COLOR=1 npx playwright test e2e/webauthn.spec.ts
	@echo "✅ E2E WebAuthn OK"

test-e2e-playwright-pass: ## E2E Playwright — Pass uniquement (e2e/pass.spec.ts). Prérequis: make up, make seed-admin
	@echo "🎭 Tests E2E Playwright — Pass..."
	@cd frontend/apps/cloudity-web && BASE_URL=http://localhost:$(PORT_DASHBOARD) FORCE_COLOR=0 NO_COLOR=1 npx playwright test e2e/pass.spec.ts
	@echo "✅ E2E Pass OK"

test-e2e-playwright-pass-extension: test-pass-extension ## E2E Chromium — extension Pass autofill (MP-07). Prérequis: make up, make seed-admin
	@echo "🎭 Tests E2E Playwright — extension Pass (MP-07)..."
	@cd frontend/apps/cloudity-web && PLAYWRIGHT_RUN_PASS_EXTENSION=1 BASE_URL=http://localhost:$(PORT_DASHBOARD) PLAYWRIGHT_API_URL=http://localhost:$(PORT_GATEWAY) FORCE_COLOR=0 NO_COLOR=1 npx playwright test e2e/pass-extension.spec.ts
	@echo "✅ E2E extension Pass OK"

test-e2e-playwright-twofa: ## E2E Playwright — 2FA (e2e/twofa.spec.ts). Prérequis: make up (seed dans beforeAll du spec)
	@echo "🎭 Tests E2E Playwright — 2FA..."
	@cd frontend/apps/cloudity-web && BASE_URL=http://localhost:$(PORT_DASHBOARD) FORCE_COLOR=0 NO_COLOR=1 npx playwright test e2e/twofa.spec.ts
	@echo "✅ E2E 2FA OK"

test-pass: ## Tests Pass (passwords-service Go + @cloudity/pass-crypto + protonImport Vitest). Pas d’E2E.
	@echo "🧪 Tests Pass (socle migration J8)..."
	@if ! docker info >/dev/null 2>&1; then echo "❌ Docker requis pour passwords-service."; exit 1; fi
	@echo "  [passwords-service]"
	@$(COMPOSE) $(COMPOSE_FILES) run --rm $(DOCKER_IT) --no-deps passwords-service go test -v -count=1 ./... || exit 1
	@echo "  [@cloudity/pass-crypto]"
	@(cd frontend/packages/pass-crypto && npm test) || exit 1
	@echo "  [protonImport — Vitest]"
	@(cd frontend/apps/cloudity-web && npx vitest run src/pages/app/pass/protonImport.test.ts src/pages/app/mail/mailSyncHelpers.test.ts) || exit 1
	@echo "  [extension Pass MV3]"
	@(cd extensions/cloudity-pass && npm test && npm run build) || exit 1
	@echo "✅ test-pass OK"

pass-j8-prep: ## J8 migration Proton : test-pass + checklist (scripts/dev/pass-j8-prep.sh). SKIP_TESTS=1 pour la checklist seule.
	@chmod +x scripts/dev/pass-j8-prep.sh
	@./scripts/dev/pass-j8-prep.sh

dashboard-npm-ci: ## npm ci à la racine frontend/ (workspaces : apps/* + packages/*)
	@echo "📦 npm ci — frontend/ (workspaces)..."
	@(cd frontend && npm ci)
	@echo "✅ dashboard-npm-ci OK"

dashboard-npm-install: ## npm install racine frontend/ (workspaces) ou apps/cloudity-web seul si besoin
	@echo "📦 npm install — frontend/ (workspaces)..."
	@(cd frontend && npm install)
	@echo "✅ dashboard-npm-install OK"

frontend-npm-ci: ## npm ci à la racine frontend/ (workspaces : @cloudity/web + @cloudity/shared)
	@echo "📦 npm ci — frontend/ (workspaces)..."
	@(cd frontend && npm ci)
	@echo "✅ frontend-npm-ci OK"

frontend-install: ## npm install à la racine frontend/ (workspaces)
	@echo "📦 npm install — frontend/ (workspaces)..."
	@(cd frontend && npm install)
	@echo "✅ frontend-install OK"

test-security: ## Tests et vérifications sécurité (audits deps + checks auth)
	@chmod +x scripts/ci/test-security.sh
	@./scripts/ci/test-security.sh

# === mTLS interne (step-ca) ============================================
# Voir docs/securite/MTLS-INTERNE.md, infrastructure/step-ca/README.md.
COMPOSE_SECURITY = $(COMPOSE) $(COMPOSE_FILES) -f docker-compose.security.yml

mtls-up: ## Démarre step-ca (PKI interne, optionnel — voir docs/securite/MTLS-INTERNE.md)
	@if [ ! -f infrastructure/step-ca/secrets/ca-password ]; then \
	  echo "⚠️  infrastructure/step-ca/secrets/ca-password manquant. Création (random 32 bytes)..."; \
	  if command -v openssl >/dev/null 2>&1; then \
	    openssl rand -base64 32 > infrastructure/step-ca/secrets/ca-password; \
	  else \
	    head -c 32 /dev/urandom | base64 > infrastructure/step-ca/secrets/ca-password; \
	  fi; \
	  chmod 600 infrastructure/step-ca/secrets/ca-password; \
	  echo "🔐 Mot de passe CA généré (NE PAS committer ce fichier)."; \
	fi
	@$(COMPOSE_SECURITY) up -d step-ca
	@echo "✅ step-ca démarré (https://localhost:6443). Lancer 'make seed-mtls' la première fois."

mtls-down: ## Arrête step-ca (les volumes ne sont pas supprimés)
	@$(COMPOSE_SECURITY) stop step-ca
	@echo "ℹ️  step-ca arrêté (données conservées dans le volume cloudity-step-ca-data)."

seed-mtls: ## Initialise la PKI interne (à lancer une fois après mtls-up)
	@echo "🔐 Initialisation step-ca (mot de passe lu depuis /secrets/ca-password)..."
	@$(COMPOSE_SECURITY) exec step-ca step ca init \
	  --name "Cloudity Internal" \
	  --dns step-ca,localhost \
	  --address ":9000" \
	  --provisioner cloudity-jwt \
	  --password-file /secrets/ca-password \
	  --provisioner-password-file /secrets/ca-password \
	  || echo "ℹ️  CA déjà initialisée (rerun safe)."
	@echo "📜 Fingerprint racine :"
	@$(COMPOSE_SECURITY) exec step-ca step certificate fingerprint /home/step/certs/root_ca.crt || true

mtls-status: ## Affiche l'état de step-ca + fingerprint root
	@$(COMPOSE_SECURITY) ps step-ca || true
	@echo ""
	@$(COMPOSE_SECURITY) exec -T step-ca step certificate fingerprint /home/step/certs/root_ca.crt 2>/dev/null \
	  | sed 's/^/Fingerprint root CA : /' \
	  || echo "ℹ️  Pas encore initialisé. Lancer make mtls-up puis make seed-mtls."

internalsec-test: ## Lance les tests unitaires du package backend/internalsec
	@cd backend/internalsec && go test -race -count=1 ./...

mtls-issue: ## Émet un cert mTLS via step-ca. Args : NAME=<service> [TTL=24h]
	@if [ -z "$(NAME)" ]; then echo "❌ NAME=<service> requis (ex: make mtls-issue NAME=api-gateway)"; exit 1; fi
	@mkdir -p infrastructure/step-ca/issued/$(NAME)
	@chmod 700 infrastructure/step-ca/issued
	@chmod 700 infrastructure/step-ca/issued/$(NAME)
	@TTL=$${TTL:-24h}; \
	  $(COMPOSE_SECURITY) exec -T step-ca step ca certificate "$(NAME)" \
	    /tmp/$(NAME).crt /tmp/$(NAME).key \
	    --san "$(NAME)" --san "localhost" \
	    --san "spiffe://cloudity.local/ns/default/sa/$(NAME)" \
	    --provisioner cloudity-jwt \
	    --provisioner-password-file /secrets/ca-password \
	    --not-after $$TTL --force
	@CID=$$($(COMPOSE_SECURITY) ps -q step-ca); \
	  docker cp $$CID:/tmp/$(NAME).crt infrastructure/step-ca/issued/$(NAME)/cert.pem; \
	  docker cp $$CID:/tmp/$(NAME).key infrastructure/step-ca/issued/$(NAME)/key.pem; \
	  docker cp $$CID:/home/step/certs/root_ca.crt infrastructure/step-ca/issued/$(NAME)/root_ca.pem; \
	  docker cp $$CID:/home/step/certs/intermediate_ca.crt infrastructure/step-ca/issued/$(NAME)/intermediate_ca.pem
	@cat infrastructure/step-ca/issued/$(NAME)/intermediate_ca.pem \
	     infrastructure/step-ca/issued/$(NAME)/root_ca.pem \
	     > infrastructure/step-ca/issued/$(NAME)/ca.pem
	@chmod 600 infrastructure/step-ca/issued/$(NAME)/*.pem
	@echo "✅ Cert émis pour $(NAME) (TTL $${TTL:-24h}) — infrastructure/step-ca/issued/$(NAME)/"

mtls-verify: ## Vérifie un cert émis. Args : NAME=<service>
	@if [ -z "$(NAME)" ]; then echo "❌ NAME=<service> requis"; exit 1; fi
	@D=infrastructure/step-ca/issued/$(NAME); \
	  if [ ! -f "$$D/cert.pem" ]; then echo "❌ $$D/cert.pem introuvable — lance make mtls-issue NAME=$(NAME)"; exit 1; fi; \
	  echo "📜 Subject :"; openssl x509 -in $$D/cert.pem -noout -subject; \
	  echo "📜 Issuer  :"; openssl x509 -in $$D/cert.pem -noout -issuer; \
	  echo "📜 SANs    :"; openssl x509 -in $$D/cert.pem -noout -ext subjectAltName | grep -v '^X509v3' | sed 's/^[[:space:]]*/  /'; \
	  echo "📜 Validité:"; openssl x509 -in $$D/cert.pem -noout -dates; \
	  echo "🔍 Vérification chaîne (root → cert) :"; openssl verify -CAfile $$D/ca.pem $$D/cert.pem

mtls-issue-postgres: ## Émet le cert serveur Postgres (DNS:postgres,DNS:localhost) — TTL 24 h, rotation prévue (sidecar). Pré-requis : mtls-up + seed-mtls
	@make mtls-issue NAME=postgres TTL=$${TTL:-24h}

mtls-issue-redis: ## Émet le cert serveur Redis (DNS:redis,DNS:localhost) — TTL 24 h, rotation prévue (sidecar). Pré-requis : mtls-up + seed-mtls
	@make mtls-issue NAME=redis TTL=$${TTL:-24h}

mtls-issue-admin: ## Émet le cert mTLS pour gateway + admin-service (DNS:admin-service,api-gateway). TTL 24 h.
	@$(MAKE) mtls-issue NAME=admin-service TTL=$${TTL:-24h}
	@$(MAKE) mtls-issue NAME=api-gateway TTL=$${TTL:-24h}

mtls-issue-auth: ## Émet le cert mTLS pour auth-service (DNS:auth-service,localhost). TTL 24 h.
	@$(MAKE) mtls-issue NAME=auth-service TTL=$${TTL:-24h}

check-versioning: ## Vérifie qu'aucune lib partagée n'a changé sans bump (warning par défaut, CHECK_VERSIONING_BLOCKING=1 pour fail).
	@chmod +x scripts/ci/check-versioning.sh
	@./scripts/ci/check-versioning.sh

smoke-prod: ## Smoke test post-déploiement (5 endpoints + TLS + headers durcis). Variables: SMOKE_API_URL, SMOKE_APP_URL, [SMOKE_USER + SMOKE_PASS].
	@chmod +x scripts/ops/smoke-prod.sh
	@./scripts/ops/smoke-prod.sh

cert-renewer-status: ## Affiche le statut + 30 dernières lignes de log du sidecar de rotation.
	@$(COMPOSE_SECURITY) ps cert-renewer 2>/dev/null || echo "❌ sidecar absent — make mtls-up d'abord"
	@echo "--- logs (30 dernières lignes) ---"
	@$(COMPOSE_SECURITY) logs --tail 30 cert-renewer 2>/dev/null || true

cert-renewer-restart: ## Force un cycle de renouvellement immédiat (recreate du sidecar).
	@$(COMPOSE_SECURITY) up -d --force-recreate cert-renewer
	@echo "🔄 cert-renewer relancé — make cert-renewer-status pour suivre"

mtls-chown-internal-certs: ## Ajuste uid/gid des PEM pour bind-mount Postgres (70) et Redis (999)
	@echo "🔧 chown PEM postgres (uid 70) + redis (uid 999)..."
	@docker run --rm -v "$(CURDIR)/infrastructure/step-ca/issued/postgres:/certs:rw" alpine:3.19 \
	  sh -c 'chown 70:70 /certs/cert.pem /certs/key.pem /certs/ca.pem 2>/dev/null || true; chmod 600 /certs/key.pem; chmod 644 /certs/cert.pem /certs/ca.pem' || true
	@docker run --rm -v "$(CURDIR)/infrastructure/step-ca/issued/redis:/certs:rw" alpine:3.19 \
	  sh -c 'chown 999:999 /certs/cert.pem /certs/key.pem /certs/ca.pem 2>/dev/null || true; chmod 600 /certs/key.pem; chmod 644 /certs/cert.pem /certs/ca.pem' || true
	@echo "✅ Droits PEM ajustés (ignore si dossiers absents)."

mtls-poc: mtls-up seed-mtls ## Smoke complet : step-ca + 2 certs (api-gateway + auth-service) + vérif
	@echo ""
	@echo "🔬 Émission cert api-gateway..."
	@$(MAKE) mtls-issue NAME=api-gateway
	@echo ""
	@echo "🔬 Émission cert auth-service..."
	@$(MAKE) mtls-issue NAME=auth-service
	@echo ""
	@echo "🔍 Vérification certs émis :"
	@$(MAKE) mtls-verify NAME=api-gateway
	@echo ""
	@$(MAKE) mtls-verify NAME=auth-service
	@echo ""
	@echo "✅ PoC mTLS complet : step-ca initialisée + 2 certs valides."
	@echo "   Pour intégrer : exposer MTLS_MODE / MTLS_CERT_FILE / MTLS_KEY_FILE / MTLS_CA_FILE"
	@echo "   sur les services Go (cf. backend/internalsec/internalsec.go ConfigFromEnv)."

# =======================================================================

# === Pré-prod edge (Caddy : TLS 1.3 + HSTS + CSP + cible PQ) ==========
# Voir docs/securite/REVERSE-PROXY.md, infrastructure/reverse-proxy/README.md.
COMPOSE_PREPROD = $(COMPOSE) $(COMPOSE_FILES) -f docker-compose.preprod.yml

preprod-up: ## Démarre la stack + Caddy (https://app.cloudity.local, https://api.cloudity.local)
	@grep -qE '(^|\s)app\.cloudity\.local' /etc/hosts 2>/dev/null \
	  && grep -qE '(^|\s)api\.cloudity\.local' /etc/hosts 2>/dev/null \
	  || echo "ℹ️  Ajouter à /etc/hosts :  127.0.0.1  app.cloudity.local  api.cloudity.local"
	@$(COMPOSE_PREPROD) up -d
	@echo "✅ Pré-prod up. Tester : curl -kI https://app.cloudity.local | grep -iE 'strict-transport|content-security'"

up-tls: up preprod-up ## **HTTPS par défaut** : stack + Caddy edge TLS 1.3 (HSTS, CSP, hybride PQ quand dispo)
	@echo ""
	@echo "🔒 Cloudity en HTTPS-first :"
	@echo "   • App   : https://app.cloudity.local  (cert TLS interne Caddy)"
	@echo "   • API   : https://api.cloudity.local  (cert TLS interne Caddy)"
	@echo "   • SI navigateur warning → accepter le cert local OU faire :"
	@echo "       sudo cp infrastructure/reverse-proxy/local-root.crt /usr/local/share/ca-certificates/cloudity.crt"
	@echo "       sudo update-ca-certificates"
	@echo ""
	@echo "ℹ️  Le mode HTTP localhost:6001/6080 reste accessible pour debug ; à terme"
	@echo "    voir docs/securite/AUDIT-SECURITE.md § HTTPS partout."

up-https: up-tls ## Alias de up-tls (HTTPS edge par défaut)
	@true

up-https-internal: ## **HTTPS partout** : edge Caddy + Postgres TLS + Redis TLS (step-ca). Pré-requis : mtls-up + seed-mtls.
	@if ! docker ps --format '{{.Names}}' | grep -q '^cloudity-step-ca$$'; then \
	  echo "❌ step-ca non démarrée. Lance d'abord : make mtls-up && make seed-mtls"; exit 1; \
	fi
	@if [ ! -f infrastructure/step-ca/issued/postgres/cert.pem ]; then \
	  echo "🔬 Émission cert Postgres..."; $(MAKE) mtls-issue-postgres; \
	fi
	@if [ ! -f infrastructure/step-ca/issued/redis/cert.pem ]; then \
	  echo "🔬 Émission cert Redis..."; $(MAKE) mtls-issue-redis; \
	fi
	@if [ ! -f infrastructure/step-ca/issued/admin-service/cert.pem ] || [ ! -f infrastructure/step-ca/issued/api-gateway/cert.pem ]; then \
	  echo "🔬 Émission certs gateway + admin-service..."; $(MAKE) mtls-issue-admin; \
	fi
	@if [ ! -f infrastructure/step-ca/issued/auth-service/cert.pem ]; then \
	  echo "🔬 Émission cert auth-service..."; $(MAKE) mtls-issue-auth; \
	fi
	@$(MAKE) mtls-chown-internal-certs
	@$(COMPOSE) $(COMPOSE_FILES) -f docker-compose.https.yml up -d
	@$(MAKE) preprod-up
	@echo ""
	@echo "🔒 Cloudity en HTTPS partout (edge + Postgres TLS + Redis TLS) :"
	@echo "   • Edge   : https://app.cloudity.local + https://api.cloudity.local"
	@echo "   • DSN    : postgresql://...@postgres:5432/...?sslmode=verify-ca&sslrootcert=/run/step/ca.pem"
	@echo "   • Cache  : rediss://:...@redis:6379/0?ca=/run/step/ca.pem"
	@echo "   • Vérif  : make https-status"

https-status: ## Vérifie l'activation TLS des couches (edge, postgres, redis)
	@echo "=== Edge Caddy ==="
	@curl -kI https://app.cloudity.local 2>/dev/null \
	  | grep -iE 'http/|strict-transport|content-security' \
	  || echo "ℹ️  Caddy ne répond pas (make up-tls)."
	@echo ""
	@echo "=== Postgres TLS ==="
	@docker exec -t cloudity-postgres psql -U cloudity_admin -d cloudity -c "SHOW ssl;" 2>&1 | tail -n 5 \
	  || echo "ℹ️  Postgres injoignable (make up-https-internal)."
	@echo ""
	@echo "=== Redis TLS ==="
	@docker exec cloudity-redis sh -c 'redis-cli --tls --cacert /run/step/ca.pem -a "$$REDIS_PASSWORD" ping' 2>&1 | tail -n 3 \
	  || echo "ℹ️  Redis injoignable (make up-https-internal)."

preprod-down: ## Arrête uniquement Caddy (le reste de la stack continue)
	@$(COMPOSE_PREPROD) stop caddy
	@echo "ℹ️  Caddy arrêté."

preprod-status: ## En-têtes Caddy renvoyés sur app.cloudity.local
	@curl -kI https://app.cloudity.local 2>/dev/null \
	  | grep -iE 'http/|strict-transport|content-security|x-content-type|permissions-policy|cross-origin' \
	  || echo "ℹ️  Caddy ne répond pas. Lancer make preprod-up."
# =======================================================================

test-docker: ## go test via **exec** dans la stack déjà démarrée (make up). Pytest/Vitest en run. Vérifie les binaires en cours d’exécution.
	@echo "🧪 Tests dans les conteneurs déjà up (exec Go + run admin)..."
	@$(COMPOSE) $(COMPOSE_FILES) exec -T auth-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T api-gateway go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T passwords-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T mail-directory-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T calendar-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T contacts-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T notes-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T tasks-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T photos-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T drive-service go test -v ./... || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T admin-service python -m pytest tests/ -v --tb=short || exit 1
	@$(COMPOSE) $(COMPOSE_FILES) exec -T cloudity-web sh -c "cd /ws && npm install && cd apps/cloudity-web && npm run test" || exit 1
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
	@$(COMPOSE) $(COMPOSE_FILES) logs -f cloudity-web

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
	@$(COMPOSE) $(COMPOSE_FILES) exec cloudity-web sh

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
	@curl -s -f http://localhost:$(PORT_GATEWAY)/health >/dev/null && echo "  ✅ API Gateway (6080): OK" || echo "  ❌ API Gateway (6080): FAIL"
	@curl -s -f http://localhost:$(PORT_AUTH)/health >/dev/null && echo "  ✅ Auth Service (6081): OK" || echo "  ❌ Auth Service (6081): FAIL"
	@curl -s -f http://localhost:$(PORT_ADMIN)/health >/dev/null && echo "  ✅ Admin Service (6082): OK" || echo "  ❌ Admin Service (6082): FAIL"
	@curl -s -f http://localhost:$(PORT_DASHBOARD) >/dev/null && echo "  ✅ Dashboard (6001): OK" || echo "  ❌ Dashboard (6001): FAIL"
	@curl -sf http://localhost:$(PORT_DASHBOARD)/4dm1n | grep -q 'main-admin' && echo "  ✅ Back-office /4dm1n (6001): OK" || echo "  ❌ Back-office /4dm1n (6001): FAIL"

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

seed-admin: ## Crée le compte admin@cloudity.local / Admin123! ET le promeut en role='admin' (stack up, tenant 1)
	@echo "👤 Création du compte de démo (admin@cloudity.local)..."
	@curl -sf -X POST http://localhost:$(PORT_GATEWAY)/auth/register \
	  -H "Content-Type: application/json" \
	  -d '{"email":"admin@cloudity.local","password":"Admin123!","tenant_id":"1"}' >/dev/null \
	  && echo "✅ Compte créé." \
	  || echo "ℹ️  Le compte existait déjà — promotion du rôle quand même."
	@echo "🔐 Promotion role='admin' pour admin@cloudity.local (tenant 1)..."
	@$(COMPOSE) $(COMPOSE_FILES) exec -T postgres psql -U cloudity_admin -d cloudity \
	  -c "UPDATE users SET role='admin' WHERE email='admin@cloudity.local' AND tenant_id=1;" >/dev/null \
	  && echo "✅ Rôle admin appliqué. Connexion: admin@cloudity.local / Admin123! (UI back-office /4dm1n)" \
	  || (echo "❌ Promotion role='admin' échouée — vérifier que la stack est up et que le tenant 1 existe."; exit 1)

seed-e2e-2fa: ## Compte E2E 2FA dédié : e2e-2fa@cloudity.local / E2faTest123! (recrée le user si besoin)
	@echo "👤 Compte E2E 2FA (e2e-2fa@cloudity.local) — suppression éventuelle puis inscription..."
	@$(COMPOSE) $(COMPOSE_FILES) exec -T postgres psql -U cloudity_admin -d cloudity -v ON_ERROR_STOP=1 \
	  -c "DELETE FROM users WHERE email='e2e-2fa@cloudity.local' AND tenant_id=1;"
	@curl -sf -X POST http://localhost:$(PORT_GATEWAY)/auth/register \
	  -H "Content-Type: application/json" \
	  -d '{"email":"e2e-2fa@cloudity.local","password":"E2faTest123!","tenant_id":"1"}' >/dev/null \
	  && echo "✅ Compte E2E 2FA créé (E2faTest123!)." \
	  || (echo "❌ Inscription e2e-2fa échouée — stack up ?"; exit 1)

reset-e2e-2fa: ## Désactive 2FA + supprime codes récup pour e2e-2fa@cloudity.local (avant e2e/twofa.spec.ts)
	@chmod +x scripts/dev/reset-user-2fa.sh
	@./scripts/dev/reset-user-2fa.sh e2e-2fa@cloudity.local

format: ## Formate le code de tous les services
	@echo "✨ Formatage du code..."
	@$(COMPOSE) $(COMPOSE_FILES) exec auth-service go fmt ./... 2>/dev/null || echo "⚠️  Formatage Go auth-service échoué"
	@$(COMPOSE) $(COMPOSE_FILES) exec api-gateway go fmt ./... 2>/dev/null || echo "⚠️  Formatage Go api-gateway échoué"
	@$(COMPOSE) $(COMPOSE_FILES) exec admin-service black . 2>/dev/null || echo "⚠️  Formatage Python échoué"
	@$(COMPOSE) $(COMPOSE_FILES) exec cloudity-web npm run format 2>/dev/null || echo "⚠️  Formatage React échoué"
	@echo "✅ Formatage terminé!"

update-deps: ## Met à jour les dépendances
	@echo "🔄 Mise à jour des dépendances..."
	@cd backend/auth-service && go mod tidy && go get -u ./... 2>/dev/null || true
	@cd backend/api-gateway && go mod tidy && go get -u ./... 2>/dev/null || true
	@cd frontend && npm update 2>/dev/null || true
	@cd mobile/admin_app && flutter pub upgrade 2>/dev/null || true
	@echo "✅ Dépendances mises à jour!"

reset: ## Reset complet (clean + init + up)
	@make clean
	@make init
	@make up
	@echo "✅ Reset terminé."


diagnose: ## Lance le diagnostic complet du projet
	@echo "🔍 Diagnostic Cloudity..."
	@chmod +x scripts/dev/diagnose.sh
	@./scripts/dev/diagnose.sh

fix-project: ## Répare automatiquement les problèmes du projet
	@echo "🔧 Réparation automatique..."
	@chmod +x scripts/dev/fix-project.sh
	@./scripts/dev/fix-project.sh

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
	@curl -sf http://localhost:$(PORT_GATEWAY)/health >/dev/null && echo "  ✅ API Gateway (6080): OK" || echo "  ❌ API Gateway: FAIL"
	@curl -sf http://localhost:$(PORT_ADMIN)/health >/dev/null && echo "  ✅ Admin (6082): OK" || echo "  ❌ Admin: FAIL"
	@curl -sf http://localhost:$(PORT_DASHBOARD) >/dev/null && echo "  ✅ Dashboard (6001): OK" || echo "  ❌ Dashboard: FAIL"
	@curl -sf http://localhost:$(PORT_DASHBOARD)/4dm1n | grep -q 'main-admin' && echo "  ✅ Back-office /4dm1n (6001): OK" || echo "  ❌ Back-office /4dm1n: FAIL (attend admin.html + bundle admin)"
	@curl -sf http://localhost:6084 >/dev/null && echo "  ✅ Redis Commander (6084): OK" || echo "  ⚠️  Redis Commander (6084): non démarré (make up avec profil dev)"
	@curl -sf http://localhost:6083 >/dev/null && echo "  ✅ Adminer (6083): OK" || echo "  ⚠️  Adminer (6083): non démarré (make up avec profil dev)"

debug-logs: ## Affiche les logs des services qui posent problème
	@echo "🐛 Debug des services..."
	@echo "=== Password Manager (souvent bloquant pour le gateway) ==="
	@$(COMPOSE) $(COMPOSE_FILES) logs --tail=40 passwords-service 2>/dev/null || echo "passwords-service non démarré"
	@echo ""
	@echo "=== Drive Service ==="
	@$(COMPOSE) $(COMPOSE_FILES) logs --tail=40 drive-service 2>/dev/null || echo "drive-service non démarré"
	@echo ""
	@echo "=== Mail Directory ==="
	@$(COMPOSE) $(COMPOSE_FILES) logs --tail=30 mail-directory-service 2>/dev/null || echo "mail-directory-service non démarré"
	@echo ""
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
	@$(COMPOSE) $(COMPOSE_FILES) logs --tail=20 cloudity-web 2>/dev/null || echo "Frontend non démarré"

rebuild-force: ## Rebuild complet sans cache
	@$(MAKE) ensure-mail-encryption-key
	@$(MAKE) ensure-alias-encryption-key
	@echo "🔨 Rebuild forcé de tous les services..."
	@$(COMPOSE) $(COMPOSE_FILES) down -v --remove-orphans
	@docker system prune -f
	@$(COMPOSE) $(COMPOSE_FILES) build --no-cache --parallel
	@$(MAKE) build-pass-extension
	@echo "✅ Rebuild terminé!"

status: ## Affiche services, port, URL, état + bloc URLs (hub, Pass, Mail, gateway… ; CLOUDITY_STATUS_HOST pour LAN)
	@chmod +x scripts/dev/status.sh 2>/dev/null || true
	@./scripts/dev/status.sh

# Recettes explicites : évite les pièges de « cible sans recette » et des fichiers locaux nommés statys/stats.
statys stats stat: ## Alias de make status (ex. faute « statys » ou raccourci « stat »)
	@$(MAKE) --no-print-directory status

status-watch: ## Rafraîchit make status toutes les 10 s (`watch -c` + couleurs forcées). Prérequis : procps-ng / watch
	@chmod +x scripts/dev/status.sh 2>/dev/null || true
	@if command -v watch >/dev/null 2>&1; then \
		if watch -h 2>&1 | grep -q -- '--color'; then \
			watch -n 10 -c -- env CLOUDITY_STATUS_FORCE_COLOR=1 bash -lc 'cd "$(CURDIR)" && ./scripts/dev/status.sh'; \
		else \
			watch -n 10 -- env CLOUDITY_STATUS_FORCE_COLOR=1 bash -lc 'cd "$(CURDIR)" && ./scripts/dev/status.sh'; \
		fi; \
	else \
		echo "⚠️  \`watch\` introuvable. Installez-le (ex. procps) ou : while sleep 10; do clear; CLOUDITY_STATUS_FORCE_COLOR=1 make status; done"; \
		exit 1; \
	fi

# === Surveillance ressources (CLI uniquement) ============================
# Rituel : avant CHAQUE feature/refactor → make perf-snapshot LABEL=before-XXX
#                              après → make perf-snapshot LABEL=after-XXX
#                              vérif  → make perf-diff
# Voir docs/operations/PERFORMANCES-MONITORING.md.

perf-watch: ## Surveillance temps réel CPU/MEM/IO de tous les conteneurs cloudity-* (Ctrl+C pour quitter)
	@chmod +x scripts/dev/perf-watch.sh 2>/dev/null || true
	@./scripts/dev/perf-watch.sh

perf-watch-once: ## Une seule passe de perf-watch (pour cron / CI / log file)
	@chmod +x scripts/dev/perf-watch.sh 2>/dev/null || true
	@./scripts/dev/perf-watch.sh --once

perf-snapshot: ## Capture un snapshot horodaté → reports/perf/<ts>-<LABEL>.json (utilise LABEL=xxx)
	@chmod +x scripts/dev/perf-snapshot.sh 2>/dev/null || true
	@./scripts/dev/perf-snapshot.sh --label "$(or $(LABEL),snapshot)"

perf-diff: ## Compare les 2 derniers snapshots (ou make perf-diff BEFORE=... AFTER=...)
	@chmod +x scripts/dev/perf-diff.sh 2>/dev/null || true
	@if [ -n "$(BEFORE)" ] && [ -n "$(AFTER)" ]; then \
		./scripts/dev/perf-diff.sh "$(BEFORE)" "$(AFTER)"; \
	else \
		./scripts/dev/perf-diff.sh; \
	fi

perf-budgets: ## Vérifie respect des budgets (exit 0 OK / 1 KO) — utilisable en pré-commit / CI
	@chmod +x scripts/dev/perf-budgets.sh 2>/dev/null || true
	@./scripts/dev/perf-budgets.sh

perf-budgets-json: ## Idem perf-budgets, sortie JSON (admin-service / dashboards)
	@chmod +x scripts/dev/perf-budgets.sh 2>/dev/null || true
	@./scripts/dev/perf-budgets.sh --json

wait-for-backends: ## Attend auth + gateway + admin-service (sans front)
	@echo "⏳ Attente des backends (auth, gateway, admin-service)..."
	@timeout=120; \
	while [ $$timeout -gt 0 ]; do \
		if curl -sf http://localhost:$(PORT_AUTH)/health >/dev/null && \
		   curl -sf http://localhost:$(PORT_GATEWAY)/health >/dev/null && \
		   curl -sf http://localhost:$(PORT_ADMIN)/health >/dev/null; then \
			echo "✅ Backends prêts."; \
			exit 0; \
		fi; \
		echo "Attente backends... ($$timeout s)"; \
		sleep 5; \
		timeout=$$((timeout-5)); \
	done; \
	echo "❌ Timeout backends."; make debug-logs; exit 1

wait-for-dashboard: ## Attend Vite sur PORT_DASHBOARD (cloudity-web : npm install au 1er run)
	@echo "⏳ Attente du front Vite (cloudity-web, 1er démarrage souvent 1–3 min)..."
	@timeout=240; \
	while [ $$timeout -gt 0 ]; do \
		if curl -sf http://localhost:$(PORT_DASHBOARD)/ >/dev/null; then \
			echo "✅ Dashboard http://localhost:$(PORT_DASHBOARD) prêt."; \
			exit 0; \
		fi; \
		echo "Attente :$(PORT_DASHBOARD)... ($$timeout s) — logs: docker compose logs -f cloudity-web"; \
		sleep 5; \
		timeout=$$((timeout-5)); \
	done; \
	echo "❌ Timeout dashboard (:$(PORT_DASHBOARD)). Logs: docker compose logs cloudity-web"; \
	exit 1

wait-for-services: wait-for-backends wait-for-dashboard ## Backends + dashboard (pour up-full / tests manuels)

backend-only: ## Lance uniquement les services backend (sans frontend)
	@$(COMPOSE) $(COMPOSE_FILES) up -d postgres redis auth-service api-gateway admin-service
	@make wait-for-backends

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
	@if [ ! -s frontend/apps/cloudity-web/Dockerfile.dev ]; then \
		echo "⚠️  frontend/apps/cloudity-web/Dockerfile.dev est vide ou n'existe pas"; \
	else \
		echo "✅ frontend/apps/cloudity-web/Dockerfile.dev OK"; \
	fi

# Créer/corriger les Dockerfiles manquants
fix-dockerfiles: ## Répare ou crée les Dockerfiles manquants
	@echo "🔧 Réparation des Dockerfiles..."
	@if [ ! -s backend/auth-service/Dockerfile.dev ]; then \
		echo "FROM golang:1.25-alpine\n\nWORKDIR /app\n\nRUN apk add --no-cache git\n\nRUN go install github.com/cosmtrek/air@v1.42.0\n\nCOPY go.mod go.sum ./\nRUN go mod download\n\nCOPY . .\n\nEXPOSE 8081\n\nCMD [\"air\", \"-c\", \".air.toml\"]" > backend/auth-service/Dockerfile.dev; \
		echo "✅ backend/auth-service/Dockerfile.dev créé"; \
	fi
	@if [ ! -s backend/api-gateway/Dockerfile.dev ]; then \
		echo "FROM golang:1.25-alpine\n\nWORKDIR /app\n\nRUN apk add --no-cache git\n\nRUN go install github.com/cosmtrek/air@v1.42.0\n\nCOPY go.mod go.sum ./\nRUN go mod download\n\nCOPY . .\n\nEXPOSE 8000\n\nCMD [\"air\", \"-c\", \".air.toml\"]" > backend/api-gateway/Dockerfile.dev; \
		echo "✅ backend/api-gateway/Dockerfile.dev créé"; \
	fi
	@if [ ! -s backend/admin-service/Dockerfile.dev ]; then \
		echo "FROM python:3.11-slim\n\nENV PYTHONUNBUFFERED=1\nENV PYTHONDONTWRITEBYTECODE=1\nENV PIP_NO_CACHE_DIR=1\n\nRUN apt-get update && apt-get install -y \\\n    curl \\\n    gcc \\\n    libpq-dev \\\n    && rm -rf /var/lib/apt/lists/*\n\nWORKDIR /app\n\nRUN pip install uvicorn[standard] watchfiles\n\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\n\nCOPY . .\n\nEXPOSE 8082\n\nCMD [\"uvicorn\", \"app.main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8082\", \"--reload\", \"--reload-dir\", \"/app/app\"]" > backend/admin-service/Dockerfile.dev; \
		echo "✅ backend/admin-service/Dockerfile.dev créé"; \
	fi
	@if [ ! -s frontend/apps/cloudity-web/Dockerfile.dev ]; then \
		echo "Voir frontend/apps/cloudity-web/Dockerfile.dev (monorepo : contexte ./frontend)"; \
	fi

# Reconstruire un service spécifique
rebuild-service: ## Menu pour reconstruire un service spécifique
	@echo "🔄 Reconstruire un service"
	@echo "1) auth-service"
	@echo "2) api-gateway"
	@echo "3) admin-service"
	@echo "4) cloudity-web"
	@echo "5) drive-service"
	@read -p "Choisir un service (1-5): " choice; \
	case $$choice in \
		1) make rebuild-auth ;; \
		2) make rebuild-gateway ;; \
		3) make rebuild-admin ;; \
		4) make rebuild-dashboard ;; \
		5) make rebuild-drive ;; \
		*) echo "Choix invalide" ;; \
	esac

rebuild-auth: ## Reconstruit auth-service
	@$(COMPOSE) $(COMPOSE_FILES) stop auth-service 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache auth-service && $(COMPOSE) $(COMPOSE_FILES) up -d auth-service && echo "✅ auth-service OK"

rebuild-gateway: ## Reconstruit api-gateway
	@$(COMPOSE) $(COMPOSE_FILES) stop api-gateway 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache api-gateway && $(COMPOSE) $(COMPOSE_FILES) up -d api-gateway && echo "✅ api-gateway OK"

rebuild-admin: ## Reconstruit admin-service
	@$(COMPOSE) $(COMPOSE_FILES) stop admin-service 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache admin-service && $(COMPOSE) $(COMPOSE_FILES) up -d admin-service && echo "✅ admin-service OK"

rebuild-dashboard: ## Reconstruit cloudity-web
	@$(COMPOSE) $(COMPOSE_FILES) stop cloudity-web 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache cloudity-web && $(COMPOSE) $(COMPOSE_FILES) up -d cloudity-web && echo "✅ cloudity-web OK"

rebuild-drive: ## Reconstruit drive-service
	@$(COMPOSE) $(COMPOSE_FILES) stop drive-service 2>/dev/null; $(COMPOSE) $(COMPOSE_FILES) build --no-cache drive-service && $(COMPOSE) $(COMPOSE_FILES) up -d drive-service && echo "✅ drive-service OK"

rebuild-mail: ## Reconstruit mail-directory-service (fix 404 sur /mail/me/accounts) et relance le gateway
	@$(COMPOSE) $(COMPOSE_FILES) stop mail-directory-service 2>/dev/null; \
	$(COMPOSE) $(COMPOSE_FILES) build --no-cache mail-directory-service && \
	$(COMPOSE) $(COMPOSE_FILES) up -d mail-directory-service && \
	echo "Attente que mail-directory-service soit healthy (healthcheck toutes les 30 s, max 40 s)..." && \
	i=0; while [ $$i -lt 20 ]; do \
	  docker inspect --format='{{.State.Health.Status}}' cloudity-mail-directory-service 2>/dev/null | grep -q healthy && break; \
	  sleep 2; i=$$((i+1)); \
	done && \
	(docker inspect --format='{{.State.Health.Status}}' cloudity-mail-directory-service 2>/dev/null | grep -q healthy) || (echo "❌ mail-directory-service pas healthy après 40 s. Vérifiez: docker compose logs mail-directory-service"; exit 1) && \
	$(COMPOSE) $(COMPOSE_FILES) up -d api-gateway && \
	echo "✅ mail-directory-service OK. Si la page Mail affichait 404, rechargez l'app."

verify-mail-api: ## Vérifie que le gateway transmet bien /mail/* (après make up ou make rebuild-mail). Attend 5s puis GET /mail/health.
	@echo "Vérification API Mail (gateway -> mail-directory-service)..."
	@echo "  Attente 5 s que les services soient prêts..."
	@sleep 5
	@curl -sf http://localhost:$(PORT_GATEWAY)/mail/health >/dev/null && echo "  ✅ GET /mail/health: OK" || (echo "  ❌ GET /mail/health: FAIL. Lancez: make up puis make rebuild-mail"; exit 1)
	@echo "  Pour tester /mail/me/accounts: connectez-vous sur http://localhost:$(PORT_DASHBOARD) puis ouvrez Mail."

mail-clean-dev: ## Supprime tous les comptes mail (et messages) du compte démo (user_id=1). Pour retester l'attachement d'une boîte. Prérequis: make up
	@echo "🧹 Nettoyage des comptes mail du compte démo (user_id=1)..."
	@$(COMPOSE) $(COMPOSE_FILES) exec -T postgres psql -U cloudity_admin -d cloudity -c "DELETE FROM user_email_accounts WHERE user_id = 1;" 2>/dev/null || true
	@echo "✅ Comptes mail supprimés. Vous restez connecté ; rechargez la page Mail (ou l'app) puis ajoutez votre boîte à nouveau."

clean-pass-e2e-vaults: ## Supprime les coffres Pass nommés « e2e-* » (Playwright pass.spec.ts). Prérequis: make up. Option: PASS_E2E_CLEAN_EMAIL=
	@chmod +x scripts/dev/cleanup-pass-e2e-vaults.sh
	@./scripts/dev/cleanup-pass-e2e-vaults.sh

clean-test-tenants: ## Nettoie les tenants de test connus (APPLY=1 pour suppression réelle)
	@chmod +x scripts/dev/cleanup-test-tenants.sh
	@if [ "$(APPLY)" = "1" ]; then \
		./scripts/dev/cleanup-test-tenants.sh --apply; \
	else \
		./scripts/dev/cleanup-test-tenants.sh; \
	fi

setup-infra-only: ## Démarre uniquement Postgres + Redis
	@$(COMPOSE) $(COMPOSE_FILES) up -d postgres redis
	@echo "✅ Postgres (6042), Redis (6079) démarrés."

start-service: ## Démarre un service spécifique
	@echo "🚀 Démarrer un service"
	@echo "1) auth-service"
	@echo "2) api-gateway"
	@echo "3) admin-service" 
	@echo "4) cloudity-web"
	@echo "5) postgres"
	@echo "6) redis"
	@read -p "Choisir un service (1-6): " choice; \
	case $$choice in \
		1) docker compose up -d auth-service ;; \
		2) docker compose up -d api-gateway ;; \
		3) docker compose up -d admin-service ;; \
		4) docker compose up -d cloudity-web ;; \
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
	@echo "4) cloudity-web"
	@echo "5) postgres"
	@echo "6) redis"
	@echo "7) tous les services"
	@read -p "Choisir un service (1-7): " choice; \
	case $$choice in \
		1) docker compose stop auth-service ;; \
		2) docker compose stop api-gateway ;; \
		3) docker compose stop admin-service ;; \
		4) docker compose stop cloudity-web ;; \
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
	@echo "4) cloudity-web"
	@echo "5) postgres"
	@echo "6) redis"
	@echo "7) tous les services"
	@read -p "Choisir un service (1-7): " choice; \
	case $$choice in \
		1) docker compose restart auth-service ;; \
		2) docker compose restart api-gateway ;; \
		3) docker compose restart admin-service ;; \
		4) docker compose restart cloudity-web ;; \
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
	@echo "4) cloudity-web"
	@echo "5) postgres"
	@echo "6) redis"
	@echo "7) tous les services"
	@read -p "Choisir un service (1-7): " choice; \
	case $$choice in \
		1) docker compose logs -f auth-service ;; \
		2) docker compose logs -f api-gateway ;; \
		3) docker compose logs -f admin-service ;; \
		4) docker compose logs -f cloudity-web ;; \
		5) docker compose logs -f postgres ;; \
		6) docker compose logs -f redis ;; \
		7) docker compose logs -f ;; \
		*) echo "Choix invalide" ;; \
	esac

# Gestion des applications mobiles
init-mobile: ## Initialise toutes les applications mobiles
	@echo "📱 Initialisation des applications mobiles..."
	@if command -v flutter >/dev/null 2>&1; then \
		for app in mobile/admin_app mobile/calendar mobile/chat mobile/drive mobile/mail mobile/notes mobile/contacts mobile/photos mobile/pass; do \
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
		for app in mobile/admin_app mobile/calendar mobile/chat mobile/drive mobile/mail mobile/notes mobile/contacts mobile/photos mobile/pass; do \
			if [ -d "$$app" ]; then \
				echo "Build de $$app"; \
				cd $$app && flutter build apk --debug; \
			fi; \
		done; \
		echo "✅ Applications mobiles construites"; \
	else \
		echo "⚠️  Flutter non installé, applications mobiles ignorées"; \
	fi

# run-mobile : voir en tête du Makefile (scripts/mobile/run-mobile.sh + APP=…). Ancienne recette interactive retirée car elle écrasait cette cible.

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
	@echo "1) Démarrer cloudity-web"
	@echo "2) Démarrer tous les frontends"
	@echo "3) Arrêter cloudity-web"
	@echo "4) Arrêter tous les frontends"
	@echo "5) Rebuild cloudity-web"
	@read -p "Choisir une action (1-5): " choice; \
	case $$choice in \
		1) docker compose up -d cloudity-web ;; \
		2) docker compose up -d cloudity-web ;; \
		3) docker compose stop cloudity-web ;; \
		4) docker compose stop cloudity-web ;; \
		5) make rebuild-dashboard ;; \
		*) echo "Choix invalide" ;; \
	esac

create-frontend: ## Crée un nouveau service frontend
	@echo "🎨 Création d'un nouveau service frontend..."
	@read -p "Nom du service (ex: user-dashboard): " name; \
	if [ -n "$$name" ]; then \
		mkdir -p frontend/apps/$$name/src; \
		cp -r frontend/apps/cloudity-web/Dockerfile.dev frontend/apps/$$name/ 2>/dev/null || true; \
		cp frontend/apps/cloudity-web/package.json frontend/apps/cloudity-web/vite.config.js frontend/apps/$$name/; \
		cp -r frontend/apps/cloudity-web/src/App.tsx frontend/apps/cloudity-web/src/main.tsx frontend/apps/$$name/src/; \
		cp frontend/apps/cloudity-web/index.html frontend/apps/$$name/; \
		sed -i "s/@cloudity\\/web/$$name/g" frontend/apps/$$name/package.json; \
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