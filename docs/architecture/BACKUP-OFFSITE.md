# Cloudity — Backup distribué offsite (architecture)

**Rôle** : décrire le système de **sauvegardes** Cloudity quand le service tournera en production, avec une **machine de backup tierce** (raspberry pi, ordinateur fixe perso, NAS — **pas** sur le VPS de production), pilotable depuis le panel admin **et** depuis un petit panel local sur la machine de backup.

> Décision de référence : **[../decisions/multi-repo/REPONSES.md](../decisions/multi-repo/REPONSES.md)** § Q8 (réponse libre).  
> **Cadre matériel + réseau (homelab)** : **[HOMELAB-SECURITE.md](HOMELAB-SECURITE.md)** — décrit la Raspberry Pi cible, le branchement des 2 disques USB (1 To + 500 Go), le nettoyage préalable, la topologie réseau (3 scénarios A/B/C), le VPN WireGuard, la DMZ, et le monitoring.  
> Plan multi-repo qui contextualise ce module : **[MULTI-REPO-LAYOUT.md](MULTI-REPO-LAYOUT.md)** § 8.3.  
> Vision sécurité (chiffrement, mTLS, post-quantique) : **[../securite/SECURITE.md](../securite/SECURITE.md)**.

Ce document est une **note d'architecture**. Le code n'existe pas encore : il s'agit du cadre d'implémentation pour quand ce chantier démarrera (post-stabilisation Mail / Photos / Pass).

---

## 1. Pourquoi un agent **distant** plutôt qu'un conteneur sur le VPS ?

| Risque | Conteneur backup co-localisé | Agent offsite (cible) |
|--------|------------------------------|------------------------|
| Le VPS prend feu / est piraté / disque mort | Backups perdus en même temps | **Backups intacts** sur autre machine |
| Compromission ransomware sur le VPS | Restic chiffré OK, mais répertoire local accessible | Agent **pull** depuis l'extérieur, pas d'accès écrivable côté VPS |
| Attaque sur les credentials du backup | Compromis si stockés localement | Clé privée **sur la machine de backup uniquement** |
| Coût | Stockage payant côté hébergeur | Disque local sur raspberry / PC perso, gratuit |

⇒ La **machine de backup** est l'**initiateur** : c'est elle qui se connecte au VPS et **tire** (pull) les données. Le VPS ne sait pas où vont ses backups, il ne stocke aucune clé de déchiffrement.

---

## 2. Topologie cible

```
┌──────────── INTERNET ────────────┐
│                                  │
│   VPS Cloudity (production)      │
│   ├─ api-gateway (mTLS internal) │
│   ├─ admin-service               │
│   ├─ postgres (volume data)      │
│   ├─ drive blobs (volume)        │
│   ├─ photos blobs (volume)       │
│   ├─ mail attachments (volume)   │
│   └─ cloudity-backup-agent       │ ◄─── « source-side » : expose
│      (read-only data + RPC)      │      des dumps PG + tar streams
│                                  │      sur mTLS, en réponse à des
│                                  │      requêtes du backup runner
└──────────────────────────────────┘
            ▲
            │  HTTPS + mTLS (step-ca)
            │  ou tunnel WireGuard / SSH
            ▼
┌─────────── HOME / OFFSITE ───────┐
│                                  │
│   Raspberry Pi / PC fixe / NAS   │
│   ├─ cloudity-backup-runner      │ ◄─── « pull-side » : ordonnance,
│   │  (Go binary ou conteneur)    │      lance Restic, gère la
│   ├─ Restic repo (chiffré)       │      planification, garde les
│   │  └─ /var/backups/cloudity/   │      logs.
│   ├─ panel local (web)           │
│   │  http://backup.local:7080    │
│   └─ disque dédié (USB / NAS)    │
│                                  │
└──────────────────────────────────┘
```

**Deux composants** :

1. **`cloudity-backup-agent`** — petit service Go (~quelques centaines de lignes) **hébergé sur le VPS**, exposé en **mTLS interne**, expose :
   - `GET /backup/v1/postgres/dump` → stream `pg_dump --custom` ;
   - `GET /backup/v1/volumes/<nom>` → tar stream du volume (drive, photos, mail-attachments…) ;
   - `GET /backup/v1/health` → status / dernière exécution ;
   - `POST /backup/v1/quiesce` → demande à `admin-service` de mettre les services en lecture seule pendant la durée du dump (option, voir § 5).
2. **`cloudity-backup-runner`** — service installé **chez toi** (machine offsite), tourne en background, expose :
   - un **panel web** local (`http://backup.local:7080`) — historique, actions « lancer maintenant », « restaurer », plan ;
   - une API consommée par **`admin-service`** côté VPS — c'est l'**inverse** du flux principal, le VPS interroge l'agent runner via une connexion établie et maintenue en mode reverse.

