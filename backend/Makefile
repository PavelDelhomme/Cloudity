# Redirection vers le Makefile principal
# Utilisez: make -C .. <commande> ou make <commande> depuis la racine

.PHONY: help

help: ## Redirection vers le Makefile principal
	@echo "🔄 Redirection vers le Makefile principal..."
	@echo "Utilisez depuis la racine: make help"
	@echo "Ou: make -C .. help"
	@echo ""
	@echo "Commandes backend disponibles:"
	@echo "  make -C .. start backend    # Démarrer le backend"
	@echo "  make -C .. stop backend     # Arrêter le backend"
	@echo "  make -C .. logs backend     # Logs backend"
	@echo "  make -C .. shell <service>  # Shell d'un service"

%:
	@echo "🔄 Redirection vers le Makefile principal..."
	@make -C .. $@
