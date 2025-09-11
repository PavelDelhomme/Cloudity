# scripts/colors.mk - VERSION FINALE SANS PRINTF
# À inclure dans tous les Makefiles avec: include scripts/colors.mk

# ═══════════════════════════════════════════════════════════════
# COULEURS - VERSION ECHO DIRECTE (compatible Manjaro)
# ═══════════════════════════════════════════════════════════════

RED     := \033[0;31m
GREEN   := \033[0;32m
YELLOW  := \033[1;33m
BLUE    := \033[0;34m
PURPLE  := \033[0;35m
CYAN    := \033[0;36m
WHITE   := \033[1;37m
GRAY    := \033[0;37m
NC      := \033[0m

# Émojis
EMOJI_SUCCESS := ✅
EMOJI_ERROR   := ❌
EMOJI_WARNING := ⚠️
EMOJI_INFO    := ℹ️
EMOJI_ROCKET  := 🚀
EMOJI_GEAR    := ⚙️

# ═══════════════════════════════════════════════════════════════
# FONCTIONS DE LOGGING - ECHO SIMPLE
# ═══════════════════════════════════════════════════════════════

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
# FONCTIONS UTILITAIRES - CORRIGÉES
# ═══════════════════════════════════════════════════════════════

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

define check_service_status
	@if docker compose ps $(1) --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)$(1): Running$(NC)"; \
	else \
		echo "$(RED)$(1): Stopped$(NC)"; \
	fi
endef