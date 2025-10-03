# ═══════════════════════════════════════════════════════════════
# CLOUDITY - GESTION DES SERVICES INDIVIDUELS
# Commandes pour gérer les services un par un avec leurs dépendances
# ═══════════════════════════════════════════════════════════════

.PHONY: service service-help service-start service-stop service-restart service-status service-logs

# ═══════════════════════════════════════════════════════════════
# AIDE CONTEXTUELLE SERVICES
# ═══════════════════════════════════════════════════════════════

service-help: ## Aide pour la gestion des services
	@echo "$(PURPLE)🔧 GESTION DES SERVICES INDIVIDUELS$(NC)"
	@echo ""
	@echo "$(CYAN)═══ NOUVELLE SYNTAXE SIMPLIFIÉE ═══$(NC)"
	@echo "$(GREEN)make service-start-<nom>$(NC)     # Démarrer un service avec ses dépendances"
	@echo "$(GREEN)make service-stop-<nom>$(NC)      # Arrêter un service"
	@echo "$(GREEN)make service-restart-<nom>$(NC)   # Redémarrer un service"
	@echo "$(GREEN)make service-status-<nom>$(NC)    # Status d'un service"
	@echo "$(GREEN)make service-logs-<nom>$(NC)      # Logs d'un service"
	@echo ""
	@echo "$(CYAN)═══ SERVICES DISPONIBLES ═══$(NC)"
	@echo "$(YELLOW)Infrastructure:$(NC)"
	@echo "  • postgres, redis"
	@echo "$(YELLOW)Backend Core:$(NC)"
	@echo "  • auth-service, api-gateway, admin-service"
	@echo "$(YELLOW)Backend Email:$(NC)"
	@echo "  • email-service, alias-service"
	@echo "$(YELLOW)Backend Password:$(NC)"
	@echo "  • password-service"
	@echo "$(YELLOW)Backend Futurs:$(NC)"
	@echo "  • 2fa-service, calendar-service, drive-service, office-service, gallery-service"
	@echo "$(YELLOW)Frontend:$(NC)"
	@echo "  • admin-dashboard, email-app, password-app"
	@echo ""
	@echo "$(CYAN)═══ EXEMPLES ═══$(NC)"
	@echo "$(GREEN)make service-start-auth-service$(NC)   # Démarre postgres + redis + auth-service"
	@echo "$(GREEN)make service-restart-admin-dashboard$(NC) # Redémarre api-gateway + admin-dashboard"
	@echo "$(GREEN)make service-logs-postgres$(NC)        # Logs de PostgreSQL en temps réel"

service: ## Aide pour la gestion des services
	@make service-help

# ═══════════════════════════════════════════════════════════════
# COMMANDES DE GESTION DES SERVICES (SYNTAXE SIMPLIFIÉE)
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# COMMANDES POUR SERVICES INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════

service-start-postgres: ## Démarrer PostgreSQL
	@echo "$(CYAN)Démarrage postgres...$(NC)"
	@$(COMPOSE) up -d postgres
	@$(call wait_for_postgres)
	@echo "$(GREEN)✅ postgres démarré avec succès$(NC)"

service-stop-postgres: ## Arrêter PostgreSQL
	@echo "$(YELLOW)Arrêt postgres...$(NC)"
	@$(COMPOSE) stop postgres
	@echo "$(GREEN)✅ postgres arrêté$(NC)"

service-restart-postgres: ## Redémarrer PostgreSQL
	@make service-stop-postgres
	@sleep 2
	@make service-start-postgres

service-status-postgres: ## Status PostgreSQL
	@echo "$(CYAN)═══ STATUS postgres ═══$(NC)"
	@$(call check_service_status,postgres)
	@if $(COMPOSE) ps postgres --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps postgres --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-postgres: ## Logs PostgreSQL
	@echo "$(CYAN)═══ LOGS postgres ═══$(NC)"
	@$(COMPOSE) logs -f postgres

service-start-redis: ## Démarrer Redis
	@echo "$(CYAN)Démarrage redis...$(NC)"
	@$(COMPOSE) up -d redis
	@sleep 2
	@echo "$(GREEN)✅ redis démarré avec succès$(NC)"

service-stop-redis: ## Arrêter Redis
	@echo "$(YELLOW)Arrêt redis...$(NC)"
	@$(COMPOSE) stop redis
	@echo "$(GREEN)✅ redis arrêté$(NC)"

service-restart-redis: ## Redémarrer Redis
	@make service-stop-redis
	@sleep 2
	@make service-start-redis

service-status-redis: ## Status Redis
	@echo "$(CYAN)═══ STATUS redis ═══$(NC)"
	@$(call check_service_status,redis)
	@if $(COMPOSE) ps redis --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps redis --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-redis: ## Logs Redis
	@echo "$(CYAN)═══ LOGS redis ═══$(NC)"
	@$(COMPOSE) logs -f redis

# Outils de développement
service-start-adminer: ## Démarrer Adminer
	@echo "$(CYAN)Démarrage adminer...$(NC)"
	@$(COMPOSE) up -d adminer
	@sleep 2
	@echo "$(GREEN)✅ adminer démarré avec succès$(NC)"
	@echo "$(CYAN)Accessible sur: http://localhost:8083$(NC)"

