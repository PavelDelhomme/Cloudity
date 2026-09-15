# Cloudity Suite — état global (15 septembre 2026, soir)

**Branche Cloudity** : `chore/restructure-platform`  
**Workspace** : `Cloudity.code-workspace` (4 racines)  
**Objectif de ce document** : savoir où on en est, ce qui est fait, ce qui reste, sans rejouer tout l’historique chat.

---

## 1. Vision en une phrase

**Cloudity** = cœur (auth, mail, drive, pass, agenda, notes, tasks, contacts, photos) + **cadre** pour des produits satellites en **submodules** sous `products/`, stacks Portainer **séparées**, volumes Docker **intouchables**, SSO **opt-in** plus tard.

Développement cible quotidien : **un seul chemin** = `/home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/…`  
Les clones `/Perso/JobbingTrack`, `/Perso/GasoilTracking`, `/Perso/YTMusic` = même remote, à éviter au quotidien pour ne pas diverger.

---

## 2. Carte `products/` (état actuel)

| Dossier | Produit | Repo GitHub | Branche travail | Statut |
|---------|---------|-------------|-----------------|--------|
| `jobbing-track/` | JobbingTrack | `PavelDelhomme/JobbingTrack` | `dev` | Submodule actif |
| `GasoilTracking/` | GasoilTracking | `PavelDelhomme/GasoilTracking` | `dev` (prod = ship) | Submodule actif (ex-`fuel/`) |
| `YTMusic/` | PLM / YTMusic | `PavelDelhomme/YTMusic` | `dev` | Submodule actif (ex-`music/`) |
| `maps/` | Cloudity Maps | — | — | **Placeholder** README seulement |
| `fuel` → `GasoilTracking` | alias symlink local | — | — | Confort chemins anciens |
| `music` → `YTMusic` | alias symlink local | — | — | Idem |

**Pas** de nesting `music/YTMusic` ni rename immédiat en `fuels/` / `Jobs/` : un submodule = un dossier plat ; renommer encore = coût sans gain runtime.

---

## 3. Ce qui a été fait aujourd’hui (session)

### 3.1 Intégration suite / Git

- Submodules Gasoil + YTMusic branchés dans Cloudity ; renommage **fuel→GasoilTracking**, **music→YTMusic**.
- Workspace Cursor à 4 racines ; docs Cursor / brief / README products alignés.
- Commits Cloudity sur `chore/restructure-platform` (push GitHub).

### 3.2 Gasoil — catalogue phases B + C

- Seed enrichi (~332 presets, vieux FR + 2024/2025), alias recherche.
- `GET /api/vehicle-catalog` (ETag) + cache app 7 j + JSON `api/data/vehicle-catalog.json`.
- Merge **prod → dev** (1.4.137) présent sur le submodule Cloudity `dev`.

### 3.3 Identité / SSO (fondations seulement)

- Doc [`CLOUDITY-AUTH-PLM.md`](CLOUDITY-AUTH-PLM.md) : lien opt-in Cloudity Auth ↔ users PLM.
- SDK stub [`platform/identity-sdk/`](../../platform/identity-sdk/).
- Migration Postgres prête (pas encore appliquée en prod) : `50-identity-app-links.sql`.
- **Auth locale de chaque app reste le défaut.**

### 3.4 Ops (reco autre IA intégrées)

- Script [`scripts/ops/backup-suite-volumes.sh`](../../scripts/ops/backup-suite-volumes.sh) (dry-run / `--run`, **jamais** prune).
- Doc [`OPS-SUITE-BACKUP-CI-RESEAU.md`](OPS-SUITE-BACKUP-CI-RESEAU.md) : rollback submodule, `.env` multi-root, CI par satellite, `cloudity-bridge`, contrat JWT.
- Brief Cursor mis à jour.

### 3.5 PLM — installs appareils

| Appareil | PLM prod `ovh.delhomme.ytmusic` |
|----------|----------------------------------|
| Blackview BV9700Pro | OK — API `https://ytmusic.delhomme.ovh` |
| Samsung S21 FE | OK |
| Nothing Phone (A059, ADB Wi‑Fi) | OK — `p+1.3.239` |
| AVD temporaire API 34 | OK smoke puis **AVD supprimé** ; diag conservé |

Diagnostics AVD : [`diagnostics/avd-plm-temp-20260915.md`](diagnostics/avd-plm-temp-20260915.md).

### 3.6 Problèmes ADB / émulateur documentés

1. Double ADB (`/usr/bin/adb` vs SDK) → préférer `$ANDROID_HOME/platform-tools/adb`.
2. Ne pas `killall adb/emulator` pendant un boot.
3. Snapshots `Cloudity_S21_FE` parfois incompatibles → cold boot.
4. Smoke AVD fiable : headless + swiftshader + `setsid` + `-dns-server 8.8.8.8`.

