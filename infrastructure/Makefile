# infrastructure/Makefile - Gestion infrastructure
.PHONY: help setup dev prod clean status health

include ../scripts/colors.mk

COMPOSE = docker compose -f docker-compose.infrastructure.yml

help: ## Infrastructure Cloudity
	@echo "$(BLUE)🏗️ Infrastructure Cloudity$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## Configuration initiale infrastructure
	$(call log_info,"Setup infrastructure")
	@mkdir -p storage/{postgres,redis,mongodb,logs,backups,certs}
	@chmod +x ../scripts/*.sh 2>/dev/null || true
	$(call log_success,"Infrastructure configurée")

dev: ## Infrastructure développement
	$(call log_info,"Démarrage infrastructure dev")
	@$(COMPOSE) up -d postgres redis
	@$(MAKE) wait-postgres
	@$(MAKE) db-init
	$(call log_success,"Infrastructure dev prête")

prod: ## Infrastructure production
	$(call log_info,"Démarrage infrastructure prod")
	@$(COMPOSE) -f docker-compose.infrastructure.yml -f docker-compose.prod.yml up -d
	$(call log_success,"Infrastructure prod prête")

wait-postgres: ## Attente PostgreSQL
	$(call log_info,"Attente PostgreSQL...")
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if $(COMPOSE) exec postgres pg_isready -U cloudity_admin >/dev/null 2>&1; then \
			$(call log_success,"PostgreSQL prêt"); \
			break; \
		fi; \
		sleep 2; \
		timeout=$$((timeout-2)); \
	done

db-init: ## Initialisation base de données
	$(call log_info,"Initialisation BDD")
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d postgres -f /docker-entrypoint-initdb.d/01-create-database.sql
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity_db -f /docker-entrypoint-initdb.d/02-create-tenants.sql
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity_db -f /docker-entrypoint-initdb.d/03-setup-rls.sql
	$(call log_success,"BDD initialisée")

db-reset-all: ## Reset complet des BDD
	$(call log_warning,"Reset des BDD")
	@$(COMPOSE) down postgres -v
	@$(COMPOSE) up -d postgres
	@$(MAKE) wait-postgres
	@$(MAKE) db-init
	$(call log_success,"BDD réinitialisées")

db-migrate-all: ## Migrations
	@$(MAKE) db-init

db-seed-tenants: ## Données de test
	$(call log_info,"Seed tenants")
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity_db -c "\
	INSERT INTO tenants (name, subdomain, max_storage_gb, max_users, features) VALUES \
	('Admin Tenant', 'admin', 10000, 1, '[\"all\"]'), \
	('Demo Tenant', 'demo', 100, 5, '[\"drive\", \"mail\"]'), \
	('Test Tenant', 'test', 50, 3, '[\"chat\"]') \
	ON CONFLICT (name) DO NOTHING;"
	$(call log_success,"Tenants créés")

backup-all: ## Sauvegarde complète
	$(call log_info,"Sauvegarde")
	@mkdir -p storage/backups/$(shell date +%Y%m%d)
	@$(COMPOSE) exec postgres pg_dump -U cloudity_admin cloudity_db | gzip > storage/backups/$(shell date +%Y%m%d)/postgres_$(shell date +%Y%m%d_%H%M%S).sql.gz
	$(call log_success,"Sauvegarde créée")

restore-latest: ## Restauration
	$(call log_info,"Restauration")
	@latest=$$(ls -t storage/backups/*/postgres_*.sql.gz | head -1); \
	gunzip -c $$latest | $(COMPOSE) exec -T postgres psql -U cloudity_admin cloudity_db
	$(call log_success,"Restauration terminée")

status: ## Status infrastructure
	@echo "$(BLUE)Infrastructure Status:$(NC)"
	@$(COMPOSE) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

health: ## Health check infrastructure
	@$(COMPOSE) exec postgres pg_isready -U cloudity_admin && $(call log_success,"PostgreSQL OK") || $(call log_error,"PostgreSQL KO")
	@$(COMPOSE) exec redis redis-cli ping >/dev/null && $(call log_success,"Redis OK") || $(call log_error,"Redis KO")

logs: ## Logs infrastructure
	@$(COMPOSE) logs -f

shell-postgres: ## Shell PostgreSQL
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity_db

shell-redis: ## Shell Redis
	@$(COMPOSE) exec redis redis-cli

clean: ## Nettoyage infrastructure
	@$(COMPOSE) down -v --remove-orphans

stop: ## Arrêt infrastructure
	@$(COMPOSE) stop
