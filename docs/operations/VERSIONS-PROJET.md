# Cloudity — versions du projet (libs, services, images)

> **Pas le point d’entrée ops.** Pour déployer / dev : **[SUIVRE-ICI.md](SUIVRE-ICI.md)**.  
> Ouvre ce fichier seulement si tu modifies une lib partagée ou les tags d’images.

**Rôle** : savoir **où** est versionné quoi (libs partagées, backends, front, mobile, images Docker), et comment ça se relie au déploiement Portainer.

Pour la **convention SemVer des 4 libs partagées** (détail + CI) :  
→ **[../architecture/VERSIONNAGE-LIBS.md](../architecture/VERSIONNAGE-LIBS.md)** · `make check-versioning`

Pour **créer la stack Portainer Git** :  
→ **[PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md)**

---

## 1. Carte rapide

| Couche | Emplacement version | Comment c’est consommé en prod VPS |
|--------|---------------------|-------------------------------------|
| Libs Go `internalsec`, `pkg/dbpin` | `VERSION` / CHANGELOG + `go.mod` | Build dans l’image du service (path replace monorepo) |
| Lib TS `@cloudity/shared` | `frontend/packages/cloudity-shared/package.json` | Build image `cloudity-web` (workspaces) |
| Lib Dart `cloudity_shared` | `mobile/cloudity_shared/pubspec.yaml` | Apps Flutter (`path:`) — **hors** Portainer |
| Chaque service Go | `backend/<svc>/go.mod` | Image build Portainer / GHCR |
| Admin Python | deps `backend/admin-service` | Image build |
| Front SPA | `frontend/package.json` + workspaces | Image `cloudity-web` |
| Stack Docker | branche Git `main` / `dev` | Portainer Git reference |
| Images registry (option) | tag `vX.Y.Z` / `sha-…` | `ghcr.io/<owner>/cloudity-<svc>:<tag>` |

---

## 2. Bibliothèques partagées (SemVer)

| Lib | Stack | Chemin | Fichier version |
|-----|-------|--------|-----------------|
| `internalsec` | Go | `backend/internalsec/` | `VERSION` + CHANGELOG |
| `pkg/dbpin` | Go | `backend/pkg/dbpin/` | CHANGELOG |
| `@cloudity/shared` | TypeScript | `frontend/packages/cloudity-shared/` | `package.json` → `"version"` |
| `cloudity_shared` | Dart | `mobile/cloudity_shared/` | `pubspec.yaml` → `version:` |

**Vérifier avant merge** :

```bash
make check-versioning
# bloquant :
CHECK_VERSIONING_BLOCKING=1 make check-versioning
```

Règles SemVer, publication future npm/pub.dev/Go : voir **VERSIONNAGE-LIBS.md**.

---

## 3. Services backend (un module Go / un service Python)

Chaque service a son `go.mod` (ou requirements Python).  
Ils ne publient **pas** encore un numéro SemVer produit unique : la « version déployée » = **commit Git** (ou tag image GHCR).

| Service Compose | Dossier | Runtime |
|-----------------|---------|---------|
| `auth-service` | `backend/auth-service` | Go |
| `api-gateway` | `backend/api-gateway` | Go |
| `admin-service` | `backend/admin-service` | Python |
| `mail-directory-service` | `backend/mail-directory-service` | Go |
| `passwords-service` | `backend/passwords-service` | Go |
| `drive-service` | `backend/drive-service` | Go |
| `photos-service` | `backend/photos-service` | Go |
| `calendar-service` | `backend/calendar-service` | Go |
| `notes-service` | `backend/notes-service` | Go |
| `tasks-service` | `backend/tasks-service` | Go |
| `contacts-service` | `backend/contacts-service` | Go |
| `postgres` / `redis` | images officielles | — |
| `db-migrate` | migrations SQL | one-shot |

**Local — un service** : `make deploy-gateway`, `make deploy-auth`, …  
**VPS — un service** : recreer le conteneur dans Portainer (voir [DEPLOIEMENT-PAR-SERVICE.md](DEPLOIEMENT-PAR-SERVICE.md)).

---

## 4. Frontend web

| Paquet | Chemin | Notes |
|--------|--------|-------|
| App + admin SPA | `frontend/apps/cloudity-web` | Image Docker `cloudity-web` |
| UI kit | `frontend/packages/…` | workspaces npm |
| `@cloudity/shared` | ci-dessus | SemVer lib |

Version « produit » front = commit buildé dans l’image (ou tag GHCR `cloudity-web` / `cloudity-frontend`).

---

## 5. Mobile (hors Portainer)

| App | Chemin | Dépend de |
|-----|--------|-----------|
| Mail, Drive, Photos, Pass, Admin, … | `mobile/<app>/` | `cloudity_shared` (path) |
| Broker auth | `mobile/cloudity_auth_broker/` | — |

Version = `version:` / `versionCode` dans chaque `pubspec.yaml` + store.  
Gateway : `CLOUDITY_MOBILE_GATEWAY_URL` (LAN ou `https://api.cloudity.…`).  
Aide : `make android-help`.

---

## 6. Deux modes de « version » sur Portainer

### A — Stack Git + build sur le VPS (actuel)

- **Version = branche + commit** clonés par Portainer (`refs/heads/main` ou `dev`).
- Compose : `deploy/portainer/docker-compose.stack.yml` avec `pull_policy: build`.
- Pas besoin de registry pour démarrer.
- Guide : [PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md).

### B — Images GHCR taguées (cible perf / rollback)

- **Version = tag** `v0.5.0` / `sha-abc` sur `ghcr.io/<owner>/cloudity-<svc>`.
- CI : `.github/workflows/docker-publish.yml` (si actif).
- Rollback = re-pointer le tag précédent + Pull.
- Doc : [DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md).

---

## 7. Commandes utiles

```bash
make check-versioning          # libs partagées
make help TOPIC=env            # env-prod / portainer-env
make h14-https-check           # DNS+TLS+health+CORS prod
make deploy-web                # front local
make android-help              # commandes mobile
```

---

*Fiche index — 2026-07-29.*
