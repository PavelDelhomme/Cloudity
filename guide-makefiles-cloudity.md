# Guide Complet - Gestion Cloudity via Makefiles

## 🚀 Démarrage Rapide

### Commandes Essentielles

```bash
# Démarrage rapide (recommandé pour débuter)
make quick-start

# Environnement complet
make dev-full

# Système email uniquement
make dev-email

# Status de tous les services
make status

# Arrêt complet
make stop-all
```

## 📁 Structure des Makefiles

```
Cloudity/
├── Makefile                     # 🎯 Orchestrateur principal
├── backend/Makefile             # 🔧 Gestion services backend
├── frontend/Makefile            # 🎨 Gestion applications frontend  
├── infrastructure/Makefile      # 🏗️ Gestion infrastructure
├── scripts/colors.mk           # 🎨 Utilitaires et couleurs
└── [service]/Makefile          # 📦 Makefiles individuels
```

## 🎯 Makefile Principal - Commandes Globales

### Démarrages Orchestrés

| Commande | Description | Services démarrés |
|----------|-------------|------------------|
| `make quick-start` | **Démarrage essentiel** | Infrastructure + Auth + Admin |
| `make dev-full` | Environnement complet | Tous les services |
| `make dev-email` | Système email complet | Infra + Backend core + Email |
| `make dev-core` | Services de base | Infrastructure + Backend core |

### Gestion par Composants

| Commande | Description |
|----------|-------------|
| `make infra-start` | Infrastructure uniquement (PostgreSQL + Redis) |
| `make backend-core` | Services backend essentiels |
| `make backend-all` | Tous les services backend |
| `make frontend-all` | Toutes les applications frontend |

### Services Individuels

| Commande | Port | Description |
|----------|------|-------------|
| `make auth-service` | 8081 | Service authentification |
| `make api-gateway` | 8000 | API Gateway |
| `make admin-service` | 8082 | Service administration |
| `make admin-dashboard` | 3000 | Dashboard admin |
| `make email-frontend` | 8094 | Application email |
| `make alias-service` | 8092 | Service alias email |

## 🔧 Backend Services

### Commandes Backend Globales

```bash
# Démarrage
make -C backend dev-all          # Tous les services backend
make -C backend dev-core         # Services core (auth + gateway + admin)
make -C backend dev-email        # Services email

# Status et monitoring
make -C backend status           # Status détaillé
make -C backend health           # Health check
make -C backend logs-all         # Logs tous services

# Tests
make -C backend test-all         # Tests complets
make -C backend test-auth        # Tests auth service

# Build
make -C backend build-all        # Build tous services
```

### Services Backend Individuels

| Service | Commande | Port | Technologie |
|---------|----------|------|-------------|
| **Auth Service** | `make -C backend auth-service` | 8081 | Go |
| **API Gateway** | `make -C backend api-gateway` | 8000 | Go |
| **Admin Service** | `make -C backend admin-service` | 8082 | Python |
| **Email Service** | `make -C backend email-service` | 8091 | Rust |
| **Alias Service** | `make -C backend alias-service` | 8092 | Rust |

## 🎨 Frontend Applications

### Commandes Frontend Globales

```bash
# Démarrage
make -C frontend dev-all         # Toutes les applications
make -C frontend admin-dashboard # Dashboard admin
make -C frontend email-app       # Application email

# Développement local (sans Docker)
make -C frontend dev-admin-local # Admin en local
make -C frontend dev-email-local # Email en local

# Status et monitoring
make -C frontend status          # Status applications
make -C frontend show-urls       # URLs d'accès
make -C frontend logs-all        # Logs applications
```

### Applications Frontend

| Application | Commande | Port | Description |
|-------------|----------|------|-------------|
| **Admin Dashboard** | `make -C frontend admin-dashboard` | 3000 | Gestion système |
| **Email App** | `make -C frontend email-app` | 8094 | Interface email |
| **Password App** | `make -C frontend password-app` | 8095 | Gestionnaire mots de passe |

## 📧 Système Email Spécialisé

### Commandes Email Complètes

