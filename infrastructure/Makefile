# Redirection vers le Makefile principal
# Utilisez: make -C .. <commande> ou make <commande> depuis la racine

.PHONY: help

help: ## Redirection vers le Makefile principal
	@echo "🔄 Redirection vers le Makefile principal..."
	@echo "Utilisez depuis la racine: make help"
	@echo "Ou: make -C .. help"
	@echo ""
	@echo "Commandes infrastructure disponibles:"
	@echo "  make -C .. start infra      # Démarrer l'infrastructure"
	@echo "  make -C .. stop infra       # Arrêter l'infrastructure"
	@echo "  make -C .. logs infra       # Logs infrastructure"
	@echo "  make -C .. shell postgres   # Shell PostgreSQL"
	@echo "  make -C .. shell redis      # Shell Redis"

%:
	@echo "🔄 Redirection vers le Makefile principal..."
	@make -C .. $@
