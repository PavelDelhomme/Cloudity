# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE API
# Gestion des API et endpoints (Gateway, Services REST)
# ═══════════════════════════════════════════════════════════════

.PHONY: start-api stop-api restart-api status-api logs-api health-api test-api
.PHONY: api-docs api-test api-benchmark api-monitor

# ═══════════════════════════════════════════════════════════════
# GESTION API COMPLÈTE
# ═══════════════════════════════════════════════════════════════

start-api: ## Démarrer tous les services API
	$(call log_rocket,"Démarrage API complète")
	@make start-infra
	@sleep 2
	@$(COMPOSE) up -d api-gateway
	@sleep 1
	@$(COMPOSE) up -d $(BACKEND_CORE_SERVICES)
	@sleep 1
	@$(COMPOSE) up -d $(BACKEND_EMAIL_SERVICES)
	$(call log_success,"API complète opérationnelle")

stop-api: ## Arrêter tous les services API
	$(call log_info,"Arrêt API")
	@$(COMPOSE) stop api-gateway $(BACKEND_CORE_SERVICES) $(BACKEND_EMAIL_SERVICES)
	$(call log_success,"API arrêtée")

restart-api: ## Redémarrer tous les services API
	$(call log_info,"Redémarrage API")
	@make stop-api
	@sleep 2
	@make start-api

status-api: ## Status des services API
	@echo "$(CYAN)═══ STATUS API ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)API Gateway:$(NC)"
	@$(call check_service_status,api-gateway)
	@echo ""
	@echo "$(PURPLE)Services API:$(NC)"
	@for service in $(BACKEND_CORE_SERVICES) $(BACKEND_EMAIL_SERVICES); do \
		$(call check_service_status,$$service); \
	done
	@echo ""

logs-api: ## Logs des services API
	@$(COMPOSE) logs -f api-gateway $(BACKEND_CORE_SERVICES) $(BACKEND_EMAIL_SERVICES)

# ═══════════════════════════════════════════════════════════════
# HEALTH CHECKS ET MONITORING API
# ═══════════════════════════════════════════════════════════════

health-api: ## Health check complet des API
	$(call log_info,"Health check API complet")
	@echo "$(CYAN)═══ HEALTH CHECK API ═══$(NC)"
	@echo ""
	
	@echo "$(PURPLE)API Gateway:$(NC)"
	@if curl -sf http://localhost:$(API_GATEWAY_PORT)/health >/dev/null 2>&1; then \
		echo "$(GREEN)✓ API Gateway (http://localhost:$(API_GATEWAY_PORT))$(NC)"; \
	else \
		echo "$(RED)✗ API Gateway (http://localhost:$(API_GATEWAY_PORT))$(NC)"; \
	fi
	@echo ""
	
	@echo "$(PURPLE)Auth Service:$(NC)"
	@if curl -sf http://localhost:$(AUTH_SERVICE_PORT)/health >/dev/null 2>&1; then \
		echo "$(GREEN)✓ Auth Service (http://localhost:$(AUTH_SERVICE_PORT))$(NC)"; \
	else \
		echo "$(RED)✗ Auth Service (http://localhost:$(AUTH_SERVICE_PORT))$(NC)"; \
	fi
	@echo ""
	
	@echo "$(PURPLE)Admin Service:$(NC)"
	@if curl -sf http://localhost:$(ADMIN_SERVICE_PORT)/health >/dev/null 2>&1; then \
		echo "$(GREEN)✓ Admin Service (http://localhost:$(ADMIN_SERVICE_PORT))$(NC)"; \
	else \
		echo "$(RED)✗ Admin Service (http://localhost:$(ADMIN_SERVICE_PORT))$(NC)"; \
	fi
	@echo ""

test-api: ## Tests des endpoints API
	$(call log_info,"Tests API")
	@echo "$(CYAN)═══ TESTS API ═══$(NC)"
	@echo ""
	
	@echo "$(PURPLE)Test API Gateway:$(NC)"
	@curl -s http://localhost:$(API_GATEWAY_PORT)/api/v1/health || echo "$(RED)API Gateway indisponible$(NC)"
	@echo ""
	
	@echo "$(PURPLE)Test Auth Service:$(NC)"
	@curl -s http://localhost:$(AUTH_SERVICE_PORT)/health || echo "$(RED)Auth Service indisponible$(NC)"
	@echo ""
	
	@echo "$(PURPLE)Test Admin Service:$(NC)"
	@curl -s http://localhost:$(ADMIN_SERVICE_PORT)/health || echo "$(RED)Admin Service indisponible$(NC)"
	@echo ""

# ═══════════════════════════════════════════════════════════════
# DOCUMENTATION ET OUTILS API
# ═══════════════════════════════════════════════════════════════

