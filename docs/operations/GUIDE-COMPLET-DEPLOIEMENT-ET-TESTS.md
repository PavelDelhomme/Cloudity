# Guide complet — dev local, mobile, Portainer & NPM

**Document maître** : tout ce qu’il faut suivre, de ton PC au VPS en « vraie prod » (HTTPS, téléphone, web).

> Commence ici. Les autres fichiers `.md` restent la référence détaillée ; ce guide te dit **dans quel ordre** les lire et **quoi faire**.

| Tu veux… | Va directement à |
|----------|------------------|
| Coder sur le PC | [§ 2 Mode local](#2-mode-local--pc) |
| Tester web + mobile sur ton téléphone (Wi‑Fi maison, sans VPS) | [§ 3 Mode LAN](#3-mode-lan--téléphone--web-comme-en-prod-sauf-https) |
| Déployer sur ton serveur (Portainer + NPM + HTTPS) | [§ 4 Mode production VPS](#4-mode-production-vps--portainer--npm) |
| Variables `.env` / Portainer | [§ 5 Variables](#5-variables-par-mode) |
| Git (feat → dev → main) | [§ 6 Git](#6-git) |
| Dépannage | [§ 8 Dépannage](#8-dépannage) |

**Documents liés (index)** :

| Sujet | Fichier |
|-------|---------|
| Hub 3 environnements | [DEPLOIEMENT-ENVIRONNEMENTS.md](DEPLOIEMENT-ENVIRONNEMENTS.md) |
| Checklist ordonnée (cases ☐) | [DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md) |
| Portainer formulaire Git | [../../deploy/portainer/PORTAINER-STACK.md](../../deploy/portainer/PORTAINER-STACK.md) |
| NPM + stacks détaillées | [DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md) |
| Ton VPS (DNS, réseaux) | [PORTAINER-VPS.md](PORTAINER-VPS.md) |
| Secrets | [ENV-GENERATION.md](ENV-GENERATION.md) · [../securite/SECRETS.md](../securite/SECRETS.md) |
| Mobile (apps Flutter) | [../produit/MOBILES.md](../produit/MOBILES.md) |
| Tests | [TESTS.md](TESTS.md) |
| `make deploy-*` par service | [DEPLOIEMENT-PAR-SERVICE.md](DEPLOIEMENT-PAR-SERVICE.md) |
| Ports 6001, 6002… | [PORTS-HOTES.md](PORTS-HOTES.md) |
| Branches Git | [GIT.md](../GIT.md) · [BRANCHES.md](BRANCHES.md) |

---

## 1. Les trois modes (vue d’ensemble)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  MODE A — LOCAL (PC seul)                                                │
│  make up → http://localhost:6001 (web) + http://localhost:6002 (API)    │
│  Mobile USB : adb reverse + CLOUDITY_MOBILE_GATEWAY_URL=127.0.0.1:6002   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  MODE B — LAN (téléphone + PC, même Wi‑Fi)                                │
│  Web téléphone : http://<IP_PC>:6001                                     │
│  API : http://<IP_PC>:6002 · CORS_ALLOW_LAN=true                         │
│  Mobile : --dart-define=CLOUDITY_GATEWAY_URL=http://<IP_PC>:6002         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  MODE C — PRODUCTION (VPS + Portainer + NPM + Let's Encrypt)             │
│  Web : https://cloudity.<domaine>                                       │
│  API : https://api.cloudity.<domaine>                                   │
│  Mobile : CLOUDITY_MOBILE_GATEWAY_URL=https://api.cloudity.<domaine>     │
│  Stack Git : deploy/portainer/docker-compose.stack.yml (branche main)   │
└─────────────────────────────────────────────────────────────────────────┘
```

| | Mode A Local | Mode B LAN | Mode C Prod VPS |
|---|-------------|------------|-----------------|
| **Où tourne Docker** | Ton PC | Ton PC | Serveur (Portainer) |
| **HTTPS** | Non | Non (HTTP) | Oui (NPM) |
| **Web navigateur PC** | `localhost:6001` | `localhost:6001` | `https://cloudity.<domaine>` |
| **Web sur téléphone** | Difficile sans LAN | `http://<IP_PC>:6001` | `https://cloudity.<domaine>` |
| **Mobile Flutter** | USB + `adb reverse` | Wi‑Fi + IP PC | Wi‑Fi/4G + URL HTTPS publique |
| **Fichier config** | `.env` (PC) | `.env` (PC, IP LAN) | Portainer env vars |
| **Objectif** | Développer, tests | Tester « comme un user » | Usage réel |

---

## 2. Mode local — PC

### Prérequis

- Docker + Docker Compose
- Git clone du dépôt
- (Optionnel) Flutter pour mobile

### Checklist (première fois)

- [ ] `cp .env.example .env` puis `make secrets` (ou compléter à la main)
- [ ] `make up` — attendre ~30 s
- [ ] `make migrate` (souvent déjà fait par `db-migrate` au up)
- [ ] `make seed-admin` — compte admin local
- [ ] Ouvrir **http://localhost:6001**
- [ ] API OK : **http://localhost:6002/auth/health**

### Commandes utiles

```bash
make up                    # toute la stack
make deploy-web            # rebuild front seul
make deploy-mail           # rebuild mail-directory seul
make test                  # tests unitaires (Docker)
make logs-service SERVICE=mail-directory-service
```

### Mobile en USB (Mode A)

```bash
adb reverse tcp:6002 tcp:6002
adb reverse tcp:6001 tcp:6001   # optionnel
make run-mobile APP=Mail
```

L’app utilise `CLOUDITY_MOBILE_GATEWAY_URL=http://127.0.0.1:6002` (défaut `.env`).

**Doc** : [MOBILES.md](../produit/MOBILES.md) · [TESTS.md](TESTS.md) § 1b

---

## 3. Mode LAN — téléphone + web « comme en prod » (sauf HTTPS)

Tu restes sur ton PC pour Docker, mais tu testes **depuis ton téléphone** sur le même réseau Wi‑Fi — pas cantonné à `localhost`.

### 3.1 Trouver l’IP du PC

```bash
ip -4 addr | rg 'inet 192\.168|inet 10\.'
# Exemple : 192.168.1.134
```

Note : `<IP_PC>` = cette adresse (ex. `192.168.1.134`).

### 3.2 Adapter le `.env` sur le PC

```bash
# API — le front et le mobile doivent pointer vers l’IP du PC, pas localhost
VITE_API_URL=http://<IP_PC>:6002
CLOUDITY_MOBILE_GATEWAY_URL=http://<IP_PC>:6002

# Autoriser le navigateur du téléphone (origine http://<IP_PC>:6001)
CORS_ALLOW_LAN=true
CORS_ORIGINS=http://localhost:6001,http://<IP_PC>:6001
```

Puis **rebuild le front** (Vite injecte `VITE_API_URL` au build) :

```bash
make deploy-web
# ou : make up si tu changes aussi le gateway
```

### 3.3 Pare-feu PC (Arch Linux / etc.)

Autoriser les ports **6001** (web) et **6002** (gateway) depuis le LAN :

```bash
# Exemple firewalld — adapter à ta config
sudo firewall-cmd --add-port=6001/tcp --add-port=6002/tcp
```

### 3.4 Tester le web sur le téléphone

1. Téléphone sur le **même Wi‑Fi** que le PC.
2. Navigateur : **http://\<IP_PC\>:6001**
3. Connexion avec le compte seed (`make seed-admin`).

### 3.5 Tester les apps mobile (Wi‑Fi)

```bash
# Gateway injectée au build/run
CLOUDITY_GATEWAY_URL=http://<IP_PC>:6002 make run-mobile APP=Mail
CLOUDITY_GATEWAY_URL=http://<IP_PC>:6002 make run-mobile APP=Photos
CLOUDITY_GATEWAY_URL=http://<IP_PC>:6002 make run-mobile APP=Drive
```

Ou ajouter dans `.env` :

```bash
CLOUDITY_MOBILE_GATEWAY_URL=http://<IP_PC>:6002
```

Puis `make run-mobile APP=…` (le script lit `.env` / `--dart-define`).

### 3.6 Checklist Mode LAN

- [ ] `.env` : `VITE_API_URL` et `CLOUDITY_MOBILE_GATEWAY_URL` = `http://<IP_PC>:6002`
- [ ] `CORS_ALLOW_LAN=true`
- [ ] `make deploy-web`
- [ ] Pare-feu : 6001 + 6002 ouverts
- [ ] Web téléphone : `http://<IP_PC>:6001` OK
- [ ] App mobile : login OK

---

## 4. Mode production VPS — Portainer + NPM

C’est le mode « vrai prod » : stack sur ton **serveur**, **HTTPS** via **Nginx Proxy Manager**, mobile et web utilisent les **mêmes URLs publiques**.

### 4.1 Schéma

```text
Internet ──HTTPS──► NPM (Let's Encrypt)
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   cloudity.<dom>  api.cloudity.<dom>  admin.cloudity.<dom>
          │             │
          ▼             ▼
   cloudity-web    cloudity-api-gateway
          │             │
          └────── cloudity-data (réseau Docker interne)
                    postgres, redis, mail-directory, …
```

### 4.2 DNS (chez ton registrar / OVH)

| Enregistrement | Type | Valeur |
|----------------|------|--------|
| `cloudity.<domaine>` | A | IP publique du VPS |
| `api.cloudity.<domaine>` | A | même IP |
| `admin.cloudity.<domaine>` | A | même IP (optionnel, même app web) |

**Doc** : [PORTAINER-VPS.md](PORTAINER-VPS.md) § 2

### 4.3 Stack Portainer `cloudity-stack`

**Stacks → Add stack → Git repository**

| Champ | Valeur |
|-------|--------|
| Name | `cloudity-stack` |
| Repository URL | `https://github.com/PavelDelhomme/Cloudity.git` |
| Repository reference | `refs/heads/main` |
| Compose path | `deploy/portainer/docker-compose.stack.yml` |
| Authentication | PAT GitHub si repo privé |
| GitOps | Activé, polling 5 min |

**Guide détaillé** : [../../deploy/portainer/PORTAINER-STACK.md](../../deploy/portainer/PORTAINER-STACK.md)

### 4.4 Variables Portainer (Advanced mode)

Sur ton PC :

```bash
make secrets-print
```

Colle dans Portainer, puis **adapte obligatoirement** :

```bash
GO_ENV=production
NODE_ENV=production
CORS_ALLOW_LAN=false
VITE_API_URL=https://api.cloudity.<TON_DOMAINE>
CORS_ORIGINS=https://cloudity.<TON_DOMAINE>,https://admin.cloudity.<TON_DOMAINE>
CLOUDITY_MOBILE_GATEWAY_URL=https://api.cloudity.<TON_DOMAINE>
WEBAUTHN_RP_ID=cloudity.<TON_DOMAINE>
WEBAUTHN_ORIGINS=https://cloudity.<TON_DOMAINE>,https://admin.cloudity.<TON_DOMAINE>
```

Modèle complet : [../../deploy/portainer/stack.env.example](../../deploy/portainer/stack.env.example)

- [ ] Variables collées (sans committer sur GitHub)
- [ ] **Deploy the stack**
- [ ] Logs : `cloudity-db-migrate` terminé OK
- [ ] Conteneurs `healthy`

### 4.5 Réseau Docker + NPM

Les conteneurs **`cloudity-web`** et **`cloudity-api-gateway`** doivent joindre le **même réseau Docker** que Nginx Proxy Manager (souvent `nginx-proxy-manager_npm-network` ou `web`).

Dans Portainer → conteneur → **Join network** (ou ajouter le réseau external dans le compose — voir [DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md) § 4).

### 4.6 Nginx Proxy Manager — Proxy Hosts

| Domain Names | Forward hostname | Port | SSL |
|--------------|------------------|------|-----|
| `cloudity.<domaine>` | `cloudity-web` | 3000 | Let's Encrypt |
| `api.cloudity.<domaine>` | `cloudity-api-gateway` | 8000 | Let's Encrypt |
| `admin.cloudity.<domaine>` | `cloudity-web` | 3000 | Let's Encrypt |

- [ ] Certificats SSL émis (HTTP challenge)
- [ ] **https://api.cloudity.\<domaine\>/auth/health** → 200
- [ ] **https://cloudity.\<domaine\>** → page login

### 4.7 Admin + smoke

```bash
# Depuis ton PC (adapter les URLs)
SMOKE_API_URL=https://api.cloudity.<domaine> \
SMOKE_APP_URL=https://cloudity.<domaine> \
SMOKE_USER=ton@email \
SMOKE_PASS=ton_mot_de_passe \
make smoke-prod
```

Création compte admin prod : flux inscription ou seed **une seule fois** sur le VPS (ne pas réutiliser `Admin123!` en public).

### 4.8 Mobile en Mode C (prod)

**Build / run** avec l’URL publique HTTPS :

```bash
CLOUDITY_GATEWAY_URL=https://api.cloudity.<domaine> make run-mobile APP=Mail
```

Pour un **APK** installé sur plusieurs téléphones :

1. Build release signé : `flutter build apk --release`
2. `CLOUDITY_MOBILE_GATEWAY_URL` compilée via `--dart-define` au build
3. Distribution : [RELEASE-AND-DISTRIBUTION.md](RELEASE-AND-DISTRIBUTION.md) § 4

**Important** : le certificat Let's Encrypt doit être **valide** sur le téléphone (pas de certificat auto-signé sauf install manuelle).

### 4.9 Checklist prod complète

- [ ] DNS A records OK
- [ ] Stack Portainer déployée (`main`)
- [ ] Variables prod (HTTPS, CORS, secrets)
- [ ] Réseau NPM connecté (web + gateway)
- [ ] 3 Proxy Hosts NPM + SSL
- [ ] `/auth/health` OK en HTTPS
- [ ] Login web OK
- [ ] Mobile : gateway HTTPS + login OK
- [ ] `make smoke-prod` OK

---

## 5. Variables par mode

| Variable | Mode A Local | Mode B LAN | Mode C Prod |
|----------|--------------|------------|-------------|
| `VITE_API_URL` | `http://localhost:6002` | `http://<IP_PC>:6002` | `https://api.cloudity.<dom>` |
| `CLOUDITY_MOBILE_GATEWAY_URL` | `http://127.0.0.1:6002` | `http://<IP_PC>:6002` | `https://api.cloudity.<dom>` |
| `CORS_ALLOW_LAN` | `true` | `true` | **`false`** |
| `CORS_ORIGINS` | localhost… | + `http://<IP_PC>:6001` | URLs HTTPS publiques |
| `GO_ENV` / `NODE_ENV` | development | development | **production** |
| Où configurer | `.env` PC | `.env` PC + `deploy-web` | **Portainer** |

Génération secrets : [ENV-GENERATION.md](ENV-GENERATION.md)

---

## 6. Git

```text
feat/mon-chantier  →  merge dev  →  tests OK  →  merge main  →  Portainer pull (main)
```

| Branche | Usage |
|---------|--------|
| `feat/*` | Développement |
| `dev` | Intégration |
| `main` | **Portainer prod** (`refs/heads/main`) |

- [ ] Travail sur `feat/*`
- [ ] `make test` vert
- [ ] Merge → `dev` puis → `main`
- [ ] Push `main` → GitOps Portainer redéploie (ou deploy manuel)

**Doc** : [GIT.md](../GIT.md)

---

## 7. Applications (web + mobile)

| App | Web (route) | Mobile | Commande mobile |
|-----|-------------|--------|-----------------|
| Hub / suite | `/app` | — | — |
| Mail | `/app/mail` | `mobile/mail` | `make run-mobile APP=Mail` |
| Drive | `/app/drive` | `mobile/drive` | `make run-mobile APP=Drive` |
| Photos | `/app/photos` | `mobile/photos` | `make run-mobile APP=Photos` |
| Pass | `/app/pass` | `mobile/pass` | `make run-mobile APP=Pass` |
| Calendar | `/app/calendar` | `mobile/calendar` | `make run-mobile APP=Calendar` |
| Contacts | `/app/contacts` | `mobile/contacts` | `make run-mobile APP=Contacts` |
| Notes | `/app/notes` | `mobile/notes` | `make run-mobile APP=Notes` |
| Tasks | `/app/tasks` | `mobile/tasks` | `make run-mobile APP=Tasks` |

Toutes les apps mobiles parlent à l’**API gateway** (pas au port 6001 du front).

---

## 8. Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Web téléphone « connexion refusée » | Pare-feu / mauvaise IP | Ouvrir 6001–6002 ; vérifier `<IP_PC>` |
| Web téléphone login OK mais API erreur CORS | `VITE_API_URL` encore localhost | Rebuild `make deploy-web` avec IP |
| Mobile LAN ne connecte pas | Gateway = 127.0.0.1 | `CLOUDITY_GATEWAY_URL=http://<IP_PC>:6002` |
| Prod 502 NPM | Mauvais réseau Docker | Joindre `cloudity-web` / gateway au réseau NPM |
| Prod CORS | Origines HTTP en prod | `CORS_ORIGINS` en HTTPS exact |
| JWT invalidés après redeploy | Volume clés auth | Volume `cloudity_auth_keys` persistant |
| Portainer build long / OOM | VPS petit | Augmenter RAM ou déployer images GHCR plus tard |

**Docs** : [PLAN.md](PLAN.md) · [DEVELOPMENT-HOST.md](DEVELOPMENT-HOST.md) · [DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)

---

## 9. Parcours recommandé (ordre de lecture)

1. **Ce guide** (tu es ici)
2. Mode A : [PORTS-HOTES.md](PORTS-HOTES.md) + [TESTS.md](TESTS.md)
3. Mode B : § 3 ci-dessus + [MOBILES.md](../produit/MOBILES.md)
4. Mode C : [PORTAINER-STACK.md](../../deploy/portainer/PORTAINER-STACK.md) → [PORTAINER-VPS.md](PORTAINER-VPS.md) → [DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)
5. Mises à jour : [DEPLOIEMENT-PAR-SERVICE.md](DEPLOIEMENT-PAR-SERVICE.md) · [RELEASE-AND-DISTRIBUTION.md](RELEASE-AND-DISTRIBUTION.md)

---

*Dernière mise à jour : aligné sur stack `deploy/portainer/docker-compose.stack.yml` et ports série 60XX.*
