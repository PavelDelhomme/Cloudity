# scripts/colors.mk - Couleurs partagées
SHELL := /bin/bash

GREEN := $(shell printf "\033[0;32m")
YELLOW := $(shell printf "\033[0;33m") 
RED := $(shell printf "\033[0;31m")
BLUE := $(shell printf "\033[0;34m")
PURPLE := $(shell printf "\033[0;35m")
CYAN := $(shell printf "\033[0;36m")
NC := $(shell printf "\033[0m")

define log_info
	printf "$(CYAN)ℹ️  $(1)$(NC)"
endef

define log_success
	printf "$(GREEN)✅ $(1)$(NC)"
endef

define log_warning
	printf "$(YELLOW)⚠️  $(1)$(NC)"
endef

define log_error
	printf "$(RED)❌ $(1)$(NC)"
endef


# Test de couleurs
test-colors: ## Test des couleurs
	$(call log_info,"Test couleur info")
	$(call log_success,"Test couleur success")
	$(call log_warning,"Test couleur warning")
	$(call log_error,"Test couleur error")
	@printf "$(GREEN)Vert$(NC) $(YELLOW)Jaune$(NC) $(RED)Rouge$(NC) $(BLUE)Bleu$(NC)\n"