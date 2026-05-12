# Réponses — questionnaire multi-repos

**Mode d’emploi** : remplis ce fichier puis pousse-le (ou colle-moi son contenu en chat). Dès que la **synthèse Q1–Q10** est renseignée, l’agent enchaîne sur la **Phase 0** décrite dans **[../../architecture/MULTI-REPO-LAYOUT.md](../../architecture/MULTI-REPO-LAYOUT.md)** § 4.

Voir le détail des options dans **[QUESTIONNAIRE.md](QUESTIONNAIRE.md)**.

---

## Synthèse rapide *(obligatoire)* — **bloc 1 : multi-repo (complet au 2026-05-12)**

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

## Synthèse rapide — **bloc 2 : homelab / sécurité résidentielle (complet au 2026-05-12)**

Cadre détaillé : **[../../architecture/HOMELAB-SECURITE.md](../../architecture/HOMELAB-SECURITE.md)**.

```
Q11=A   scénario réseau MINIMAL : RPi simple serveur backup sur LAN + WireGuard
        (box FAI inchangée, pas de filtrage du trafic foyer pour démarrer)
Q12=A   hub USB 3.0 alimenté (~25 €) + disques USB tels quels
Q13=B   WireGuard + Headscale self-hosted (sans cloud tiers, scalabilité prévue)
Q14=A   nettoyage outillé : ncdu + rmlint + tar.zst -19 + LUKS + ext4
Q15=A   homelab avant prod : pas de mise en prod Cloudity tant que H1 (RPi backup
        opérationnelle) n'est pas livrée
```

## Synthèse rapide — **bloc 3 : crypto applicative & edge (complet au 2026-05-12)**

Cadre : **[../../securite/CRYPTO-NORME.md](../../securite/CRYPTO-NORME.md)** ; edge : **[../../securite/REVERSE-PROXY.md](../../securite/REVERSE-PROXY.md)** ; WebAuthn : **[../../securite/WEBAUTHN-PLAN.md](../../securite/WEBAUTHN-PLAN.md)**.

```
Q16=A   JWT EdDSA : phase A+B maintenant (auth-service signe EdDSA ; gateway accepte
        EdDSA + RS256 legacy kid-aware) ; phase C retrait RS256 après ~30 jours
Q17=A   WebAuthn / passkeys : d’abord /4dm1n web (admins), extension users après validation
Q18=A   HTTP/3 (QUIC) : actif dès mise en prod (reverse-proxy)
Q19=A   TLS hybride PQ X25519MLKEM768 : actif dès mise en prod (reverse-proxy)
Q20=A   gosec : intégré à make test-security (warnings par défaut ; GOSEC_BLOCKING=1 pour fail)
```

## Synthèse rapide — **bloc 4 : déploiement VPS / Portainer / NPM (en attente — questions Q21-Q24)**

Cadre : **[../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)**.

Contexte VPS observé au 2026-05-12 : Contabo, Portainer, NPM `nginx.delhomme.ovh`, stacks `cooking-recipes` / `cyna-production` / `n8n-stack` / `nextcloud-stack`. Registry Docker Hub `paveldelhomme/*`. Réseaux partagés `web` (cookingrecipes) et `shared-network-copy` (cyna, n8n). Pattern domaines `*.delhomme.ovh`.

```
Q21=?   registry images Cloudity : Docker Hub (cohérence cookingrecipes/cyna)
        vs GHCR vs hybride
Q22=?   réseau edge NPM : réutiliser `web` (recommandé) vs `shared-network-copy`
        vs créer `cloudity-edge` dédié
Q23=?   pattern domaine : `cloudity.delhomme.ovh` + sous-domaines vs TLD dédié
        vs hybride (delhomme.ovh d'abord, TLD plus tard)
Q24=?   build & push : GitHub Actions sur tag vs manuel docker push vs hybride
```

### Conséquences directes des choix Q11–Q15

| Choix | Conséquence concrète |
|-------|----------------------|
| **Q11=A** | On retient le scénario A de **HOMELAB-SECURITE § 3.1**. Pas de bridge box FAI, pas de nftables routeur, pas de Pi-hole pour démarrer. Possibilité de monter en B/C plus tard sans casser ce qui aura été livré. |
| **Q12=A** | Achat à prévoir : **hub USB 3.0 alimenté 4 ports 5V/4A** (~25 €) — ex. Anker, Sabrent, Inateck. Disques USB connectés tels quels. |
| **Q13=B** | Headscale tournera comme **conteneur** sur la RPi (ou plus tard sur le VPS prod). Côté RPi : `headscale` + `wireguard` mais pilotés par Headscale plutôt que des `.conf` à la main. Permet d'ajouter/retirer des peers (PC fixe, smartphone, futur VPS, futurs peers familiaux) via une UI ou CLI sans toucher manuellement les configs WireGuard. |
| **Q14=A** | Procédure complète de **HOMELAB-SECURITE § 2** appliquée. **LUKS obligatoire** sur les 2 disques (chiffrement at-rest) — déchiffrage via clé sur SD card RPi (compromis ergonomie) ou via SSH `dropbear-initramfs`. |
| **Q15=A** | **Bloquant pour la mise en prod** : tant que la phase H1 (RPi + runner backup opérationnels + WireGuard + Headscale) n'est pas livrée, **on ne déploie pas Cloudity sur un VPS public**. Ça donne un ordre d'attaque clair pour les sprints qui mèneront à la prod. |

### Achats à valider (selon Q11=A + Q12=A)

- [ ] **Hub USB 3.0 alimenté 4 ports** (5V/4A, marque réputée) — ~25 €
- [ ] *(Optionnel)* **SSD M.2 USB 256 Go** pour remplacer la carte SD de la RPi (durée de vie sous écriture intensive) — ~40 €
- [ ] *(Optionnel)* **Boîtier RPi avec dissipation passive** (Argon ONE M.2, FLIRC) — ~30–50 €
- [ ] *(Optionnel)* **UPS 600 VA** pour protéger la RPi des coupures secteur — ~70 €

> Total minimum : ~25 €. Total recommandé (avec SSD et UPS) : ~135 €.

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
