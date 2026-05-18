# Stack MTA alias Cloudity (squelette)

**Ne pas committer** de FQDN réels, IP VPS ni clés DKIM. Copier `.env.example` → `.env` (gitignored) sur le serveur.

## Rôle

Réception SMTP sur le **domaine alias** (`*@<DOMAINE-ALIAS>`) et remise vers la boîte IMAP principale (phase 2 de `docs/operations/MAIL-ALIAS-MTA-DEPLOY.md`).

En **phase 1**, préférer la redirection registrar (option A dans `docs/produit/MAIL-ALIAS-RECEPTION.md`) — aucun port 25 requis.

## Démarrage (VPS / homelab)

Toutes les variables du `.env` sont **obligatoires** (le compose n’a pas de valeurs par défaut).

```bash
cd deploy/mail-mta
cp .env.example .env
# Éditer .env sur la machine (jamais dans Git)
docker compose config   # vérifie que rien n’est vide
docker compose up -d
```

Portainer : voir **docs/operations/PORTAINER-MAIL-ALIAS.md**.

Ports exposés par défaut : **25** (SMTP entrant), **587** (soumission). Ouvrir le pare-feu + MX DNS uniquement après tests internes.

## Intégration Cloudity (à venir)

1. `mail-directory-service` : endpoint ou script de lookup `user_email_aliases` → `deliver_target_email`.
2. Postfix `transport_maps` ou pipe vers script `scripts/alias-deliver.sh` (stub).
3. DKIM : clés dans `opendkim/keys/` (volume local, **hors Git**).

## Liens

- `docs/operations/MAIL-ALIAS-MTA-DEPLOY.md`
- `docs/produit/MAIL-ALIAS-CHECKLIST.md`
