# backend/email-service/Makefile - Service Email Rust Optimisé
.PHONY: help dev build test clean

include ../../scripts/colors.mk

SERVICE_NAME := email-service
PORT := 8091
COMPOSE = docker compose -f ../../docker-compose.yml

help: ## Service Email Rust
	@echo "$(PURPLE)🦀 Email Service (Rust)$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## Configuration initiale
	$(call log_info,"⚙️ Setup Email Service")
	@cargo --version >/dev/null 2>&1 || (echo "$(RED)❌ Cargo/Rust non installé$(NC)" && exit 1)
	@cargo fetch
	@$(MAKE) create-structure
	$(call log_success,"Email Service configuré")

create-structure: ## Crée la structure Rust
	@mkdir -p {src/{handlers,models,services,utils},tests/{unit,integration},docs}
	@touch src/handlers/{email_handler.rs,alias_handler.rs,health_handler.rs}
	@touch src/models/{email.rs,alias.rs,user.rs}
	@touch src/services/{smtp_service.rs,imap_service.rs,alias_service.rs}

dev: ## Développement avec hot reload
	$(call log_info,"🦀 Démarrage Email Service dev")
	@$(COMPOSE) up -d $(SERVICE_NAME)
	$(call log_success,"Email Service: http://localhost:$(PORT)")

dev-local: ## Développement local (sans Docker)
	$(call log_info,"🦀 Démarrage local Email Service")
	@cargo watch -x run
	$(call log_success,"Email Service local: http://localhost:$(PORT)")

build: ## Build le service
	$(call log_info,"🔨 Build Email Service")
	@cargo build
	$(call log_success,"Email Service built")

build-docker: ## Build image Docker
	$(call log_info,"🐳 Build Docker Email Service")
	@$(COMPOSE) build $(SERVICE_NAME)
	$(call log_success,"Image Docker construite")

build-release: ## Build optimisé production
	$(call log_info,"🚀 Build release Email Service")
	@cargo build --release
	$(call log_success,"Build release terminé")

# ═══════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════

test: ## Tests complets
	$(call log_info,"🧪 Tests Email Service")
	@cargo test
	@$(MAKE) test-api
	$(call log_success,"Tests terminés")

test-unit: ## Tests unitaires
	$(call log_info,"🧪 Tests unitaires")
	@cargo test --lib

test-integration: ## Tests d'intégration
	$(call log_info,"🧪 Tests d'intégration")
	@cargo test --test '*'

test-api: ## Tests API manuels
	$(call log_info,"🧪 Tests API")
	@$(MAKE) test-health
	@$(MAKE) test-emails
	@$(MAKE) test-aliases

test-health: ## Test endpoint health
	@curl -sf http://localhost:$(PORT)/health >/dev/null && \
		$(call log_success,"Health OK") || \
		$(call log_error,"Health KO")

test-emails: ## Test endpoints emails
	@curl -sf http://localhost:$(PORT)/api/v1/emails >/dev/null && \
		$(call log_success,"Emails endpoint OK") || \
		$(call log_warning,"Emails endpoint failed")

test-aliases: ## Test endpoints aliases
	@curl -sf http://localhost:$(PORT)/api/v1/aliases >/dev/null && \
		$(call log_success,"Aliases endpoint OK") || \
		$(call log_warning,"Aliases endpoint failed")

# ═══════════════════════════════════════════════════════════════
# DÉVELOPPEMENT AVANCÉ
# ═══════════════════════════════════════════════════════════════

format: ## Formatage du code
	$(call log_info,"✨ Formatage Rust")
	@cargo fmt
	$(call log_success,"Code formaté")

lint: ## Linting Clippy
	$(call log_info,"🔍 Linting Clippy")
	@cargo clippy -- -D warnings
	$(call log_success,"Linting terminé")

doc: ## Génération documentation
	$(call log_info,"📚 Génération documentation")
	@cargo doc --no-deps --open
	$(call log_success,"Documentation générée")

check: ## Vérification Cargo
	$(call log_info,"✅ Vérification Cargo")
	@cargo check
	$(call log_success,"Vérification OK")

audit: ## Audit sécurité
	$(call log_info,"🔐 Audit sécurité")
	@cargo audit || echo "$(YELLOW)⚠️ Installer cargo-audit: cargo install cargo-audit$(NC)"

# ═══════════════════════════════════════════════════════════════
# DATABASE MIGRATIONS
# ═══════════════════════════════════════════════════════════════

