#!/bin/bash
# Setup initial du projet Cloudity (structure, .env, clés, deps)
# Ensuite : make up-full pour démarrer la stack et créer le compte démo (prêt à tester)

set -e

echo "🚀 Cloudity - Setup initial"
echo "============================"

# Outils requis
for cmd in docker; do
    if ! command -v $cmd &>/dev/null; then
        echo "❌ $cmd est requis."
        exit 1
    fi
done
if ! docker compose version &>/dev/null && ! docker-compose version &>/dev/null; then
    echo "❌ Docker Compose est requis."
    exit 1
fi
echo "✅ Docker (Compose) OK"

# Dossiers
echo "📁 Création des dossiers..."
mkdir -p backend/auth-service backend/api-gateway backend/admin-service
mkdir -p frontend/admin-dashboard
mkdir -p mobile/admin_app
mkdir -p infrastructure/postgresql/init
mkdir -p scripts

# .env
if [ ! -f .env ]; then
    echo "📝 Création de .env..."
    [ -f .env.example ] && cp .env.example .env || {
        cat > .env << 'EOF'
POSTGRES_USER=cloudity_admin
POSTGRES_PASSWORD=cloudity_secure_password_2025
POSTGRES_DB=cloudity
REDIS_PASSWORD=redis_secure_password_2025
JWT_SECRET=super_secret_jwt_key_change_this_in_production_2025
NODE_ENV=development
VITE_API_URL=http://localhost:6080
CORS_ORIGINS=http://localhost:6001,http://localhost:5173
EOF
    }
    echo "✅ .env créé (à personnaliser si besoin)"
else
    echo "⚠️  .env existe déjà"
fi

# Clés RSA (auth-service)
if [ ! -f backend/auth-service/private.pem ]; then
    echo "🔐 Génération des clés RSA (JWT)..."
    openssl genrsa -out backend/auth-service/private.pem 2048 2>/dev/null
    openssl rsa -in backend/auth-service/private.pem -pubout -out backend/auth-service/public.pem 2>/dev/null
    echo "✅ Clés créées"
fi

# Dépendances (Go, Python, Node, Flutter) — réutilise le script commun
if [ -f scripts/install-deps.sh ]; then
    chmod +x scripts/install-deps.sh 2>/dev/null || true
    ./scripts/install-deps.sh
else
    echo "📦 Dépendances (fallback)..."
    (cd backend/auth-service && go mod tidy 2>/dev/null) || true
    (cd backend/api-gateway && go mod tidy 2>/dev/null) || true
    (cd backend/calendar-service && go mod tidy 2>/dev/null) || true
    (cd backend/notes-service && go mod tidy 2>/dev/null) || true
    (cd backend/tasks-service && go mod tidy 2>/dev/null) || true
    (cd backend/drive-service && go mod tidy 2>/dev/null) || true
    [ -f frontend/admin-dashboard/package.json ] && (cd frontend/admin-dashboard && npm install 2>/dev/null) || true
    command -v flutter &>/dev/null && [ -d mobile/admin_app ] && (cd mobile/admin_app && flutter pub get 2>/dev/null) || true
fi

# Permissions scripts
chmod +x scripts/*.sh 2>/dev/null || true

echo ""
echo "✅ Setup terminé."
echo ""
echo "Démarrer tout (stack + compte démo) :  make up-full"
echo "Ou seulement la stack :               make up"
echo "Arrêter la stack :                    make down"
echo "Aide :                                make help"
echo "Suivi projet :                        voir STATUS.md"
echo ""
