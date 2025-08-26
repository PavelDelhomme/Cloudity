#!/bin/bash

echo "🔧 Script de réparation Cloudity"
echo "================================"

# Nettoyage complet d'abord
echo "🧹 Nettoyage des anciens conteneurs..."
docker compose down -v --remove-orphans 2>/dev/null || true
docker system prune -f

# Vérification et création des fichiers manquants
echo "📁 Vérification des fichiers essentiels..."

# 1. Créer .env s'il n'existe pas
if [ ! -f ".env" ]; then
    echo "📝 Création du fichier .env..."
    cat > .env << 'EOF'
# Cloudity Environment Configuration
POSTGRES_USER=cloudity_admin
POSTGRES_PASSWORD=cloudity_secure_password_2025
POSTGRES_DB=cloudity
REDIS_PASSWORD=redis_secure_password_2025
JWT_SECRET=super_secret_jwt_key_change_this_in_production_2025
BUILD_TARGET=Dockerfile.dev
NODE_ENV=development
VITE_API_URL=http://localhost:8000
EOF
    echo "✅ Fichier .env créé"
fi

# 2. Vérifier et créer les go.mod manquants
echo "🔧 Configuration des projets Go..."

# Auth service go.mod
if [ ! -f "backend/auth-service/go.mod" ]; then
    cd backend/auth-service
    cat > go.mod << 'EOF'
module github.com/pavel/cloudity/auth-service

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/joho/godotenv v1.5.1
)
EOF
    go mod tidy 2>/dev/null || echo "⚠️ go mod tidy échoué, mais go.mod créé"
    cd ../../
    echo "✅ go.mod auth-service créé"
fi

# API Gateway go.mod  
if [ ! -f "backend/api-gateway/go.mod" ]; then
    cd backend/api-gateway
    cat > go.mod << 'EOF'
module github.com/pavel/cloudity/api-gateway

go 1.21

require (
	github.com/gorilla/mux v1.8.1
	github.com/rs/cors v1.10.1
	github.com/joho/godotenv v1.5.1
)
EOF
    go mod tidy 2>/dev/null || echo "⚠️ go mod tidy échoué, mais go.mod créé"
    cd ../../
    echo "✅ go.mod api-gateway créé"
fi

# 3. Vérifier les package.json frontend
echo "📦 Configuration du frontend..."
if [ ! -f "frontend/admin-dashboard/package.json" ]; then
    cat > frontend/admin-dashboard/package.json << 'EOF'
{
  "name": "admin-dashboard",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.28",
    "@types/react-dom": "^18.0.11",
    "@vitejs/plugin-react": "^3.1.0",
    "typescript": "^4.9.3",
    "vite": "^4.1.0"
  }
}
EOF
    echo "✅ package.json frontend créé"
fi

# 4. Créer un App.tsx minimal si nécessaire
if [ ! -f "frontend/admin-dashboard/src/App.tsx" ]; then
    mkdir -p frontend/admin-dashboard/src
    cat > frontend/admin-dashboard/src/App.tsx << 'EOF'
import React from 'react'

function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Cloudity Admin Dashboard</h1>
      <p>Dashboard en cours de développement...</p>
      <div style={{ background: '#f5f5f5', padding: '10px', borderRadius: '5px', marginTop: '20px' }}>
        <h3>État des services:</h3>
        <ul>
          <li>✅ Frontend React: Opérationnel</li>
          <li>⏳ API Gateway: En attente</li>
          <li>⏳ Auth Service: En attente</li>
          <li>⏳ Admin Service: En attente</li>
        </ul>
      </div>
    </div>
  )
}

export default App
EOF
    echo "✅ App.tsx minimal créé"
fi

# 5. Créer main.tsx si nécessaire
if [ ! -f "frontend/admin-dashboard/src/main.tsx" ]; then
    cat > frontend/admin-dashboard/src/main.tsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF
    echo "✅ main.tsx créé"
fi

# 6. Créer index.html si nécessaire
if [ ! -f "frontend/admin-dashboard/index.html" ]; then
    cat > frontend/admin-dashboard/index.html << 'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cloudity Admin Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
    echo "✅ index.html créé"
fi

# 7. Vérifier requirements.txt
if [ ! -f "backend/admin-service/requirements.txt" ]; then
    cat > backend/admin-service/requirements.txt << 'EOF'
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
EOF
    echo "✅ requirements.txt créé"
fi

# 8. Créer les répertoires manquants
mkdir -p storage/postgres storage/redis storage/logs storage/backups
mkdir -p infrastructure/postgresql/init

# 9. Permissions sur les scripts
chmod +x scripts/*.sh 2>/dev/null || true

echo ""
echo "🎉 Réparation terminée!"
echo ""
echo "📋 Prochaines étapes:"
echo "1. docker compose build --no-cache"  
echo "2. docker compose up -d postgres redis"
echo "3. Attendre 10 secondes"
echo "4. docker compose up -d"
echo ""