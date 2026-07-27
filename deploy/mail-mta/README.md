# Stack MTA alias Cloudity

Deux modes :

| Fichier | Usage |
|---------|--------|
| `docker-compose.local.yml` | **Dev** — SMTP sur **2526** (hôte), **Rspamd** + Maddy → `alias-router` → lookup API Cloudity |
| `docker-compose.maddy.yml` | **VPS / Portainer** — ports **25**, **587**, **993** |
| `docker-compose.yml` | Postfix + OpenDKIM (expérimental) |

DNS : **[docs/operations/MAIL-ALIAS-DNS-MADDY.md](../../docs/operations/MAIL-ALIAS-DNS-MADDY.md)**  
Déploiement : **[docs/operations/MAIL-ALIAS-MTA-DEPLOY.md](../../docs/operations/MAIL-ALIAS-MTA-DEPLOY.md)**  
Test local : **[docs/operations/MAIL-MTA-LOCAL-TEST.md](../../docs/operations/MAIL-MTA-LOCAL-TEST.md)**

**Ne pas committer** de FQDN réels, IP VPS ni clés DKIM. Copier `.env.local.example` ou `.env.example` → `.env` (gitignored).

## Rôle

Réception SMTP sur le **domaine alias** (`*@<domaine-alias>`) :

1. MTA reçoit `RCPT TO` alias@…
2. Maddy relaie en SMTP interne vers `alias-router:2527`
3. `alias-router` appelle `POST /mail/internal/alias-resolve` (token `MTA_INTERNAL_TOKEN`)
4. **Rspamd** (local) analyse le message avant relais — en-têtes `X-Spam-Score` / `X-Spam-Status` lus par `mail-directory-service`
5. `alias-router` relaie vers `deliver_to` (boîte IMAP / SMTP cible) avec en-têtes `Delivered-To` / `X-Original-To` pour le filtre Mail Cloudity

Le même chemin est utilisé en local et en Portainer : plus de mode `dummy`.

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
docker compose -f docker-compose.local.yml up -d --build alias-router maddy
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
swaks --to inscriptions@alias.example.invalid --server localhost --port 2526
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
| Maddy `maddy.conf` | Livre vers `alias-router:2527` |
| `alias-router` | Lookup Cloudity + relais SMTP final |
| DKIM/SPF/DMARC Cloudity | Phase **MAIL-ALIAS-06** |

## Liens

- `docs/produit/MAIL-ALIAS-RECEPTION.md`
- `docs/produit/MAIL-ALIAS-CHECKLIST.md`
- `docs/operations/PORTAINER-MAIL-ALIAS.md`
