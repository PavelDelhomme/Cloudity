#!/bin/bash
# Installe toutes les dépendances du projet (Go, Python, Node).
# Utilisé par : make install, et par scripts/setup.sh
# À lancer après clone ou après ajout de paquets (ex. docx, xlsx dans le frontend).

set -e

echo "📦 Cloudity - Installation des dépendances"
echo "==========================================="

# Go (tous les services backend qui ont go.mod)
for dir in backend/auth-service backend/api-gateway backend/calendar-service \
  backend/notes-service backend/tasks-service backend/photos-service backend/drive-service \
  backend/password-manager backend/mail-directory-service; do
  if [ -f "$dir/go.mod" ]; then
    echo "  Go: $dir"
    (cd "$dir" && go mod tidy) || true
  fi
done
echo "✅ Go modules OK"

# Python (admin-service)
if [ -f backend/admin-service/requirements.txt ]; then
  echo "  Python: backend/admin-service"
  (cd backend/admin-service && python3 -m venv venv 2>/dev/null || true)
  (cd backend/admin-service && ./venv/bin/pip install -r requirements.txt -q 2>/dev/null) || \
  (cd backend/admin-service && pip install -r requirements.txt -q 2>/dev/null) || true
  echo "✅ Python deps OK"
fi

# Node — workspaces à la racine frontend/ (A1) si présent, sinon admin-dashboard seul
if [ -f frontend/package.json ]; then
  echo "  npm: frontend/ (workspaces)"
  (cd frontend && npm install)
elif [ -f frontend/admin-dashboard/package.json ]; then
  echo "  npm: frontend/admin-dashboard"
  (cd frontend/admin-dashboard && npm install)
fi
if [ -f frontend/package.json ] || [ -f frontend/admin-dashboard/package.json ]; then
  echo "✅ npm deps OK"
fi

# Flutter (optionnel)
if command -v flutter &>/dev/null && [ -d mobile/admin_app ]; then
  echo "  Flutter: mobile/admin_app"
  (cd mobile/admin_app && flutter pub get) || true
  echo "✅ Flutter deps OK"
fi

echo ""
echo "✅ Toutes les dépendances sont installées."
echo "   Démarrer la stack : make up"
echo "   Tout-en-un :       make up-full"