> Le mode « `admin-service` consomme l'agent runner offsite » est délicat (NAT, IP dynamique côté maison). Solution : **WireGuard** ou **un canal long-lived** initié par le runner (websocket / gRPC streaming) et terminé sur la gateway. À détailler en POC.

---

## 3. Pilotage UI

### 3.1 Côté admin Cloudity (`/4dm1n/backups`)

- **Vue d'ensemble** : dernier backup réussi, taille, durée, prochain plan.
- **Bouton** « lancer maintenant » → admin-service envoie un ordre au runner offsite (via canal long-lived) ; le runner déclenche un cycle complet (snapshot Postgres, tar volumes, push Restic).
- **Restauration** : sélection d'un point dans l'historique → admin-service marque la stack en lecture seule, le runner pousse les fichiers via l'agent VPS (en sens inverse, mTLS), admin-service redémarre les conteneurs.
- **Alertes** : « pas de backup depuis 48 h », « répertoire Restic plein », « checksum invalide ».

### 3.2 Côté local sur la machine de backup

Petit panel autonome (port 7080) :

- même historique que côté admin, accessible si le VPS est down ;
- actions de maintenance qui n'ont pas de sens depuis le VPS : forget / prune Restic, intégrité (`restic check`), ajout d'un disque externe USB ;
- configuration : URL du VPS, certificats mTLS, clé Restic (générée lors de l'install et **jamais exportée**).

---

## 4. Sécurité

| Aspect | Choix |
|--------|-------|
| **Transport VPS ↔ runner** | mTLS via **step-ca** (cf. **[../securite/MTLS-INTERNE.md](../securite/MTLS-INTERNE.md)**) **ou** WireGuard avec clés publiques préagréées. |
| **Authentification du runner** | Certificat client signé par step-ca, identifiant unique du runner. Admin-service liste les runners autorisés. |
| **Chiffrement des sauvegardes** | **Restic** (AES-256 + Poly1305-Chacha20). Passphrase **dérivée par Argon2id** (déjà cohérent avec Pass). Une seule machine connaît la passphrase : le runner. |
| **Intégrité** | `restic check` automatique chaque semaine ; alerte si KO. |
| **Verrouillage** | Si la machine de backup est compromise, l'attaquant peut détruire les backups locaux mais **ne peut pas** modifier les données du VPS (l'agent VPS expose en read-only via les routes `GET`). |
| **Rotation** | Plan Restic : `keep-daily 7 keep-weekly 4 keep-monthly 12 keep-yearly 5`. |

---

## 5. Cohérence des dumps Postgres

Pour un dump cohérent sans freeze des services :

1. `pg_dump --jobs=4 --format=custom` (PG 15 supporte les dumps online sans verrouiller les lignes longues durations).
2. Pour les volumes Drive / Photos / Mail attachments : `tar` avec `--atime-preserve` ; les fichiers concurrents en cours d'écriture peuvent être incohérents → ajouter une **fenêtre de quiesce** optionnelle (le runner demande à l'admin-service de mettre uploads en pause 2–5 min, le temps du tar).

Ou plus simple à long terme : **filesystem snapshots** (LVM ou ZFS) côté VPS et tar du snapshot.

---

## 6. Installation chez l'utilisateur

Cible : 1 commande sur la raspberry / PC.

```bash
curl -sSL https://cloudity.example.com/get-backup.sh | sudo sh
# - télécharge le binaire cloudity-backup-runner
# - crée un user système, un service systemd
# - génère une keypair, demande au VPS un certificat client (mTLS bootstrap one-shot)
# - propose une URL pour le panel local (http://<host>:7080)
```

Le binaire sera publié comme **release GitHub** (cf. Q4=B publication publique) sur le futur dépôt `cloudity-backup-runner`. Image alternative : `docker run` pour Linux conteneurisés.

---

## 7. Roadmap d'implémentation (à mettre dans BACKLOG quand actionnable)

1. **POC tunnel** WireGuard ou reverse-RPC (gRPC streaming) pour la liaison persistante VPS ↔ runner.
2. **Agent VPS** (`cloudity-backup-agent`) en Go, exposé en mTLS interne, avec `pg_dump` + tar volumes.
3. **Runner offsite** (`cloudity-backup-runner`) : binaire Go, panel web minimal, intégration Restic, planification cron interne.
4. **Intégration `admin-service`** : route `/admin/backups/*` qui pilote le runner, vue dans `/4dm1n/backups` (web).
5. **Documentation utilisateur** : tutoriel d'installation sur Raspberry Pi OS / Debian / Fedora.
6. **Tests d'intégration** : scénario complet backup + restauration sur une stack jetable.

> Cette roadmap démarre **après** stabilisation Mail / Photos / Pass (cf. Q9=D pour extension Pass + desktop). En attendant, on garde des **dumps PG manuels** (cible : `make backup` ; cf. backlog).

---

*Document à mettre à jour quand le POC démarre. Pour les choix de TLS / signatures / post-quantique, rester aligné avec **[../securite/SECURITE.md](../securite/SECURITE.md)** § 8.*
