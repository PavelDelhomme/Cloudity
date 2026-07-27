# Génération du fichier `.env` — guide pas à pas

**Rôle** : savoir **quoi** mettre dans `.env`, **comment** le générer, et **où** recopier les valeurs en prod (Portainer).  
**Ne jamais** committer `.env` (déjà dans `.gitignore`).

Références : **[SECRETS.md](../securite/SECRETS.md)** · **[.env.example](../../.env.example)** · **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** § variables.

---

## 1. Commandes (ordre recommandé)

| Étape | Commande | Effet |
|-------|----------|--------|
| 1 | `cp .env.example .env` | Copie le modèle (si tu préfères tout remplir à la main). |
| 2 | **`make secrets`** | Crée `.env` avec secrets CSPRNG (**échoue** si `.env` existe déjà). |
| 2 bis | `./scripts/dev/gen-secrets.sh --force` | **Écrase** `.env` — uniquement si tu acceptes de perdre l’ancien fichier. |
| 3 | **`make sync-public-urls`** | Aligne `VITE_API_URL`, mobile, CORS, WebAuthn depuis `CLOUDITY_PUBLIC_*`. |
| 4 | **`make env-prod DOMAIN=…`** | Génère **`.env.prod`** (fusion `.env` + `.env.example` + overlays prod) pour Portainer. |
| 5 | **`make portainer-env`** | Affiche les `KEY=VALUE` de `.env.prod` à coller dans Portainer. |
| 6 | **`make ensure-mail-encryption-key`** | Ajoute ou remplace `MAIL_PASSWORD_ENCRYPTION_KEY` (64 car. hex) sans toucher au reste. |
| 7 | **`make ensure-alias-encryption-key`** | Ajoute ou remplace `ALIAS_ENCRYPTION_KEY` (base64 32 octets). |
| 8 | **`make secrets-print`** | Affiche un jeu de secrets **sans écrire** (pour Portainer / copier-coller). |
| 9 | **`make doctor`** | Vérifie clés mail + alias, recrée `mail-directory-service`, build extension Pass. |

**Première install** typique :

```bash
make secrets
# Hôte public (localhost / IP LAN / domaine) puis sync des URLs dérivées
# CLOUDITY_PUBLIC_HOST=…  CLOUDITY_PUBLIC_PROTO=http|https
make sync-public-urls
# Compléter à la main : GOOGLE_OAUTH_CLIENT_* si Gmail
make up
make migrate
make seed-admin   # compte démo local uniquement
```

---

## 2. Variables générées automatiquement (`make secrets`)

| Variable | Format | Utilisée par | Obligatoire |
|----------|--------|--------------|-------------|
| `POSTGRES_PASSWORD` | 64 hex (32 octets) | Postgres, tous les services DB | Oui |
| `REDIS_PASSWORD` | 64 hex | Redis, auth refresh | Oui |
| `JWT_SECRET` | 64 hex | auth-service (legacy HMAC) | Oui |
| `PERFORMANCE_INGEST_TOKEN` | 64 hex | gateway + admin perf ingest | **Prod** : oui |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | 64 hex | mail-directory (MDP IMAP chiffrés) | Dès qu’une boîte Mail est connectée |
| `ALIAS_ENCRYPTION_KEY` | base64 ~44 car. | mail-directory (**futur** provision alias) | Parité VPS ; pas encore lue en Go |

`gen-secrets.sh` pose aussi : `POSTGRES_USER`, `POSTGRES_DB`, `JWT_EXPIRATION`, `CORS_*`, `LOG_*`.

---

## 3. Hôte public (une seule variable) + URLs dérivées

Pour passer de **localhost** → **IP LAN** → **domaine prod** sans retaper la même IP partout :