service-stop-adminer: ## Arrêter Adminer
	@echo "$(YELLOW)Arrêt adminer...$(NC)"
	@$(COMPOSE) stop adminer
	@echo "$(GREEN)✅ adminer arrêté$(NC)"

service-restart-adminer: ## Redémarrer Adminer
	@make service-stop-adminer
	@sleep 2
	@make service-start-adminer

service-status-adminer: ## Status Adminer
	@echo "$(CYAN)═══ STATUS adminer ═══$(NC)"
	@$(call check_service_status,adminer)
	@if $(COMPOSE) ps adminer --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps adminer --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-adminer: ## Logs Adminer
	@echo "$(CYAN)═══ LOGS adminer ═══$(NC)"
	@$(COMPOSE) logs -f adminer

service-start-redis-commander: ## Démarrer Redis Commander
	@echo "$(CYAN)Démarrage redis-commander...$(NC)"
	@$(COMPOSE) up -d redis-commander
	@sleep 2
	@echo "$(GREEN)✅ redis-commander démarré avec succès$(NC)"
	@echo "$(CYAN)Accessible sur: http://localhost:8084$(NC)"

service-stop-redis-commander: ## Arrêter Redis Commander
	@echo "$(YELLOW)Arrêt redis-commander...$(NC)"
	@$(COMPOSE) stop redis-commander
	@echo "$(GREEN)✅ redis-commander arrêté$(NC)"

service-restart-redis-commander: ## Redémarrer Redis Commander
	@make service-stop-redis-commander
	@sleep 2
	@make service-start-redis-commander

service-status-redis-commander: ## Status Redis Commander
	@echo "$(CYAN)═══ STATUS redis-commander ═══$(NC)"
	@$(call check_service_status,redis-commander)
	@if $(COMPOSE) ps redis-commander --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps redis-commander --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-redis-commander: ## Logs Redis Commander
	@echo "$(CYAN)═══ LOGS redis-commander ═══$(NC)"
	@$(COMPOSE) logs -f redis-commander

# ═══════════════════════════════════════════════════════════════
# COMMANDES POUR SERVICES BACKEND CORE
# ═══════════════════════════════════════════════════════════════

service-start-auth-service: ## Démarrer Auth Service
	@echo "$(CYAN)Démarrage auth-service avec dépendances...$(NC)"
	@if ! $(COMPOSE) ps postgres --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(BLUE)Démarrage dépendance: postgres$(NC)"; \
		make service-start-postgres; \
	fi
	@if ! $(COMPOSE) ps redis --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(BLUE)Démarrage dépendance: redis$(NC)"; \
		make service-start-redis; \
	fi
	@echo "$(GREEN)Démarrage auth-service...$(NC)"
	@$(COMPOSE) up -d auth-service
	@sleep 2
	@echo "$(GREEN)✅ auth-service démarré avec succès$(NC)"

service-stop-auth-service: ## Arrêter Auth Service
	@echo "$(YELLOW)Arrêt auth-service...$(NC)"
	@$(COMPOSE) stop auth-service
	@echo "$(GREEN)✅ auth-service arrêté$(NC)"

service-restart-auth-service: ## Redémarrer Auth Service
	@make service-stop-auth-service
	@sleep 2
	@make service-start-auth-service

service-status-auth-service: ## Status Auth Service
	@echo "$(CYAN)═══ STATUS auth-service ═══$(NC)"
	@$(call check_service_status,auth-service)
	@if $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps auth-service --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-auth-service: ## Logs Auth Service
	@echo "$(CYAN)═══ LOGS auth-service ═══$(NC)"
	@$(COMPOSE) logs -f auth-service

service-start-api-gateway: ## Démarrer API Gateway
	@echo "$(CYAN)Démarrage api-gateway avec dépendances...$(NC)"
	@if ! $(COMPOSE) ps auth-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(BLUE)Démarrage dépendance: auth-service$(NC)"; \
		make service-start-auth-service; \
	fi
	@echo "$(GREEN)Démarrage api-gateway...$(NC)"
	@$(COMPOSE) up -d api-gateway
	@sleep 2
	@echo "$(GREEN)✅ api-gateway démarré avec succès$(NC)"

service-stop-api-gateway: ## Arrêter API Gateway
	@echo "$(YELLOW)Arrêt api-gateway...$(NC)"
	@$(COMPOSE) stop api-gateway
	@echo "$(GREEN)✅ api-gateway arrêté$(NC)"

service-restart-api-gateway: ## Redémarrer API Gateway
	@make service-stop-api-gateway
	@sleep 2
	@make service-start-api-gateway

service-status-api-gateway: ## Status API Gateway
	@echo "$(CYAN)═══ STATUS api-gateway ═══$(NC)"
	@$(call check_service_status,api-gateway)
	@if $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps api-gateway --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-api-gateway: ## Logs API Gateway
	@echo "$(CYAN)═══ LOGS api-gateway ═══$(NC)"
	@$(COMPOSE) logs -f api-gateway

