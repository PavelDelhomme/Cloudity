# Déploiement par composant (sans tout redéployer)

**Rôle** : mettre à jour **un seul** morceau de Cloudity — en **local** (`make deploy-*`) ou sur le **VPS** (Portainer, un conteneur).

**Lire d’abord** : **[DEPLOIEMENT-ENVIRONNEMENTS.md](DEPLOIEMENT-ENVIRONNEMENTS.md)** (local vs VPS, socle obligatoire, mobile).

Voir aussi : **[RELEASE-AND-DISTRIBUTION.md](RELEASE-AND-DISTRIBUTION.md)** · **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** · **[PORTAINER-VPS.md](PORTAINER-VPS.md)**.

---

## 1. Principe

| Couche | Image / artefact | Mise à jour typique |
|--------|------------------|---------------------|
| **Web** (dashboard SPA) | `cloudity-web` | Rebuild image + `up -d cloudity-web` |
| **API** | `api-gateway` | Rebuild + restart |
| **Backend** | `auth-service`, `mail-directory-service`, `drive-service`, … | Rebuild **un** service + restart |
| **Admin Python** | `admin-service` | Idem |
| **Base** | `db-migrate` | `make migrate` **avant** le service qui lit le nouveau schéma |
| **Mobile** | APK Flutter | Hors Docker — § 4 |

En **Portainer** : changer le tag/digest **d’une seule** image dans la stack, `Pull & redeploy`. Les autres conteneurs restent en place.

---

## 2. Tableau local ↔ Portainer (même composant)

| Composant | Service Compose | **Local** | **Portainer (VPS)** |
|-----------|-----------------|-----------|------------------------|
| **Front web** | `cloudity-web` | `make deploy-web` | Stack `cloudity-web` → redeploy image `cloudity-web` |
| **API** | `api-gateway` | `make deploy-gateway` | Stack `cloudity-identity` → `cloudity-api-gateway` |
| **Auth** | `auth-service` | `make deploy-auth` | Stack `cloudity-identity` → `cloudity-auth-service` |
| **Admin Python** | `admin-service` | `make deploy-admin` | Stack `cloudity-identity` → `cloudity-admin-service` |
| **Mail** | `mail-directory-service` | `make deploy-mail` | Stack `cloudity-mail` |
| **Pass** | `passwords-service` | `make deploy-pass` | Stack `cloudity-pass` |
| **Drive** | `drive-service` | `make deploy-drive` | Stack `cloudity-drive` |
| **Photos** | `photos-service` | `make deploy-photos` | Stack `cloudity-photos` |
| **Tout** | tous | `make up` / `make rebuild` | Déployer les 8 stacks (ordre § DEPLOIEMENT-VPS § 3) |

> Erreur fréquente : pour Mail, utiliser **`deploy-mail`**, pas `deploy-web`.

## 3. Développement local (`make`)

| Besoin | Commande |
|--------|----------|
| Première fois / tout démarrer | `make up` (pas de Portainer, pas de NPM) |
| Tout reconstruire | `make rebuild` |
| **Front uniquement** | `make deploy-web` |
| **Gateway** | `make deploy-gateway` |
| **Auth** | `make deploy-auth` |
| **Mail** | `make deploy-mail` |
| **Pass** | `make deploy-pass` |
| **Drive / Photos** | `make deploy-drive`, `make deploy-photos` |
| Migrations SQL | `make migrate` |
| Extension Pass MV3 | `make build-pass-extension` (pas un conteneur) |

Équivalent manuel :

```bash
docker compose build cloudity-web
docker compose up -d cloudity-web
```

---

## 4. Production (VPS + Portainer + NPM)

### 3.1 Flux Git → image

1. Push sur la branche qui déclenche **GitHub Actions** (`docker-publish.yml` si configuré) → image `ghcr.io/.../cloudity-<service>:<tag>`.  
2. Dans Portainer : stack **frontend** ou **backend** → variable `TAG=v2026.05.18` **uniquement** pour le service modifié.  
3. **Pull & redeploy** du conteneur concerné.  
4. Si migration : job **db-migrate** ou `docker compose run --rm db-migrate` **avant** le service.

### 3.2 Matrice « je change quoi »

| Tu modifies… | Redéployer | Migrer ? |
|--------------|------------|----------|
| React / Vite (`frontend/apps/cloudity-web`) | `cloudity-web` | Non |
| `api-gateway` | `api-gateway` | Rarement |
| `auth-service` | `auth-service` | Parfois |
| `mail-directory-service` | `mail-directory-service` | Souvent — `migrate` d’abord |
| `passwords-service` | `passwords-service` | Parfois |
| `drive-service`, `photos-service`, … | service ciblé | Selon migration |
| `.env` secrets seulement | **Restart** services qui lisent la variable | Non |
| App Flutter `mobile/mail` | **APK** + `version.json` | Non |

### 3.3 NPM (HTTPS)

Le navigateur ne parle qu’à **Nginx Proxy Manager**. Les microservices restent sur le réseau Docker interne — pas besoin de redéployer NPM pour un fix front.

---

## 4. Mobile (hors compose)

| App | Build | Distribution |
|-----|-------|----------------|
| Mail | `cd mobile/mail && flutter build apk --release` | APK signé + **[RELEASE-AND-DISTRIBUTION.md](RELEASE-AND-DISTRIBUTION.md)** § 4 |
| Drive / Photos / Pass | idem chemins `mobile/*` | Même canal `version.json` (backlog **REL-01**) |

Le mobile consomme la **même API** (gateway) : une mise à jour **backend** peut exiger une mise à jour **app** si le contrat API change.

---

## 6. Push Git

```bash
git push origin feat/ma-branche
# Puis CI build → Portainer pull du tag concerné
```

Pas de push automatique vers le VPS : tu choisis **quel** service redéployer dans Portainer.

---

*Dernière mise à jour : 2026-05-18.*
