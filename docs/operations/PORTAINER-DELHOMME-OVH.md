# Portainer + NPM — exemple `delhomme.ovh` (VPS personnel)

**Rôle** : coller la doc générique **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** à **ton** VPS déjà en service (Nextcloud, n8n, Cyna, …).

> Ne pas committer de secrets ni l’**IP publique** du VPS dans Git. La valeur réelle se saisit dans **Portainer** (voir § 0 ci-dessous), pas dans un fichier du dépôt.

**Suivi méthodique** : **[DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)**.

---

## 0. Variables à saisir dans Portainer (dont l’IP)

Pour **chaque stack** Cloudity (`cloudity-preprod-infra`, `cloudity-prod-web`, …) :

1. Portainer → **Stacks** → ta stack → **Editor** ou **Environment variables**.  
2. Coller les secrets générés par `make secrets-print` (sur ton PC, **sans** les committer).  
3. Ajouter si besoin une variable d’infra (non consommée par tous les services) :

| Variable (exemple) | Exemple de valeur | Où la trouver |
|--------------------|-------------------|---------------|
| `POSTGRES_PASSWORD` | 64 hex | `make secrets-print` |
| `JWT_SECRET` | 64 hex | idem |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | 64 hex | idem |
| `ALIAS_ENCRYPTION_KEY` | base64 | idem |
| `VPS_PUBLIC_IP` | ton IP publique VPS | Zone DNS OVH → enregistrement **A** (référence pour toi / scripts ; **pas** dans Git) |
| `CORS_ORIGINS` | `https://cloudity.<domaine>` | URL NPM du front |
| `VITE_API_URL` (build web) | `https://api.cloudity.<domaine>` | au build image ou variable runtime selon stack |

**Pas de fichier `*.local.md` dans le projet** : Portainer (ou un `.env` **sur le disque du VPS**, hors Git) suffit.

---

## 1. Ce qui existe déjà (schéma)

| Élément | Détail |
|---------|--------|
| **IP VPS** | `<VPS_PUBLIC_IP>` — voir § 0 |
| **Portainer** | CE, conteneur `portainer`, port `9000` |
| **NPM** | Stack `nginx-proxy-manager`, réseau `nginx-proxy-manager_npm-network` (`172.26.0.0/16`) |
| **Réseau apps** | `shared-network-copy` (`172.28.0.0/16`, **attachable**) — Nextcloud, n8n, Cyna, … |
| **DNS Cloudity** (A → VPS) | `cloudity.delhomme.ovh`, `mail.cloudity.delhomme.ovh`, `calendar.cloudity.delhomme.ovh`, `office.cloudity.delhomme.ovh` |
| **Alias mail Proton** | `alias.delhomme.ovh` → MX **Proton** (`mx1.alias.proton.me`, …) — **pas** Cloudity pour l’instant |

---

## 2. DNS Cloudity — à compléter pour mobile / API

Aujourd’hui tu as le **front** (`cloudity.delhomme.ovh`). Pour le **dashboard + mobile + extension**, il faut une **origine API** stable :

| FQDN recommandé | Type | Cible | NPM → conteneur |
|-----------------|------|-------|-----------------|
| `cloudity.delhomme.ovh` | A | `<VPS_PUBLIC_IP>` | `cloudity-web:3000` |
| **`api.cloudity.delhomme.ovh`** | **A** (à ajouter si absent) | `<VPS_PUBLIC_IP>` | **`cloudity-api-gateway:8000`** |
| `admin.cloudity.delhomme.ovh` (optionnel) | A | idem | `cloudity-web:3000` (routes `/4dm1n`) |

Les noms `mail.cloudity.delhomme.ovh`, `office.cloudity.delhomme.ovh`, etc. peuvent rester des **alias NPM** vers la **même** SPA avec redirection `/app/mail`, `/app/office`, … — ou être retirés si tu n’utilises que `cloudity.delhomme.ovh/app/*`.

---

## 3. Réseaux Docker pour les stacks Cloudity

**Objectif** : NPM doit joindre **seulement** `cloudity-web` et `cloudity-api-gateway`. Postgres/Redis **jamais** sur le réseau edge.

```
┌─────────────────────────────────────────────────────────┐
│  nginx-proxy-manager_npm-network  (external, existant) │
│    npm, cloudity-web, cloudity-api-gateway              │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP interne
┌───────────────────────────▼─────────────────────────────┐
│  cloudity-data  (external, à créer au 1er déploiement)     │
│    postgres, redis, auth, mail-directory, pass, …         │
└─────────────────────────────────────────────────────────┘
```

Dans chaque `docker-compose` stack Portainer :

```yaml
networks:
  cloudity-data:
    external: true
  nginx-proxy-manager_npm-network:
    external: true
```

> Vérifie dans Portainer → **Networks** → conteneur `nginx-proxy-manager_npm_1` : s’il est aussi sur `shared-network-copy`, tu peux brancher Cloudity sur **le même** réseau que NPM utilise réellement pour les Proxy Hosts (souvent `nginx-proxy-manager_npm-network`).

---

## 4. Créer la stack Cloudity (modèle Nextcloud)

1. Portainer → **Stacks** → **Add stack** → nom `cloudity-infra`.  
2. Coller le compose **infra** (Postgres, Redis) depuis **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** § 3.  
3. Variables d’environnement : copier depuis `make secrets-print` (voir **[ENV-GENERATION.md](ENV-GENERATION.md)**).  
4. Répéter : `cloudity-identity` → `cloudity-web` → `cloudity-mail` → `cloudity-pass` → …  
5. **NPM** → Proxy Host :
   - Domain : `cloudity.delhomme.ovh` → Forward `http://cloudity-web:3000`
   - Domain : `api.cloudity.delhomme.ovh` → Forward `http://cloudity-api-gateway:8000`
   - SSL : Let's Encrypt, Force SSL

**App Templates** Portainer (URL GitHub templates) : optionnel ; un **compose dans le repo** (`deploy/portainer/`) reste plus simple pour Cloudity — backlog si tu veux un template dédié.

---

## 5. Mise à jour **d’un seul** service (prod partielle)

Exemple : tu corriges uniquement le front.

1. CI ou `docker build` → pousse `ghcr.io/<toi>/cloudity-web:2026-05-18`.  
2. Portainer → stack **`cloudity-web`** → variable `TAG=2026-05-18`.  
3. **Update the stack** (Pull & redeploy).  
4. Les stacks `cloudity-mail`, `cloudity-infra`, etc. **ne bougent pas**.

Équivalent local : `make deploy-web`.

---

## 6. Coexistence avec tes autres stacks

Tes conteneurs (`nextcloud`, `n8n`, `cookingrecipes-*`, …) **ne sont pas impactés** si :

- Cloudity utilise le réseau **`cloudity-data`** dédié (pas de conflit de nom `cloudity-postgres`).  
- Les **ports host** ne sont pas republiés en prod (tout passe par NPM, pas `6042:5432` sur l’IP publique).

---

## 7. Sécurité (rappel)

| Sujet | Action |
|-------|--------|
| Portainer `9000` | Préférer `portainer.delhomme.ovh` derrière NPM + auth, ou VPN |
| Secrets prod | `make secrets-print` → Portainer, **pas** le `.env` dev faible du PC |
| mTLS **interne** apps | **[MTLS-INTERNE.md](../securite/MTLS-INTERNE.md)** § 0 — phase ultérieure |
| OAuth Portainer | Business only — rester en **auth interne** CE |

---

*Dernière mise à jour : 2026-05-18.*
