#!/bin/bash

echo "🚀 Setting up Cloudity development environment..."

# Check for required tools
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
}

check_command docker
check_command docker-compose
check_command make

# Create necessary directories
echo "📁 Creating project directories..."
mkdir -p backend/{auth-service,api-gateway,admin-service}
mkdir -p frontend/admin-dashboard
mkdir -p mobile/admin_app
mkdir -p infrastructure/{postgres,nginx}
mkdir -p scripts
mkdir -p backups

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration"
fi

# Generate JWT keys
if [ ! -f backend/auth-service/private.pem ]; then
    echo "🔐 Generating RSA keys for JWT..."
    openssl genrsa -out backend/auth-service/private.pem 2048
    openssl rsa -in backend/auth-service/private.pem -outform PEM -pubout -out backend/auth-service/public.pem
fi

# Initialize Go modules
echo "📦 Initializing Go modules..."
(cd backend/auth-service && go mod init github.com/PavelDelhomme/Cloudity/auth-service 2>/dev/null || true)
(cd backend/api-gateway && go mod init github.com/PavelDelhomme/Cloudity/api-gateway 2>/dev/null || true)

# Initialize Node projects
echo "📦 Initializing Node projects..."
(cd frontend/admin-dashboard && npm init -y 2>/dev/null || true)

# Initialize Flutter project
echo "📦 Initializing Flutter project..."
if command -v flutter &> /dev/null; then
    (cd mobile && flutter create admin_app --org com.cloudity 2>/dev/null || true)
else
    echo "⚠️  Flutter not installed, skipping mobile app initialization"
fi

# Pull Docker images
echo "🐳 Pulling Docker images..."
docker pull postgres:15-alpine
docker pull redis:7-alpine
docker pull golang:1.21-alpine
docker pull python:3.11-slim
docker pull node:18-alpine
docker pull nginx:alpine

# Create Docker network
echo "🌐 Creating Docker network..."
docker network create cloudity-network 2>/dev/null || true

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your configuration"
echo "2. Run 'make dev' to start the development environment"
echo "3. Access the services:"
echo "   - API Gateway: http://localhost:8080"
echo "   - Admin Dashboard: http://localhost:3000"
echo ""
echo "Happy coding! 🎉"