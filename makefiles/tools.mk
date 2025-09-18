# ═══════════════════════════════════════════════════════════════
# CLOUDITY - MODULE TOOLS
# Outils de développement, débogage et utilitaires
# ═══════════════════════════════════════════════════════════════

.PHONY: tools-help tools-install tools-update tools-clean
.PHONY: dev-setup dev-reset dev-logs dev-shell dev-test
.PHONY: docker-clean docker-prune docker-rebuild docker-stats
.PHONY: network-test network-scan port-check urls

# ═══════════════════════════════════════════════════════════════
# AIDE ET SETUP OUTILS
# ═══════════════════════════════════════════════════════════════

tools-help: ## Aide sur les outils disponibles
	@echo "$(CYAN)═══ OUTILS DÉVELOPPEMENT ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Setup et Installation:$(NC)"
	@echo "$(GREEN)make dev-setup$(NC)        - Configuration environnement développement"
	@echo "$(GREEN)make tools-install$(NC)    - Installation des outils nécessaires"
	@echo "$(GREEN)make tools-update$(NC)     - Mise à jour des outils"
	@echo ""
	@echo "$(PURPLE)Développement:$(NC)"
	@echo "$(GREEN)make dev-logs$(NC)         - Logs de développement"
	@echo "$(GREEN)make dev-shell$(NC)        - Shell interactif"
	@echo "$(GREEN)make dev-test$(NC)         - Tests de développement"
	@echo ""
	@echo "$(PURPLE)Docker:$(NC)"
	@echo "$(GREEN)make docker-clean$(NC)     - Nettoyage Docker"
	@echo "$(GREEN)make docker-rebuild$(NC)   - Reconstruction images"
	@echo "$(GREEN)make docker-stats$(NC)     - Statistiques Docker"
	@echo ""
	@echo "$(PURPLE)Réseau et Diagnostic:$(NC)"
	@echo "$(GREEN)make network-test$(NC)     - Tests réseau"
	@echo "$(GREEN)make port-check$(NC)       - Vérification ports"
	@echo "$(GREEN)make urls$(NC)             - Affichage URLs"

tools-install: ## Installer les outils de développement
	$(call log_info,"Installation outils développement")
	@echo "$(YELLOW)Vérification des outils...$(NC)"
	@command -v docker >/dev/null 2>&1 || (echo "$(RED)Docker non installé$(NC)" && exit 1)
	@command -v docker-compose >/dev/null 2>&1 || command -v docker compose >/dev/null 2>&1 || (echo "$(RED)Docker Compose non installé$(NC)" && exit 1)
	@command -v curl >/dev/null 2>&1 || (echo "$(RED)curl non installé$(NC)" && exit 1)
	@command -v jq >/dev/null 2>&1 || echo "$(YELLOW)jq recommandé pour JSON: sudo pacman -S jq$(NC)"
	@command -v ab >/dev/null 2>&1 || echo "$(YELLOW)Apache Bench recommandé: sudo pacman -S apache$(NC)"
	$(call log_success,"Outils vérifiés")

tools-update: ## Mettre à jour les outils
	$(call log_info,"Mise à jour outils")
	@echo "$(YELLOW)Mise à jour images Docker...$(NC)"
	@docker pull postgres:15
	@docker pull redis:7-alpine
	@docker pull adminer:latest
	$(call log_success,"Outils mis à jour")

tools-clean: ## Nettoyer les outils temporaires
	$(call log_warning,"Nettoyage outils")
	@rm -rf .tmp/
	@rm -rf *.log
	$(call log_success,"Outils nettoyés")

# ═══════════════════════════════════════════════════════════════
# ENVIRONNEMENT DE DÉVELOPPEMENT
# ═══════════════════════════════════════════════════════════════

dev-setup: ## Configuration environnement développement
	$(call log_rocket,"Configuration environnement développement")
	@echo "$(YELLOW)Configuration Git...$(NC)"
	@git config --local core.autocrlf input 2>/dev/null || true
	@echo "$(YELLOW)Configuration Docker...$(NC)"
	@docker network create cloudity-network 2>/dev/null || true
	@echo "$(YELLOW)Création répertoires...$(NC)"
	@mkdir -p storage/{logs,backups,postgres,redis}
	@mkdir -p .tmp
	$(call log_success,"Environnement configuré")

