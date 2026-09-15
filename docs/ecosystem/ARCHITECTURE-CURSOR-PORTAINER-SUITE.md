# Architecture opérationnelle — Cursor + Portainer + satellites

> **Tampon vivant** (15/09/2026) — complète le brief Cursor et l’email décisions.  
> À lire avant toute « migration Cloudity ».

---

## 1. Carte des projets (GitHub ↔ disque ↔ VPS)

| Produit | Repo GitHub | Clone local « Perso » | Sous Cloudity | Branche travail | Stack Portainer | Volume data critique |
|---------|-------------|----------------------|---------------|-----------------|-----------------|----------------------|
| Cloudity Suite | `PavelDelhomme/Cloudity` | `…/Cloudity/Cloudity` | (racine) | `dev` / `chore/restructure-platform` | `cloudity` | `cloudity_postgres_data`, `cloudity_mobile_data` |
| JobbingTrack | `PavelDelhomme/JobbingTrack` | `…/Perso/JobbingTrack` | `products/jobbing-track` | `dev` | `jobbingtrack-prod` (+ `jobbingtrack-preprod`) | `jobbingtrack-prod_postgres_data` |
| GasoilTracking | `PavelDelhomme/GasoilTracking` | `…/Perso/GasoilTracking` | `products/GasoilTracking` **actif** | `dev` (prod = `prod`) | `gasoil-tracking` | `gasoil_api_data` (~9 Go) |
| YTMusic / PLM | `PavelDelhomme/YTMusic` | `…/Perso/YTMusic` | `products/YTMusic` **actif** | `dev` | `ytmusic` | `ytmusic_ytmusic_data` (~21 Go) |

**Règle** : un produit = un repo = une (ou deux) stack(s) = volumes **immuables en nom**.

---

## 2. Ouvrir Cursor correctement

### 2.1 Un seul produit

```bash
# JobbingTrack (préférer le submodule une fois l’habitude prise)
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/jobbing-track
cursor .

# Gasoil
cd /home/pactivisme/Documents/Dev/Perso/GasoilTracking && cursor .

# YTMusic
cd /home/pactivisme/Documents/Dev/Perso/YTMusic && cursor .

# Plateforme Cloudity seule
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity && cursor .
```

Dans la barre bas : tu dois voir la **branche git** (`dev`, etc.). Si tu ne vois que « Workspace … » → Reload Window + panneau Source Control.

### 2.2 Toute la suite

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

Chaque dossier du workspace = un root. **Commits** : vérifier le repo actif (statusbar) avant `commit`.

### 2.3 Quoi ne pas faire

- Ouvrir le parent `Perso/` (multi-projets sans workspace) → Cursor perd le contexte git.
- Committer depuis la racine Cloudity des fichiers qui vivent dans un submodule (ça ne push pas JobbingTrack).

---

## 3. Cycle Git recommandé

```text
1. Travail dans products/X ou Perso/X  →  branche feat/… ou fix/…
2. PR / merge vers dev du produit
3. Push origin dev
4. Si submodule : bump pointeur dans Cloudity + push Cloudity
5. Portainer : redeploy stack Git du produit (sans remove volumes)
```

JobbingTrack a aussi des branches `docs/…`, `feat/…` — convention : [`docs/development/BRANCHES.md`](../../../JobbingTrack/docs/development/BRANCHES.md) dans le repo JT (ou `products/jobbing-track/...`).

---

## 4. Portainer — déploiement Git

| Stack | Compose / Git | Conteneurs typiques (constat 15/09) |
|-------|---------------|--------------------------------------|
| `cloudity` | repo Cloudity | gateway, auth, postgres, redis, web, drive, mail, … |
| `jobbingtrack-prod` | repo JT / compose prod | ~17 services + postgres + redis |
| `jobbingtrack-preprod` | idem preprod | miroir tags `:dev` |
| `gasoil-tracking` | repo Gasoil | `gasoil-tracking-api` + `web` |
| `ytmusic` | repo YTMusic | `ytmusic` + `ytm-stream-bridge` |

### Checklist redeploy sûr

1. Backup volume data si schéma DB change.  
2. Pull image / Git dans Portainer.  
3. **Ne pas** cocher Remove volumes / Remove named volumes.  
4. Healthcheck gateway / web.  
5. Smoke login user réel (surtout Gasoil & PLM).

---

## 5. Intégration logique (sans perdre le métier JT)

```text
                    ┌─────────────────────────┐
                    │   Cloudity hub (web)    │
                    │  auth / mail / drive…   │
                    └───────────┬─────────────┘
                                │ tuiles (futur) + SSO opt-in
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   JobbingTrack            GasoilTracking           YTMusic
   (microservices          (API+Expo)               (API+data
    Node + Flutter)                                  média)
          │                     │                     │
   stack Portainer        stack Portainer       stack Portainer
   volumes JT             gasoil_api_data       ytmusic_*_data
```

JT reste une **app complète** ; Cloudity n’est pas un monolithe qui l’absorbe.

---

## 6. Hygiene docs JobbingTrack (en cours)

- Garder : `docs/pilotage/*`, `DEPLOY.md`, `README.md`, `docs/STATUS.md`, briefs Cloudity.  
- Sortir du bruit : artefacts `tests/performance-benchmark/`, note `.nettoyage_effectue`, doublon `flutter-mobile-app` (code mort — **phase chore**, pas ce commit si trop large).  
- Tampon triage structure : réintroduire si besoin depuis branche `docs/architecture-triage-inventory`.

---

## 7. Fichiers à donner à l’agent Cloudity

1. `docs/ecosystem/EMAIL-PORTEUR-DECISIONS-SUITE-2026-09-15.md` ← **décisions**  
2. `docs/cursor/BRIEF-INTEGRATION-SUITE.md` ← règles quotidiennes  
3. Ce fichier ← ops Cursor/Portainer  
4. `products/README.md` ← carte submodules  

---

*Fin.*
