# Restructure — checklist opérationnelle

Doc : [`STRUCTURE-CIBLE.md`](./STRUCTURE-CIBLE.md) · Images : [`GHCR-IMAGES.md`](./GHCR-IMAGES.md) · Ops : [`../../DEPLOIEMENT_PROCEDURE.md`](../../DEPLOIEMENT_PROCEDURE.md)

## P0 — Doc (fait)

- [x] `DEPLOIEMENT_PROCEDURE.md` unique (Install + Formulaire + Limited + par service)
- [x] Branches `dev` / `preprod` / `prod` alignées sur la restructure
- [x] CI GHCR sur `dev` + `prod` (+ `preprod` tag)

## P1 — Conventions (fait)

- [x] `backend/README.md` · `frontend/README.md`
- [x] Inventaire embedded `cloudity-web` : hub, pass, photos, office, notes, calendar, contacts, tasks, settings (mail+drive sortis)
- [x] Table images GHCR [`GHCR-IMAGES.md`](./GHCR-IMAGES.md)

## P2 — Base commune

- [x] Auth Flutter via `cloudity_shared` (Pass + apps produit)
- [ ] `@cloudity/ui` + tokens partout sur hub (progressif)
- [ ] Contrats OpenAPI gateway (backlog)

## P3 — Split apps web

- [x] `web-mail` · `web-drive`
- [ ] `web-pass` · `web-photos` · `web-office` · …

## P4 — Move physique backend

- [ ] `backend/services/_platform|_product` (après splits web stables)

## P5 — Portainer Total

- [x] Stack Git **`cloudity`** (`refs/heads/prod`, Total) + GitOps 5m
- [x] Watchtower (labels Cloudity) pour pull `:latest`
- [ ] Créer stack **`cloudity-preprod`** (`refs/heads/preprod`, `TAG=preprod`)

## P6 — Admin hold/promote + OTA

- [x] Gateway : manifest / apk / upload / hold / **list releases**
- [x] Flutter : `CloudityOtaClient` + `SuiteAppShell`
- [x] UI admin **`/4dm1n` → Déploiements** (liste, hold, upload APK, matrice web/API)
- [x] `make mobile-upload-all` + doc `DEPLOY-MATRIX.md`
