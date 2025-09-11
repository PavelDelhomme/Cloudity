# scripts/colors.mk - Système de couleurs FINAL CORRIGÉ
# À inclure dans tous les Makefiles avec: include scripts/colors.mk

# ═══════════════════════════════════════════════════════════════
# DÉFINITION DES COULEURS - VERSION BASH COMPATIBLE
# ═══════════════════════════════════════════════════════════════

# Couleurs de base - syntaxe bash compatible
RED     := $(shell printf "\033[0;31m")
GREEN   := $(shell printf "\033[0;32m")
YELLOW  := $(shell printf "\033[1;33m")
BLUE    := $(shell printf "\033[0;34m")
PURPLE  := $(shell printf "\033[0;35m")
CYAN    := $(shell printf "\033[0;36m")
WHITE   := $(shell printf "\033[1;37m")
GRAY    := $(shell printf "\033[0;37m")
NC      := $(shell printf "\033[0m")

# Couleurs étendues
BOLD    := $(shell printf "\033[1m")
DIM     := $(shell printf "\033[2m")
UNDER   := $(shell printf "\033[4m")

# ═══════════════════════════════════════════════════════════════
# ÉMOJIS ET ICÔNES
# ═══════════════════════════════════════════════════════════════

EMOJI_SUCCESS := ✅
EMOJI_ERROR   := ❌
EMOJI_WARNING := ⚠️
EMOJI_INFO    := ℹ️
EMOJI_ROCKET  := 🚀
EMOJI_GEAR    := ⚙️
EMOJI_CLEAN   := 🧹
EMOJI_TEST    := 🧪
EMOJI_BUILD   := 🔨
EMOJI_DOC     := 📚
EMOJI_LOCK    := 🔐
EMOJI_MAIL    := 📧
EMOJI_DB      := 🗄️

# ═══════════════════════════════════════════════════════════════
# FONCTIONS DE LOGGING - VERSION SIMPLE
# ═══════════════════════════════════════════════════════════════

# Fonction de log simple avec echo
define log_info
	@echo "$(BLUE)$(EMOJI_INFO) $(1)$(NC)"
endef

define log_success
	@echo "$(GREEN)$(EMOJI_SUCCESS) $(1)$(NC)"
endef

define log_warning
	@echo "$(YELLOW)$(EMOJI_WARNING) $(1)$(NC)"
endef

define log_error
	@echo "$(RED)$(EMOJI_ERROR) $(1)$(NC)"
endef

define log_rocket
	@echo "$(PURPLE)$(EMOJI_ROCKET) $(1)$(NC)"
endef

define log_gear
	@echo "$(CYAN)$(EMOJI_GEAR) $(1)$(NC)"
endef

# ═══════════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES
# ═══════════════════════════════════════════════════════════════

# Vérification de service Docker - simple
define check_service_status
	@if docker compose ps $(1) --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)$(1): Running$(NC)"; \
	else \
		echo "$(RED)$(1): Stopped$(NC)"; \
	fi
endef

# Attente de service - simple
define wait_for_postgres
	@echo "$(YELLOW)Attente PostgreSQL...$(NC)"
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if docker compose exec postgres pg_isready -U cloudity_admin >/dev/null 2>&1; then \
			echo "$(GREEN)PostgreSQL prêt!$(NC)"; \
			break; \
		fi; \
		sleep 2; \
		timeout=$$((timeout-2)); \
	done; \
	if [ $$timeout -le 0 ]; then \
		echo "$(RED)PostgreSQL timeout$(NC)"; \
		exit 1; \
	fi
endef

# ═══════════════════════════════════════════════════════════════
# TEMPLATES DE MESSAGES
# ═══════════════════════════════════════════════════════════════

define show_header
	@echo ""
	@echo "$(CYAN)═══ $(1) ═══$(NC)"
	@echo ""
endef

define show_separator
	@echo "$(GRAY)═══════════════════════════════════════════════════════$(NC)"
endef

# ═══════════════════════════════════════════════════════════════
# VALIDATION
# ═══════════════════════════════════════════════════════════════

define check_docker
	@if ! command -v docker >/dev/null 2>&1; then \
		echo "$(RED)$(EMOJI_ERROR) Docker non installé$(NC)"; \
		exit 1; \
	fi
	@if ! docker info >/dev/null 2>&1; then \
		echo "$(RED)$(EMOJI_ERROR) Docker non démarré$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)$(EMOJI_SUCCESS) Docker OK$(NC)"
endef