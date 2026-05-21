# Test MTA alias en local

**Ne jamais committer** de FQDN/IP réels. Utiliser `<domaine-alias>` et `alias.example.invalid` en dev.

## Prérequis

1. Stack Cloudity : `make up` ou au minimum postgres + `make deploy-mail`
2. `MTA_INTERNAL_TOKEN` **décommenté** et identique dans `.env` racine et `deploy/mail-mta/.env`
3. Alias enregistré dans l’UI (Pass ou Mail) pour `test@<domaine-alias>` avec cible = boîte IMAP sync

## 0. `.env` local Cloudity

Dans le `.env` racine, les lignes doivent être **actives** (pas préfixées par `#`) :

```bash
MAIL_ALIAS_DOMAIN=<domaine-alias>
MAIL_ALIAS_PORT=2526
MTA_INTERNAL_TOKEN=<openssl rand -hex 32>
```

En dev, `mail-directory-service` accepte `MAIL_ALIAS_DOMAIN` comme suffixe direct si `MAIL_ALIAS_SUBDOMAIN` est vide.  
En Portainer/prod, préférer le nom canonique `MAIL_ALIAS_SUBDOMAIN=<domaine-alias>` côté service Cloudity, et `MAIL_ALIAS_DOMAIN=<domaine-alias>` côté stack `deploy/mail-mta`.

Après modification :

```bash
make deploy-mail
make sync-mail-mta-env
make test-mail-mta-local
```

Optionnel : alias réel déjà créé dans l’UI :

```bash
ALIAS_TEST_EMAIL=inscriptions@<domaine-alias> make test-mail-mta-local
```

## 1. Test API (sans port 25)

```bash
export MTA_INTERNAL_TOKEN="$(grep MTA_INTERNAL_TOKEN .env | cut -d= -f2)"
curl -sS -X POST "http://localhost:${PORT_MAIL_DIRECTORY:-6050}/mail/internal/alias-resolve" \
  -H "Content-Type: application/json" \
  -H "X-MTA-Internal-Token: ${MTA_INTERNAL_TOKEN}" \
  -d '{"alias_email":"inscriptions@<domaine-alias>"}'
```

Réponse attendue : `{"ok":true,"deliver_to":"…","account_id":…}`.

## 2. Stack Maddy locale (port 2526 par défaut si 2525 = MailHog)

```bash
make sync-mail-mta-env
make mail-mta-local-up
```

Équivalent manuel :

```bash
cd deploy/mail-mta
cp .env.local.example .env
# ou : make sync-mail-mta-env
docker compose -f docker-compose.local.yml up -d --build alias-router maddy
```

Envoi test :

```bash
swaks --to inscriptions@<domaine-alias> \
  --from sender@external.example \
  --server localhost --port 2526
```

Le flux réel est : Maddy → `alias-router` → `/mail/internal/alias-resolve` → `RELAY_SMTP_HOST:RELAY_SMTP_PORT`.  
En local, `RELAY_SMTP_PORT=1025` vise MailHog/SMTP dev par défaut ; en prod, renseigner le relais SMTP autorisé dans Portainer.

Puis **Mail → Actualiser (IMAP)** et filtre alias dans la barre latérale si le relais final livre bien dans la boîte cible.

## 3. Filtre `delivered_to`

Le MTA ajoute `Delivered-To` / `X-Original-To`. Cloudity filtre aussi `raw_headers` en base — utile quand la boîte cible affiche `To:` = adresse principale.

## 4. Avant bascule DNS prod

- [ ] Test API OK
- [ ] Test local 2526 OK (ou preprod VPS)
- [ ] MX `@` → `mail.<domaine-alias>.` (TTL baissé 24–48 h)
- [ ] SPF/DKIM/DMARC Cloudity (pas OVH `include:mx.ovh.com`)
- [ ] Rollback documenté : **[MAIL-ALIAS-REDIRECTION-SAFE.md](../produit/MAIL-ALIAS-REDIRECTION-SAFE.md)**

## Liens

- **[MAIL-ALIAS-DNS-MADDY.md](./MAIL-ALIAS-DNS-MADDY.md)**
- **[deploy/mail-mta/README.md](../../deploy/mail-mta/README.md)**
