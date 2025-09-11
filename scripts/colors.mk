# scripts/colors.mk - Système de couleurs et fonctions utilitaires CORRIGÉ
# À inclure dans tous les Makefiles avec: include scripts/colors.mk

# ═══════════════════════════════════════════════════════════════
# DÉFINITION DES COULEURS - CORRIGÉES
# ═══════════════════════════════════════════════════════════════

# Couleurs de base - avec printf au lieu d'echo
RED     = \033[0;31m
GREEN   = \033[0;32m
YELLOW  = \033[1;33m
BLUE    = \033[0;34m
PURPLE  = \033[0;35m
CYAN    = \033[0;36m
WHITE   = \033[1;37m
GRAY    = \033[0;37m
NC      = \033[0m

# Couleurs étendues
BOLD    = \033[1m
DIM     = \033[2m
UNDER   = \033[4m

# ═══════════════════════════════════════════════════════════════
# ÉMOJIS ET ICÔNES
# ═══════════════════════════════════════════════════════════════

# Émojis d'état
EMOJI_SUCCESS = ✅
EMOJI_ERROR   = ❌
EMOJI_WARNING = ⚠️
EMOJI_INFO    = ℹ️
EMOJI_ROCKET  = 🚀
EMOJI_GEAR    = ⚙️
EMOJI_CLEAN   = 🧹
EMOJI_TEST    = 🧪
EMOJI_BUILD   = 🔨
EMOJI_DOC     = 📚
EMOJI_LOCK    = 🔐
EMOJI_MAIL    = 📧
EMOJI_DB      = 🗄️

# ═══════════════════════════════════════════════════════════════
# FONCTIONS DE LOGGING - CORRIGÉES
# ═══════════════════════════════════════════════════════════════

# Fonction de log générique avec printf
define log
	@printf "$(1)[%s] $(2)$(NC)\n" "$$(date '+%H:%M:%S')"
endef

# Fonctions spécialisées
define log_info
	$(call log,$(BLUE),$(EMOJI_INFO) $(1))
endef

define log_success
	$(call log,$(GREEN),$(EMOJI_SUCCESS) $(1))
endef

define log_warning
	$(call log,$(YELLOW),$(EMOJI_WARNING) $(1))
endef

define log_error
	$(call log,$(RED),$(EMOJI_ERROR) $(1))
endef

define log_rocket
	$(call log,$(PURPLE),$(EMOJI_ROCKET) $(1))
endef

define log_gear
	$(call log,$(CYAN),$(EMOJI_GEAR) $(1))
endef

# ═══════════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES - CORRIGÉES
# ═══════════════════════════════════════════════════════════════

# Vérification de service Docker
define check_service
	@if docker compose ps $(1) --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		printf "$(GREEN)$(1): Running$(NC)\n"; \
	else \
		printf "$(RED)$(1): Stopped$(NC)\n"; \
	fi
endef

# Attente de service - CORRIGÉE
define wait_for_service
	@printf "$(YELLOW)Attente de $(1)...$(NC)\n"; \
	timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if curl -sf $(2) >/dev/null 2>&1; then \
			printf "$(GREEN)$(1) prêt!$(NC)\n"; \
			break; \
		fi; \
		sleep 1; \
		timeout=$$((timeout-1)); \
	done; \
	if [ $$timeout -eq 0 ]; then \
		printf "$(RED)Timeout: $(1) non disponible$(NC)\n"; \
		exit 1; \
	fi
endef

# Fonction de confirmation
define confirm
	@printf "$(YELLOW)$(1) (y/N)?$(NC) "; \
	read -r response; \
	if [ "$$response" != "y" ] && [ "$$response" != "Y" ]; then \
		printf "$(RED)Opération annulée$(NC)\n"; \
		exit 1; \
	fi
endef

# ═══════════════════════════════════════════════════════════════
# TEMPLATES DE MESSAGES - CORRIGÉS
# ═══════════════════════════════════════════════════════════════

# Header de section
define section_header
	@printf "\n"
	@printf "$(CYAN)═══ $(1) ═══$(NC)\n"
	@printf "\n"
endef

# Séparateur
define separator
	@printf "$(GRAY)═══════════════════════════════════════════════════════════════$(NC)\n"
endef

# Message de bienvenue
define welcome_message
	@printf "\n"
	@printf "$(BOLD)$(GREEN)$(EMOJI_ROCKET) Bienvenue dans Cloudity $(EMOJI_ROCKET)$(NC)\n"
	@printf "$(CYAN)Écosystème cloud privé multi-tenant$(NC)\n"
	@printf "\n"
endef

# ═══════════════════════════════════════════════════════════════
# FONCTIONS DE VALIDATION - CORRIGÉES
# ═══════════════════════════════════════════════════════════════

# Vérification Docker
define check_docker
	@if ! command -v docker >/dev/null 2>&1; then \
		printf "$(RED)$(EMOJI_ERROR) Docker n'est pas installé$(NC)\n"; \
		exit 1; \
	fi; \
	if ! docker info >/dev/null 2>&1; then \
		printf "$(RED)$(EMOJI_ERROR) Docker n'est pas démarré$(NC)\n"; \
		exit 1; \
	fi; \
	printf "$(GREEN)$(EMOJI_SUCCESS) Docker OK$(NC)\n"
endef

# Vérification Docker Compose
define check_docker_compose
	@if ! docker compose version >/dev/null 2>&1; then \
		if ! docker-compose version >/dev/null 2>&1; then \
			printf "$(RED)$(EMOJI_ERROR) Docker Compose n'est pas installé$(NC)\n"; \
			exit 1; \
		fi; \
	fi; \
	printf "$(GREEN)$(EMOJI_SUCCESS) Docker Compose OK$(NC)\n"
endef

# Vérification Node.js
define check_nodejs
	@if ! command -v node >/dev/null 2>&1; then \
		printf "$(YELLOW)$(EMOJI_WARNING) Node.js non installé (optionnel)$(NC)\n"; \
	else \
		printf "$(GREEN)$(EMOJI_SUCCESS) Node.js OK ($$(node --version))$(NC)\n"; \
	fi
endef

# Vérification Rust
define check_rust
	@if ! command -v cargo >/dev/null 2>&1; then \
		printf "$(YELLOW)$(EMOJI_WARNING) Rust/Cargo non installé (optionnel)$(NC)\n"; \
	else \
		printf "$(GREEN)$(EMOJI_SUCCESS) Rust OK ($$(rustc --version | cut -d' ' -f2))$(NC)\n"; \
	fi
endef

# ═══════════════════════════════════════════════════════════════
# FONCTIONS D'AFFICHAGE - CORRIGÉES
# ═══════════════════════════════════════════════════════════════

# Affichage des URLs de services
define show_service_urls
	@printf "\n"
	@printf "$(CYAN)═══ SERVICES DISPONIBLES ═══$(NC)\n"
	@printf "$(GREEN)🌐 API Gateway:$(NC)     http://localhost:8000\n"
	@printf "$(GREEN)🔐 Auth Service:$(NC)    http://localhost:8081\n" 
	@printf "$(GREEN)⚙️  Admin Service:$(NC)   http://localhost:8082\n"
	@printf "$(GREEN)📊 Admin Dashboard:$(NC) http://localhost:3000\n"
	@printf "$(GREEN)📧 Email Service:$(NC)   http://localhost:8091\n"
	@printf "$(GREEN)🏷️  Alias Service:$(NC)   http://localhost:8092\n"
	@printf "$(GREEN)🗄️  Database Admin:$(NC) http://localhost:8083\n"
	@printf "\n"
endef

# Affichage du status coloré
define show_status
	@printf "$(CYAN)%-20s$(NC) " "$(1):"; \
	if $(2); then \
		printf "$(GREEN)Running$(NC)"; \
	else \
		printf "$(RED)Stopped$(NC)"; \
	fi; \
	printf "\n"
endef

# ═══════════════════════════════════════════════════════════════
# UTILITAIRES DE DÉVELOPPEMENT - CORRIGÉS
# ═══════════════════════════════════════════════════════════════

# Fonction de cleanup générique
define cleanup
	$(call log_info,"Nettoyage $(1)")
	@docker compose down $(1) 2>/dev/null || true
	@docker system prune -f >/dev/null 2>&1 || true
	$(call log_success,"$(1) nettoyé")
endef

# Fonction de build générique
define build_service
	$(call log_info,"Build $(1)")
	@docker compose build $(1)
	$(call log_success,"$(1) construit")
endef

# Fonction de test générique
define test_service
	$(call log_info,"Tests $(1)")
	@if $(2); then \
		$(call log_success,"Tests $(1) OK"); \
	else \
		$(call log_error,"Tests $(1) échoués"); \
		exit 1; \
	fi
endef