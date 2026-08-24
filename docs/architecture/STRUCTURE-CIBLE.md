# Architecture Cloudity — structure cible & feuille de route

**Priorité** : remettre de l’ordre dans le monorepo **avant** de figer le déploiement Portainer Git (dev / preprod / prod).  
Companion ops : [`DEPLOIEMENT_PROCEDURE.md`](../DEPLOIEMENT_PROCEDURE.md).

---

## 1. Pourquoi `cloudity-web` **et** `web-mail` ?

| Dossier | Rôle aujourd’hui | Intention |
|---------|------------------|-----------|
| `frontend/apps/cloudity-web` | **Shell / hub** : login, `/app` grille, **et encore** Drive, Pass, Photos, Office, admin… dans le même bundle | Doit devenir **uniquement** site + login + hub (+ éventuellement settings) |
| `frontend/apps/web-mail` | App Mail **extraite** (FE-SPLIT-01) : build séparé, packagée dans l’image `cloudity-frontend` sous `/app/mail/` | Modèle à **répéter** pour Drive, Pass, Photos… |

Ce n’est **pas** deux fronts concurrentes : c’est le **début du découpage**. Mail est sorti ; le reste est encore « embedded » dans `cloudity-web/src/pages/app/*`.

```text
Navigateur
  └── cloudity-web (shell) ──► charge / embed les apps produit
         ├── web-mail     (déjà séparé)
         ├── web-drive    (cible)
         ├── web-pass     (cible)
         └── …
```

Libs communes **déjà là** (à renforcer, pas à inventer) :

| Package | Stack | Rôle |
|---------|-------|------|
| `@cloudity/ui` | React | Design system (boutons, layouts, tokens) |
| `@cloudity/shared` | React/TS | Client API, JWT, types |
| `@cloudity/pass-crypto` / `app-vault-crypto` | TS | Crypto métier |
| `mobile/cloudity_shared` | Dart | Thème, shell, gateway, auth 2FA |

---

## 2. Catégories backend (plateforme vs produit)

Aujourd’hui les services sont **à plat** sous `backend/*-service`. Cible logique :

```text
backend/
├── common/                    # ← aujourd’hui : backend/pkg + internalsec partagé
│   ├── pkg/                   # dbpin, helpers Go
│   └── internalsec/           # sécu transverse (déjà un module)
└── services/
    ├── _platform/             # impactent TOUTE la suite
    │   ├── api-gateway/       # reverse-proxy interne + JWT + rate-limit
    │   ├── auth-service/      # login, 2FA, WebAuthn, sessions
    │   ├── admin-service/     # back-office /4dm1n
    │   ├── mail-directory-service/  # boîtes, alias, sync IMAP (socle Mail)
    │   └── internalsec/       # (ou reste en common/)
    └── _product/              # apps utilisateur (web + mobile)
        ├── calendar-service/
        ├── contacts-service/
        ├── drive-service/     # + sync fichiers (réutilisable)
        ├── notes-service/
        ├── passwords-service/ # Pass
        ├── photos-service/
        └── tasks-service/
```

| Catégorie | Services | Effet d’un changement |
|-----------|----------|------------------------|
| **Plateforme** | gateway, auth, admin, mail-directory, internalsec | Peut forcer rebuild **plusieurs** fronts + mobiles |
| **Produit** | calendar, contacts, drive, notes, pass, photos, tasks | En général **un** front + **une** app mobile |

**Règle trafic** : clients (web/mobile) → **uniquement** `api-gateway`. Les services produit ne s’exposent pas sur NPM.

> **Migration dossiers** : ne pas déplacer physiquement en un seul commit (casse Dockerfiles / CI / imports). Phases § 5.

---

## 3. Cible multi-plateforme (base commune)