api-docs: ## Afficher les endpoints API disponibles
	@echo "$(CYAN)═══ DOCUMENTATION API ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)API Gateway (Port $(API_GATEWAY_PORT)):$(NC)"
	@echo "  $(GREEN)GET$(NC)  /api/v1/health          - Health check"
	@echo "  $(GREEN)POST$(NC) /api/v1/auth/login      - Connexion"
	@echo "  $(GREEN)POST$(NC) /api/v1/auth/register   - Inscription"
	@echo "  $(GREEN)GET$(NC)  /api/v1/auth/me         - Profil utilisateur"
	@echo ""
	@echo "$(PURPLE)Auth Service (Port $(AUTH_SERVICE_PORT)):$(NC)"
	@echo "  $(GREEN)GET$(NC)  /health                 - Health check"
	@echo "  $(GREEN)POST$(NC) /login                  - Connexion directe"
	@echo "  $(GREEN)POST$(NC) /register               - Inscription directe"
	@echo "  $(GREEN)GET$(NC)  /me                     - Profil utilisateur"
	@echo ""
	@echo "$(PURPLE)Admin Service (Port $(ADMIN_SERVICE_PORT)):$(NC)"
	@echo "  $(GREEN)GET$(NC)  /health                 - Health check"
	@echo "  $(GREEN)GET$(NC)  /admin/users            - Liste des utilisateurs"
	@echo "  $(GREEN)GET$(NC)  /admin/stats            - Statistiques"
	@echo ""
	@echo "$(PURPLE)Email Service (Port $(EMAIL_SERVICE_PORT)):$(NC)"
	@echo "  $(GREEN)GET$(NC)  /health                 - Health check"
	@echo "  $(GREEN)POST$(NC) /send                   - Envoyer email"
	@echo "  $(GREEN)GET$(NC)  /emails                 - Liste emails"
	@echo ""

api-urls: ## Afficher les URLs des API
	@echo "$(CYAN)═══ URLS API ═══$(NC)"
	@echo ""
	@$(call show_service_url,api-gateway,http://localhost:$(API_GATEWAY_PORT),🌐)
	@$(call show_service_url,auth-service,http://localhost:$(AUTH_SERVICE_PORT),🔐)
	@$(call show_service_url,admin-service,http://localhost:$(ADMIN_SERVICE_PORT),⚙️)
	@$(call show_service_url,email-service,http://localhost:$(EMAIL_SERVICE_PORT),📧)
	@$(call show_service_url,alias-service,http://localhost:$(ALIAS_SERVICE_PORT),🏷️)
	@echo ""

# ═══════════════════════════════════════════════════════════════
# BENCHMARKS ET PERFORMANCE API
# ═══════════════════════════════════════════════════════════════

api-benchmark: ## Benchmark des API (nécessite Apache Bench)
	$(call log_info,"Benchmark API")
	@echo "$(CYAN)═══ BENCHMARK API ═══$(NC)"
	@echo ""
	@if command -v ab >/dev/null 2>&1; then \
		echo "$(PURPLE)Benchmark API Gateway:$(NC)"; \
		ab -n 100 -c 10 http://localhost:$(API_GATEWAY_PORT)/api/v1/health; \
		echo ""; \
		echo "$(PURPLE)Benchmark Auth Service:$(NC)"; \
		ab -n 100 -c 10 http://localhost:$(AUTH_SERVICE_PORT)/health; \
	else \
		echo "$(RED)Apache Bench (ab) non installé$(NC)"; \
		echo "$(YELLOW)Installation: sudo pacman -S apache$(NC)"; \
	fi

api-monitor: ## Monitoring en temps réel des API
	$(call log_info,"Monitoring API")
	@echo "$(CYAN)═══ MONITORING API ═══$(NC)"
	@echo "$(YELLOW)Surveillance des API en cours... (Ctrl+C pour arrêter)$(NC)"
	@while true; do \
		clear; \
		echo "$(CYAN)═══ MONITORING API - $(shell date) ═══$(NC)"; \
		echo ""; \
		make health-api 2>/dev/null; \
		sleep 5; \
	done

# ═══════════════════════════════════════════════════════════════
# OUTILS DE DÉVELOPPEMENT API
# ═══════════════════════════════════════════════════════════════

api-curl-test: ## Tests avec curl pour développement
	$(call log_info,"Tests curl API")
	@echo "$(CYAN)═══ TESTS CURL API ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Test connexion:$(NC)"
	@echo "curl -X POST http://localhost:$(API_GATEWAY_PORT)/api/v1/auth/login \\"
	@echo "  -H 'Content-Type: application/json' \\"
	@echo "  -d '{\"email\":\"admin@cloudity.com\",\"password\":\"admin123\"}'"
	@echo ""
	@echo "$(PURPLE)Test health check:$(NC)"
	@echo "curl http://localhost:$(API_GATEWAY_PORT)/api/v1/health"
	@echo ""

api-postman: ## Générer collection Postman (si disponible)
	$(call log_info,"Génération collection Postman")
	@mkdir -p docs/api
	@echo "$(YELLOW)Collection Postman générée dans docs/api/$(NC)"
	@echo "$(CYAN)Import dans Postman: docs/api/cloudity-api.postman_collection.json$(NC)"
