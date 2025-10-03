# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE FRONTEND
# Gestion des applications frontend (Admin Dashboard, Email App, Password App)
# ═══════════════════════════════════════════════════════════════

.PHONY: start-frontend stop-frontend restart-frontend status-frontend logs-frontend clean-frontend
.PHONY: start-admin-dashboard stop-admin-dashboard restart-admin-dashboard logs-admin-dashboard shell-admin-dashboard
.PHONY: start-email-app stop-email-app restart-email-app logs-email-app shell-email-app
.PHONY: start-password-app stop-password-app restart-password-app logs-password-app shell-password-app
.PHONY: build-frontend install-frontend dev-frontend

# ═══════════════════════════════════════════════════════════════
# GESTION FRONTEND COMPLET
# ═══════════════════════════════════════════════════════════════

start-frontend: ## Démarrer le frontend complet
	$(call log_rocket,"Démarrage frontend complet")
	@make start-backend
	@sleep 2
	@$(COMPOSE) up -d $(FRONTEND_SERVICES)
	@sleep 2
	$(call log_success,"Frontend opérationnel")

stop-frontend: ## Arrêter le frontend
	$(call log_info,"Arrêt frontend")
	@$(COMPOSE) stop $(FRONTEND_SERVICES)
	$(call log_success,"Frontend arrêté")

restart-frontend: ## Redémarrer le frontend
	$(call log_info,"Redémarrage frontend")
	@make stop-frontend
	@sleep 2
	@make start-frontend

status-frontend: ## Status du frontend
	@echo "$(CYAN)═══ STATUS FRONTEND ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Applications Frontend:$(NC)"
	@for service in $(FRONTEND_SERVICES); do \
		$(call check_service_status,$$service); \
	done
	@echo ""

logs-frontend: ## Logs frontend
	@$(COMPOSE) logs -f $(FRONTEND_SERVICES)

clean-frontend: ## Nettoyer le frontend
	$(call log_warning,"Nettoyage frontend")
	@$(COMPOSE) stop $(FRONTEND_SERVICES)
	@$(COMPOSE) rm -f $(FRONTEND_SERVICES)
	$(call log_success,"Frontend nettoyé")

# ═══════════════════════════════════════════════════════════════
# ADMIN DASHBOARD
# ═══════════════════════════════════════════════════════════════

start-admin-dashboard: ## Démarrer admin-dashboard
	$(call log_info,"Démarrage admin-dashboard")
	@make start-backend-core
	@$(COMPOSE) up -d admin-dashboard
	$(call log_success,"Admin dashboard démarré sur http://localhost:$(ADMIN_DASHBOARD_PORT)")

stop-admin-dashboard: ## Arrêter admin-dashboard
	@$(COMPOSE) stop admin-dashboard

restart-admin-dashboard: ## Redémarrer admin-dashboard
	@$(COMPOSE) restart admin-dashboard

logs-admin-dashboard: ## Logs admin-dashboard
	@$(COMPOSE) logs -f admin-dashboard

shell-admin-dashboard: ## Shell admin-dashboard
	@$(COMPOSE) exec admin-dashboard /bin/sh

# ═══════════════════════════════════════════════════════════════
# EMAIL APP
# ═══════════════════════════════════════════════════════════════

start-email-app: ## Démarrer email-app
	$(call log_info,"Démarrage email-app")
	@make start-backend-email
	@$(COMPOSE) up -d email-app
	$(call log_success,"Email app démarrée sur http://localhost:$(EMAIL_APP_PORT)")

stop-email-app: ## Arrêter email-app
	@$(COMPOSE) stop email-app

restart-email-app: ## Redémarrer email-app
	@$(COMPOSE) restart email-app

logs-email-app: ## Logs email-app
	@$(COMPOSE) logs -f email-app

shell-email-app: ## Shell email-app
	@$(COMPOSE) exec email-app /bin/sh

# ═══════════════════════════════════════════════════════════════
# PASSWORD APP
# ═══════════════════════════════════════════════════════════════

start-password-app: ## Démarrer password-app
	$(call log_info,"Démarrage password-app")
	@make start-backend-core
	@$(COMPOSE) up -d password-app
	$(call log_success,"Password app démarrée sur http://localhost:$(PASSWORD_APP_PORT)")

stop-password-app: ## Arrêter password-app
	@$(COMPOSE) stop password-app

restart-password-app: ## Redémarrer password-app
	@$(COMPOSE) restart password-app

logs-password-app: ## Logs password-app
	@$(COMPOSE) logs -f password-app

shell-password-app: ## Shell password-app
	@$(COMPOSE) exec password-app /bin/sh

# ═══════════════════════════════════════════════════════════════
# DÉVELOPPEMENT FRONTEND
# ═══════════════════════════════════════════════════════════════

install-frontend: ## Installer les dépendances frontend
	$(call log_info,"Installation dépendances frontend")
	@cd frontend/admin-dashboard && npm install
	@cd frontend/email-app && npm install
	@cd frontend/password-app && npm install
	$(call log_success,"Dépendances frontend installées")

build-frontend: ## Builder le frontend
	$(call log_info,"Build frontend")
	@cd frontend/admin-dashboard && npm run build
	@cd frontend/email-app && npm run build
	@cd frontend/password-app && npm run build
	$(call log_success,"Frontend buildé")

dev-frontend: ## Mode développement frontend
	$(call log_info,"Mode développement frontend")
	@echo "$(YELLOW)Démarrage en mode développement...$(NC)"
	@echo "$(CYAN)Admin Dashboard: http://localhost:3000$(NC)"
	@echo "$(CYAN)Email App: http://localhost:8094$(NC)"
	@echo "$(CYAN)Password App: http://localhost:8095$(NC)"

# ═══════════════════════════════════════════════════════════════
# TESTS FRONTEND
# ═══════════════════════════════════════════════════════════════

test-frontend: ## Lancer les tests frontend
	$(call log_info,"Tests frontend")
	@cd frontend/admin-dashboard && npm test
	@cd frontend/email-app && npm test
	@cd frontend/password-app && npm test
	$(call log_success,"Tests frontend terminés")

lint-frontend: ## Linter le frontend
	$(call log_info,"Lint frontend")
	@cd frontend/admin-dashboard && npm run lint
	@cd frontend/email-app && npm run lint
	@cd frontend/password-app && npm run lint
	$(call log_success,"Lint frontend terminé")

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE FRONTEND
# ═══════════════════════════════════════════════════════════════

clean-node-modules: ## Nettoyer les node_modules
	$(call log_warning,"Nettoyage node_modules")
	@rm -rf frontend/admin-dashboard/node_modules
	@rm -rf frontend/email-app/node_modules
	@rm -rf frontend/password-app/node_modules
	$(call log_success,"node_modules nettoyés")

update-frontend: ## Mettre à jour les dépendances frontend
	$(call log_info,"Mise à jour dépendances frontend")
	@cd frontend/admin-dashboard && npm update
	@cd frontend/email-app && npm update
	@cd frontend/password-app && npm update
	$(call log_success,"Dépendances frontend mises à jour")
