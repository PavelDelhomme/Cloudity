# Redirection vers le Makefile principal
# Utilisez: make -C .. <commande> ou make <commande> depuis la racine

.PHONY: help

help: ## Redirection vers le Makefile principal
	@echo "🔄 Redirection vers le Makefile principal..."
	@echo "Utilisez depuis la racine: make help"
	@echo "Ou: make -C .. help"
	@echo ""
	@echo "Commandes frontend disponibles:"
	@echo "  make -C .. start frontend   # Démarrer le frontend"
	@echo "  make -C .. stop frontend    # Arrêter le frontend"
	@echo "  make -C .. logs frontend    # Logs frontend"
	@echo "  make -C .. shell <service>  # Shell d'un service"

%:
	@echo "🔄 Redirection vers le Makefile principal..."
	@make -C .. $@
