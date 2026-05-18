# Documentation produit (`docs/produit/`)

**Rôle de chaque fichier** et lien avec **déploiement** / **alias mail**.

| Fichier | Aligné avec le chantier actuel ? | Rôle |
|---------|----------------------------------|------|
| **[VISION-SUITE.md](VISION-SUITE.md)** | Oui (vision long terme) | Couches P0–P7, ordre des apps. |
| **[ROADMAP.md](ROADMAP.md)** | Oui | Fiches APP-xx, TR-xx ; référence déploiement via operations/. |
| **[SPRINT-PASS-2026-05.md](SPRINT-PASS-2026-05.md)** | Oui — priorité J8 | Migration Proton, critères § 5. |
| **[SYNC-BACKLOG.md](SYNC-BACKLOG.md)** | Oui | Sync Mail/Drive ; § 2 Pass ↔ alias. |
| **[MAIL-ALIAS-VISION.md](MAIL-ALIAS-VISION.md)** | Oui — **cible** | Parcours `hellowork@alias.domain.ovh` sans OVH manuel. |
| **[MAIL-ALIAS-DEMARRAGE.md](MAIL-ALIAS-DEMARRAGE.md)** | Oui — **pratique** | Que faire **sans** OVH / sans MX Cloudity (complète VISION, ne la remplace pas). |
| **[MAIL-ALIAS-CHECKLIST.md](MAIL-ALIAS-CHECKLIST.md)** | Oui — **tests** | Créer alias dans Pass/Mail, filtre, règle, on/off — cases ☐ |
| **[MAIL-GMAIL-OAUTH.md](MAIL-GMAIL-OAUTH.md)** | Oui | Gmail OAuth — variables `GOOGLE_OAUTH_*` dans `.env`. |
| **[MOBILES.md](MOBILES.md)** | Oui | Web avant mobile ; API = gateway. |
| **[MULTI-PLATEFORME.md](MULTI-PLATEFORME.md)** | Oui | Web + mobile + extension ; MP-01..08. |
| **[PHOTOS.md](PHOTOS.md)** | Oui | Produit Photos. |
| **[PlanImplementation.md](PlanImplementation.md)** | Oui (macro) | Phases longues — pas le fil quotidien (voir STATUS). |
| **[editeur-docs.md](editeur-docs.md)** | Oui (Office/Drive) | Éditeur documents — indépendant de Mail/Pass. |

**Pas de doublon à supprimer** : **VISION** = cible produit alias ; **DEMARRAGE** = guide « je n’ai pas configuré OVH ».

**Déploiement** : **[../operations/DEPLOIEMENT-ENVIRONNEMENTS.md](../operations/DEPLOIEMENT-ENVIRONNEMENTS.md)**.

---

*Dernière mise à jour : 2026-05-18.*
