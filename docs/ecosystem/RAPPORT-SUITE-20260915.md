# Cloudity Suite — rapport d’intégration (lisible)

Date : 2026-09-15 (mise à jour soir)

## 1. Pourquoi le lien PDF donnait 404

La release GitHub `suite-integration-guide-20260915` était en **brouillon (draft)**.  
Les drafts ne sont pas téléchargeables publiquement → page 404.

**Corrigé** : release **publiée**. Lien direct PDF :

https://github.com/PavelDelhomme/Cloudity/releases/download/suite-integration-guide-20260915/cloudity-suite-integration-20260915-184002.pdf

Page release :

https://github.com/PavelDelhomme/Cloudity/releases/tag/suite-integration-guide-20260915

---

## 2. Restructure déjà faite (et c’est normal)

```
Cloudity/
├── Cloudity.code-workspace
├── products/
│   ├── jobbing-track/     ← submodule COMPLET (= repo JobbingTrack)
│   ├── fuel/README.md     ← placeholder Gasoil (pas encore submodule)
│   └── music/README.md    ← placeholder PLM (pas encore submodule)
├── platform/
│   └── identity-sdk/      ← squelette SSO
├── backend/ frontend/ …   ← cœur Cloudity inchangé
└── docs/cursor/
    ├── BRIEF-INTEGRATION-SUITE.md
    └── COMMENT-OUVRIR-CURSOR.md
```

**Pourquoi seulement JobbingTrack dans products/ ?**  
On intègre **un produit à la fois** pour ne pas risquer les volumes Gasoil (~9 Go) et YTMusic (~21 Go). JT est le pilote.

Le code JobbingTrack sous `products/jobbing-track` **est bien le projet complet** (backend, frontend, mobile, docs…) — ce n’est pas un stub.

---

## 3. Comment ouvrir dans Cursor (important)

### Recommandé — un seul Cursor, workspace suite

```bash
cd ~/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

Tu vois **Cloudity** + **JobbingTrack** dans le même explorateur.  
**Pas besoin** d’un second terminal `cursor .` pour JT.

### Alternative — JT seul

```bash
cd ~/Documents/Dev/Perso/Cloudity/Cloudity/products/jobbing-track
cursor .
```

---

## 4. Orchestrateur ? Runtime ?

Aujourd’hui Cloudity **n’oblige pas** à démarrer JT.  
Stacks Docker VPS restent **séparées** (cloudity / jobbingtrack-prod / preprod / gasoil / ytmusic).

« Orchestrateur » = cadre **dev + docs + submodules**, pas encore un seul `docker compose` unique.  
C’est voulu pour **zéro perte** de données utilisateurs.

---

## 5. Données VPS (ne jamais Remove volumes)

| Volume | ~Taille |
|--------|--------:|
| ytmusic_ytmusic_data | 20,6 Go |
| gasoil_api_data | 8,9 Go |
| jobbingtrack-prod_postgres_data | 537 Mo |
| jobbingtrack-preprod_postgres_data | 465 Mo |
| cloudity_postgres_data | 49 Mo |

Levier RAM : éteindre **JT preprod** hors usage (~15 conteneurs).

---

## 6. Prochaines étapes (propositions)

1. Travailler JT via `products/jobbing-track` + workspace.  
2. Quand stable : submodule Gasoil → `products/fuel` (même procédure).  
3. Puis PLM → `products/music` (volume 20 Go intact).  
4. SSO Cloudity ID opt-in (platform/identity-sdk).  
5. Maps plus tard.  
6. Mises à jour : **par repo / par stack Portainer** ; éventuellement script « bump all submodules » sans redeploy forcé.

### Versions API / images

Objectif : ≤ 5 tags d’écart vs prod ; éviter d’accumuler des images mortes (>1 Go/user de caches inutiles côté PLM déjà géré à part).  
`docker image prune` **sans** toucher aux volumes.

---

## 7. Fichiers utiles

| Fichier | Rôle |
|---------|------|
| `docs/cursor/COMMENT-OUVRIR-CURSOR.md` | Ouvrir Cursor |
| `docs/cursor/BRIEF-INTEGRATION-SUITE.md` | Brief chat Cursor |
| `docs/ecosystem/ECOSYSTEME-SUITE-MODULAIRE.md` | Rapport long |
| `products/README.md` | Liste produits |
| `Cloudity.code-workspace` | Multi-root |

---

## 8. Décisions encore à trancher (sans bloquer JT)

Naming Cloudity X vs -ity ; meta-repo séparé ou tout dans Cloudity.git (déjà engagé) ; premier SSO ; Maps dans Cloudity ou repo solo ; F-Droid ; éteindre preprod JT.

