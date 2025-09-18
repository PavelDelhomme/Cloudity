# 🚀 Guide du Makefile Centralisé Cloudity

## Vue d'ensemble

Le Makefile principal de Cloudity a été entièrement centralisé et optimisé pour offrir une gestion intelligente et intuitive de tous vos services. Plus besoin de naviguer entre différents Makefiles dans chaque dossier !

## ✨ Fonctionnalités Principales

### 🎯 Démarrage Intelligent
- **Démarrage automatique des dépendances** : Les services démarrent leurs dépendances automatiquement
- **Stacks prédéfinies** : Démarrez des groupes de services logiquement liés
- **Gestion individuelle** : Contrôlez chaque service indépendamment

### 📊 Monitoring en Temps Réel
- **Status des services** : Vérifiez l'état de tous vos services d'un coup d'œil
- **Health checks** : Testez la santé de vos endpoints
- **URLs dynamiques** : Affichez les URLs des services actifs

### 📝 Logs Centralisés
- **Logs par service** : Suivez les logs d'un service spécifique
- **Logs par groupe** : Surveillez des groupes de services (backend, frontend, infra)
- **Logs en temps réel** : Suivez l'activité en direct

### 🔧 Accès et Maintenance
- **Shell interactif** : Accédez facilement aux shells des services
- **Nettoyage intelligent** : Nettoyez les services sans perdre les données
- **Gestion des volumes** : Contrôlez les données persistantes

## 🚀 Commandes Principales

### Démarrage Rapide
```bash
make help                    # Aide complète
make start                   # Démarrage intelligent (infra + backend + admin)
make start-email             # Stack email complète
make start-frontend          # Stack frontend complète
make start-full              # Tous les services
```

### Gestion des Services
```bash
# Services individuels
make start-<service>         # Démarrer un service
make stop-<service>          # Arrêter un service
make restart-<service>       # Redémarrer un service

# Stacks complètes
make start-infra             # Infrastructure (postgres, redis)
make start-backend           # Backend complet
make start-frontend          # Frontend complet
make start-email             # Stack email complète
```

### Monitoring
```bash
make status                  # Status de tous les services
make health                  # Health check des services
make urls                    # Afficher les URLs des services
```

### Logs
```bash
make logs                    # Logs de tous les services
make logs-<service>          # Logs d'un service
make logs-backend            # Logs backend
make logs-frontend           # Logs frontend
make logs-infra              # Logs infrastructure
```

### Accès Shell
```bash
make shell                   # Menu interactif
make shell-<service>         # Shell direct d'un service
```

### Maintenance
```bash
make clean                   # Nettoyer les services
make clean-all               # Nettoyage complet avec volumes
```

## 📋 Services Disponibles

### Infrastructure
- `postgres` - Base de données PostgreSQL
- `redis` - Cache et sessions Redis

### Backend Core
- `auth-service` - Service d'authentification
- `api-gateway` - Passerelle API
- `admin-service` - Service d'administration

### Backend Email
- `email-service` - Service email Rust
- `alias-service` - Service d'alias email

### Frontend
- `admin-dashboard` - Dashboard d'administration
- `email-app` - Application email
- `password-app` - Gestionnaire de mots de passe

## 🎯 Exemples d'Usage

### Développement Frontend
```bash
# Démarrer l'admin dashboard avec ses dépendances
make start-admin-dashboard

# Vérifier que tout fonctionne
make status
make urls

# Suivre les logs
make logs-admin-dashboard
```

### Développement Backend
```bash
# Démarrer le backend complet
make start-backend

# Tester un service spécifique
make start-auth-service
make health

# Accéder au shell pour debug
make shell-auth-service
```

### Stack Email Complète
```bash
# Démarrer toute la stack email
make start-email

# Vérifier les URLs
make urls

# Suivre les logs
make logs-email
```

### Développement Complet
```bash
# Démarrer tout Cloudity
make start-full

# Monitoring global
make status
make health
make urls

# Logs de tout le système
make logs
```

## 🔧 Configuration

### Variables d'Environnement
Le Makefile utilise les variables d'environnement suivantes :
- `POSTGRES_USER` (défaut: cloudity_admin)
- `POSTGRES_PASSWORD` (défaut: cloudity)
- `POSTGRES_DB` (défaut: cloudity)
- `REDIS_PASSWORD` (défaut: redis_secure)
- `JWT_SECRET` (défaut: super_secret_jwt_key_change_this_in_production_2025)

### Fichiers de Configuration
- `docker-compose.yml` - Configuration principale des services
- `scripts/colors.mk` - Couleurs et fonctions utilitaires

## 🚨 Dépannage

### Problème avec l'alias make
Si vous rencontrez des erreurs avec `make`, utilisez le chemin complet :
```bash
/usr/bin/make <commande>
```

### Services qui ne démarrent pas
1. Vérifiez le status : `make status`
2. Consultez les logs : `make logs-<service>`
3. Vérifiez les dépendances : `make health`

### Problèmes de ports
Vérifiez que les ports ne sont pas utilisés :
```bash
netstat -tulpn | grep :3000  # Admin dashboard
netstat -tulpn | grep :8000  # API Gateway
```

## 🎉 Avantages du Système Centralisé

### ✅ Avant (Problèmes résolus)
- ❌ Multiple Makefiles dispersés
- ❌ Commandes incohérentes
- ❌ Gestion manuelle des dépendances
- ❌ Monitoring fragmenté
- ❌ Logs éparpillés

### ✅ Maintenant (Solutions)
- ✅ Un seul Makefile centralisé
- ✅ Commandes cohérentes et intuitives
- ✅ Démarrage intelligent automatique
- ✅ Monitoring unifié
- ✅ Logs centralisés et organisés

## 🚀 Démarrage Rapide

1. **Aide complète** :
   ```bash
   make help
   ```

2. **Démarrage intelligent** :
   ```bash
   make start
   ```

3. **Vérification** :
   ```bash
   make status
   make urls
   ```

4. **Démonstration complète** :
   ```bash
   ./scripts/demo-makefile.sh
   ```

## 📞 Support

Pour toute question ou problème :
1. Consultez ce guide
2. Utilisez `make help` pour la liste complète des commandes
3. Vérifiez les logs avec `make logs-<service>`
4. Testez la santé des services avec `make health`

---

**🎯 Votre système Cloudity est maintenant entièrement centralisé et optimisé !**
