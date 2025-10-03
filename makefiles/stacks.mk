# ═══════════════════════════════════════════════════════════════
# CLOUDITY - GESTION DES STACKS APPLICATIVES
# Démarrage de stacks complètes avec gestion des dépendances
# ═══════════════════════════════════════════════════════════════

.PHONY: stack stack-help start-stack stop-stack restart-stack status-stack
.PHONY: start-admin stop-admin restart-admin status-admin
.PHONY: start-email stop-email restart-email status-email
.PHONY: start-password stop-password restart-password status-password
.PHONY: start-infra stop-infra restart-infra status-infra
.PHONY: start-backend stop-backend restart-backend status-backend
.PHONY: start-frontend stop-frontend restart-frontend status-frontend
.PHONY: start-full stop-full restart-full status-full

# ═══════════════════════════════════════════════════════════════
# AIDE CONTEXTUELLE STACKS
# ═══════════════════════════════════════════════════════════════

stack-help: ## Aide pour la gestion des stacks
	@echo "$(PURPLE)🚀 GESTION DES STACKS APPLICATIVES$(NC)"
	@echo ""
	@echo "$(CYAN)═══ NOUVELLE SYNTAXE STACKS ═══$(NC)"
	@echo "$(GREEN)make stack-start-admin$(NC)        # Stack administration complète"
	@echo "$(GREEN)make stack-start-email$(NC)        # Stack email complète"
	@echo "$(GREEN)make stack-start-password$(NC)     # Stack gestion mots de passe"
	@echo "$(GREEN)make stack-start-infra$(NC)        # Infrastructure (postgres + redis)"
	@echo "$(GREEN)make stack-start-backend$(NC)      # Tous les services backend"
	@echo "$(GREEN)make stack-start-frontend$(NC)     # Toutes les applications frontend"
	@echo "$(GREEN)make stack-start-full$(NC)         # Tous les services"
	@echo ""
	@echo "$(CYAN)═══ COMMANDES DISPONIBLES ═══$(NC)"
	@echo "$(GREEN)make stack-start-<nom>$(NC)       # Démarrer une stack"
	@echo "$(GREEN)make stack-stop-<nom>$(NC)        # Arrêter une stack"
	@echo "$(GREEN)make stack-restart-<nom>$(NC)     # Redémarrer une stack"
	@echo "$(GREEN)make stack-status-<nom>$(NC)      # Status d'une stack"
	@echo ""
	@echo "$(CYAN)═══ DÉTAILS DES STACKS ═══$(NC)"
	@echo "$(YELLOW)admin:$(NC) postgres, redis, auth-service, api-gateway, admin-service, admin-dashboard"
	@echo "$(YELLOW)email:$(NC) postgres, redis, auth-service, api-gateway, email-service, alias-service, email-app"
	@echo "$(YELLOW)password:$(NC) postgres, redis, auth-service, api-gateway, password-service, password-app"
	@echo ""
	@echo "$(CYAN)═══ STACKS FUTURES (PRÉPARÉES) ═══$(NC)"
	@echo "$(GRAY)2fa, calendar, drive, office, gallery$(NC)"

stack: ## Aide pour la gestion des stacks
	@make stack-help

# ═══════════════════════════════════════════════════════════════
# STACK ADMINISTRATION - DASHBOARD ADMIN
# ═══════════════════════════════════════════════════════════════

stack-start-admin: ## Démarrer la stack administration complète
	@echo "$(PURPLE)🚀 DÉMARRAGE STACK ADMINISTRATION$(NC)"
	@echo ""
	@echo "$(CYAN)Services à démarrer:$(NC) $(STACK_ADMIN)"
	@echo ""
	@$(call start_stack_ordered,ADMIN,$(STACK_ADMIN))
	@echo ""
	@echo "$(GREEN)🌐 URLS DISPONIBLES:$(NC)"
	@echo "$(CYAN)Dashboard Admin:$(NC) http://localhost:3000"
	@echo "$(CYAN)API Gateway:$(NC) http://localhost:8000"
	@echo "$(CYAN)Auth Service:$(NC) http://localhost:8081"
	@echo "$(CYAN)Admin Service:$(NC) http://localhost:8082"

