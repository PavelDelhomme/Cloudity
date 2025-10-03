# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE ADMIN
# Gestion des fonctionnalités d'administration système
# ═══════════════════════════════════════════════════════════════

.PHONY: start-admin stop-admin restart-admin status-admin logs-admin
.PHONY: admin-dashboard admin-users admin-stats admin-backup admin-restore
.PHONY: admin-cleanup admin-monitor admin-security admin-logs

# ═══════════════════════════════════════════════════════════════
# STACK ADMINISTRATION COMPLÈTE
# ═══════════════════════════════════════════════════════════════

start-admin: ## Démarrer la stack administration complète
	$(call log_rocket,"Démarrage stack administration")
	@make start-infra
	@sleep 2
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	@sleep 2
	@$(COMPOSE) up -d admin-dashboard
	@sleep 1
	@$(COMPOSE) up -d adminer redis-commander
	$(call log_success,"Stack administration opérationnelle")

stop-admin: ## Arrêter la stack administration
	$(call log_info,"Arrêt stack administration")
	@$(COMPOSE) stop admin-dashboard adminer redis-commander $(BACKEND_CORE_SERVICES)
	$(call log_success,"Stack administration arrêtée")

restart-admin: ## Redémarrer la stack administration
	$(call log_info,"Redémarrage stack administration")
	@make stop-admin
	@sleep 2
	@make start-admin

status-admin: ## Status de la stack administration
	@echo "$(CYAN)═══ STATUS ADMINISTRATION ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Services Administration:$(NC)"
	@$(call check_service_status,admin-service)
	@$(call check_service_status,admin-dashboard)
	@$(call check_service_status,adminer)
	@$(call check_service_status,redis-commander)
	@echo ""

logs-admin: ## Logs de la stack administration
	@$(COMPOSE) logs -f admin-service admin-dashboard

# ═══════════════════════════════════════════════════════════════
# DASHBOARD ADMINISTRATION
# ═══════════════════════════════════════════════════════════════

admin-dashboard: ## Accéder au dashboard admin
	$(call log_info,"Ouverture dashboard admin")
	@if $(COMPOSE) ps admin-dashboard --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)$(EMOJI_ADMIN) Dashboard Admin: http://localhost:$(ADMIN_DASHBOARD_PORT)$(NC)"; \
		if command -v xdg-open >/dev/null 2>&1; then \
			xdg-open http://localhost:$(ADMIN_DASHBOARD_PORT); \
		fi; \
	else \
		echo "$(RED)Dashboard admin non démarré$(NC)"; \
		echo "$(YELLOW)Démarrage: make start-admin-dashboard$(NC)"; \
	fi

