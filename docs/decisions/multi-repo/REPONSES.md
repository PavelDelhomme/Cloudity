# Réponses — questionnaire multi-repos

**Mode d’emploi** : remplis ce fichier puis pousse-le (ou colle-moi son contenu en chat). Dès que la **synthèse Q1–Q10** est renseignée, l’agent enchaîne sur la **Phase 0** décrite dans **[../../architecture/MULTI-REPO-LAYOUT.md](../../architecture/MULTI-REPO-LAYOUT.md)** § 4.

Voir le détail des options dans **[QUESTIONNAIRE.md](QUESTIONNAIRE.md)**.

---

## Synthèse rapide *(obligatoire)* — **complète au 2026-05-12**

```
Q1=A    polyrepo + meta-repo + git submodule
Q2=D    monorepo backend (cloudity-backend) — pas de scission service par service
Q3=A    un dépôt par app mobile Flutter
Q4=B    publication publique (npm.org + pub.dev + tags Go publics)
Q5=A    infrastructure/ reste dans le meta-repo
Q6=B    CI principalement meta-repo (jobs clonant les sous-dépôts)
Q7=C    stacks Portainer par domaine produit (Mail / Drive / Pass / Photos / Office / Identity / Infra)
Q8=*    architecture custom — voir docs/architecture/BACKUP-OFFSITE.md
Q9=D+T3 extension Pass + desktop Linux : plus tard, stack à arbitrer
Q10=A   Phase 0 immédiate (pkg/dbpin + versionnage libs)
```

---

## Texte libre *(optionnel — 5 lignes max, dans l’ordre)*

```
1. (libre — à compléter si besoin)
2. (libre — à compléter si besoin)
3. (libre — à compléter si besoin)
4. (libre — à compléter si besoin)
5. (libre — à compléter si besoin)
```

---

## Notes / divergences éventuelles

### Q4 — publication publique des libs partagées

`@cloudity/shared`, `cloudity_shared` (Dart) et les modules Go (`internalsec`, futur `cloudity-pkg-dbpin`) seront publiés en **public** sur npm.org / pub.dev / GitHub. Conséquence : leur code sera visible publiquement avant que l'ensemble du dépôt ne soit ouvert. À garder en tête en y mettant **uniquement** des helpers neutres (pas de schéma DB sensible, pas de secrets, pas de logique métier propre à un tenant).

### Q7 — stacks Portainer par domaine

Découpage cible (à affiner) :

| Stack | Conteneurs |
|-------|-----------|
| `cloudity-infra` | postgres, redis, step-ca (option), reverse-proxy/NPM si pas externe |
| `cloudity-identity` | api-gateway, auth-service, admin-service |
| `cloudity-mail` | mail-directory-service |
| `cloudity-drive` | drive-service, photos-service (Drive est le backing store) |
| `cloudity-pass` | passwords-service |
| `cloudity-comm` | calendar-service, contacts-service, notes-service, tasks-service |
| `cloudity-web` | cloudity-web (SPA + bundle admin) |
| `cloudity-backup` | agent backup (cf. Q8 ci-dessous) |

Le `docker-compose.yml` actuel devient un **fragment** de référence pour le dev local, et chaque stack Portainer reprend la sous-section correspondante avec **réseaux Docker partagés** pour que la gateway puisse joindre tous les services applicatifs.

### Q8 — architecture backup distribué (réponse libre)

> Système dédié, facilement configurable pour n'importe quel Linux, lance des backups automatisés à distance vers une **machine de backup tierce** (raspberry, ordinateur fixe perso, NAS — **pas** sur le VPS de prod).
>
> Pilotage **double** :
> - depuis le **panel admin Cloudity** (`/4dm1n/backups`) qui passe par `admin-service` → API → agent distant ;
> - depuis un **petit panel local** sur la machine de backup (raspberry / PC) pour les opérations courantes (lancer, restaurer, voir l'historique).
>
> L'agent doit pouvoir s'**installer facilement** sur la machine cible (script d'installation + binaire ou conteneur), maintenir une **liaison sécurisée** (mTLS via step-ca, ou tunnel WireGuard / SSH) avec le VPS, et permettre :
> - **backup à tout moment** (manuel ou programmé) — Postgres dump + volumes Drive/Mail/Photos en Restic chiffré ;
> - **rollback** — sélection d'un point de restauration et application contrôlée ;
> - **monitoring** — dernière sauvegarde réussie, taille, durée, intégrité.

→ Architecture détaillée : **[../../architecture/BACKUP-OFFSITE.md](../../architecture/BACKUP-OFFSITE.md)** (créé en même temps que ce fichier).

### Q9 — Extension Pass + desktop Linux

Reportés **après** stabilisation Mail / Photos / Pass web (D). Choix Tauri vs Electron sera tranché par un **POC court** quand la décision deviendra actionnable (T3) — critères pré-vus : taille du binaire, intégration system tray, support des notifications natives Linux, signature de paquets `.deb`/`AppImage`.

### Q10 — Phase 0 immédiate

Démarrage **maintenant** de :

1. Extraction de `backend/pkg/dbpin` (module Go partagé) — casse la duplication des 7 copies actuelles.
2. Versionnage `internalsec` `v0.1.0` (lib Go).
3. Versionnage `@cloudity/shared` `v0.1.0` (npm — préparation, publication effective une fois l'org GitHub fixée).
4. Versionnage `cloudity_shared` `v0.1.0` (Dart — idem).
5. Esquisse de `docs/cloudity-api-contracts/` (OpenAPI par service public via la gateway).

---

*Si une décision change, mets à jour ce fichier puis indique-le dans `BACKLOG.md` (section « Architecture multi-repos GitHub »). Voir `docs/architecture/MULTI-REPO-LAYOUT.md` pour le détail technique de chaque phase.*
