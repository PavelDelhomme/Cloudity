# Déploiement Cloudity — local, LAN, prod VPS

**Chemin opérationnel unique** (ex-`SUIVRE-ICI.md`). Ouvre d’abord aussi [`docs/README.md`](../README.md).  
Les autres `.md` sont des **détails** : tu n’y vas que quand une étape te le demande.

| Outil | Rôle |
|-------|------|
| **Ce fichier** | Ordre des actions + commandes + validation |
| **`/4dm1n/pilotage`** | Tu **coches** (vérité ops) — **maintenant** : FE-HUB → FE-SPLIT → H19 → MOBILE-DA ; **H14 ensuite** |
| **`TODOS.md`** | Fil court / sessions — renvoie ici |
| **Multi-apps (priorité)** | [MULTI-APPS-WEB-MOBILE.md](../architecture/MULTI-APPS-WEB-MOBILE.md) |
| Détails Portainer Git | [PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md) *(seulement § Portainer)* |
| Détails versions libs | [VERSIONS-PROJET.md](VERSIONS-PROJET.md) · [../architecture/VERSIONNAGE-LIBS.md](../architecture/VERSIONNAGE-LIBS.md) *(seulement si tu touches aux libs)* |

```text
                    ┌─────────────────────┐
                    │  DEPLOIEMENT.md      │  ← TU ES ICI
                    │  (ce fichier)        │
                    └──────────┬──────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
     0 — STRUCTURE       A — DEV local       B — PROD VPS
     hub web + DA        make up / LAN       Portainer+NPM
     mobile (AVANT B)         │                   │
           │                  │                   │
           └──────────────────┴────────► Pilotage (cocher)
```

---

## 0 — Priorité structurelle (AVANT le VPS § B)

Ne pas enchaîner Portainer/H14 HTTPS tant que le monolithe web + l’auth Flutter dupliquée ne sont pas cadrés.

| Ordre Pilotage | ID | Objectif |
|----------------|----|----------|
| 1 | **FE-HUB-01** | `cloudity-web` = hub (`/`, `/login`, `/app`) seulement |
| 2 | **FE-SPLIT-01** | Extraire 1ère app (`web-mail`) hors monolithe |
| 3 | **H19** | Auth/login unique dans `cloudity_shared` (plus de copies `lib/auth/`) |
| 4 | **MOBILE-DA-01** | DA Flutter commune + perso produit (couleur/logo) |
| ensuite | **H14** | Gateway mobile → HTTPS VPS (§ B) |

Doc complète : **[MULTI-APPS-WEB-MOBILE.md](../architecture/MULTI-APPS-WEB-MOBILE.md)**.

---

## Routine quotidienne (ne rien perdre)

1. Branche feat → code → `make test` / smoke local.
2. **Pilotage** : Sync docs → Focus **FE-HUB-01** (puis FE-SPLIT / H19 / MOBILE-DA) → coche → décision. **H14** seulement après § 0.
3. Push Git → (prod) Portainer GitOps ou Update stack **quand** tu es en § B.
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

## B — Mode PROD (VPS) — après § 0 (H14 3b)

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
# Ou tout-en-un (génère env + déclenche GHCR + checklist) :
# make push-prod DOMAIN=delhomme.ovh HOST=cloudity.delhomme.ovh API_HOST=api.cloudity.delhomme.ovh FORCE=1
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
| **Push prod (PC → GHCR + checklist)** | **`make push-prod`** (`WAIT=1` · `SMOKE=1` · `SKIP_GHCR=1` si checklist seule) |
| **Push préprod** | **`make push-preprod REF=dev`** |
| Changer le code | Push branche → GitOps Portainer **ou** Update stack |
| Un service seul (PC) | `make deploy-web` / `deploy-gateway` / … |
| Un service seul (VPS) | Portainer → recreer **ce** conteneur |
| Mobile / AVD | `make mobile-emulator-cloudity-start` · `make test-mobile-avd` (jamais Portainer) |
| Versions libs | Seulement si tu modifies une lib → [VERSIONS-PROJET.md](VERSIONS-PROJET.md) |

> **`make prod`** = compose **local** seulement. **`make push-prod`** = publish images GHCR + rappel Portainer/NPM.

---

## C — Carte « quel .md pour quoi » (pour ne plus te perdre)

| Question | Fichier |
|----------|---------|
| **Que faire maintenant ?** | **Celui-ci** (`DEPLOIEMENT.md`) |
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
make up-ready             # stack locale + seed (sans tests)
make up-full              # up-ready + tests
make android-help         # mobile
make mobile-emulator-cloudity-start   # AVD Cloudity (réutilise si déjà up)
make test-mobile-avd      # suite mobile sur emulator-5556
make push-preprod REF=dev # GHCR + checklist préprod
make push-prod            # GHCR + checklist prod
make h14-https-check      # prod HTTPS
make portainer-env        # coller dans Portainer
make status / status-watch
```

Pilotage local : http://localhost:6001/4dm1n/pilotage → Focus **H14** → guide déplié.

---

*Chemin ops — 2026-07-29. Index global : [`docs/README.md`](../README.md).*