stack-stop-admin: ## Arrêter la stack administration
	@echo "$(YELLOW)Arrêt stack administration$(NC)"
	@$(COMPOSE) stop $(STACK_ADMIN)
	$(call log_success,"Stack administration arrêtée")

stack-restart-admin: ## Redémarrer la stack administration
	@echo "$(CYAN)Redémarrage stack administration$(NC)"
	@make stack-stop-admin
	@sleep 2
	@make stack-start-admin

stack-status-admin: ## Status de la stack administration
	@echo "$(CYAN)═══ STATUS STACK ADMINISTRATION ═══$(NC)"
	@echo ""
	@for service in $(STACK_ADMIN); do \
		$(call check_service_status,$$service); \
	done

# Alias pour compatibilité
start-admin: stack-start-admin
stop-admin: stack-stop-admin  
restart-admin: stack-restart-admin
status-admin: stack-status-admin

# ═══════════════════════════════════════════════════════════════
# STACK EMAIL - SYSTÈME EMAIL COMPLET
# ═══════════════════════════════════════════════════════════════

stack-start-email: ## Démarrer la stack email complète
	@echo "$(PURPLE)📧 DÉMARRAGE STACK EMAIL$(NC)"
	@echo ""
	@echo "$(CYAN)Services à démarrer:$(NC) $(STACK_EMAIL)"
	@echo ""
	@$(call start_stack_ordered,EMAIL,$(STACK_EMAIL))
	@echo ""
	@echo "$(GREEN)🌐 URLS DISPONIBLES:$(NC)"
	@echo "$(CYAN)Email App:$(NC) http://localhost:8094"
	@echo "$(CYAN)Email Service:$(NC) http://localhost:8091"
	@echo "$(CYAN)Alias Service:$(NC) http://localhost:8092"

stack-stop-email: ## Arrêter la stack email
	@echo "$(YELLOW)Arrêt stack email$(NC)"
	@$(COMPOSE) stop $(STACK_EMAIL)
	$(call log_success,"Stack email arrêtée")

stack-restart-email: ## Redémarrer la stack email
	@echo "$(CYAN)Redémarrage stack email$(NC)"
	@make stack-stop-email
	@sleep 2
	@make stack-start-email

stack-status-email: ## Status de la stack email
	@echo "$(CYAN)═══ STATUS STACK EMAIL ═══$(NC)"
	@echo ""
	@for service in $(STACK_EMAIL); do \
		$(call check_service_status,$$service); \
	done

# Alias pour compatibilité
start-email: stack-start-email
stop-email: stack-stop-email
restart-email: stack-restart-email
status-email: stack-status-email

# ═══════════════════════════════════════════════════════════════
# STACK PASSWORD - GESTION DES MOTS DE PASSE
# ═══════════════════════════════════════════════════════════════

start-password: ## Démarrer la stack mots de passe
	@echo "$(PURPLE)🔒 DÉMARRAGE STACK MOTS DE PASSE$(NC)"
	@echo ""
	@echo "$(CYAN)Services à démarrer:$(NC) $(STACK_PASSWORD)"
	@echo ""
	@$(call start_stack_ordered,PASSWORD,$(STACK_PASSWORD))
	@echo ""
	@echo "$(GREEN)🌐 URLS DISPONIBLES:$(NC)"
	@echo "$(CYAN)Password App:$(NC) http://localhost:8095"
	@echo "$(CYAN)Password Service:$(NC) http://localhost:8093"