```text
packages/  (ou frontend/packages + mobile/cloudity_shared + futur desktop/)
├── design-tokens     # couleurs, typo, spacing (JSON → React + Flutter + CSS)
├── api-client        # contrats OpenAPI / types partagés
├── auth-sdk          # login / refresh / 2FA (TS + Dart)
└── ui-kit            # boutons, listes, shells

apps/
├── web/              # shell + web-*
├── mobile/           # Flutter par produit
└── desktop/          # futur Linux / Windows / macOS (même ui-kit)
```

Chaque **app produit** = thin shell + features métier + dépendances sur la base commune.

---

## 4. Environnements (local → preprod → prod)

| Env | Où | Branche Git | Tag GHCR | URL type | Mobile |
|-----|-----|-------------|----------|----------|--------|
| **local** | PC `make up` | `feat/*` | — | `localhost:6001` / `:6002` | ADB, gateway LAN ou tunnel |
| **preprod** (dev distant fermé) | VPS stack `cloudity-preprod` | `preprod` | `:preprod` | `https://cloudity-preprod.<domaine>` | APK preprod + ADB |
| **prod** | VPS stack `cloudity` | `prod` | `:latest` | `https://cloudity.delhomme.ovh` | APK prod / OTA URL |

Deux stacks Portainer recommandées : **`cloudity`** (prod) + **`cloudity-preprod`** (fermée IP / Basic auth / pas d’indexation).

### Déploiement admin (objectif produit)

Dans l’UI admin (`/4dm1n` + `mobile/admin_app`) :

1. Voir versions déployées (web / services / APK).
2. **Mettre en attente** une release (staging) → promote preprod → prod.
3. Publier URL OTA mobile (`/api/deploy/apk/...` déjà amorcé dans les scripts).

Socle technique déjà partiel : `dist/mobile-manifests`, Watchtower labels, GitOps Portainer. À brancher sur l’admin ensuite (pas bloquant pour la restructure dossiers).

---

## 5. Phases de restructuration (ordre strict)

| Phase | Contenu | Risque |
|-------|---------|--------|
| **P0** | Doc cible (ce fichier) + `DEPLOIEMENT_PROCEDURE` + formulaire Portainer | Nul |
| **P1** | Inventaire + README par zone (`backend/README`, `frontend/README`) ; conventions noms | Nul |
| **P2** | Renforcer libs communes (auth Dart unique, `@cloudity/ui` partout) **sans** bouger dossiers | Faible |
| **P3** | Extraire apps web (Drive → `web-drive`, etc.) comme `web-mail` | Moyen |
| **P4** | Déplacer `backend/*` → `backend/services/_platform|_product` + màj Dockerfiles/CI | Élevé |
| **P5** | 2 stacks Portainer Git (preprod + prod) + GitOps | Moyen |
| **P6** | Admin « promote / hold release » + OTA mobile | Moyen |

**Règle produit** : ne pas développer 10 apps en parallèle tant que P0–P2 ne sont pas stables. Ordre minimaliste : **auth + gateway → Pass/Mail/Drive/Photos → reste**.

---

## 6. État actuel (carte rapide)

```text
Cloudity/
├── backend/                 # services à plat (+ pkg/, internalsec/)
├── frontend/
│   ├── apps/
│   │   ├── cloudity-web/    # shell + apps encore embedded
│   │   └── web-mail/        # Mail split ✓
│   └── packages/            # ui, shared, crypto
├── mobile/                  # apps Flutter + cloudity_shared
├── deploy/portainer/        # env examples, stubs docs
├── docker-compose.ghcr.yml  # prod Portainer (racine)
└── DEPLOIEMENT_PROCEDURE.md
```

---

## 7. Critères « restructure OK »

- [ ] On sait expliquer en 30 s cloudity-web vs web-mail
- [ ] Chaque service classé plateforme / produit
- [ ] Une seule façon de déployer : branche Git → Portainer (preprod/prod)
- [ ] Màj d’**un** service sans redeployer toute la suite (doc + pratique)
- [ ] Base UI/auth partagée web + mobile (plus de copier-coller login)
- [ ] Admin peut lister versions ; promote/hold = backlog P6

Branche de travail : `chore/restructure-platform` (depuis `dev`).
