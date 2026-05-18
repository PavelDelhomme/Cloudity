# Vision — Alias mail Cloudity

## Objectif produit

Offrir des **adresses alias** dédiées (style Proton : `newsletter@<domaine-alias>`), rattachées à une boîte IMAP existante, avec :

- **Tri** automatique (`recipient_pattern`, filtre `delivered_to`)
- **Envoi** avec `From` = alias (si le SMTP fournisseur l’autorise)
- **Réception Internet** sur le domaine alias sans perdre le courrier de la boîte principale

## Phases

| Phase | Statut | Contenu |
|-------|--------|---------|
| **MAIL-ALIAS-01–03** | Livré | CRUD alias, domaine configurable UI, normalisation local-part |
| **MAIL-ALIAS-02** | Livré | Règle filtre auto à la création |
| **MAIL-ALIAS-04** | Partiel | Désactivation alias ↔ règle filtre (ce lot) |
| **MAIL-ALIAS-05** | À faire | MTA Cloudity (MX, routage `*@domaine-alias`) |
| **MAIL-ALIAS-06** | À faire | SPF, DKIM, DMARC sur le domaine alias |
| **AS-1** | À faire | Stack déployable preprod / prod (Portainer, sans secrets Git) |

## Principes non négociables

1. **Pas de perte de mail** : ne pas basculer les MX production tant que la procédure de bascule (**MAIL-ALIAS-RECEPTION.md**) n’est pas validée.
2. **Pas de secrets dans Git** : domaines réels, IP VPS, clés DKIM → Portainer / carnet local uniquement.
3. **Boîte IMAP inchangée** : Cloudity se superpose (sync, filtres, alias) ; la boîte chez l’hébergeur reste la source tant que l’option A (redirection) est utilisée.

## Court terme (sans MTA)

**Option A** — redirection registrar : alias `@<domaine-alias>` → boîte IMAP → enregistrer la même adresse dans Cloudity. Voir **MAIL-ALIAS-RECEPTION.md**.

## Moyen terme (maily / domaine alias dédié)

1. Déployer le stack **MTA** documenté dans **docs/operations/MAIL-MTA-PREPROD.md** (stub Maddy/Postfix).
2. DNS : MX, SPF, DKIM, DMARC sur `<domaine-alias>` (placeholders dans Git).
3. Backend : lookup `user_email_aliases` → injection vers boîte cible.

## Tests manuels

**MAIL-ALIAS-CHECKLIST.md** (C1–C7).

## Liens

- [MAIL-ALIAS-CHECKLIST.md](MAIL-ALIAS-CHECKLIST.md)
- [MAIL-ALIAS-RECEPTION.md](MAIL-ALIAS-RECEPTION.md)
- [MAIL-ALIAS-DEMARRAGE.md](MAIL-ALIAS-DEMARRAGE.md) (si présent)
- [../operations/MAIL-MTA-PREPROD.md](../operations/MAIL-MTA-PREPROD.md)
