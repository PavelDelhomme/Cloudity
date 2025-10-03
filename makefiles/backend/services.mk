# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE BACKEND
# Gestion des services backend (Core, Email, Password)
# ═══════════════════════════════════════════════════════════════

.PHONY: start-backend stop-backend restart-backend status-backend logs-backend clean-backend
.PHONY: start-backend-core stop-backend-core start-backend-email stop-backend-email
.PHONY: start-auth-service stop-auth-service restart-auth-service logs-auth-service shell-auth-service
.PHONY: start-api-gateway stop-api-gateway restart-api-gateway logs-api-gateway shell-api-gateway
.PHONY: start-admin-service stop-admin-service restart-admin-service logs-admin-service shell-admin-service
.PHONY: start-email-service stop-email-service restart-email-service logs-email-service shell-email-service
.PHONY: start-alias-service stop-alias-service restart-alias-service logs-alias-service shell-alias-service
.PHONY: start-password-service stop-password-service restart-password-service logs-password-service shell-password-service

# ═══════════════════════════════════════════════════════════════
# GESTION BACKEND COMPLET
# ═══════════════════════════════════════════════════════════════

start-backend: ## Démarrer le backend complet
	$(call log_rocket,"Démarrage backend complet")
	@make start-infra
	@sleep 3
	@$(COMPOSE) up -d $(ALL_BACKEND_SERVICES)
	@sleep 2
	$(call log_success,"Backend opérationnel")

stop-backend: ## Arrêter le backend
	$(call log_info,"Arrêt backend")
	@$(COMPOSE) stop $(ALL_BACKEND_SERVICES)
	$(call log_success,"Backend arrêté")

restart-backend: ## Redémarrer le backend
	$(call log_info,"Redémarrage backend")
	@make stop-backend
	@sleep 2
	@make start-backend

status-backend: ## Status du backend
	@echo "$(CYAN)═══ STATUS BACKEND ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Backend Core:$(NC)"
	@for service in $(BACKEND_CORE_SERVICES); do \
		$(call check_service_status,$$service); \
	done
	@echo ""
	@echo "$(PURPLE)Backend Email:$(NC)"
	@for service in $(BACKEND_EMAIL_SERVICES); do \
		$(call check_service_status,$$service); \
	done
	@echo ""

logs-backend: ## Logs backend
	@$(COMPOSE) logs -f $(ALL_BACKEND_SERVICES)

clean-backend: ## Nettoyer le backend
	$(call log_warning,"Nettoyage backend")
	@$(COMPOSE) stop $(ALL_BACKEND_SERVICES)
	@$(COMPOSE) rm -f $(ALL_BACKEND_SERVICES)
	$(call log_success,"Backend nettoyé")

# ═══════════════════════════════════════════════════════════════
# BACKEND CORE (Auth, API Gateway, Admin)
# ═══════════════════════════════════════════════════════════════

start-backend-core: ## Démarrer les services backend core
	$(call log_info,"Démarrage backend core")
	@make start-infra
	@sleep 2
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	$(call log_success,"Backend core démarré")

stop-backend-core: ## Arrêter les services backend core
	$(call log_info,"Arrêt backend core")
	@$(COMPOSE) stop $(BACKEND_CORE_SERVICES)
	$(call log_success,"Backend core arrêté")

# ═══════════════════════════════════════════════════════════════
# AUTH SERVICE
# ═══════════════════════════════════════════════════════════════

start-auth-service: ## Démarrer auth-service
	$(call log_info,"Démarrage auth-service")
	@make start-infra
	@$(COMPOSE) up -d auth-service
	$(call log_success,"Auth service démarré sur http://localhost:$(AUTH_SERVICE_PORT)")

stop-auth-service: ## Arrêter auth-service
	@$(COMPOSE) stop auth-service

restart-auth-service: ## Redémarrer auth-service
	@$(COMPOSE) restart auth-service

logs-auth-service: ## Logs auth-service
	@$(COMPOSE) logs -f auth-service

shell-auth-service: ## Shell auth-service
	@$(COMPOSE) exec auth-service /bin/sh

# ═══════════════════════════════════════════════════════════════
# API GATEWAY
# ═══════════════════════════════════════════════════════════════

start-api-gateway: ## Démarrer api-gateway
	$(call log_info,"Démarrage api-gateway")
	@make start-infra
	@$(COMPOSE) up -d api-gateway
	$(call log_success,"API Gateway démarré sur http://localhost:$(API_GATEWAY_PORT)")

stop-api-gateway: ## Arrêter api-gateway
	@$(COMPOSE) stop api-gateway

restart-api-gateway: ## Redémarrer api-gateway
	@$(COMPOSE) restart api-gateway

logs-api-gateway: ## Logs api-gateway
	@$(COMPOSE) logs -f api-gateway

