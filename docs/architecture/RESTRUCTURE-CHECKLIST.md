# Restructure — checklist opérationnelle

Branche : **`chore/restructure-platform`**  
Doc : [`STRUCTURE-CIBLE.md`](./STRUCTURE-CIBLE.md) · Ops : [`../../DEPLOIEMENT_PROCEDURE.md`](../../DEPLOIEMENT_PROCEDURE.md)

## P0 — Doc (fait)

- [x] `DEPLOIEMENT_PROCEDURE.md` + formulaire Portainer
- [x] Expliquer `cloudity-web` vs `web-mail`
- [x] Catégories plateforme / produit
- [x] Branches `dev` / `preprod` / `prod` alignées

## P1 — Conventions (en cours)

- [x] `backend/README.md` · `frontend/README.md`
- [ ] Inventaire routes `cloudity-web` encore embedded (Drive, Pass, Photos…)
- [ ] Convention noms images GHCR ↔ services (table unique)

## P2 — Base commune (sans bouger dossiers)

- [ ] Auth Flutter **uniquement** via `cloudity_shared` (supprimer copies login)
- [ ] `@cloudity/ui` + tokens partagés sur toutes pages hub
- [ ] Contrats API documentés (OpenAPI gateway)

## P3 — Split apps web (comme Mail)

- [ ] `web-pass` · `web-photos` · …
- [x] `web-drive` (FE-SPLIT-02) — même pattern que Mail
- [x] Image `cloudity-frontend` assemble Mail + Drive bundles

## P4 — Move physique backend

- [ ] `backend/services/_platform| _product` + màj Dockerfiles / CI / compose

## P5 — Portainer Total

- [ ] Migrer Limited → stack Git `cloudity` (prod)
- [ ] Créer stack `cloudity-preprod` (branche `preprod`, TAG=`preprod`)

## P6 — Admin hold/promote + OTA

- [ ] UI admin versions
- [ ] Promote preprod → prod
- [ ] URLs APK / manifestes
