# Stack MTA alias Cloudity

Deux modes :

| Fichier | Usage |
|---------|--------|
| `docker-compose.local.yml` | **Dev** — SMTP sur **2525** (hôte), lookup API Cloudity |
| `docker-compose.maddy.yml` | **VPS / Portainer** — ports **25**, **587**, **993** |
| `docker-compose.yml` | Postfix + OpenDKIM (expérimental) |

DNS : **[docs/operations/MAIL-ALIAS-DNS-MADDY.md](../../docs/operations/MAIL-ALIAS-DNS-MADDY.md)**  
Déploiement : **[docs/operations/MAIL-ALIAS-MTA-DEPLOY.md](../../docs/operations/MAIL-ALIAS-MTA-DEPLOY.md)**  
Test local : **[docs/operations/MAIL-MTA-LOCAL-TEST.md](../../docs/operations/MAIL-MTA-LOCAL-TEST.md)**

**Ne pas committer** de FQDN réels, IP VPS ni clés DKIM. Copier `.env.local.example` ou `.env.example` → `.env` (gitignored).

## Rôle

Réception SMTP sur le **domaine alias** (`*@<domaine-alias>`) :

1. MTA reçoit `RCPT TO` alias@…
2. En prod/preprod, le routage devra appeler `POST /mail/internal/alias-resolve` (token `MTA_INTERNAL_TOKEN`)
3. Relais vers `deliver_to` (boîte IMAP) avec en-têtes `Delivered-To` / `X-Original-To` pour le filtre Mail Cloudity

Le mode `docker-compose.local.yml` actuel est volontairement un **smoke SMTP**
du domaine alias (`deliver_to dummy`) : il valide que Maddy accepte le RCPT sur
le domaine configuré. Le lookup Cloudity est testé séparément par l’API interne
et par `scripts/alias-deliver.sh`.

## Prérequis Cloudity

Dans le `.env` racine (ou Portainer) :

```bash
MTA_INTERNAL_TOKEN=<openssl rand -hex 32>
MAIL_PRIMARY_DOMAIN=<domaine-principal>
MAIL_ALIAS_SUBDOMAIN=<domaine-alias>
```

Redémarrer le service mail : `make deploy-mail`.

## Démarrage local

Depuis la racine du monorepo :

```bash
make sync-mail-mta-env
make mail-mta-local-up
make test-mail-mta-local
```

Manuel :

```bash
cd deploy/mail-mta
cp .env.local.example .env
# ou make sync-mail-mta-env depuis la racine
docker compose -f docker-compose.local.yml up -d maddy
```

Test API (sans Maddy) :

```bash
curl -sS -X POST http://localhost:6050/mail/internal/alias-resolve \
  -H "Content-Type: application/json" \
  -H "X-MTA-Internal-Token: $MTA_INTERNAL_TOKEN" \
  -d '{"alias_email":"inscriptions@alias.example.invalid"}'
```

Test SMTP local (si `swaks` installé) :

```bash
swaks --to inscriptions@alias.example.invalid --server localhost --port 2525
```

## Démarrage VPS

```bash
cp .env.example .env
docker compose -f docker-compose.maddy.yml config
docker compose -f docker-compose.maddy.yml up -d
```

Ouvrir pare-feu : **25**, **587**. Aligner MX `@` → `mail.<domaine-alias>.` (voir doc DNS).

## Intégration

| Composant | État |
|-----------|------|
| `POST /mail/internal/alias-resolve` | Livré |
| Filtre `delivered_to` + `raw_headers` | Livré |
| Maddy `maddy.conf` | Smoke local Maddy 0.9.4 (`deliver_to dummy`) |
| DKIM/SPF/DMARC Cloudity | Phase **MAIL-ALIAS-06** |

## Liens

- `docs/produit/MAIL-ALIAS-RECEPTION.md`
- `docs/produit/MAIL-ALIAS-CHECKLIST.md`
- `docs/operations/PORTAINER-MAIL-ALIAS.md`