| Variable | Rôle |
|----------|------|
| `CLOUDITY_PUBLIC_HOST` | IP ou domaine (ex. `192.168.1.134`, `cloudity.example`) |
| `CLOUDITY_PUBLIC_PROTO` | `http` (dev) ou `https` (préprod/prod) |
| `CLOUDITY_PUBLIC_API_HOST` | Optionnel — host API distinct (`api.cloudity.example`) |
| `CLOUDITY_PUBLIC_WEB_HOST` | Optionnel — host web distinct |
| `CORS_ORIGINS_EXTRA` | Origines **stables** toujours fusionnées (localhost, `cloudity.localhost`, …) |
| `WEBAUTHN_ORIGINS_EXTRA` | Idem pour WebAuthn |

```bash
# Ex. LAN
# dans .env : CLOUDITY_PUBLIC_HOST=192.168.1.134  CLOUDITY_PUBLIC_PROTO=http
make sync-public-urls
# → écrit VITE_API_URL, CLOUDITY_MOBILE_GATEWAY_URL, CORS_ORIGINS, WEBAUTHN_*, OAuth redirect

# Aperçu sans écrire
./scripts/dev/sync-public-urls.sh --dry-run
```

Puis recreate / rebuild les services qui lisent ces vars au démarrage (`make deploy-web`, recreate `api-gateway` / `auth-service` si CORS ou WebAuthn changent).

### Préprod / prod (Portainer)

```bash
# Depuis ton .env local (secrets) + .env.example (schéma)
make env-prod DOMAIN=cloudity.ton-domaine.tld
# → écrit .env.prod + sync URLs (HTTPS, api.<domaine>, CORS_ALLOW_LAN=false)

make portainer-env                    # coller dans Portainer Advanced env
# Préprod :
make env-preprod DOMAIN=preprod.cloudity.example
make portainer-env FILE=.env.preprod
```

Détail stack Git : **[../../deploy/portainer/PORTAINER-STACK.md](../../deploy/portainer/PORTAINER-STACK.md)**.

---

## 4. Variables à renseigner à la main (non générées par `make secrets`)

| Variable | Quand | Exemple dev | Exemple prod |
|----------|-------|-------------|--------------|
| `CLOUDITY_PUBLIC_HOST` / `PROTO` | **Toujours** — source de vérité | `localhost` / `http` | `cloudity.tld` / `https` |
| `VITE_API_URL` | Dérivée (`sync-public-urls`) | `http://localhost:6002` | `https://api.ton-domaine.tld` |
| `CORS_ORIGINS` | Dérivée (+ `CORS_ORIGINS_EXTRA`) | localhost:6001 | `https://cloudity.tld` |
| `CORS_ALLOW_LAN` | Dev smartphone sur LAN | `true` | **`false`** |
| `WEBAUTHN_RP_ID` | Dérivée | `localhost` | `cloudity.tld` |
| `WEBAUTHN_ORIGINS` | Dérivée | URLs http(s) du dashboard | URL HTTPS prod |
| `GOOGLE_OAUTH_*` | Gmail OAuth | Console Google Cloud | Idem prod |
| `MTLS_MODE` | mTLS interne microservices | `off` | `permissive` puis `strict` — voir **[MTLS-INTERNE.md](../securite/MTLS-INTERNE.md)** |
| `MAIL_ALIAS_SUBDOMAIN` | Cible alias Pass | commenté | ex. `alias.domain.ovh` |
| `MAIL_ALIAS_DOMAIN` | Mode dev MTA alias (fallback suffixe) | ex. `alias.domain.ovh` | utilisé surtout par `deploy/mail-mta` |
| `MAIL_ALIAS_PORT` | Port SMTP local MTA | `2525` | généralement non utilisé (prod = 25 via stack MTA) |
| `MAIL_PRIMARY_DOMAIN` | Domaine compte principal | commenté | ex. `domain.ovh` |
| `MTA_INTERNAL_TOKEN` | Lookup MTA → Cloudity | `openssl rand -hex 32` | Même valeur dans `mail-directory-service` et `deploy/mail-mta` |
| `OVH_API_*` | Provision alias sans UI OVH | commenté | Backlog **MAIL-ALIAS-05** |

---

## 5. État opérationnel du chiffrement