```bash
# Démarrage système email complet
make dev-email                   # Infrastructure + Backend + Frontend
make email-service              # Services backend email uniquement
make email-frontend              # Application frontend email

# Services email individuels
make alias-service              # Service alias (port 8092)
make email-rust                 # Service email Rust (port 8091)
make mail-server               # Serveur mail complet

# Monitoring email
make logs-email                 # Logs services email
```

## 🏗️ Infrastructure

### Commandes Infrastructure

```bash
# Infrastructure
make -C infrastructure dev       # PostgreSQL + Redis
make -C infrastructure setup     # Configuration initiale
make -C infrastructure wait-postgres # Attendre PostgreSQL

# Base de données
make -C infrastructure db-init   # Initialisation BDD
make -C infrastructure db-reset-all # Reset complet
make -C infrastructure db-migrate-all # Migrations

# Monitoring
make -C infrastructure status    # Status infrastructure
make -C infrastructure health    # Health check
make -C infrastructure logs      # Logs infrastructure

# Shells
make -C infrastructure shell-postgres # Shell PostgreSQL
make -C infrastructure shell-redis    # Shell Redis
```

## 🔐 Service Auth Détaillé

### Gestion Auth Service

```bash
# Navigation dans le service
cd backend/auth-service

# Développement
make dev                        # Démarrage avec hot reload
make dev-local                  # Démarrage local Go
make build                      # Build du service

# Tests
make test                       # Tests complets
make test-unit                  # Tests unitaires
make test-api                   # Tests API manuels
make test-health                # Test endpoint health
make test-register              # Test inscription
make test-login                 # Test connexion

# Monitoring
make status                     # Status du service
make health                     # Health check
make logs                       # Logs du service

# Utilitaires
make shell                      # Shell dans container
make format                     # Formatage Go
make clean                      # Nettoyage
```

## 📧 Service Email Rust Détaillé

### Gestion Email Service

```bash
# Navigation dans le service
cd backend/email-service

# Développement
make dev                        # Démarrage Docker
make dev-local                  # Démarrage local Rust
make watch                      # Mode watch développement

# Build
make build                      # Build standard
make build-release              # Build optimisé production
make build-docker               # Build image Docker

# Tests
make test                       # Tests complets
make test-unit                  # Tests unitaires
make test-integration           # Tests d'intégration
make test-api                   # Tests endpoints API

# Tests spécialisés email
make smtp-test                  # Test serveur SMTP
make imap-test                  # Test serveur IMAP
make alias-test                 # Test système alias

# Qualité code
make format                     # Formatage Rust
make lint                       # Linting Clippy
make audit                      # Audit sécurité
make doc                        # Documentation

# Monitoring
make status                     # Status service
make logs                       # Logs service
make health                     # Health check
```

## 📊 Monitoring et Status

### Commandes de Status

```bash
# Status global
make status                     # Vue d'ensemble tous services
make show-urls                  # URLs d'accès
make health                     # Health check complet

# Status par composant
make -C backend status          # Status backend
make -C frontend status         # Status frontend
make -C infrastructure status   # Status infrastructure

# Tests de santé
make test-health                # Test endpoints santé
make test-auth                  # Test authentification
```

### URLs d'Accès

| Service | URL | Description |
|---------|-----|-------------|
| Admin Dashboard | http://localhost:3000 | Interface administration |
| API Gateway | http://localhost:8000 | Point d'entrée API |
| Auth Service | http://localhost:8081 | Service authentification |
| Admin Service | http://localhost:8082 | Service administration |
| Email App | http://localhost:8094 | Application email |
| Alias Service | http://localhost:8092 | Service alias email |
| Adminer | http://localhost:8083 | Administration BDD |

## 📝 Logs et Debugging

### Commandes de Logs

```bash
# Logs globaux
make logs-all                   # Tous les services
make logs-backend               # Services backend
make logs-frontend              # Applications frontend

# Logs spécialisés
make logs-auth                  # Service authentification
make logs-admin                 # Services administration
make logs-email                 # Services email

# Logs par composant
make -C backend logs-all        # Backend complet
make -C frontend logs-admin     # Admin dashboard
make -C infrastructure logs     # Infrastructure
```

## 🔄 Contrôles et Redémarrages

### Contrôles Individuels