stop-password: ## Arrêter la stack mots de passe
	@echo "$(YELLOW)Arrêt stack mots de passe$(NC)"
	@$(COMPOSE) stop $(STACK_PASSWORD)
	$(call log_success,"Stack mots de passe arrêtée")

restart-password: ## Redémarrer la stack mots de passe
	@echo "$(CYAN)Redémarrage stack mots de passe$(NC)"
	@make stop-password
	@sleep 2
	@make start-password

status-password: ## Status de la stack mots de passe
	@echo "$(CYAN)═══ STATUS STACK MOTS DE PASSE ═══$(NC)"
	@echo ""
	@for service in $(STACK_PASSWORD); do \
		$(call check_service_status,$$service); \
	done

# ═══════════════════════════════════════════════════════════════
# STACKS DE BASE
# ═══════════════════════════════════════════════════════════════

# Note: Les commandes start-infra, stop-infra, etc. sont définies dans les modules spécialisés
# Ce fichier se concentre uniquement sur les stacks applicatives complètes

# ═══════════════════════════════════════════════════════════════
# STACK COMPLÈTE
# ═══════════════════════════════════════════════════════════════

start-full: ## Démarrer tous les services
	@echo "$(PURPLE)🚀 DÉMARRAGE COMPLET CLOUDITY$(NC)"
	@echo ""
	@make start-infra
	@sleep 3
	@make start-backend
	@sleep 2
	@make start-frontend
	@echo ""
	@echo "$(GREEN)✅ CLOUDITY COMPLÈTEMENT OPÉRATIONNEL$(NC)"
	@echo ""
	@echo "$(GREEN)🌐 TOUTES LES URLS:$(NC)"
	@echo "$(CYAN)Admin Dashboard:$(NC) http://localhost:3000"
	@echo "$(CYAN)Email App:$(NC) http://localhost:8094"
	@echo "$(CYAN)Password App:$(NC) http://localhost:8095"
	@echo "$(CYAN)API Gateway:$(NC) http://localhost:8000"

stop-full: ## Arrêter tous les services
	@echo "$(YELLOW)Arrêt complet Cloudity$(NC)"
	@$(COMPOSE) down
	$(call log_success,"Cloudity complètement arrêté")

restart-full: ## Redémarrer tous les services
	@make stop-full
	@sleep 3
	@make start-full

status-full: ## Status de tous les services
	@echo "$(CYAN)═══ STATUS COMPLET CLOUDITY ═══$(NC)"
	@echo ""
	@make status-infra
	@echo ""
	@make status-backend
	@echo ""
	@make status-frontend

# ═══════════════════════════════════════════════════════════════
# STACKS FUTURES (STRUCTURE PRÉPARÉE)
# ═══════════════════════════════════════════════════════════════

start-2fa: ## Démarrer la stack 2FA (futur)
	@echo "$(YELLOW)⚠️ Stack 2FA pas encore implémentée$(NC)"
	@echo "$(CYAN)Services prévus:$(NC) $(STACK_2FA)"

start-calendar: ## Démarrer la stack calendrier (futur)
	@echo "$(YELLOW)⚠️ Stack Calendar pas encore implémentée$(NC)"
	@echo "$(CYAN)Services prévus:$(NC) $(STACK_CALENDAR)"

start-drive: ## Démarrer la stack drive (futur)
	@echo "$(YELLOW)⚠️ Stack Drive pas encore implémentée$(NC)"
	@echo "$(CYAN)Services prévus:$(NC) $(STACK_DRIVE)"

start-office: ## Démarrer la stack office (futur)
	@echo "$(YELLOW)⚠️ Stack Office pas encore implémentée$(NC)"
	@echo "$(CYAN)Services prévus:$(NC) $(STACK_OFFICE)"

start-gallery: ## Démarrer la stack galerie (futur)
	@echo "$(YELLOW)⚠️ Stack Gallery pas encore implémentée$(NC)"
	@echo "$(CYAN)Services prévus:$(NC) $(STACK_GALLERY)"
