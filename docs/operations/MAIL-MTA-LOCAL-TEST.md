# Test MTA alias en local

**Ne jamais committer** de FQDN/IP réels. Utiliser `<domaine-alias>` et `alias.example.invalid` en dev.

## Prérequis

1. Stack Cloudity : `make up` ou au minimum postgres + `make deploy-mail`
2. `MTA_INTERNAL_TOKEN` **décommenté** et identique dans `.env` racine et `deploy/mail-mta/.env`
3. Alias enregistré dans l’UI (Pass ou Mail) pour `test@<domaine-alias>` avec cible = boîte IMAP sync

## 0. `.env` local Cloudity

Dans le `.env` racine, les lignes doivent être **actives** (pas préfixées par `#`) :

```bash
MAIL_PRIMARY_DOMAIN=<domaine-principal>
MAIL_ALIAS_SUBDOMAIN=<domaine-alias>
MTA_INTERNAL_TOKEN=<openssl rand -hex 32>
```

`MAIL_ALIAS_DOMAIN` est utilisé par la stack `deploy/mail-mta`; côté `mail-directory-service`, le suffixe UI attendu est `MAIL_ALIAS_SUBDOMAIN`.

Après modification :

```bash
make deploy-mail
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

## 2. Stack Maddy locale (port 2525)

```bash
cd deploy/mail-mta
cp .env.local.example .env
# Aligner MTA_INTERNAL_TOKEN avec le .env racine
docker compose -f docker-compose.local.yml up -d maddy
```

Envoi test :

```bash
swaks --to inscriptions@<domaine-alias> \
  --from sender@external.example \
  --server localhost --port 2525
```

Puis **Mail → Actualiser (IMAP)** et filtre alias dans la barre latérale.

## 3. Filtre `delivered_to`

Le MTA ajoute `Delivered-To` / `X-Original-To`. Cloudity filtre aussi `raw_headers` en base — utile quand la boîte cible affiche `To:` = adresse principale.

## 4. Avant bascule DNS prod

- [ ] Test API OK
- [ ] Test local 2525 OK (ou preprod VPS)
- [ ] MX `@` → `mail.<domaine-alias>.` (TTL baissé 24–48 h)
- [ ] SPF/DKIM/DMARC Cloudity (pas OVH `include:mx.ovh.com`)
- [ ] Rollback documenté : **[MAIL-ALIAS-REDIRECTION-SAFE.md](../produit/MAIL-ALIAS-REDIRECTION-SAFE.md)**

## Liens

- **[MAIL-ALIAS-DNS-MADDY.md](./MAIL-ALIAS-DNS-MADDY.md)**
- **[deploy/mail-mta/README.md](../../deploy/mail-mta/README.md)**
