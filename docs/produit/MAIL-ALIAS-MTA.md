# Mail alias MTA — guide phase 2

**Rôle** : recevoir `*@<domaine-alias>` avec Cloudity/Maddy, sans MX Plan OVH, puis livrer vers une boîte IMAP cible déjà connectée à Cloudity.

**Ne jamais committer** : vrai domaine, IP VPS, clés DKIM privées, `MTA_INTERNAL_TOKEN`.

## 1. Décision produit

`<domaine-alias>` est un **domaine alias entrant** :

- pas de boîtes complètes `user@<domaine-alias>` ;
- chaque alias doit exister dans Cloudity ;
- pas de catch-all ;
- Maddy reçoit, Cloudity résout, puis le message est livré vers la boîte IMAP cible.

## 2. `.env` local Cloudity

Les lignes doivent être actives, pas commentées :

```bash
MAIL_PRIMARY_DOMAIN=<domaine-principal>
MAIL_ALIAS_SUBDOMAIN=<domaine-alias>
MTA_INTERNAL_TOKEN=<openssl rand -hex 32>
```

Notes :

- `MAIL_ALIAS_SUBDOMAIN` pilote le suffixe proposé par Mail/Pass.
- `MAIL_ALIAS_DOMAIN` sert à la stack `deploy/mail-mta`, pas au backend Cloudity principal.
- Après modification : `make deploy-mail`.

## 3. Admin Domaines

Dans **`/4dm1n/domaines`** :

1. Ajouter le domaine alias.
2. Ouvrir **Voir détails**.
3. Renseigner :
   - rôle : **Domaine alias MTA** ;
   - hostname MTA : `mail.<domaine-alias>` ;
   - cible MX : `mail.<domaine-alias>.` ;
   - SPF attendu : `v=spf1 mx a:mail.<domaine-alias> -all` ;
   - sélecteur DKIM : `cloudity` ;
   - DMARC : `none` en observation, puis `quarantine` / `reject`.

Cette configuration documente l’état attendu. Elle ne modifie pas OVH automatiquement.

## 4. Local

Voir **[MAIL-MTA-LOCAL-TEST.md](../operations/MAIL-MTA-LOCAL-TEST.md)** :

```bash
make migrate
make deploy-mail
cd deploy/mail-mta
cp .env.local.example .env
docker compose -f docker-compose.local.yml up -d maddy
```

Test API :

```bash
curl -sS -X POST http://localhost:6050/mail/internal/alias-resolve \
  -H "Content-Type: application/json" \
  -H "X-MTA-Internal-Token: ${MTA_INTERNAL_TOKEN}" \
  -d '{"alias_email":"inscriptions@<domaine-alias>"}'
```

## 5. VPS / Portainer

Stack séparée : **`cloudity-mail-mta`**.

Variables Portainer :

- `MAIL_ALIAS_DOMAIN=<domaine-alias>`
- `MADDY_DOMAIN=<domaine-alias>`
- `MADDY_HOSTNAME=mail.<domaine-alias>`
- `MAIL_DIRECTORY_URL=http://mail-directory-service:8050`
- `MTA_INTERNAL_TOKEN=<même secret que mail-directory-service>`
- `SMTP_PORT=25`
- `SUBMISSION_PORT=587`

Guide : **[PORTAINER-MAIL-ALIAS.md](../operations/PORTAINER-MAIL-ALIAS.md)**.

## 6. DNS à faire quand Maddy répond

Voir **[MAIL-ALIAS-DNS-MADDY.md](../operations/MAIL-ALIAS-DNS-MADDY.md)**.

Ordre :

1. MX `@` → `10 mail.<domaine-alias>.`
2. `mail A <IP-VPS>`
3. SPF Cloudity (retirer `include:mx.ovh.com`)
4. DKIM Cloudity (retirer `ovhmo-selector-*` quand prêt)
5. DMARC `none` puis durcissement
6. Supprimer CNAME OVH `imap/smtp/pop3/autoconfig/autodiscover` seulement si inutiles

## 7. Validation

- Alias créé dans Cloudity.
- API interne retourne `deliver_to`.
- Envoi local ou externe vers alias.
- Sync IMAP.
- Filtre `delivered_to` dans Mail.
- Checklist **[MAIL-ALIAS-CHECKLIST.md](MAIL-ALIAS-CHECKLIST.md)** C1–C7.
