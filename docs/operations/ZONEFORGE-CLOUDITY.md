# Cloudity × ZoneForge — déploiement sans manip VPS pénible

**Décision produit** : ne **pas** gérer la prod Cloudity à la main (Portainer UI + NPM UI + OVH DNS) pour chaque projet.  
Le control plane dédié est **[ZoneForge](https://github.com/PavelDelhomme/ZoneForge)** :

`domaine → DNS OVH → Proxy Host NPM → stack/conteneur Portainer`

Pilotage Cloudity (`/4dm1n/pilotage`) **suit** et **valide** ce chantier ; ZoneForge **exécute** le déploiement multi-projets (Cloudity, Nextcloud, JobbingTrack, …).

---

## 1. Qui fait quoi

| Besoin | Où | Comment |
|--------|-----|---------|
| Dev local / LAN | PC | `make up` · `make logs` · `make status-watch` · Pilotage ops-signals |
| Générer env CORS/URLs | PC | `make sync-public-urls` · `make env-prod` · `make portainer-env` |
| Suivi tâches / critères / blocages | **Cloudity** `/4dm1n/pilotage` | Sync docs, décisions, problèmes, pré-prod |
| DNS + NPM + Portainer redeploy (préprod/prod) | **ZoneForge** | Providers `ovh` · `npm` · `portainer` · publish / sync |
| Manips manuelles Portainer/NPM | **Interim seulement** | [DEPLOY-PORTAINER-NPM-CLOUDITY.md](DEPLOY-PORTAINER-NPM-CLOUDITY.md) jusqu’à ZF-03 vert |

---

## 2. Environnements Cloudity

| Env | Rôle | Outil principal |
|-----|------|-----------------|
| **dev** (local) | `make up`, gateway LAN, Pilotage | Makefile + Docker local |
| **préprod** | HTTPS réel, CORS strict, smoke mobile | ZoneForge → stack `cloudity-preprod` |
| **prod** | Utilisateurs | ZoneForge → stack `cloudity` |

Templates Compose restent dans `deploy/portainer/` (source de vérité Git). ZoneForge publie / met à jour ces stacks.

---

## 3. Chantier Pilotage (`ZF-*`)

| ID | Objectif |
|----|---------|
| **ZF-01** | Cadrer Cloudity comme *projet* ZoneForge (env, providers OVH/NPM/Portainer) — stub **[deploy/zoneforge/CLOUDITY-ENV.stub.md](../deploy/zoneforge/CLOUDITY-ENV.stub.md)** |
| **ZF-02** | Template publish Cloudity (compose path + env depuis `make portainer-env`) |
| **ZF-03** | Premier redeploy préprod via ZoneForge (DNS + proxy + stack) — **remplace** la checklist manuelle H14-3b |
| **ZF-04** | Lien / deep-link depuis Pilotage Cloudity → ZoneForge (URL configurable) |
| **ZF-05** | Prod Cloudity : publish + smoke `/health` + CORS via ZoneForge ; doc CLI locale inchangée |

H14 reste valide pour **LAN** ; le volet **HTTPS VPS** dépend de **ZF-03** (plus de « coller 20 variables dans Portainer » dès que ZF est prêt).

---

## 4. CLI Cloudity (toujours)

```bash
make help              # liste des cibles
make up / make down
make logs              # logs conteneurs locaux (+ archive reports/)
make status-watch      # statut live
make sync-public-urls
make env-prod DOMAIN=…
make portainer-env     # sortie à consommer par ZoneForge / interim Portainer
```

ZoneForge a ses propres `make up-dev` / `make logs` / `make status-watch` dans [son repo](https://github.com/PavelDelhomme/ZoneForge).

---

## 5. Sécurité

- Secrets prod : Portainer / ZoneForge vault — **jamais** commités dans Cloudity.
- Tokens OVH / NPM / Portainer : uniquement dans ZoneForge `.env` (voir SECURITY ZoneForge).
- Cloudity Pilotage ne stocke **pas** les credentials providers.

---

## Liens

- ZoneForge : https://github.com/PavelDelhomme/ZoneForge  
- Interim manuel : [DEPLOY-PORTAINER-NPM-CLOUDITY.md](DEPLOY-PORTAINER-NPM-CLOUDITY.md)  
- H14 mobile : [H14-GATEWAY-MOBILE.md](H14-GATEWAY-MOBILE.md)  
- Pilotage : [PILOTAGE.md](PILOTAGE.md)