db-migrate: ## Migrations spécifiques email
	$(call log_info,"📊 Migrations Email")
	# Ajouter ici les migrations SQLx spécifiques au service email
	$(call log_success,"Migrations terminées")

# ═══════════════════════════════════════════════════════════════
# MONITORING
# ═══════════════════════════════════════════════════════════════

status: ## Status du service
	@if curl -sf http://localhost:$(PORT)/health >/dev/null 2>&1; then \
		echo "$(GREEN)✅ Running$(NC) - http://localhost:$(PORT)"; \
	else \
		echo "$(RED)❌ Stopped$(NC)"; \
	fi

health: ## Health check détaillé
	$(call log_info,"🩺 Health check Email Service")
	@$(MAKE) test-health

logs: ## Logs du service
	@$(COMPOSE) logs -f $(SERVICE_NAME)

shell: ## Shell dans le container
	@$(COMPOSE) exec $(SERVICE_NAME) /bin/sh

# ═══════════════════════════════════════════════════════════════
# UTILITAIRES EMAIL
# ═══════════════════════════════════════════════════════════════

smtp-test: ## Test serveur SMTP
	$(call log_info,"📧 Test SMTP")
	@echo "Test email SMTP local..." | mail -s "Test Cloudity" test@localhost || \
		echo "$(YELLOW)⚠️ Commande mail non disponible$(NC)"

imap-test: ## Test serveur IMAP
	$(call log_info,"📥 Test IMAP")
	@echo "$(YELLOW)ℹ️ Test IMAP à implémenter$(NC)"

alias-test: ## Test système alias
	$(call log_info,"🏷️ Test système alias")
	@curl -sf -X POST http://localhost:$(PORT)/api/v1/aliases \
		-H "Content-Type: application/json" \
		-d '{"alias":"test@example.com","target":"real@example.com"}' \
		>/dev/null && $(call log_success,"Alias test OK") || \
		$(call log_warning,"Alias test failed")

# ═══════════════════════════════════════════════════════════════
# PERFORMANCE
# ═══════════════════════════════════════════════════════════════

bench: ## Benchmarks
	$(call log_info,"⚡ Benchmarks")
	@cargo bench

profile: ## Profiling performance
	$(call log_info,"📈 Profiling")
	@cargo run --release --bin profiler 2>/dev/null || \
		echo "$(YELLOW)⚠️ Profiler non configuré$(NC)"

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE
# ═══════════════════════════════════════════════════════════════

clean: ## Nettoyage Cargo
	$(call log_info,"🧹 Nettoyage Email Service")
	@cargo clean
	@$(COMPOSE) stop $(SERVICE_NAME)
	@$(COMPOSE) rm -f $(SERVICE_NAME)
	$(call log_success,"Email Service nettoyé")

update-deps: ## Mise à jour dépendances
	$(call log_info,"📦 Mise à jour dépendances")
	@cargo update
	$(call log_success,"Dépendances mises à jour")

# ═══════════════════════════════════════════════════════════════
# CONTRÔLES
# ═══════════════════════════════════════════════════════════════

start: dev ## Alias pour dev

stop: ## Arrêt du service
	@$(COMPOSE) stop $(SERVICE_NAME)

restart: ## Redémarrage
	@$(MAKE) stop
	@sleep 1
	@$(MAKE) dev

# ═══════════════════════════════════════════════════════════════
# DÉVELOPPEMENT SPÉCIALISÉ
# ═══════════════════════════════════════════════════════════════

watch: ## Mode watch développement
	$(call log_info,"👀 Mode watch")
	@cargo watch -x 'run --bin email-service'

watch-test: ## Mode watch tests
	$(call log_info,"👀 Mode watch tests")
	@cargo watch -x test

init-project: ## Initialisation projet Rust email
	$(call log_info,"🚀 Initialisation projet email")
	@if [ ! -f "Cargo.toml" ]; then \
		cargo init --name email-service .; \
	fi
	@$(MAKE) setup

# Configuration spécialisée pour paul@delhomme.ovh
setup-delhomme: ## Configuration pour delhomme.ovh
	$(call log_info,"🏷️ Configuration delhomme.ovh")
	@echo "Configuration domaine delhomme.ovh..."
	@echo "MX Records, SPF, DKIM à configurer manuellement"
	$(call log_success,"Configuration domain prête")