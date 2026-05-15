# Messagerie : chiffrement, anti-spam et envoi fiable

**Rôle** : clarifier comment le **chiffrement** (Pass vs Mail) et l’**anti-spam** coexistent **sans** que l’utilisateur se retrouve dans une situation où « tout est sécurisé mais je ne peux plus envoyer de mail ».

**Architecture anti-spam multi-couches (HTTP + SMTP)** : **[../architecture/ANTI-SPAM-ET-ABUS.md](../architecture/ANTI-SPAM-ET-ABUS.md)**.

---

## 1. Trois « chiffrements » différents (ne pas les mélanger)

| Sujet | Où | Ce que le serveur voit | Statut Cloudity |
|-------|-----|------------------------|-----------------|
| **Secrets boîte mail** (mot de passe IMAP/SMTP, refresh OAuth) | PostgreSQL, champs chiffrés | Blob chiffré (**AES-256-GCM** avec `MAIL_PASSWORD_ENCRYPTION_KEY`) | **Déjà en place** — voir **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)** § « Chiffrement applicatif au repos (Mail) » |
| **Coffre Pass** (mots de passe tiers, notes) | `pass_items.ciphertext` | **Opaque** — clé maître **côté client** (spec **[PASS-CRYPTO.md](PASS-CRYPTO.md)**) | **MVP web + mobile lecture** ; pas de confusion avec SMTP |
| **Corps des e-mails** (S/MIME, OpenPGP) | Client MUA ou plugin | Optionnel ; interop et UX lourdes | **Long terme** — même vision que **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)** § long terme « Mail E2E » |

**Conséquence** : « S’appuyer sur le chiffrement Pass pour chiffrer les mails » au sens **E2EE du contenu** n’est **pas** un remplacement du pipeline SMTP standard : les destinataires externes attendent du **MIME/TLS**. Le Pass protège les **secrets** (identifiants) et les **objets coffre**, pas le flux MIME entrant/sortant **sans** couche dédiée (S/MIME/OpenPGP).

---

## 2. TLS et délivrabilité (envoi qui « marche »)

- **En transit** : TLS entre Cloudity et les fournisseurs (SMTP submission, IMAP) est la **base** de la délivrabilité et de la confidentialité transport.
- **Anti-spam côté sortant** : SPF/DKIM/DMARC alignés, pas d’open relay, **rate limit** sur `POST /mail/me/send` — sinon la **réputation** de l’IP/domaine se dégrade et les mails **bounce** ou atterrissent en spam **chez le destinataire** (problème distinct du filtrage entrant).

---

## 3. Anti-spam sans bloquer l’utilisateur légitime

Principes :

1. **Quarantaine / dossier Spam** plutôt que **silence** (pas de « trou noir » sans feedback).
2. **Ham / spam** explicite dans l’UI (ré-apprentissage Rspamd / dossier utilisateur) — roadmap **M7**.
3. **Faux positifs** : possibilité de marquer « pas spam », traçabilité minimale (audit).
4. **Couche HTTP** (gateway) et **couche MTA** (Rspamd) sont **complémentaires** : l’une ne remplace pas l’autre.

Si un jour un **scoring ML** (`antispam-service`) est ajouté, il doit avoir **timeout + fallback** pour ne pas bloquer le chemin critique d’envoi lorsque le service ML est lent ou down.

---

## 4. Données sensibles et ML

Tout modèle qui consomme le **contenu** des mails doit être **compatible** avec la politique de confidentialité affichée aux utilisateurs. En **E2EE corps** (futur), le serveur ne voit pas le plaintext : le ML ne pourra s’appuyer que sur **métadonnées** (tailles, horodatages, graphe d’envoi, entêtes non chiffrées) ou sur des **labels** côté client (feedback chiffré — sujet de recherche).

---

## 5. Liens

- **[ANTI-SPAM-ET-ABUS.md](../architecture/ANTI-SPAM-ET-ABUS.md)** — couches L0–L4, phasage AS-0..AS-5, Redis, Rspamd, option River/MLflow.
- **[PASS-CRYPTO.md](PASS-CRYPTO.md)** — format coffre Pass.
- **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)** — chiffrement au repos, pistes mail E2E.
- **[SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** — sync Mail, pièces jointes, archivage.

---

*À mettre à jour lors du branchement Postfix/Dovecot/Rspamd ou de l’introduction d’un scoring ML.*