```bash
# Redémarrages
make restart-auth               # Redémarrage auth service
make restart-gateway            # Redémarrage API gateway
make restart-admin              # Redémarrage admin service
make restart-admin-dashboard    # Redémarrage dashboard

# Arrêts sélectifs
make stop-backend               # Arrêt services backend
make stop-frontend              # Arrêt applications frontend
make stop-infra                 # Arrêt infrastructure
make stop-all                   # Arrêt complet
```

## 🧹 Nettoyage et Maintenance

### Commandes de Nettoyage

```bash
# Nettoyage services
make clean                      # Nettoyage services
make clean-all                  # Nettoyage complet + volumes

# Nettoyage par composant
make -C backend clean           # Nettoyage backend
make -C frontend clean          # Nettoyage frontend
make -C infrastructure clean    # Nettoyage infrastructure

# Reset complet
make reset-project              # Reset projet complet
make db-reset                   # Reset bases de données
```

## 🛠️ Shells et Accès Conteneurs

### Menu Shell Interactif

```bash
make shell                      # Menu de sélection
# Choisir parmi:
# 1) auth-service    2) api-gateway    3) admin-service
# 4) admin-dashboard 5) postgres       6) redis
# 7) email-service   8) alias-service
```

### Shells Directs

```bash
# Backend
make -C backend shell-auth      # Shell auth service
make -C backend shell-gateway   # Shell API gateway
make -C backend shell-admin     # Shell admin service

# Frontend
make -C frontend shell-admin    # Shell admin dashboard

# Infrastructure
make -C infrastructure shell-postgres # Shell PostgreSQL
make -C infrastructure shell-redis    # Shell Redis
```

## 🔧 Configuration et Setup

### Configuration Initiale

```bash
# Setup complet
make setup                      # Configuration complète

# Setup par composant
make -C infrastructure setup    # Setup infrastructure
make -C backend setup           # Setup backend
make -C frontend setup          # Setup frontend

# Setup services spécifiques
make -C backend/auth-service setup    # Setup auth service
make -C backend/email-service setup   # Setup email service
```

## 📋 Scenarios d'Usage Typiques

### 1. Premier Lancement (Développement)

```bash
# 1. Configuration initiale
make setup

# 2. Démarrage rapide
make quick-start

# 3. Vérification
make status
make show-urls

# 4. Tests
make test-health
```

### 2. Développement Email

```bash
# 1. Démarrage système email
make dev-email

# 2. Développement service Rust
cd backend/email-service
make dev-local

# 3. Tests
make test
make alias-test

# 4. Monitoring
make logs
```

### 3. Développement Frontend

```bash
# 1. Infrastructure + Backend
make backend-core

# 2. Frontend local
make -C frontend dev-admin-local

# 3. Tests
make -C frontend test-admin
```

### 4. Debugging

```bash
# 1. Status détaillé
make status

# 2. Logs spécifiques
make logs-auth

# 3. Shell pour investigation
make shell
# Choisir le service à investiguer

# 4. Health check
make health
```

### 5. Reset Complet

```bash
# 1. Arrêt complet
make stop-all

# 2. Nettoyage
make clean-all

# 3. Reset BDD
make db-reset

# 4. Redémarrage
make quick-start
```

## ⚡ Raccourcis Pratiques

### Aliases Disponibles

```bash
# Raccourcis globaux
make start          # = make quick-start
make up             # = make dev-full  
make down           # = make stop-all
make ps             # = make status

# Raccourcis frontend
make admin          # = make admin-dashboard
make email          # = make email-frontend
make password       # = make password-frontend
```

## 🚨 Dépannage Fréquent

### Problèmes Courants

1. **Services ne démarrent pas**
   ```bash
   make status              # Vérifier l'état
   make logs-all           # Voir les erreurs
   make clean && make quick-start # Reset
   ```

2. **Base de données inaccessible**
   ```bash
   make -C infrastructure health
   make -C infrastructure db-reset-all
   ```

3. **Ports occupés**
   ```bash
   make stop-all           # Arrêter tous les services
   docker system prune -f  # Nettoyer
   ```

4. **Problèmes de build**
   ```bash
   make clean-all          # Nettoyage complet
   make setup              # Reconfiguration
   ```

Cette documentation vous donne un contrôle granulaire total sur l'environnement Cloudity via les Makefiles ! 🚀