#!/bin/bash
# Setup environnement de développement Cloudity (deps locales + vérifs)
# À lancer après setup.sh si vous développez en local (sans tout Docker).

set -e

echo "🔧 Cloudity - Setup développement"
echo "================================="

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# .env
if [ ! -f .env ]; then
    echo "❌ Fichier .env manquant. Lancez: make create-env ou scripts/setup.sh"
    exit 1
fi

# Optionnel: Go
if command -v go &>/dev/null; then
    echo "📦 Go: go mod tidy (auth, api-gateway)..."
    (cd backend/auth-service && go mod tidy) 2>/dev/null || true
    (cd backend/api-gateway && go mod tidy) 2>/dev/null || true
fi

# Optionnel: Node (pour lancer le front en local sur 5173)
if command -v node &>/dev/null && [ -f frontend/admin-dashboard/package.json ]; then
    echo "📦 Node: npm install (admin-dashboard)..."
    (cd frontend/admin-dashboard && npm install)
fi

# Optionnel: Python (admin-service)
if command -v python3 &>/dev/null && [ -f backend/admin-service/requirements.txt ]; then
    echo "📦 Python: venv + pip install..."
    (cd backend/admin-service && python3 -m venv venv 2>/dev/null; . venv/bin/activate 2>/dev/null && pip install -r requirements.txt -q) || true
fi

echo ""
echo "✅ Setup dev terminé."
echo "  Stack complète en Docker:  make up"
echo "  Backend seul:             make backend-only"
echo "  Infra seule:              make infrastructure-only"
echo "  Voir STATUS.md pour la roadmap."
echo ""