| Secret / mécanisme | Opérationnel aujourd’hui ? | Note |
|--------------------|---------------------------|------|
| Coffre **Pass** (Argon2id + XChaCha20) | Oui | Côté **navigateur / app** ; serveur ne voit que des blobs. |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | Oui | MDP boîtes dans `user_email_accounts`. Rotation → **ré-enregistrer** chaque MDP dans Mail. |
| `ALIAS_ENCRYPTION_KEY` | Non (clé en `.env` seulement) | **MAIL-ALIAS-KEY-01** — pour API OVH / tokens. |
| JWT Ed25519 (fichiers dans volume auth) | Oui au boot | Générés dans le conteneur `auth-service`, pas dans `.env`. |
| mTLS inter-services | Optionnel (`MTLS_MODE=off` par défaut) | Voir **MTLS-INTERNE.md** § 0. |

---

## 6. Prod (Portainer / VPS)

1. Générer sur une machine de confiance : `make secrets-print` ou `OUTPUT=.env.prod ./scripts/dev/gen-secrets.sh`.  
2. Copier **chaque** variable dans **Portainer → Stack → Environment variables** (jamais dans Git). C’est aussi l’endroit pour noter **`VPS_PUBLIC_IP`** (IP publique du serveur) si tu t’en sers comme référence — voir **[DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)** § 0.  
3. Trois jeux de stacks possibles : **dev**, **preprod**, **prod** — secrets **distincts** par environnement.  
3. **Même** `POSTGRES_PASSWORD` / `REDIS_PASSWORD` sur toutes les stacks qui partagent Postgres/Redis.  
4. Après changement de `MAIL_PASSWORD_ENCRYPTION_KEY` : resynchroniser les boîtes Mail (saisie MDP).  
5. Checklist déploiement : **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)**.

---

## 7. Alignement `.env` ↔ `.env.example` (audit)

Ton `.env` local doit **contenir les mêmes clés** que `.env.example`. Différences normales :

| Clé | `.env.example` | Ton `.env` typique dev |
|-----|----------------|-------------------------|
| Secrets Postgres/Redis/JWT | placeholders `change_me_*` | mots de passe dev (`cloudity_secure_password`, …) — **OK en local** |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | vide ou à générer | **doit** être 64 hex (`make ensure-mail-encryption-key`) |
| `ALIAS_ENCRYPTION_KEY` | vide | base64 (`make ensure-alias-encryption-key`) |
| `VITE_API_URL` | vide | `http://localhost:6080` pour le front Docker |
| `API_GATEWAY_URL` | non listé (interne compose) | `http://api-gateway:8080` ou `8000` selon réseau — le front utilise surtout `VITE_API_URL` |
| `BUILD_TARGET` | `dev` | idem |
| Prod-only | `MAIL_ALIAS_*`, `OVH_API_*` | commentés jusqu’au chantier alias |

**Avant VPS** : ne **pas** réutiliser les mots de passe faibles du dev — exécuter `make secrets-print` et coller dans Portainer.

Checklist rapide :

```bash
# Clés critiques présentes ?
grep -E '^(MAIL_PASSWORD_ENCRYPTION_KEY|ALIAS_ENCRYPTION_KEY|POSTGRES_PASSWORD)=' .env
# Générer ce qui manque
make ensure-mail-encryption-key
make ensure-alias-encryption-key
```

---

## 8. Dépannage rapide

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Sync IMAP « secret illisible » | Clé mail tournée | `make ensure-mail-encryption-key` puis MDP boîte dans Mail |
| `make secrets` refuse | `.env` existe | `make ensure-*` ou `--force` en connaissance de cause |
| Perf ingest 503 | `PERFORMANCE_INGEST_TOKEN` vide | Renseigner + redémarrer gateway + admin |
| Pass OK mais alias ne reçoivent rien | Pas de MX / pas d’alias chez hébergeur | **[MAIL-ALIAS-DEMARRAGE.md](../produit/MAIL-ALIAS-DEMARRAGE.md)** |

---

*Dernière mise à jour : 2026-05-18.*