service-start-admin-service: ## Démarrer Admin Service
	@echo "$(CYAN)Démarrage admin-service avec dépendances...$(NC)"
	@if ! $(COMPOSE) ps postgres --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(BLUE)Démarrage dépendance: postgres$(NC)"; \
		make service-start-postgres; \
	fi
	@if ! $(COMPOSE) ps redis --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(BLUE)Démarrage dépendance: redis$(NC)"; \
		make service-start-redis; \
	fi
	@echo "$(GREEN)Démarrage admin-service...$(NC)"
	@$(COMPOSE) up -d admin-service
	@sleep 2
	@echo "$(GREEN)✅ admin-service démarré avec succès$(NC)"

service-stop-admin-service: ## Arrêter Admin Service
	@echo "$(YELLOW)Arrêt admin-service...$(NC)"
	@$(COMPOSE) stop admin-service
	@echo "$(GREEN)✅ admin-service arrêté$(NC)"

service-restart-admin-service: ## Redémarrer Admin Service
	@make service-stop-admin-service
	@sleep 2
	@make service-start-admin-service

service-status-admin-service: ## Status Admin Service
	@echo "$(CYAN)═══ STATUS admin-service ═══$(NC)"
	@$(call check_service_status,admin-service)
	@if $(COMPOSE) ps admin-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps admin-service --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-admin-service: ## Logs Admin Service
	@echo "$(CYAN)═══ LOGS admin-service ═══$(NC)"
	@$(COMPOSE) logs -f admin-service

# ═══════════════════════════════════════════════════════════════
# COMMANDES POUR SERVICES EMAIL
# ═══════════════════════════════════════════════════════════════

service-start-email-service: ## Démarrer Email Service
	@echo "$(CYAN)Démarrage email-service avec dépendances...$(NC)"
	@if ! $(COMPOSE) ps postgres --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(BLUE)Démarrage dépendance: postgres$(NC)"; \
		make service-start-postgres; \
	fi
	@if ! $(COMPOSE) ps redis --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(BLUE)Démarrage dépendance: redis$(NC)"; \
		make service-start-redis; \
	fi
	@echo "$(GREEN)Démarrage email-service...$(NC)"
	@$(COMPOSE) up -d email-service
	@sleep 2
	@echo "$(GREEN)✅ email-service démarré avec succès$(NC)"

service-stop-email-service: ## Arrêter Email Service
	@echo "$(YELLOW)Arrêt email-service...$(NC)"
	@$(COMPOSE) stop email-service
	@echo "$(GREEN)✅ email-service arrêté$(NC)"

service-restart-email-service: ## Redémarrer Email Service
	@make service-stop-email-service
	@sleep 2
	@make service-start-email-service

service-status-email-service: ## Status Email Service
	@echo "$(CYAN)═══ STATUS email-service ═══$(NC)"
	@$(call check_service_status,email-service)
	@if $(COMPOSE) ps email-service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps email-service --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-email-service: ## Logs Email Service
	@echo "$(CYAN)═══ LOGS email-service ═══$(NC)"
	@$(COMPOSE) logs -f email-service

# ═══════════════════════════════════════════════════════════════
# COMMANDES POUR APPLICATIONS FRONTEND
# ═══════════════════════════════════════════════════════════════

service-start-email-app: ## Démarrer Email App
	@echo "$(CYAN)Démarrage email-app avec dépendances...$(NC)"
	@if ! $(COMPOSE) ps api-gateway --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(BLUE)Démarrage dépendance: api-gateway$(NC)"; \
		make service-start-api-gateway; \
	fi
	@echo "$(GREEN)Démarrage email-app...$(NC)"
	@$(COMPOSE) up -d email-app
	@sleep 2
	@echo "$(GREEN)✅ email-app démarré avec succès$(NC)"

service-stop-email-app: ## Arrêter Email App
	@echo "$(YELLOW)Arrêt email-app...$(NC)"
	@$(COMPOSE) stop email-app
	@echo "$(GREEN)✅ email-app arrêté$(NC)"

service-restart-email-app: ## Redémarrer Email App
	@make service-stop-email-app
	@sleep 2
	@make service-start-email-app

service-status-email-app: ## Status Email App
	@echo "$(CYAN)═══ STATUS email-app ═══$(NC)"
	@$(call check_service_status,email-app)
	@if $(COMPOSE) ps email-app --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo ""; \
		echo "$(GREEN)Détails:$(NC)"; \
		$(COMPOSE) ps email-app --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"; \
	fi

service-logs-email-app: ## Logs Email App
	@echo "$(CYAN)═══ LOGS email-app ═══$(NC)"
	@$(COMPOSE) logs -f email-app

# ═══════════════════════════════════════════════════════════════
# LOGS INDIVIDUELS (RACCOURCIS UNIQUEMENT)
# ═══════════════════════════════════════════════════════════════

# Note: Les commandes start/stop/restart sont gérées par les modules spécialisés
# Ce fichier ne contient que les raccourcis pour les logs et l'aide des services
