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

Référence : **[ENV-GENERATION.md](./docs/operations/ENV-GENERATION.md)** (guide complet) · **[SECRETS.md](./docs/securite/SECRETS.md)** · mTLS expliqué : **[MTLS-INTERNE.md](./docs/securite/MTLS-INTERNE.md)** § 0.

---

## Alias mail — cible produit (Pass ↔ Mail)

**Doc maître** : **[MAIL-ALIAS-VISION.md](./docs/produit/MAIL-ALIAS-VISION.md)** · pratique : **[MAIL-ALIAS-DEMARRAGE.md](./docs/produit/MAIL-ALIAS-DEMARRAGE.md)**.

| Priorité | Tâche | État |
|----------|--------|------|
| P0 | Comprendre l’écart : enregistrement Cloudity ≠ création MX/OVH | Doc ✅ |
| P0 | `MAIL_PASSWORD_ENCRYPTION_KEY` renseignée + boîtes sync | `make doctor` |
| P0 | `ALIAS_ENCRYPTION_KEY` renseignée (parité VPS) | `make ensure-alias-encryption-key` — **Go ne l’utilise pas encore** |
| P1 | **MAIL-ALIAS-01** — activer/désactiver alias | BACKLOG |
| P1 | **MAIL-ALIAS-02** — dossier/règle auto par alias | BACKLOG |
| P2 | **MAIL-ALIAS-05** — provision sans panneau OVH (API ou MTA **AS-1**) | BACKLOG |
| P2 | Envoi `From` + DKIM alignés sur `alias.*` | **MAIL-ALIAS-06** + **AS-1** |

**Chiffrement (état réel)** :

| Secret | Opérationnel ? |
|--------|----------------|
| Pass coffre (client) | Oui — Argon2id + XChaCha20-Poly1305 |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | Oui — MDP IMAP en base |
| `ALIAS_ENCRYPTION_KEY` | Non côté code — clé à garder pour la suite |

---

## Feuille de route déploiement (méthodique)

**Document détaillé avec cases ☐** : **[DEPLOIEMENT-SUIVI.md](./docs/operations/DEPLOIEMENT-SUIVI.md)** — à suivre depuis GitHub (web ou mobile).

| Phase | Objectif | Lien rapide |
|-------|----------|-------------|
| **A** | Local monorepo (`make up`, `make test`, `deploy-*`) | SUIVI § 2 |
| **B** | Git : PR → `dev` → `main`, GHA tests + `docker-publish` | SUIVI § 3 |
| **C** | Portainer : stacks **dev** / **preprod** / **prod** | SUIVI § 4 · **[PORTAINER-DELHOMME-OVH.md](./docs/operations/PORTAINER-DELHOMME-OVH.md)** § 0 |
| **D** | NPM + DNS + HTTPS | SUIVI § 5 |
| **E** | Android APK + `version.json` | SUIVI § 6 · **[RELEASE-AND-DISTRIBUTION.md](./docs/operations/RELEASE-AND-DISTRIBUTION.md)** |
| **F** | Mise à jour **un** service (quotidien) | SUIVI § 7 · `make deploy-web`, etc. |

**IP VPS (`VPS_PUBLIC_IP`)** : uniquement dans **Portainer → variables de stack**, pas dans Git. Voir PORTAINER § 0.

**Prochaine action suggérée** : Phase B — PR branche actuelle vers **`dev`** (code + doc déjà poussés).

---

## Déploiement (références rapides)

| Besoin | Doc / commande |
|--------|----------------|
| Hub 3 environnements | **[DEPLOIEMENT-ENVIRONNEMENTS.md](./docs/operations/DEPLOIEMENT-ENVIRONNEMENTS.md)** |
| Front / Mail / API seul | `make deploy-web` · `deploy-mail` · `deploy-gateway` |
| Secrets | `make secrets-print` → **Portainer** — **[ENV-GENERATION.md](./docs/operations/ENV-GENERATION.md)** |
| Monorepo | **[TRAVAIL-MONOREPO-MAINTENANT.md](./docs/decisions/multi-repo/TRAVAIL-MONOREPO-MAINTENANT.md)** |
| Compose Portainer (futur) | **[deploy/portainer/README.md](./deploy/portainer/README.md)** |

## Prod VPS (sécurité)

**[DEPLOIEMENT-VPS-PORTAINER-NPM.md](./docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** + **[HOMELAB-SECURITE.md](./docs/architecture/HOMELAB-SECURITE.md)** (Q15).

---

## URL-CAPABILITIES (post J7 bis)

Voir **[docs/securite/URL-CAPABILITIES.md](./docs/securite/URL-CAPABILITIES.md)** et **[BACKLOG.md](./BACKLOG.md)** (section UC-DOC / UC-FE).
