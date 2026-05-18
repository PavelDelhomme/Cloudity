# CLOUDITY — Suivi court (micro-tâches)

**Rôle** : cases rapides et liens ; le détail produit reste dans **[BACKLOG.md](./BACKLOG.md)**, le fil quotidien dans **[STATUS.md](./STATUS.md)**.

---

## Avant session

1. **`git status`** — branche alignée avec le chantier (**[docs/GIT.md](./docs/GIT.md)**).
2. **`docker info`** puis **`make test`** (barrière merge) — **[docs/operations/DEV-VERIFICATION.md](./docs/operations/DEV-VERIFICATION.md)** § 0.
3. Relire **[STATUS.md](./STATUS.md)** § *À faire maintenant*.

---

## `.env` / secrets (alignement `.env.example`)

| Besoin | Commande |
|--------|----------|
| Nouveau fichier `.env` complet (CSPRNG) | **`make secrets`** (échoue si `.env` existe — utiliser **`./scripts/dev/gen-secrets.sh --force`** en connaissance de cause : **écrase** le fichier). |
| Afficher un jeu de secrets **sans** écrire | **`make secrets-print`** |
| Clé IMAP/SMTP (64 hex) manquante ou placeholder | **`make ensure-mail-encryption-key`** |
| `ALIAS_ENCRYPTION_KEY` vide (parité VPS / futur) | **`make ensure-alias-encryption-key`** |
| Clé mail + recréer `mail-directory-service` + build extension Pass | **`make doctor`** (= **`make stack-heal`**) — succès = uniquement des **✅** en sortie ; l’avertissement **icons/** de l’extension est bénin. |
| Sync IMAP encore en erreur après rotation de clé | Ré-enregistrer le **mot de passe** de la boîte dans l’UI Mail — le ciphertext en base était chiffré avec l’ancienne clé. |
| Boîte sans secret IMAP (`imap_auth_ready: false`) | Pas de sync auto ni 400 en boucle — **Paramètres Mail → Sync avec mot de passe…** une fois ; la modale ne se rouvre qu’une fois par session et par boîte. |
| **J8 Pass / Proton** | `make pass-j8-prep` puis runbook **SPRINT-PASS-2026-05.md** § 3 bis (import ≥50, 2FA, mobile lecture, bascule). |

Référence : **[docs/securite/SECRETS.md](./docs/securite/SECRETS.md)**.

---

## Prod VPS

Checklist : **[docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](./docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** + **[docs/architecture/HOMELAB-SECURITE.md](./docs/architecture/HOMELAB-SECURITE.md)** (Q15).

---

## URL-CAPABILITIES (post J7 bis)

Voir **[docs/securite/URL-CAPABILITIES.md](./docs/securite/URL-CAPABILITIES.md)** et **[BACKLOG.md](./BACKLOG.md)** (section UC-DOC / UC-FE).
