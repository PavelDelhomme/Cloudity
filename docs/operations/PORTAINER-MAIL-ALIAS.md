# Déployer Mail alias / MTA dans Portainer (VPS)

**Ne jamais committer** : IP VPS, FQDN réels, mots de passe, clés DKIM, contenu de `deploy/mail-mta/.env`.

Tu n’as **pas encore** déployé sur le VPS : ce guide part de zéro. La stack Cloudity principale et le MTA alias sont **deux stacks séparées**.

## Vue d’ensemble

```text
[Navigateur] → NPM (443) → cloudity-web / api-gateway   (stack Cloudity existante)
[Internet SMTP] → port 25 VPS → deploy/mail-mta (Postfix)  (stack séparée, plus tard)
```

Phase actuelle recommandée : **redirections OVH uniquement** — pas de stack MTA sur le VPS tant que les tests locaux ne sont pas verts.

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

- `MAIL_PRIMARY_DOMAIN`, `MAIL_ALIAS_SUBDOMAIN` dans le service **mail-directory-service** (placeholders dans la doc, valeurs dans Portainer).
- Pas besoin du compose `deploy/mail-mta` pour l’option redirection.

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
2. **Web editor** : coller le contenu de `deploy/mail-mta/docker-compose.yml`.
3. **Environment variables** : charger depuis `.env` (UI Portainer) — **toutes** les variables sont obligatoires (pas de défaut dans le compose) :
   - `MAIL_ALIAS_DOMAIN`
   - `MTA_HOSTNAME`
   - `ALLOWED_SENDER_DOMAINS`
   - `DKIM_SELECTOR`
   - `SMTP_PORT`, `SUBMISSION_PORT`
   - `RELAYHOST` (vide si non utilisé)
4. **Volumes** : monter `opendkim/keys` en volume nommé Portainer (clés générées sur le serveur, sauvegarde hors Git).
5. **Deploy** — vérifier les logs Postfix / OpenDKIM.

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
| 2 | OVH | Redirection seule (**MAIL-ALIAS-REDIRECTION-SAFE.md** A1 ou A3) |
| 3 | VPS | Déployer / mettre à jour stack Cloudity (sans MTA) |
| 4 | VPS | Stack `cloudity-mail-mta` + DNS MX |
| 5 | Prod | SPF/DKIM/DMARC |

## 5. Homelab / preprod

Même procédure avec un hostname technique et un domaine de test ; garder la prod sur redirections jusqu’à validation C7.

## Liens

- **deploy/mail-mta/README.md**
- **MAIL-ALIAS-MTA-DEPLOY.md** · **MAIL-MTA-PREPROD.md**
- **MAIL-ALIAS-REDIRECTION-SAFE.md**