shell-api-gateway: ## Shell api-gateway
	@$(COMPOSE) exec api-gateway /bin/sh

# ═══════════════════════════════════════════════════════════════
# ADMIN SERVICE
# ═══════════════════════════════════════════════════════════════

start-admin-service: ## Démarrer admin-service
	$(call log_info,"Démarrage admin-service")
	@make start-infra
	@$(COMPOSE) up -d admin-service
	$(call log_success,"Admin service démarré sur http://localhost:$(ADMIN_SERVICE_PORT)")

stop-admin-service: ## Arrêter admin-service
	@$(COMPOSE) stop admin-service

restart-admin-service: ## Redémarrer admin-service
	@$(COMPOSE) restart admin-service

logs-admin-service: ## Logs admin-service
	@$(COMPOSE) logs -f admin-service

shell-admin-service: ## Shell admin-service
	@$(COMPOSE) exec admin-service /bin/bash

# ═══════════════════════════════════════════════════════════════
# BACKEND EMAIL (Email Service, Alias Service)
# ═══════════════════════════════════════════════════════════════

start-backend-email: ## Démarrer les services backend email
	$(call log_info,"Démarrage backend email")
	@make start-infra
	@sleep 2
	@$(COMPOSE) up -d $(BACKEND_EMAIL_SERVICES)
	$(call log_success,"Backend email démarré")

stop-backend-email: ## Arrêter les services backend email
	$(call log_info,"Arrêt backend email")
	@$(COMPOSE) stop $(BACKEND_EMAIL_SERVICES)
	$(call log_success,"Backend email arrêté")

# ═══════════════════════════════════════════════════════════════
# EMAIL SERVICE
# ═══════════════════════════════════════════════════════════════

start-email-service: ## Démarrer email-service
	$(call log_info,"Démarrage email-service")
	@make start-infra
	@$(COMPOSE) up -d email-service
	$(call log_success,"Email service démarré sur http://localhost:$(EMAIL_SERVICE_PORT)")

stop-email-service: ## Arrêter email-service
	@$(COMPOSE) stop email-service

restart-email-service: ## Redémarrer email-service
	@$(COMPOSE) restart email-service

logs-email-service: ## Logs email-service
	@$(COMPOSE) logs -f email-service

shell-email-service: ## Shell email-service
	@$(COMPOSE) exec email-service /bin/sh

# ═══════════════════════════════════════════════════════════════
# ALIAS SERVICE
# ═══════════════════════════════════════════════════════════════

start-alias-service: ## Démarrer alias-service
	$(call log_info,"Démarrage alias-service")
	@make start-infra
	@$(COMPOSE) up -d alias-service
	$(call log_success,"Alias service démarré sur http://localhost:$(ALIAS_SERVICE_PORT)")

stop-alias-service: ## Arrêter alias-service
	@$(COMPOSE) stop alias-service

restart-alias-service: ## Redémarrer alias-service
	@$(COMPOSE) restart alias-service

logs-alias-service: ## Logs alias-service
	@$(COMPOSE) logs -f alias-service

shell-alias-service: ## Shell alias-service
	@$(COMPOSE) exec alias-service /bin/sh

# ═══════════════════════════════════════════════════════════════
# PASSWORD SERVICE
# ═══════════════════════════════════════════════════════════════

start-password-service: ## Démarrer password-service
	$(call log_info,"Démarrage password-service")
	@make start-infra
	@$(COMPOSE) up -d password-service
	$(call log_success,"Password service démarré sur http://localhost:$(PASSWORD_SERVICE_PORT)")

stop-password-service: ## Arrêter password-service
	@$(COMPOSE) stop password-service

restart-password-service: ## Redémarrer password-service
	@$(COMPOSE) restart password-service

logs-password-service: ## Logs password-service
	@$(COMPOSE) logs -f password-service

shell-password-service: ## Shell password-service
	@$(COMPOSE) exec password-service /bin/sh

# ═══════════════════════════════════════════════════════════════
# HEALTH CHECKS ET MONITORING
# ═══════════════════════════════════════════════════════════════

health-backend: ## Health check des services backend
	$(call log_info,"Health check backend")
	@echo "$(CYAN)Test des endpoints backend:$(NC)"
	@for service in $(BACKEND_CORE_SERVICES); do \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			port=$$($(COMPOSE) ps $$service --format "{{.Ports}}" 2>/dev/null | grep -o ":[0-9]*->" | cut -d: -f2 | cut -d- -f1 | head -1); \
			if [ ! -z "$$port" ]; then \
				if curl -sf http://localhost:$$port/health >/dev/null 2>&1; then \
					echo "$(GREEN)✓ $$service (port $$port)$(NC)"; \
				else \
					echo "$(RED)✗ $$service (port $$port)$(NC)"; \
				fi; \
			fi; \
		fi; \
	done