admin-tools: ## Afficher les outils d'administration disponibles
	@echo "$(CYAN)═══ OUTILS ADMINISTRATION ═══$(NC)"
	@echo ""
	@$(call show_service_url,admin-dashboard,http://localhost:$(ADMIN_DASHBOARD_PORT),$(EMOJI_ADMIN))
	@$(call show_service_url,adminer,http://localhost:$(ADMINER_PORT),$(EMOJI_DATABASE))
	@$(call show_service_url,redis-commander,http://localhost:$(REDIS_COMMANDER_PORT),🔧)
	@echo ""
	@echo "$(PURPLE)Accès direct:$(NC)"
	@echo "$(GREEN)make admin-dashboard$(NC)  - Ouvrir le dashboard"
	@echo "$(GREEN)make admin-db$(NC)         - Ouvrir Adminer"
	@echo "$(GREEN)make admin-redis$(NC)      - Ouvrir Redis Commander"

admin-db: ## Accéder à Adminer (gestion BDD)
	$(call log_info,"Ouverture Adminer")
	@if $(COMPOSE) ps adminer --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)$(EMOJI_DATABASE) Adminer: http://localhost:$(ADMINER_PORT)$(NC)"; \
		if command -v xdg-open >/dev/null 2>&1; then \
			xdg-open http://localhost:$(ADMINER_PORT); \
		fi; \
	else \
		echo "$(RED)Adminer non démarré$(NC)"; \
		echo "$(YELLOW)Démarrage: make start-adminer$(NC)"; \
	fi

admin-redis: ## Accéder à Redis Commander
	$(call log_info,"Ouverture Redis Commander")
	@if $(COMPOSE) ps redis-commander --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)🔧 Redis Commander: http://localhost:$(REDIS_COMMANDER_PORT)$(NC)"; \
		if command -v xdg-open >/dev/null 2>&1; then \
			xdg-open http://localhost:$(REDIS_COMMANDER_PORT); \
		fi; \
	else \
		echo "$(RED)Redis Commander non démarré$(NC)"; \
		echo "$(YELLOW)Démarrage: make start-redis-commander$(NC)"; \
	fi

# ═══════════════════════════════════════════════════════════════
# GESTION DES UTILISATEURS
# ═══════════════════════════════════════════════════════════════

admin-users: ## Lister les utilisateurs
	$(call log_info,"Liste des utilisateurs")
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity -c "SELECT id, email, created_at, is_active FROM users ORDER BY created_at DESC;"

admin-create-user: ## Créer un utilisateur (usage: make admin-create-user EMAIL=user@domain.com PASSWORD=pass123)
	$(call log_info,"Création utilisateur")
	@if [ -z "$(EMAIL)" ] || [ -z "$(PASSWORD)" ]; then \
		echo "$(RED)Usage: make admin-create-user EMAIL=user@domain.com PASSWORD=pass123$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Création utilisateur: $(EMAIL)$(NC)"
	@curl -X POST http://localhost:$(API_GATEWAY_PORT)/api/v1/auth/register \
		-H "Content-Type: application/json" \
		-d '{"email":"$(EMAIL)","password":"$(PASSWORD)"}' || echo "$(RED)Erreur création$(NC)"

admin-delete-user: ## Supprimer un utilisateur (usage: make admin-delete-user EMAIL=user@domain.com)
	$(call log_warning,"Suppression utilisateur")
	@if [ -z "$(EMAIL)" ]; then \
		echo "$(RED)Usage: make admin-delete-user EMAIL=user@domain.com$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Suppression utilisateur: $(EMAIL)$(NC)"
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity -c "DELETE FROM users WHERE email='$(EMAIL)';"

# ═══════════════════════════════════════════════════════════════
# STATISTIQUES ET MONITORING
# ═══════════════════════════════════════════════════════════════

admin-stats: ## Afficher les statistiques système
	$(call log_info,"Statistiques système")
	@echo "$(CYAN)═══ STATISTIQUES CLOUDITY ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Base de données:$(NC)"
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity -c "SELECT 'Utilisateurs' as table_name, COUNT(*) as count FROM users UNION SELECT 'Sessions' as table_name, COUNT(*) as count FROM sessions;"
	@echo ""
	@echo "$(PURPLE)Services:$(NC)"
	@docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(shell docker ps --format "{{.Names}}" | grep cloudity) 2>/dev/null || echo "Aucun service en cours"
	@echo ""

admin-monitor: ## Monitoring en temps réel
	$(call log_info,"Monitoring en temps réel")
	@echo "$(CYAN)═══ MONITORING CLOUDITY ═══$(NC)"
	@echo "$(YELLOW)Surveillance en cours... (Ctrl+C pour arrêter)$(NC)"
	@while true; do \
		clear; \
		echo "$(CYAN)═══ MONITORING - $(shell date) ═══$(NC)"; \
		make admin-stats 2>/dev/null; \
		sleep 10; \
	done

# ═══════════════════════════════════════════════════════════════
# SAUVEGARDES ET MAINTENANCE
# ═══════════════════════════════════════════════════════════════

admin-backup: ## Sauvegarde complète du système
	$(call log_info,"Sauvegarde système")
	@mkdir -p storage/backups/$(shell date +%Y%m%d)
	@echo "$(YELLOW)Sauvegarde base de données...$(NC)"
	@$(COMPOSE) exec postgres pg_dump -U cloudity_admin cloudity > storage/backups/$(shell date +%Y%m%d)/cloudity_$(shell date +%H%M%S).sql
	@echo "$(YELLOW)Sauvegarde configuration...$(NC)"
	@cp -r infrastructure/postgresql/init storage/backups/$(shell date +%Y%m%d)/
	@cp docker-compose.yml storage/backups/$(shell date +%Y%m%d)/
	$(call log_success,"Sauvegarde terminée: storage/backups/$(shell date +%Y%m%d)/")

admin-restore: ## Restaurer une sauvegarde (usage: make admin-restore FILE=backup.sql)
	$(call log_warning,"Restauration système")
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)Usage: make admin-restore FILE=backup.sql$(NC)"; \
		echo "$(YELLOW)Sauvegardes disponibles:$(NC)"; \
		ls -la storage/backups/*/; \
		exit 1; \
	fi
	@echo "$(YELLOW)Restauration: $(FILE)$(NC)"
	@$(COMPOSE) exec -T postgres psql -U cloudity_admin -d cloudity < $(FILE)
	$(call log_success,"Restauration terminée")

# ═══════════════════════════════════════════════════════════════
# NETTOYAGE ET MAINTENANCE
# ═══════════════════════════════════════════════════════════════

admin-cleanup: ## Nettoyage système complet
	$(call log_warning,"Nettoyage système")
	@echo "$(YELLOW)Nettoyage des logs...$(NC)"
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity -c "DELETE FROM logs WHERE created_at < NOW() - INTERVAL '7 days';" 2>/dev/null || true
	@echo "$(YELLOW)Nettoyage des sessions expirées...$(NC)"
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity -c "DELETE FROM sessions WHERE expires_at < NOW();" 2>/dev/null || true
	@echo "$(YELLOW)Nettoyage Docker...$(NC)"
	@docker system prune -f >/dev/null 2>&1
	$(call log_success,"Nettoyage terminé")

admin-logs: ## Consulter les logs d'administration
	$(call log_info,"Logs d'administration")
	@echo "$(CYAN)═══ LOGS ADMINISTRATION ═══$(NC)"
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity -c "SELECT * FROM logs WHERE level = 'ERROR' ORDER BY created_at DESC LIMIT 10;" 2>/dev/null || echo "Table logs non disponible"

# ═══════════════════════════════════════════════════════════════
# SÉCURITÉ
# ═══════════════════════════════════════════════════════════════

admin-security: ## Vérifications de sécurité
	$(call log_info,"Vérifications sécurité")
	@echo "$(CYAN)═══ AUDIT SÉCURITÉ ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Utilisateurs actifs:$(NC)"
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity -c "SELECT COUNT(*) as active_users FROM users WHERE is_active = true;" 2>/dev/null || echo "Non disponible"
	@echo ""
	@echo "$(PURPLE)Sessions actives:$(NC)"
	@$(COMPOSE) exec postgres psql -U cloudity_admin -d cloudity -c "SELECT COUNT(*) as active_sessions FROM sessions WHERE expires_at > NOW();" 2>/dev/null || echo "Non disponible"
	@echo ""
	@echo "$(PURPLE)Ports exposés:$(NC)"
	@netstat -tlnp 2>/dev/null | grep -E ":($(API_GATEWAY_PORT)|$(AUTH_SERVICE_PORT)|$(ADMIN_SERVICE_PORT))" || echo "Aucun port exposé détecté"