dev-reset: ## Reset complet environnement développement
	$(call log_warning,"Reset environnement développement")
	@$(MAKE) clean-all
	@docker network rm cloudity-network 2>/dev/null || true
	@rm -rf storage/{logs,postgres,redis}/*
	@$(MAKE) dev-setup
	$(call log_success,"Environnement reset")

dev-logs: ## Logs de développement avec filtrage
	$(call log_info,"Logs développement")
	@echo "$(CYAN)═══ LOGS DÉVELOPPEMENT ═══$(NC)"
	@$(COMPOSE) logs --tail=50 -f | grep -E "(ERROR|WARN|INFO)" --color=always

dev-shell: ## Shell interactif de développement
	$(call log_info,"Shell développement")
	@echo "$(CYAN)═══ SHELL DÉVELOPPEMENT ═══$(NC)"
	@echo "$(YELLOW)Services disponibles:$(NC)"
	@echo "1) postgres    2) redis      3) auth-service"
	@echo "4) api-gateway 5) admin-service"
	@read -p "Choisir un service (1-5): " choice; \
	case $$choice in \
		1) $(MAKE) shell-postgres ;; \
		2) $(MAKE) shell-redis ;; \
		3) $(MAKE) shell-auth-service ;; \
		4) $(MAKE) shell-api-gateway ;; \
		5) $(MAKE) shell-admin-service ;; \
		*) echo "$(RED)Choix invalide$(NC)" ;; \
	esac

dev-test: ## Tests de développement
	$(call log_info,"Tests développement")
	@echo "$(CYAN)═══ TESTS DÉVELOPPEMENT ═══$(NC)"
	@$(MAKE) health-api
	@$(MAKE) network-test

# ═══════════════════════════════════════════════════════════════
# GESTION DOCKER AVANCÉE
# ═══════════════════════════════════════════════════════════════

docker-clean: ## Nettoyage Docker standard
	$(call log_info,"Nettoyage Docker")
	@docker system prune -f
	@docker volume prune -f
	$(call log_success,"Docker nettoyé")

docker-prune: ## Nettoyage Docker agressif
	$(call log_warning,"Nettoyage Docker agressif")
	@docker system prune -a -f --volumes
	@docker network prune -f
	$(call log_success,"Docker prunage terminé")

docker-rebuild: ## Reconstruction complète des images
	$(call log_info,"Reconstruction images Docker")
	@$(COMPOSE) build --no-cache
	$(call log_success,"Images reconstruites")

docker-stats: ## Statistiques Docker en temps réel
	$(call log_info,"Statistiques Docker")
	@echo "$(CYAN)═══ STATISTIQUES DOCKER ═══$(NC)"
	@docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

docker-inspect: ## Inspection détaillée des conteneurs
	$(call log_info,"Inspection conteneurs")
	@echo "$(CYAN)═══ INSPECTION CONTENEURS ═══$(NC)"
	@for container in $$(docker ps --format "{{.Names}}" | grep cloudity); do \
		echo "$(PURPLE)=== $$container ====$(NC)"; \
		docker inspect $$container --format "{{.Config.Image}} - {{.State.Status}} - {{.NetworkSettings.IPAddress}}"; \
		echo ""; \
	done

# ═══════════════════════════════════════════════════════════════
# TESTS RÉSEAU ET DIAGNOSTIC
# ═══════════════════════════════════════════════════════════════

network-test: ## Tests de connectivité réseau
	$(call log_info,"Tests réseau")
	@echo "$(CYAN)═══ TESTS RÉSEAU ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Test connectivité locale:$(NC)"
	@ping -c 1 localhost >/dev/null && echo "$(GREEN)✓ localhost$(NC)" || echo "$(RED)✗ localhost$(NC)"
	@echo ""
	@echo "$(PURPLE)Test ports principaux:$(NC)"
	@nc -z localhost $(API_GATEWAY_PORT) && echo "$(GREEN)✓ API Gateway ($(API_GATEWAY_PORT))$(NC)" || echo "$(RED)✗ API Gateway ($(API_GATEWAY_PORT))$(NC)"
	@nc -z localhost $(POSTGRES_PORT) && echo "$(GREEN)✓ PostgreSQL ($(POSTGRES_PORT))$(NC)" || echo "$(RED)✗ PostgreSQL ($(POSTGRES_PORT))$(NC)"
	@nc -z localhost $(REDIS_PORT) && echo "$(GREEN)✓ Redis ($(REDIS_PORT))$(NC)" || echo "$(RED)✗ Redis ($(REDIS_PORT))$(NC)"

network-scan: ## Scanner les ports ouverts
	$(call log_info,"Scan ports réseau")
	@echo "$(CYAN)═══ SCAN PORTS ═══$(NC)"
	@netstat -tlnp 2>/dev/null | grep -E ":(8[0-9]{3}|3000|5432|6379)" | head -10

port-check: ## Vérifier l'occupation des ports
	$(call log_info,"Vérification ports")
	@echo "$(CYAN)═══ PORTS CLOUDITY ═══$(NC)"
	@echo ""
	@for port in $(API_GATEWAY_PORT) $(AUTH_SERVICE_PORT) $(ADMIN_SERVICE_PORT) $(POSTGRES_PORT) $(REDIS_PORT); do \
		if netstat -tln 2>/dev/null | grep -q ":$$port "; then \
			echo "$(GREEN)✓ Port $$port: Occupé$(NC)"; \
		else \
			echo "$(RED)✗ Port $$port: Libre$(NC)"; \
		fi; \
	done

urls: ## Afficher toutes les URLs des services
	@echo ""
	@echo "$(CYAN)═══ SERVICES CLOUDITY ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Frontend Applications:$(NC)"
	@$(call show_service_url,admin-dashboard,http://localhost:$(ADMIN_DASHBOARD_PORT),$(EMOJI_ADMIN))
	@$(call show_service_url,email-app,http://localhost:$(EMAIL_APP_PORT),$(EMOJI_EMAIL))
	@$(call show_service_url,password-app,http://localhost:$(PASSWORD_APP_PORT),$(EMOJI_LOCK))
	@echo ""
	@echo "$(PURPLE)Backend Services:$(NC)"
	@$(call show_service_url,api-gateway,http://localhost:$(API_GATEWAY_PORT),🌐)
	@$(call show_service_url,auth-service,http://localhost:$(AUTH_SERVICE_PORT),🔐)
	@$(call show_service_url,admin-service,http://localhost:$(ADMIN_SERVICE_PORT),⚙️)
	@$(call show_service_url,email-service,http://localhost:$(EMAIL_SERVICE_PORT),$(EMOJI_EMAIL))
	@$(call show_service_url,alias-service,http://localhost:$(ALIAS_SERVICE_PORT),🏷️)
	@echo ""
	@echo "$(PURPLE)Outils de développement:$(NC)"
	@$(call show_service_url,adminer,http://localhost:$(ADMINER_PORT),$(EMOJI_DATABASE))
	@echo "$(GREEN)🔧 Redis Commander: $(NC)http://localhost:$(REDIS_COMMANDER_PORT)"
	@echo ""

# ═══════════════════════════════════════════════════════════════
# UTILITAIRES DE DÉBOGAGE
# ═══════════════════════════════════════════════════════════════

debug-env: ## Afficher l'environnement de débogage
	$(call log_info,"Environnement débogage")
	@echo "$(CYAN)═══ ENVIRONNEMENT DÉBOGAGE ═══$(NC)"
	@echo ""
	@echo "$(PURPLE)Système:$(NC)"
	@echo "OS: $$(uname -s)"
	@echo "Architecture: $$(uname -m)"
	@echo ""
	@echo "$(PURPLE)Docker:$(NC)"
	@docker version --format "Version: {{.Server.Version}}"
	@echo "Compose: $$(docker compose version --short 2>/dev/null || echo 'Non disponible')"
	@echo ""
	@echo "$(PURPLE)Réseau Docker:$(NC)"
	@docker network ls | grep cloudity || echo "Aucun réseau Cloudity"

debug-services: ## Debug des services
	$(call log_info,"Debug services")
	@echo "$(CYAN)═══ DEBUG SERVICES ═══$(NC)"
	@for service in $(ALL_SERVICES); do \
		echo ""; \
		echo "$(PURPLE)=== $$service ===$(NC)"; \
		if $(COMPOSE) ps $$service --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
			echo "$(GREEN)Status: Running$(NC)"; \
			$(COMPOSE) logs --tail=5 $$service 2>/dev/null | tail -3; \
		else \
			echo "$(RED)Status: Stopped$(NC)"; \
		fi; \
	done
