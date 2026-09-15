# Email / note porteur — décisions suite Cloudity (avant implémentation)

**Date** : 15 septembre 2026  
**Destinataire** : toi (porteur) + agent Cursor Cloudity  
**Objet** : [Cloudity Suite] Audit VPS + satellites JT / Gasoil / PLM — **à trancher avant code**

---

## TL;DR

Les trois apps tournent **déjà** en stacks Docker **séparées** sur Contabo, avec **volumes nommés** (données critiques). Cloudity a déjà un monorepo + submodule JobbingTrack.  
**Ne rien fusionner / ne pas `down -v`** tant que les décisions ci-dessous ne sont pas cochées.

### Données à ne jamais perdre (mesuré VPS 15/09)

| Produit | Volume Docker | Taille | Stack Portainer |
|---------|---------------|-------:|-----------------|
| **YTMusic / PLM** | `ytmusic_ytmusic_data` | **~20,6 Go** | `ytmusic` |
| **GasoilTracking** | `gasoil_api_data` | **~8,9 Go** | `gasoil-tracking` |
| **JobbingTrack prod** | `jobbingtrack-prod_postgres_data` | ~537 Mo | `jobbingtrack-prod` |
| JobbingTrack preprod | `jobbingtrack-preprod_postgres_data` | ~465 Mo | `jobbingtrack-preprod` |
| JobbingTrack OTA prod | `jobbingtrack-prod_mobile_releases` | ~1,2 Go | idem |
| Cloudity | `cloudity_postgres_data` + `cloudity_mobile_data` | ~49 Mo + ~678 Mo | `cloudity` |

Serveur : ~29 Go RAM (≈8 Go used), disque ~43 % (479 Go / 1,2 To). Portainer CE **2.45.0** up.

---

## Comment développer (Cursor) — unitaire vs global

### Unitaire (quotidien, recommandé)

| App | Chemin | Commande |
|-----|--------|----------|
| Cloudity (plateforme) | `…/Cloudity/Cloudity` | `cursor .` |
| JobbingTrack | `…/Cloudity/Cloudity/products/jobbing-track` **ou** `…/Perso/JobbingTrack` | `cursor .` (même repo Git) |
| Gasoil | `…/Perso/GasoilTracking` (puis `products/fuel` quand submodule) | `cursor .` |
| YTMusic | `…/Perso/YTMusic` (puis `products/music`) | `cursor .` |

Commits = **dans le repo de l’app**. Branches `dev` (Gasoil a aussi `prod` / `preprod`).

### Global (suite)

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

Workspace actuel = Cloudity + JobbingTrack. Étendre quand `fuel/` et `music/` existent.

Après commit dans un submodule :

```bash
cd products/jobbing-track && git push origin dev
cd ../.. && git add products/jobbing-track && git commit -m "chore: bump jobbing-track" && git push
```

---

## Portainer / Git (règles absolues)

1. **Une stack = un produit** (`cloudity`, `jobbingtrack-prod`, `jobbingtrack-preprod`, `gasoil-tracking`, `ytmusic`).
2. Redeploy Git **sans** « Remove volumes ».
3. Backup volume **avant** toute manip destructive :  
   `docker run --rm -v VOL:/v -v /home/pavel/backups:/b alpine tar czf /b/VOL-$(date +%F).tgz -C /v .`
4. Chemins VPS utiles : `/home/pavel/stacks/`, `/home/pavel/apps/gasoil-tracking`.
5. Images : JT prod mélange encore `latest` / `dev` / `local-ops-*` — à normaliser **après** décisions tags.

---

## Ce que « JT sous Cloudity » veut dire

| Oui | Non |
|-----|-----|
| Submodule `products/jobbing-track` + workspace multi-root | Tout coller dans un seul conteneur |
| Continuer à coder JT **complet** (microservices + Flutter) | Perdre preprod ou fusionner Postgres |
| Plus tard : tuile hub + SSO **opt-in** | Forcer tous les users sur Cloudity ID |
| Déploiement Portainer **séparé** | Renommer les volumes Docker |

---

## Décisions à trancher (coche avant d’implémenter)

| # | Décision | Options | Reco agent | Ton choix |
|---|----------|---------|------------|-----------|
| D1 | Nom public de la suite | garder **Cloudity** / renommer (ex. Delhomme Suite) | Garder Cloudity pour l’instant | [ ] |
| D2 | Ordre d’intégration submodules | JT → Gasoil → PLM / autre | **JT d’abord** (déjà fait), puis Gasoil, puis PLM | [ ] |
| D3 | Preprod JT 24/7 | garder / n’allumer qu’à la demande | **Éteindre hors usage** (RAM/CPU) | [ ] |
| D4 | SSO Cloudity ID | jamais / opt-in / obligatoire | **Opt-in** ; auth locale inchangée | [ ] |
| D5 | Gasoil → Cloudity Maps | nouveau repo `maps/` vs réutiliser gasoil | **Nouveau `products/maps`** plus tard ; Gasoil reste stack | [ ] |
| D6 | PLM volume 20 Go | inchangé / migration stockage | **Inchangé** ; pas de copie parallèle | [ ] |
| D7 | Tags images JT | `latest` vs semver vs `prod` | **Semver / `prod`** + arrêt mix `dev` en prod | [ ] |
| D8 | Watchtower | off / filtré par stack | **Filtré**, jamais global | [ ] |
| D9 | Chemins locaux Perso/* | garder symlinks / n’utiliser que `products/` | Garde les deux jusqu’à stable, puis un seul | [ ] |
| D10 | Rename fichiers EN (JT) | maintenant / après tri structure | **Après** hygiene `.md` + triage | [ ] |

---

## Organisation cible des dossiers (logique)

```text
Cloudity/                          # meta-repo plateforme
├── Cloudity.code-workspace        # multi-root Cursor
├── backend/ … frontend/ …         # suite Cloudity
├── products/
│   ├── jobbing-track/             # submodule → JobbingTrack.git (FAIT)
│   ├── fuel/                      # submodule → GasoilTracking.git (À FAIRE)
│   └── music/                     # submodule → YTMusic.git (À FAIRE)
└── docs/ecosystem/                # rapports + décisions (ce fichier)

Perso/JobbingTrack                 # clone = même remote que products/jobbing-track
Perso/GasoilTracking
Perso/YTMusic
```

Sur le VPS : stacks inchangées ; le meta-repo **ne remplace pas** les volumes.

---

## Prochaines actions agents (après tes coches)

1. Cloudity : étendre workspace + submodules `fuel` / `music` **sans** toucher volumes.  
2. Script `backup-suite-volumes.sh` sur VPS.  
3. JT : hygiene docs (déjà en cours) + validation mobile Blackview.  
4. SSO / Mail bridge = features **flaggées**, pas migration forcée.

---

## Message à coller dans Cursor Cloudity

> Lis `docs/ecosystem/EMAIL-PORTEUR-DECISIONS-SUITE-2026-09-15.md` et `docs/cursor/BRIEF-INTEGRATION-SUITE.md`.  
> N’implémente **aucune** glue SSO / merge de DB / rename de volumes tant que D1–D10 ne sont pas tranchés.  
> Tu peux préparer : backup script, submodule Gasoil/PLM en **dry-run**, extension `Cloudity.code-workspace`.  
> JobbingTrack reste développable à 100 % via `products/jobbing-track` ou le clone Perso (même Git).

---

*Fin — met à jour ce fichier quand une décision est tranchée.*
