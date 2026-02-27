# Plan d'implémentation CLOUDITY

**Référence au quotidien** : [STATUS.md](./STATUS.md) (suivi détaillé, checklist, ports 60XX).  
**Démarrage** : `make up` | **Arrêt** : `make down` | **Ports** : 6080 (API Gateway), 6001 (Dashboard), 6042 (Postgres), 6079 (Redis).

---

## État actuel (mise à jour récente)

- **API** : Gateway sur port **6080** (évite ERR_UNSAFE_PORT 6000). CORS géré uniquement par le gateway ; les backends (admin-service, etc.) ne renvoient plus d’en-têtes CORS pour éviter la valeur en double `http://localhost:6001, *`.
- **Auth** : JWT persistant après redémarrage, Register 409 si email déjà pris.
- **Admin** : Tableau de bord, tenants, users, vaults, domaines. Stats `/admin/stats` utilisables depuis le dashboard après correction CORS.
- **Drive** : Arborescence, création dossier, upload (POST `/drive/nodes/upload`), téléchargement, renommer, supprimer, déplacer. Timeout 120 s et gestion d’erreur côté front pour l’upload.
- **Pass** : Coffre-fort, table `pass_vaults` créée via migration.
- **Navigation app** : Tableau de bord, **Drive**, **Office** (placeholder), **Pass**, **Mail**, **Calendar**, **Notes**, **Tasks**, **Contacts** (placeholder), **Photos** (placeholder), Administration, Paramètres.

**À faire (priorité)** : Suite Office (éditeur de documents **maison** : TipTap, Luckysheet, intégrés au Drive) ; app **Contacts** ; app **Photos** ; **alias mail** (API + UI) ; application mobile (Drive, Office, etc.) ; téléversement Drive à valider en conditions réelles après correctifs CORS.

---

## Vision produit (type Nextcloud / Proton, en mieux)

Suite complète auto-hébergée avec applications web + mobiles, interconnections et éditeurs :

| Domaine | Web | Mobile | Interconnexions |
|--------|-----|--------|------------------|
| **Drive** | Client + éditeur de documents (Word, tableur, présentation) | App mobile Drive | Drive ↔ Office, partage |
| **Office** | Documents, tableurs, présentations (TipTap, Luckysheet, etc.) | App mobile Office | Création/édition depuis Drive |
| **Pass** | Gestionnaire mots de passe, extension navigateur | App mobile Pass | Intégration alias mail |
| **Mail** | Client mail web / Linux | App mobile Mail | Mail ↔ Calendar, Contacts, **alias** |
| **Calendar** | Agenda, événements | App mobile Calendar | Calendar ↔ Mail, Tasks, Contacts |
| **Notes** | Bloc-notes, éditeur riche | App mobile Notes | Sync, partage |
| **Tasks** | Tâches, to-do | App mobile Tasks | Tasks ↔ Calendar, Mail |
| **Contacts** | Carnet d’adresses web + mobile | App mobile Contacts | Contacts ↔ Mail, Calendar |
| **Photos** | Galerie, stockage photos | App mobile Photos | Sync, partage, albums |

**À faire (référence)** : **Alias email** (API + UI), API alias temp/permanent, extension Pass « Créer alias », **éditeurs documents maison** (TipTap, Luckysheet, intégrés au front), stack Postfix/Dovecot, mail-client-api, E2E mail OpenPGP, apps Flutter/natives, prod TLS/backups. Détail dans STATUS.md et TESTS.md.

---

## Phase 0 – Infra commune (base actuelle)

> - Docker Compose global (Postgres, Redis, auth, api-gateway, admin-service, admin-dashboard)
> - Ports 60XX standardisés (voir STATUS.md)
> - Init PostgreSQL dans `infrastructure/postgresql/init/`
> - Templates / structure pour futurs services (Mail Core, Password Manager, Drive)

## Phase 1 : Infrastructure de base (Mois 1-)
### Semaines 1-2: Setup PostgresSQL multitenant
> - Configuration PostgreSQL avec RLS
> - Mise en place de PgBouncer
> - Scripts de migration tenant

### Semaines 3-5: Infrastructure Kubernetes
> - Déploiement cluster K8s multi-zones
> - Installation Linkerd service mesh
> - Configuration namespaces et RBAC

## Phase 2 : Services core (Mois )
### Semaines 6-9: Services d'authentification
> - Service Auth (Go) avec JWT
> - Service 2FA (Go)
> - Intégration mTLS

