# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE INFRASTRUCTURE
# Gestion de PostgreSQL, Redis et outils d'administration
# ═══════════════════════════════════════════════════════════════

.PHONY: start-infra stop-infra restart-infra status-infra logs-infra clean-infra
.PHONY: start-postgres stop-postgres restart-postgres logs-postgres shell-postgres
.PHONY: start-redis stop-redis restart-redis logs-redis shell-redis
.PHONY: start-adminer stop-adminer start-redis-commander stop-redis-commander

# ═══════════════════════════════════════════════════════════════
# GESTION DE L'INFRASTRUCTURE COMPLÈTE
# ═══════════════════════════════════════════════════════════════

start-infra: ## Démarrer l'infrastructure complète
	$(call log_rocket,"Démarrage infrastructure")
	@$(COMPOSE) up -d $(INFRASTRUCTURE_SERVICES)
	@$(call wait_for_postgres)
	$(call log_success,"Infrastructure prête")

stop-infra: ## Arrêter l'infrastructure
	$(call log_info,"Arrêt infrastructure")
	@$(COMPOSE) stop $(INFRASTRUCTURE_SERVICES)
	$(call log_success,"Infrastructure arrêtée")

restart-infra: ## Redémarrer l'infrastructure
	$(call log_info,"Redémarrage infrastructure")
	@$(MAKE) stop-infra
	@sleep 2
	@$(MAKE) start-infra

status-infra: ## Status de l'infrastructure
	@echo "$(CYAN)═══ STATUS INFRASTRUCTURE ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Services Infrastructure:$(NC)"
	@for service in $(INFRASTRUCTURE_SERVICES); do \
		$(call check_service_status,$$service); \
	done
	@echo ""

logs-infra: ## Logs infrastructure
	@$(COMPOSE) logs -f $(INFRASTRUCTURE_SERVICES)

clean-infra: ## Nettoyer l'infrastructure
	$(call log_warning,"Nettoyage infrastructure")
	@$(COMPOSE) stop $(INFRASTRUCTURE_SERVICES)
	@$(COMPOSE) rm -f $(INFRASTRUCTURE_SERVICES)
	$(call log_success,"Infrastructure nettoyée")

# ═══════════════════════════════════════════════════════════════
# GESTION POSTGRESQL
# ═══════════════════════════════════════════════════════════════

start-postgres: ## Démarrer PostgreSQL
	$(call log_info,"Démarrage PostgreSQL")
	@$(COMPOSE) up -d postgres
	@$(call wait_for_postgres)
	$(call log_success,"PostgreSQL démarré")

stop-postgres: ## Arrêter PostgreSQL
	$(call log_info,"Arrêt PostgreSQL")
	@$(COMPOSE) stop postgres
	$(call log_success,"PostgreSQL arrêté")

restart-postgres: ## Redémarrer PostgreSQL
	$(call log_info,"Redémarrage PostgreSQL")
	@$(COMPOSE) restart postgres
	@$(call wait_for_postgres)
	$(call log_success,"PostgreSQL redémarré")

logs-postgres: ## Logs PostgreSQL
	@$(COMPOSE) logs -f postgres

shell-postgres: ## Shell PostgreSQL
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity

# ═══════════════════════════════════════════════════════════════
# GESTION REDIS
# ═══════════════════════════════════════════════════════════════

start-redis: ## Démarrer Redis
	$(call log_info,"Démarrage Redis")
	@$(COMPOSE) up -d redis
	$(call log_success,"Redis démarré")

stop-redis: ## Arrêter Redis
	$(call log_info,"Arrêt Redis")
	@$(COMPOSE) stop redis
	$(call log_success,"Redis arrêté")

restart-redis: ## Redémarrer Redis
	$(call log_info,"Redémarrage Redis")
	@$(COMPOSE) restart redis
	$(call log_success,"Redis redémarré")

logs-redis: ## Logs Redis
	@$(COMPOSE) logs -f redis

shell-redis: ## Shell Redis
	@$(COMPOSE) exec redis redis-cli

# ═══════════════════════════════════════════════════════════════
# OUTILS D'ADMINISTRATION
# ═══════════════════════════════════════════════════════════════

start-adminer: ## Démarrer Adminer
	$(call log_info,"Démarrage Adminer")
	@$(COMPOSE) up -d adminer
	$(call log_success,"Adminer disponible sur http://localhost:$(ADMINER_PORT)")

stop-adminer: ## Arrêter Adminer
	@$(COMPOSE) stop adminer

start-redis-commander: ## Démarrer Redis Commander
	$(call log_info,"Démarrage Redis Commander")
	@$(COMPOSE) up -d redis-commander
	$(call log_success,"Redis Commander disponible sur http://localhost:$(REDIS_COMMANDER_PORT)")

stop-redis-commander: ## Arrêter Redis Commander
	@$(COMPOSE) stop redis-commander

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE ET DIAGNOSTICS
# ═══════════════════════════════════════════════════════════════

db-backup: ## Sauvegarder la base de données
	$(call log_info,"Sauvegarde base de données")
	@mkdir -p storage/backups
	@$(COMPOSE) exec postgres pg_dump -U cloudity_admin cloudity > storage/backups/cloudity_$(shell date +%Y%m%d_%H%M%S).sql
	$(call log_success,"Sauvegarde terminée")

db-restore: ## Restaurer la base de données (usage: make db-restore FILE=backup.sql)
	$(call log_warning,"Restauration base de données: $(FILE)")
	@if [ -z "$(FILE)" ]; then echo "$(RED)Usage: make db-restore FILE=backup.sql$(NC)"; exit 1; fi
	@$(COMPOSE) exec -T postgres psql -U cloudity_admin -d cloudity < $(FILE)
	$(call log_success,"Restauration terminée")

db-reset: ## Réinitialiser complètement la base de données
	$(call log_warning,"Réinitialisation base de données")
	@$(COMPOSE) stop postgres
	@$(COMPOSE) rm -f postgres
	@docker volume rm cloudity_postgres_data 2>/dev/null || true
	@$(MAKE) start-postgres
	@sleep 5
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d postgres -c "CREATE DATABASE cloudity;"
	$(call log_success,"Base de données réinitialisée")

redis-flush: ## Vider Redis
	$(call log_warning,"Vidage Redis")
	@$(COMPOSE) exec redis redis-cli FLUSHALL
	$(call log_success,"Redis vidé")
