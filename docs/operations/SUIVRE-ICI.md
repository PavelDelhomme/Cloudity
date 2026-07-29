# SUIVRE ICI — Cloudity (dev local + prod VPS)

**C’est le seul fichier à ouvrir en premier.**  
Les autres `.md` sont des **détails** : tu n’y vas que quand une étape te le demande.

| Outil | Rôle |
|-------|------|
| **Ce fichier** | Ordre des actions + commandes + validation |
| **`/4dm1n/pilotage`** | Tu **coches** au fur et à mesure (tâche **H14** en tête) |
| **`TODOS.md`** | Fil court / sessions — renvoie ici |
| Détails Portainer Git | [PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md) *(seulement § Portainer)* |
| Détails versions libs | [VERSIONS-PROJET.md](VERSIONS-PROJET.md) · [../architecture/VERSIONNAGE-LIBS.md](../architecture/VERSIONNAGE-LIBS.md) *(seulement si tu touches aux libs)* |

```text
                    ┌─────────────────────┐
                    │  SUIVRE-ICI.md       │  ← TU ES ICI
                    │  (ce fichier)        │
                    └──────────┬──────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
     A — DEV local       B — PROD VPS        C — Versions
     make up / LAN       Portainer+NPM       (plus tard)
           │                   │
           └────────► Pilotage H14 (cocher)
```

---

## Routine quotidienne (ne rien perdre)

1. Branche feat → code → `make test` / smoke local.
2. **Pilotage** : Sync docs → Focus **H14** (ou tâche du jour) → coche critères → décision (En cours / Partiel / OK).
3. Push Git → (prod) Portainer GitOps ou Update stack.
4. `TODOS.md` : une ligne de session si tu veux un fil humain ; **la vérité opérationnelle = Pilotage**.

---

## A — Mode DEV (PC) — toujours disponible

### A1. Démarrer la stack

```bash
make up-ready          # quotidien (stack + seed)
# ou première fois : make setup && make up-ready
make status            # URLs / ports
```

| Quoi | URL |
|------|-----|
| Web + admin | http://localhost:6001 · http://localhost:6001/4dm1n |
| Pilotage | http://localhost:6001/4dm1n/pilotage |
| API | http://localhost:6002 |

### A2. Un seul composant (sans tout rebuild)

```bash
make help TOPIC=stack
make deploy-web        # front
make deploy-gateway    # API
make deploy-auth
make android-help      # mobile / ADB
make run-mobile APP=Mail
```

### A3. LAN téléphone (sans VPS)

```bash
# .env : CLOUDITY_PUBLIC_HOST=<IP_LAN>  CLOUDITY_PUBLIC_PROTO=http
make sync-public-urls
make deploy-web
make run-mobile APP=Mail
```

**Pilotage H14** : cocher **1 · 2 · 3a** → décision **Partiel** (déjà fait si LAN OK).

---

## B — Mode PROD (VPS) — maintenant (H14 3b)

Tu as déjà : DNS + certificats LE.  
Il reste : **forwards NPM corrects** + **stack Portainer**.

### B0. Ouvre le détail seulement pour le formulaire

Quand tu es devant Portainer → lis **uniquement** :  
→ [PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md)

Ne lis pas VERSIONS-* pour déployer.

### B1. PC — préparer l’env (une fois)

```bash
make env-prod DOMAIN=delhomme.ovh \
  HOST=cloudity.delhomme.ovh \
  API_HOST=api.cloudity.delhomme.ovh \
  FORCE=1
make portainer-env          # COPIER tout le bloc
```

Ajoute dans le bloc : `NPM_NETWORK=<nom exact du réseau NPM>`  
(Portainer → Networks — **même** que Nextcloud.)

**Pilotage** : critère **3b-env** → coché.

### B2. NPM — corriger les Proxy Hosts

| Domaine | Forward | Port |
|---------|---------|------|
| `cloudity.delhomme.ovh` | `cloudity-web` | `3000` |
| `api.cloudity.delhomme.ovh` | `cloudity-api-gateway` | `8000` |

