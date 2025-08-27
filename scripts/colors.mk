# scripts/colors.mk - Couleurs partagées
GREEN=\033[0;32m
YELLOW=\033[0;33m
RED=\033[0;31m
BLUE=\033[0;34m
PURPLE=\033[0;35m
CYAN=\033[0;36m
NC=\033[0m

define log_info
	@echo "$(CYAN)ℹ️  $(1)$(NC)"
endef

define log_success
	@echo "$(GREEN)✅ $(1)$(NC)"
endef

define log_warning
	@echo "$(YELLOW)⚠️  $(1)$(NC)"
endef

define log_error
	@echo "$(RED)❌ $(1)$(NC)"
endef