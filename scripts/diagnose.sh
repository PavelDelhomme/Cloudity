#!/bin/bash

echo "🔍 Diagnostic Cloudity - Vérification de la configuration"
echo "=================================================="

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅${NC} $1 existe"
    else
        echo -e "${RED}❌${NC} $1 MANQUANT"
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✅${NC} Dossier $1 existe"
    else
        echo -e "${RED}❌${NC} Dossier $1 MANQUANT"
    fi
}

echo "📁 Vérification de la structure des fichiers:"
echo "----------------------------------------------"

# Fichiers principaux
check_file "docker-compose.yml"
check_file ".env"
check_file "Makefile"

# Backend auth-service
echo -e "\n🔐 Service d'authentification:"
check_dir "backend/auth-service"
check_file "backend/auth-service/Dockerfile.dev"
check_file "backend/auth-service/main.go"
check_file "backend/auth-service/go.mod"

# Backend api-gateway
echo -e "\n🌐 API Gateway:"
check_dir "backend/api-gateway"
check_file "backend/api-gateway/Dockerfile.dev"
check_file "backend/api-gateway/main.go"
check_file "backend/api-gateway/go.mod"

# Backend admin-service
echo -e "\n👤 Service d'administration:"
check_dir "backend/admin-service"
check_file "backend/admin-service/Dockerfile.dev"
check_file "backend/admin-service/main.py"
check_file "backend/admin-service/requirements.txt"

# Frontend
echo -e "\n📊 Dashboard frontend:"
check_dir "frontend/admin-dashboard"
check_file "frontend/admin-dashboard/Dockerfile.dev"
check_file "frontend/admin-dashboard/package.json"
check_file "frontend/admin-dashboard/vite.config.js"
check_file "frontend/admin-dashboard/src/App.tsx"

# Infrastructure
echo -e "\n🗄️  Infrastructure:"
check_dir "infrastructure/postgresql"
check_file "infrastructure/postgresql/init/01-schema.sql"
check_dir "infrastructure/postgresql/init"

echo -e "\n🐳 Vérification Docker:"
echo "----------------------"

if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅${NC} Docker installé"
    docker --version
else
    echo -e "${RED}❌${NC} Docker NON installé"
fi

if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    echo -e "${GREEN}✅${NC} Docker Compose disponible"
    if command -v docker-compose &> /dev/null; then
        docker-compose --version
    else
        docker compose version
    fi
else
    echo -e "${RED}❌${NC} Docker Compose NON disponible"
fi

echo -e "\n🔧 Variables d'environnement:"
echo "-----------------------------"
if [ -f ".env" ]; then
    echo -e "${GREEN}✅${NC} Fichier .env existe"
    echo "Contenu:"
    grep -v '^#' .env | grep -v '^$' | head -10
else
    echo -e "${RED}❌${NC} Fichier .env manquant"
fi

echo -e "\n📦 Vérification des ports (60XX):"
echo "-----------------------------------"
ports=(6042 6079 6000 6081 6082 6001 6083 6084)
for port in "${ports[@]}"; do
    if netstat -tuln 2>/dev/null | grep -q ":$port "; then
        echo -e "${YELLOW}⚠️${NC} Port $port déjà utilisé"
    else
        echo -e "${GREEN}✅${NC} Port $port libre"
    fi
done

echo -e "\n🚀 État des conteneurs Docker:"
echo "------------------------------"
docker ps -a --filter "name=cloudity" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Aucun conteneur Cloudity trouvé"

echo -e "\n📋 Recommandations:"
echo "-------------------"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️${NC} Créer le fichier .env avec: make create-env"
fi

if [ ! -f "backend/auth-service/go.mod" ]; then
    echo -e "${YELLOW}⚠️${NC} Initialiser les projets Go avec: make create-go-projects"
fi

if docker ps -a --filter "name=cloudity" | grep -q cloudity; then
    echo -e "${YELLOW}⚠️${NC} Nettoyer les anciens conteneurs avec: make clean"
fi

echo -e "\n✅ Diagnostic terminé!"