---

## 4. Ce qui ne change pas (rappel volumes)

| Volume | Produit | Règle |
|--------|---------|--------|
| `gasoil_api_data` (~9 Go) | Gasoil | **Jamais** Remove |
| `ytmusic_ytmusic_data` (~21 Go) | PLM | **Jamais** Remove |
| JT postgres | JobbingTrack | Stacks séparées |
| `cloudity_postgres_data` / `cloudity_mobile_data` | Cœur | Idem |

Stacks Portainer = **une stack par produit**. Un bump submodule Cloudity **ne rebuild pas** toutes les images.

---

## 5. Où on en est par produit

### Cloudity (cœur)

- Suite mail / drive / apps mobiles : vivante (hors scope détail de ce soir).
- Auth-service : JWT / 2FA / passkeys existants.
- SSO satellites : **pas encore branché runtime** (docs + migration + SDK seulement).

### JobbingTrack

- Submodule `dev` aligné.
- Clone Perso typiquement à jour après pull.
- Rôle : satellite métier ; SSO plus tard.

### GasoilTracking

- Code catalogue B/C sur `dev` Cloudity.
- Ship Portainer reste sur branche / tags **prod**.
- Nav OSM / Leaflet dans Gasoil ; **Cloudity Maps** pas démarré.

### YTMusic / PLM

- Submodule `products/YTMusic` = chemin canonique.
- APK prod installée sur lab (Nothing, Blackview, Samsung).
- Volume média critique intact.

### Maps

- Placeholder uniquement.
- Décision : futur `products/maps` (OSM / MapLibre), Waze = deep-link seulement.

---

## 6. Reste à faire (priorisé)

### P0 — Ops / sécurité données

1. **Sur le VPS** : dry-run puis `--run` de `backup-suite-volumes.sh` ; **copie hors VPS** (restic→S3 = étape encore non codée).
2. Ne jamais tester un restore sans smoke login user réel.

### P1 — Habitude dev

3. Ouvrir **uniquement** `cursor Cloudity.code-workspace` (ou `products/X`) ; arrêter les clones Perso au quotidien.
4. Après commit satellite : `git push` produit → bump SHA submodule dans Cloudity.

### P2 — Produit

5. Gasoil : déployer API catalogue en prod quand tu ships (`/api/vehicle-catalog` + image avec `api/data/`).
6. PLM : continuer features / QA sur `products/YTMusic` ; deploy avant tag si flux habituel.
7. JT : validation mobile Blackview / backlog produit (hors restructure).

### P3 — Suite / plateforme

8. SSO phase 2 : `POST` link Cloudity↔PLM derrière `CLOUDITY_SSO_ENABLED` (préprod d’abord).
9. Réseau `docker network create cloudity-bridge` sur VPS (anticipation hub).
10. Créer repo + submodule **Cloudity Maps** quand Gasoil/PLM stables.
11. Intégrations OSS futures (Trello, etc.) = **nouveaux** `products/` isolés, même modèle.

### Non prioritaires (noter seulement)

- Renommer en `fuels/` / `Jobs/` / `music/YTMusic`.
- Fusion forcée des bases users.
- Mega-CI Cloudity qui rebuild tout à chaque bump.

---

## 7. Comment ouvrir demain matin

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

Guides :

- [`docs/cursor/COMMENT-OUVRIR-CURSOR.md`](../cursor/COMMENT-OUVRIR-CURSOR.md)
- [`docs/cursor/BRIEF-INTEGRATION-SUITE.md`](../cursor/BRIEF-INTEGRATION-SUITE.md)
- [`products/README.md`](../../products/README.md)
- [`OPS-SUITE-BACKUP-CI-RESEAU.md`](OPS-SUITE-BACKUP-CI-RESEAU.md)
- [`CLOUDITY-AUTH-PLM.md`](CLOUDITY-AUTH-PLM.md)

Release PDF précédente (matin) :  
https://github.com/PavelDelhomme/Cloudity/releases/tag/suite-integration-guide-20260915

---

## 8. Synthèse « bordel » → ordre

| Fait | Pas fait / suivant |
|------|---------------------|
| Submodules JT + Gasoil + YTMusic sous Cloudity | Maps repo |
| Noms produits clairs + workspace | SSO runtime |
| Catalogue Gasoil B/C | Deploy catalogue prod + ADEME (phase D) |
| Docs ops + script backup | **Exécuter** backup VPS + offsite |
| PLM sur Nothing / Blackview / Samsung / AVD smoke | Continuer QA produit |
| Fondations identity-sdk | Flag + endpoint link PLM |

**Verdict** : la **restructure suite est en place** ; le travail produit et l’ops backup VPS sont la suite logique. Le cœur Cloudity et les satellites restent déployables **séparément** — c’est voulu.