Pas `cloudity:80`. SSL Force + LE déjà OK.

**Pilotage** : critère **3b-npm** → coché quand les forwards sont bons **et** la stack tourne (sinon 502 normal).

### B3. Portainer — créer la stack Git

| Champ | Valeur |
|-------|--------|
| Build method | Git repository |
| Name | `cloudity-stack` |
| Repository URL | `https://github.com/PavelDelhomme/Cloudity.git` |
| Reference | `refs/heads/dev` (essai) puis `refs/heads/main` |
| Compose path | `deploy/portainer/docker-compose.stack.yml` |
| Additional paths | `docker-compose.yml` · `docker-compose.prod.yml` · `backend/` · `frontend/` |
| Authentication | login GitHub + **PAT** `repo` |
| GitOps | ON, ~5 min |
| Env | coller `make portainer-env` + `NPM_NETWORK` |

→ **Deploy** (premier build long). Logs : migrate OK.

Détail champ par champ : [PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md).

### B4. Valider HTTPS

```bash
make h14-https-check
# WEB 200 · API /health 200 · CORS OK
```

Login : https://cloudity.delhomme.ovh · admin `/4dm1n`  
Mobile : `make run-mobile APP=Mail` (gateway HTTPS).

**Pilotage** : **3b-smoke** → coché → décision **Validé / OK** (ou **Partiel** si tu gardes un reste).

### B5. Ensuite — déployer sans tout perdre

| Besoin | Action |
|--------|--------|
| Changer le code | Push branche → GitOps Portainer **ou** Update stack |
| Un service seul (PC) | `make deploy-web` / `deploy-gateway` / … |
| Un service seul (VPS) | Portainer → recreer **ce** conteneur |
| Mobile | Jamais Portainer — `make android-help` |
| Versions libs | Seulement si tu modifies une lib → [VERSIONS-PROJET.md](VERSIONS-PROJET.md) |

---

## C — Carte « quel .md pour quoi » (pour ne plus te perdre)

| Question | Fichier |
|----------|---------|
| **Que faire maintenant ?** | **Celui-ci** (`SUIVRE-ICI.md`) |
| Où cocher ? | Pilotage `/4dm1n/pilotage` → **H14** |
| Formulaire Portainer Git en détail ? | [PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md) |
| NPM / DNS / CORS H14 ? | [H14-GATEWAY-MOBILE.md](H14-GATEWAY-MOBILE.md) |
| Vue d’ensemble 3 modes (long) | [GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md](GUIDE-COMPLET-DEPLOIEMENT-ET-TESTS.md) |
| SemVer libs partagées ? | [VERSIONNAGE-LIBS.md](../architecture/VERSIONNAGE-LIBS.md) |
| Qui versionne quoi (services, images) ? | [VERSIONS-PROJET.md](VERSIONS-PROJET.md) |
| Fil session humain | [TODOS.md](../../TODOS.md) |
| Catalogue tâches | Pilotage (Sync docs) |

---

## Checklist Pilotage H14 (miroir)

Coche dans l’UI, pas seulement dans ce md :

- [x] 1 sync-public-urls (LAN)
- [x] 2 run-mobile LAN
- [x] 3a smoke LAN → **Partiel**
- [x] 3b-dns
- [x] 3b-env (`.env.prod` + `portainer-env`)
- [ ] 3b-npm (forwards + stack up)
- [ ] 3b-smoke (`make h14-https-check` vert) → **OK**

Après chaque coche : Sync docs si tu as changé le catalogue ; garde une **note** sur H14 (déjà commencée).

---

## Commandes « je suis perdu »

```bash
make help                 # essentiels + stack
make android-help         # mobile
make h14-https-check      # prod HTTPS
make portainer-env        # coller dans Portainer
make status / status-watch
```

Pilotage local : http://localhost:6001/4dm1n/pilotage → Focus **H14** → guide déplié.

---

*Point d’entrée unique — 2026-07-29. Tout le reste est secondaire.*
