# Réception réelle sur un domaine alias (`MAIL-ALIAS-05`)

**Ne jamais committer** : IP VPS, FQDN réels, clés API OVH. Utiliser des placeholders dans Git ; noter les valeurs dans Portainer / carnet local.

## État MVP (déjà livré)

| Étape | Outil |
|-------|--------|
| Enregistrer `nom@<domaine-alias>` | UI Pass / Mail |
| Filtre `delivered_to`, règle auto, on/off | Cloudity |
| Envoi `From` = alias | SMTP fournisseur (si autorisé) |
| **Recevoir depuis Internet** sur `@<domaine-alias>` | **MTA Cloudity** (phase 2) |

## Option A — Redirection registrar (secours / rollback)

Chez le registrar du **`<domaine-alias>`** :

1. Redirection `inscriptions@<domaine-alias>` → `<boite-test>@<domaine-principal>`.
2. Dans Cloudity, enregistrer la **même** adresse.
3. Sync IMAP → **C7** possible.

Utile en secours si le MTA est indisponible. **Ne remplace pas** la cible auto-hébergée si tu veux contrôler SPF/DKIM/MX toi-même.

## Option B — MTA Cloudity (recommandé)

Flux :

```text
Internet → MX @<domaine-alias> → mail.<domaine-alias> (VPS)
  → Maddy/Postfix → POST /mail/internal/alias-resolve
  → relais SMTP + en-têtes Delivered-To → boîte IMAP cible → sync Cloudity
```

### Étapes

1. Déployer **`deploy/mail-mta`** (local `2525` puis VPS) — voir **[MAIL-MTA-LOCAL-TEST.md](../operations/MAIL-MTA-LOCAL-TEST.md)**.
2. Configurer `MTA_INTERNAL_TOKEN` + `MAIL_ALIAS_SUBDOMAIN` dans `.env` / Portainer.
3. DNS sur **`<domaine-alias>`** :
   - `A` `mail` → `<IP-VPS>`
   - `MX` `@` → `10 mail.<domaine-alias>.`
   - Remplacer SPF OVH par SPF Cloudity quand le MTA envoie (**MAIL-ALIAS-06**)
4. Port **25** ouvert (pare-feu + hébergeur).
5. Enregistrer chaque alias dans Cloudity **avant** de recevoir du courrier (pas de catch-all).

### API interne MTA

```http
POST /mail/internal/alias-resolve
X-MTA-Internal-Token: <secret>
{"alias_email":"inscriptions@<domaine-alias>"}
```

Réponse : `deliver_to`, `account_id`. Alias inconnu ou `enabled=false` → **404**.

## Checklist DNS (bascule MTA)

- [ ] `MTA_INTERNAL_TOKEN` aligné mail-directory + stack MTA
- [ ] Test local API + optionnel port 2525
- [ ] MX `@` vers `mail.<domaine-alias>.` (TTL 24–48 h avant bascule)
- [ ] Nettoyer SPF/DKIM OVH → enregistrements Cloudity
- [ ] Test externe → `test@<domaine-alias>`
- [ ] **C7** dans **MAIL-ALIAS-CHECKLIST.md**

## Zone « héritée OVH »

Tant qu’un domaine alias a été créé sans MX Plan OVH, la zone peut encore contenir :

- SPF `include:mx.ovh.com`
- DKIM `ovhmo-selector-*`
- CNAME `imap` / `smtp` → `ssl0.ovh.net`

**À remplacer** au moment où le MTA Cloudity devient autoritaire (réception + envoi). Garder une copie / screenshot hors Git pour rollback.

## Liens

- **MAIL-ALIAS-CHECKLIST.md** · **MAIL-ALIAS-DNS-MADDY.md**
- **MAIL-ALIAS-MTA-DEPLOY.md** · **deploy/mail-mta/README.md**
- **BACKLOG** MAIL-ALIAS-05/06, AS-1
