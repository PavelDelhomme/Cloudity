# Déploiement Cloudity — Portainer + NPM (comme Nextcloud)

**Rôle** : procédure **interim** (manuelle) pour préprod/prod — utile tant que [ZoneForge](https://github.com/PavelDelhomme/ZoneForge) n’est pas prêt pour Cloudity.

> **Formulaire Git Portainer complet** (auth, Compose path, Additional paths, alternatives) →  
> **[PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md)**  
> Versions libs/services → **[VERSIONS-PROJET.md](VERSIONS-PROJET.md)**

> **Cible** : déployer / redeploy **sans** coller dans Portainer + NPM à la main → **[ZONEFORGE-CLOUDITY.md](ZONEFORGE-CLOUDITY.md)** · tâches Pilotage `ZF-01`…`ZF-05`.  
> Ce document reste le **fallback** et la référence des Proxy Hosts / DNS.

**Ne pas confondre** avec `make up` sur ton PC (dev local / LAN).

---

## 1. Deux environnements

| Env | Domaines (exemple) | Stack Portainer | Fichier env |
|-----|--------------------|-----------------|-------------|
| **Préprod** | `cloudity-preprod.<dom>` · `api-preprod.cloudity.<dom>` | `cloudity-preprod` | `.env.preprod` |
| **Prod** | `cloudity.<dom>` · `api.cloudity.<dom>` | `cloudity` | `.env.prod` |

Génère les fichiers **sur le PC** :

```bash
make sync-public-urls   # après avoir réglé CLOUDITY_PUBLIC_* 
make env-prod DOMAIN=delhomme.ovh      # adapte
# ou make env-preprod …
make portainer-env      # affiche le bloc à coller dans Portainer → Env
```

Tu **colles** les variables dans Portainer (comme `MYSQL_PASSWD` / `JWT_SCT` pour Nextcloud).  
**Ne committe jamais** les secrets.

---

## 2. Créer la stack (Portainer)

**Suivre le guide complet** : [PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md).

**Stacks → Add stack** (résumé) :

| Champ | Valeur conseillée |
|-------|-------------------|
| Name | `cloudity-stack` (prod) ou `cloudity-stack-dev` |
| Build method | **Git repository** |
| Repository URL | `https://github.com/PavelDelhomme/Cloudity.git` |
| Reference | `refs/heads/main` (essai : `refs/heads/dev`) |
| Compose path | `deploy/portainer/docker-compose.stack.yml` |
| Additional paths | `docker-compose.yml` · `docker-compose.prod.yml` · `backend/` · `frontend/` |
| Authentication | user GitHub + **PAT** `repo` (si privé) |

**Environment variables** : mode avancé → `make portainer-env` + `NPM_NETWORK=<réseau NPM>`.

---

## 3. NPM — Proxy Hosts (comme nextcloud.delhomme.ovh)

### API

| Champ | Valeur |
|-------|--------|
| Domain Names | `api.cloudity.<dom>` |
| Scheme | `http` |
| Forward Hostname / IP | `cloudity-api-gateway` (nom du **conteneur** ou service sur le réseau NPM) |
| Forward Port | `8000` |
| SSL | certificat Let's Encrypt du domaine, **Force SSL** ON, HTTP/2 ON |

### Front web

| Champ | Valeur |
|-------|--------|
| Domain Names | `cloudity.<dom>` |
| Scheme | `http` |
| Forward Hostname / IP | `cloudity-web` |
| Forward Port | `3000` (ou le port interne du conteneur web) |
| SSL | idem Force SSL |

Admin : `https://cloudity.<dom>/4dm1n` (même host web).

---

## 4. DNS

Chez OVH (ou ton registrar) :

| Type | Nom | Cible |
|------|-----|--------|
| A | `cloudity` | IP publique VPS |
| A | `api.cloudity` | même IP |

Attends la propagation, puis demande le certificat dans NPM.

---

## 5. Checklist smoke après déploiement

```bash
curl -sS https://api.cloudity.<dom>/health
# → healthy

# Depuis le téléphone / PC :
# VITE / mobile gateway = https://api.cloudity.<dom>
# Login web https://cloudity.<dom>
```

CORS : dans les env Portainer, `CORS_ORIGINS` doit contenir `https://cloudity.<dom>` (généré par sync/env-prod).

---

## 6. Mise à jour

1. Push GitHub (image GHCR ou rebuild selon ton compose).  
2. Portainer → stack → **Pull and redeploy** (ou Update).  
3. Pas besoin de retoucher NPM si noms de conteneurs inchangés.

---

## 7. Lien avec Pilotage

| Tâche | Lien |
|-------|------|
| **H14** | HTTPS + CORS mobile — [H14-GATEWAY-MOBILE.md](H14-GATEWAY-MOBILE.md) |
| **DEPLOY-DNS-01** | DNS + NPM |
| **PREPROD-06 / 07** | Gates pré-prod HTTPS / DNS |
| **DEPLOY-SUIVI-01** | Phases A→C — [DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md) |

---

## 8. Sécurité

- Ne mets **pas** Portainer en public sans auth / VPN.  
- Secrets uniquement dans Portainer Env (comme Nextcloud).  
- Rotate les mots de passe si tu les as collés dans un chat.
