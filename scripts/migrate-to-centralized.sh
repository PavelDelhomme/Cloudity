#!/bin/bash

# Script de migration vers le Makefile centralisé
# Ce script désactive les anciens Makefiles et les remplace par des liens vers le principal

set -e

echo "🔄 Migration vers le Makefile centralisé..."

# Créer un backup des anciens Makefiles
echo "📦 Création d'un backup des anciens Makefiles..."
mkdir -p backup/makefiles-$(date +%Y%m%d-%H%M%S)
cp backend/Makefile backup/makefiles-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true
cp frontend/Makefile backup/makefiles-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true
cp infrastructure/Makefile backup/makefiles-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true

# Renommer les anciens Makefiles
echo "🔄 Désactivation des anciens Makefiles..."
mv backend/Makefile backend/Makefile.old 2>/dev/null || true
mv frontend/Makefile frontend/Makefile.old 2>/dev/null || true
mv infrastructure/Makefile infrastructure/Makefile.old 2>/dev/null || true

# Créer des Makefiles de redirection
echo "🔗 Création des Makefiles de redirection..."

# Backend Makefile de redirection
cat > backend/Makefile << 'EOF'
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
EOF

# Frontend Makefile de redirection
cat > frontend/Makefile << 'EOF'
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
EOF

# Infrastructure Makefile de redirection
cat > infrastructure/Makefile << 'EOF'
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
EOF

echo "✅ Migration terminée!"
echo ""
echo "📋 Résumé des changements:"
echo "  - Anciens Makefiles sauvegardés dans backup/"
echo "  - Nouveaux Makefiles de redirection créés"
echo "  - Toutes les commandes redirigent vers le Makefile principal"
echo ""
echo "🚀 Utilisation:"
echo "  - Depuis la racine: make help"
echo "  - Depuis un sous-dossier: make -C .. help"
echo "  - Ou simplement: make <commande> depuis n'importe où"
echo ""
echo "💡 Exemples:"
echo "  make start                    # Démarrage intelligent"
echo "  make start email             # Stack email complète"
echo "  make logs backend            # Logs du backend"
echo "  make shell auth-service      # Shell du service auth"
echo "  make status                  # Status de tous les services"
