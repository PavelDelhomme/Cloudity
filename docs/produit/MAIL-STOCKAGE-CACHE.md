# Mail — cache PostgreSQL et boîte fournisseur

## Aujourd’hui (implémenté)

1. **Sync IMAP** (`POST /mail/me/accounts/:id/sync`) : en-têtes des ~300 derniers messages par dossier standard → table **`mail_messages`** (sujet, from, to, **`date_at`**, uid, dossier).
2. **Ouverture d’un message** : si le corps manque, téléchargement **RFC822** depuis IMAP → `body_plain` / `body_html` / pièces jointes en base.
3. **Affichage « Reçu »** : uniquement **`date_at`** (date message IMAP), pas `created_at` (heure de sync).

## Problème quota fournisseur (objectif produit)

Réduire la dépendance au stockage limité chez OVH/Gmail/etc. :

| Phase | Comportement cible |
|-------|-------------------|
| **Court terme** | Cloudity = **cache** complet en PostgreSQL ; IMAP reste source de vérité |
| **Moyen terme** (**MAIL-STOR-01**) | Politique de rétention : après N jours + copie en base, **option** de purge côté IMAP (dossier par dossier, opt-in) |
| **Long terme** | MTA Cloudity (**AS-1**) : réception directe, IMAP optionnel pour migration |

## Ce qui n’est pas fait

- [ ] Purge automatique IMAP après archivage Cloudity
- [ ] Quotas par compte / compression corps
- [ ] Stockage objet (S3/MinIO) pour gros PJ

Voir **BACKLOG** : **MAIL-STOR-01**, **AS-1**.

## Après correction dates (mai 2026)

Si « Reçu : — » : lancer **Actualiser (IMAP)** après `make deploy-mail` — la sync récupère `Date` (enveloppe, InternalDate, ou en-tête `Date`).
