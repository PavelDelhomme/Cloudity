# Backup homelab — roadmap (phase tardive)

**Statut** : cadrage — **pas de implémentation** dans le sprint alias mail.  
**Règle** : aucune IP, hostname VPS réel ou chemin personnel dans Git.

## Objectif

Sauvegardes **chiffrées** et **hors VPS** (ex. Raspberry Pi sur LAN), pilotables depuis l’admin Cloudity plus tard.

## Architecture cible (résumé)

| Composant | Rôle |
|-----------|------|
| **Restic** | Snapshots incrémentaux, chiffrement repo (AES-256 / ChaCha20-Poly1305) |
| **WireGuard** ou **Headscale** | Tunnel VPS ↔ homelab sans exposer le backup sur Internet |
| **Volumes** | Postgres, mail, drive, photos, pass (selon politique) |
| **UI** | Panel `/4dm1n/backups` + agent local (cf. décisions existantes) |

## Déjà documenté dans le monorepo

- **[BACKUP-OFFSITE.md](BACKUP-OFFSITE.md)** — agent backup distribué, panel admin
- **[HOMELAB-SECURITE.md](HOMELAB-SECURITE.md)** — phases H0/H1, WireGuard, Q15 (prod après backup RPi)
- **QUESTIONNAIRE.md** § Q10, Q14 — Restic, procédure disques

## Backlog

- **BACKLOG** : aligner un ticket dédié si besoin (`BACKUP-HOMELAB-01`) — sinon réutiliser les entrées backup / homelab existantes.
- **Post-quantique** : à l’étude (Kyber pour échange de clés VPN) — **ne pas** bloquer le MVP mail.

## Priorité

Après : checklist alias **C1–C7**, PR `dev`, MTA (**AS-1**), déploiement VPS documenté.
