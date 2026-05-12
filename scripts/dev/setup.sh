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
mkdir -p frontend/apps/cloudity-web frontend/packages/cloudity-shared
mkdir -p mobile/admin_app
mkdir -p infrastructure/postgresql/init
mkdir -p scripts

# .env — secrets aléatoires par défaut (256 bits via gen-secrets.sh).
# Voir docs/securite/SECRETS.md.
if [ ! -f .env ]; then
    echo "📝 Création de .env (secrets aléatoires 256 bits)..."
    if [ -x scripts/dev/gen-secrets.sh ]; then
        OUTPUT=.env ./scripts/dev/gen-secrets.sh
    else
        # Fallback minimal si gen-secrets.sh n'est pas exécutable.
        cat > .env << 'EOF'
POSTGRES_USER=cloudity_admin
POSTGRES_PASSWORD=dev_only_change_me_via_make_secrets
POSTGRES_DB=cloudity
REDIS_PASSWORD=dev_only_change_me_via_make_secrets
JWT_SECRET=dev_only_change_me_via_make_secrets
PERFORMANCE_INGEST_TOKEN=dev_only_change_me_via_make_secrets
NODE_ENV=development
VITE_API_URL=http://localhost:6080
CORS_ORIGINS=http://localhost:6001,http://localhost:5173
EOF
        chmod 600 .env
    fi
    echo "✅ .env créé. Régénère via 'make secrets --force' si besoin."
else
    echo "⚠️  .env existe déjà — non écrasé."
fi

# Clés RSA (auth-service)
if [ ! -f backend/auth-service/private.pem ]; then
    echo "🔐 Génération des clés RSA (JWT)..."
    openssl genrsa -out backend/auth-service/private.pem 2048 2>/dev/null
    openssl rsa -in backend/auth-service/private.pem -pubout -out backend/auth-service/public.pem 2>/dev/null
    echo "✅ Clés créées"
fi

# Dépendances (Go, Python, Node, Flutter) — réutilise le script commun
if [ -f scripts/dev/install-deps.sh ]; then
    chmod +x scripts/dev/install-deps.sh 2>/dev/null || true
    ./scripts/dev/install-deps.sh
else
    echo "📦 Dépendances (fallback)..."
    (cd backend/auth-service && go mod tidy 2>/dev/null) || true
    (cd backend/api-gateway && go mod tidy 2>/dev/null) || true
    (cd backend/calendar-service && go mod tidy 2>/dev/null) || true
    (cd backend/notes-service && go mod tidy 2>/dev/null) || true
    (cd backend/tasks-service && go mod tidy 2>/dev/null) || true
    (cd backend/photos-service && go mod tidy 2>/dev/null) || true
    (cd backend/drive-service && go mod tidy 2>/dev/null) || true
    ([ -f frontend/package.json ] && (cd frontend && npm install 2>/dev/null)) || \
    ([ -f frontend/apps/cloudity-web/package.json ] && (cd frontend/apps/cloudity-web && npm install 2>/dev/null)) || true
    command -v flutter &>/dev/null && [ -d mobile/admin_app ] && (cd mobile/admin_app && flutter pub get 2>/dev/null) || true
fi

# Permissions scripts (sous-dossiers inclus)
find scripts -type f -name '*.sh' -exec chmod +x {} \; 2>/dev/null || true

echo ""
echo "✅ Setup terminé."
echo ""
echo "Démarrer tout (stack + compte démo) :  make up-full"
echo "Ou seulement la stack :               make up"
echo "Arrêter la stack :                    make down"
echo "Aide :                                make help"
echo "Suivi projet :                        voir STATUS.md"
echo ""