### Semaines 10-13: Services de base
> - **Mail Core** : Postfix + Dovecot + Rspamd + mail-directory-service (Go)
> - Service Calendar (Go)
> - **Drive** (Rust) plus tard

## Phase 3 : Suite collaborative (Mois )
### Semaines 14-16: Frontend React
> - Setup Turborepo monorepo
> - Composants UI partagés
> - Intégration Yjs pour temps réel

### Semaine 17-25: Suite Office
> - Editeur Word avec TipTap
> - Tableur Excel avec Luckysheet
> - Présentation PowerPoint

## Phase 4 : Services avancés (Mois )
### Semaine 26-32: Services sécurité
> - **Password Manager** (Go ou Rust) : vault chiffré côté client, extension navigateur, intégration alias mail
> - Wallet avec HSM (Rust)
> - VPN/Proxy (Go)

### Semaine 33-38: Streaming et média
> - Service streaming vidéo
> - Galerie photos
> - Gestionnaire de fichiers

## Phase 5 : Applications mobiles (Mois )
### Semaines 39-44: Apps natives critiques
> - 2FA (iOS/Android natif)
> - Password Manager (natif)
> - Wallet (natif)

### Semaines 44-46: Apps Flutter
> - Drive
> - Calendar
> - Notes
> - Tasks

## Phase 6: Intégrations et optimisations (Mois )
### Semaines 47-50: Intégrations cross-services
> - Synchronisation mail <-> calendar
> - Drive <-> Office intégration
> - Notifications unifiés

### Semaines 51-53: Production readiness
> - Tests de charge (100+ utilisateurs)
> - Monitoring avancé
> - Documentation complète

<br />

---

# Métriques de succès
## Performance
> - **Latence API**: <100ms p95
> - **Temps de chargement**: <2s initial, <500ms navigation
> - **Collaboration**: Support 100+ utilisateurs simultanés
> - **Disponibilité**: 99,9% uptime

## Sécurité
> - **Conformité**: PCI DSS niveau 1
> - **Chiffrement**: 100% des données sensibles
> - **Authentification**: 2FA pour tous les comptes
> - **Audit**: Logs complets avec rétention 90 jours

## Scalabilité
> - **Utilisateurs**: Support 10,000+ tenants
> - **Stockage**: Déduplication >30% économie
> - **Auto-scaling**: Réponse <60s aux pics
> - **Multi-région**: Déploiement global ready

<br />

---

# Ressources requises (normalement)
## Equipe technique

> - **Backend**: 4 développeurs (2 Go, 2 Rust)
> - **Fronted**: 3 développeurs React
> - **Mobile**: 2 développeurs (1 iOS, 1 Android)
> - **DevOps**: 2 ingénieurs Kubernetes
> - **Sécurité**: 1 exprt sécurité

## Infrastructure

> - **Kubernetes**: 3 nodes control pane, 6-50 workers
> - **PostgreSQL**: 3 instances (primary + 2 replicas)
> - **MongoDB**: Cluster 3 nodes
> - **Redis**: Cluster 6 nodes
> - **Stockage**: 10TB initial, extensible

## Buget estimé

> - **Infrastructure**: 3,000-5,000€/mois
> - **Licenses/outils**: 2,000€/mois
> - **HSM service** : 1,000€/mois
> - **Monitoring**: 500€/mois
> - **Total** : ~6,500€/mois + coût développement

<br >

# Conclusion

Ce document technique fournit une base solide pour le développement de l'écosystème CLOUDITY. L'architecture proposée garantit scalabilité, sécurité et performance tout en maintenant l'indépendance totale vis-à-vis des services cloud externes. La stratégie de développement par phases permet une mise en production progressive avec validation continue des fonctionnalités.
Les technologies choisies représentent l'état de l'art actuel en matière de développement cloud, avec un focus particulier sur la sécurité (zero-knowledge, HSM, mTLS) et la collaboration temps réel (CRDT, WebSockets). L'approche multitenant avec PostgreSQL RLS assure une isolation stricte des données tout en maintenant l'efficacité opérationnelle.
Le succès du projet reposera sur l'exécution rigoureuse du plan d'implémentation, le respect des meilleures pratiques de sécurité, et l'adoption progressive des fonctionnalités par les utilisateurs.

Document technique CLOUDITY v1.0 - Août 2025
© CLOUDITY - Tous droits réservés