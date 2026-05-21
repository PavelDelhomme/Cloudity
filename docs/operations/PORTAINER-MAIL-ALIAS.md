# Déployer Mail alias / MTA dans Portainer (VPS)

**Ne jamais committer** : IP VPS, FQDN réels, mots de passe, clés DKIM, contenu de `deploy/mail-mta/.env`.

Tu n’as **pas encore** déployé sur le VPS : ce guide part de zéro. La stack Cloudity principale et le MTA alias sont **deux stacks séparées**.

## Vue d’ensemble

```text
[Navigateur] → NPM (443) → cloudity-web / api-gateway       (stack Cloudity existante)
[Internet SMTP] → port 25 VPS → deploy/mail-mta (Maddy)     (stack séparée)
```

Phase actuelle : **MTA auto-hébergé** — tests locaux (**MAIL-MTA-LOCAL-TEST.md**) puis stack `deploy/mail-mta` sur le VPS. Redirections OVH = secours uniquement.

## 1. Prérequis VPS

- Docker + Portainer déjà en place (cf. **DEPLOIEMENT-VPS-PORTAINER-NPM.md**).
- Ports ouverts seulement quand tu actives le MTA : **25**, **587** (pare-feu + fournisseur cloud).
- Accès SSH ou UI Portainer pour copier des fichiers.

## 2. Stack Cloudity (app + API)

Déjà documentée dans **DEPLOIEMENT-VPS-PORTAINER-NPM.md** :

1. Stack Git / compose prod (`docker-compose.prod.yml` ou équivalent).
2. Variables dans Portainer (secrets) : `POSTGRES_*`, `JWT_*`, `CORS_ORIGINS=https://cloudity.<TON-DOMAINE>`, etc.
3. NPM : `cloudity.<domaine>` → web, `api.cloudity.<domaine>` → gateway.

**Mail alias côté app** (sans MTA) :

- `MAIL_PRIMARY_DOMAIN`, `MAIL_ALIAS_SUBDOMAIN`, **`MTA_INTERNAL_TOKEN`** dans **mail-directory-service** (valeurs dans Portainer uniquement).
- Stack **`deploy/mail-mta`** : même `MTA_INTERNAL_TOKEN` + `MAIL_DIRECTORY_URL=http://mail-directory-service:8050` sur le réseau Docker interne.

## 3. Stack MTA (`deploy/mail-mta`) — quand tu es prêt

### 3.1 Fichiers sur le VPS

```bash
# Sur le VPS (exemple)
mkdir -p /opt/cloudity/mail-mta
# Copier depuis le dépôt (rsync / git sparse) :
#   deploy/mail-mta/docker-compose.yml
#   deploy/mail-mta/.env.example  → renommer en .env et éditer dans Portainer
```

### 3.2 Créer la stack dans Portainer

1. **Stacks** → **Add stack** → nom `cloudity-mail-mta`.
2. **Web editor** : coller le contenu de `deploy/mail-mta/docker-compose.maddy.yml` (recommandé). Le dossier doit contenir aussi `deploy/mail-mta/alias-router/` pour le build du routeur SMTP interne.
3. **Environment variables** : charger depuis `.env` (UI Portainer) — **toutes** les variables sont obligatoires (pas de défaut dans le compose) :
   - `MAIL_ALIAS_DOMAIN`
   - `MADDY_DOMAIN`, `MADDY_HOSTNAME`
   - `MAIL_DIRECTORY_URL=http://mail-directory-service:8050`
   - `MTA_INTERNAL_TOKEN` (même valeur que la stack Cloudity)
   - `RELAY_SMTP_HOST`, `RELAY_SMTP_PORT`, `RELAY_SMTP_USERNAME`, `RELAY_SMTP_PASSWORD`, `RELAY_FROM`
   - `SMTP_PORT=25`, `SUBMISSION_PORT=587`
   - `MADDY_DOCKER_NETWORK`, `MADDY_CERTS_PATH`
4. **Réseau Docker** : `MADDY_DOCKER_NETWORK` doit être le même réseau que `mail-directory-service` si `MAIL_DIRECTORY_URL=http://mail-directory-service:8050`.
5. **Volumes** : monter `maddy_data` et le chemin TLS (`fullchain.pem`, `privkey.pem`) hors Git.
6. **Deploy** — vérifier les logs Maddy + `alias-router`, puis tester `POST /mail/internal/alias-resolve`.

### 3.3 DNS (domaine alias uniquement)

Uniquement après tests internes :

| Type | Valeur (placeholder) |
|------|----------------------|
| MX | `10 mail.<…>.` |
| TXT SPF | selon **MAIL-ALIAS-MTA-DEPLOY.md** |
| TXT DKIM | clé publique du sélecteur |
| TXT DMARC | `v=DMARC1; p=quarantine; …` |

**Rollback** : remettre les MX OVH par défaut + arrêter la stack `cloudity-mail-mta`.

## 4. Ordre recommandé pour toi

| Étape | Où | Action |
|-------|-----|--------|
| 1 | Local | `make up`, tests **MAIL-ALIAS-CHECKLIST.md** |
| 2 | Local | `MTA_INTERNAL_TOKEN` décommenté + `make deploy-mail` |
| 3 | Admin | `/4dm1n/domaines` : rôle **Domaine alias MTA**, hostname, MX, SPF/DKIM/DMARC attendus |
| 4 | VPS | Stack `cloudity-mail-mta` + DNS MX |
| 5 | DNS | SPF/DKIM/DMARC Cloudity ; supprimer héritage OVH quand validé |

## 5. Homelab / preprod

Même procédure avec un hostname technique et un domaine de test ; garder la prod sur redirections jusqu’à validation C7.

## Liens

- **deploy/mail-mta/README.md**
- **MAIL-ALIAS-MTA-DEPLOY.md** · **MAIL-MTA-PREPROD.md**
- **MAIL-ALIAS-REDIRECTION-SAFE.md**
