# Cloudity Suite — guide d’intégration & restructuration (PDF)

**Date :** 2026-09-15  
**Pour :** lectures humaines + chats Cursor (JobbingTrack, GasoilTracking, PLM, Cloudity)  
**Destinataires email :** [REDACTED] · dev@delhomme.ovh · [REDACTED]

---

## 1. Ce qui a été fait maintenant

1. **Restructuration Cloudity** (avant déplacement complet des autres apps) :
   - `products/` — applications satellites
   - `platform/` — socle partagé (identity-sdk stub)
   - `Cloudity.code-workspace` — ouverture multi-root Cursor
   - Rapport long déplacé vers `docs/ecosystem/` (racine = pointeur court)
2. **JobbingTrack intégré** comme **sous-projet** :  
   `products/jobbing-track` = **git submodule** → repo `PavelDelhomme/JobbingTrack` branche `dev`  
   → le Git JobbingTrack reste **dédié** ; Cloudity ne fait que pointer.
3. **Brief Cursor** copié dans chaque produit :  
   `docs/CURSOR-BRIEF-CLOUDITY-SUITE.md` (JT, Gasoil) + Cloudity `docs/cursor/BRIEF-INTEGRATION-SUITE.md`
4. **Aucune donnée VPS déplacée** ; volumes Docker inchangés.

---

## 2. Comment travailler (Cursor)

### JobbingTrack seul

```
cd …/Cloudity/Cloudity/products/jobbing-track
cursor .
```

### Toute la suite

```
cd …/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

### Commits

- Code JT → commit **dans** le submodule, `git push` vers JobbingTrack `dev`
- Puis dans Cloudity : `git add products/jobbing-track && git commit` (bump pointeur)

### Brief à donner au chat Cursor

Fichier : `docs/cursor/BRIEF-INTEGRATION-SUITE.md`  
ou dans JT : `docs/CURSOR-BRIEF-CLOUDITY-SUITE.md`  
→ `@` ce fichier en début de conversation.

---

## 3. Structure cible Cloudity (nouvelle)

```
Cloudity/
├── products/
│   ├── jobbing-track/     ← submodule JT (FAIT)
│   ├── fuel/              ← Gasoil (à venir)
│   ├── music/             ← PLM/YTMusic (à venir)
│   └── maps/              ← Cloudity Maps (à créer)
├── platform/
│   └── identity-sdk/      ← stub SSO
├── backend/               ← services suite (auth, mail, …)
├── frontend/ · mobile/ · deploy/
├── Cloudity.code-workspace
└── docs/
    ├── cursor/BRIEF-INTEGRATION-SUITE.md
    └── ecosystem/ECOSYSTEME-SUITE-MODULAIRE.md
```

L’ancien chemin `/Perso/JobbingTrack` peut rester un clone local ; le **canonique pour la suite** devient `Cloudity/products/jobbing-track`.

---

## 4. Audit serveur Contabo (2026-09-15)

| Ressource | Valeur |
|-----------|--------|
| RAM | 29 Go total · ~7 Go used · ~22 Go available |
| Disque | 1,2 To · **43 %** utilisé (~478 Go) |
| CPU | 8 cœurs · load ~2,8–3,7 |
| Conteneurs notables | Cloudity lean ; **JT prod+preprod doublés** ; YTMusic ~573 Mo / limite 3 Go ; OnlyOffice ~643 Mo ; n8n ~400 Mo |

### Volumes données (ne jamais Remove)

| Volume | Taille |
|--------|--------|
| ytmusic_ytmusic_data | ~20,6 Go |
| gasoil_api_data | ~8,9 Go |
| jobbingtrack-prod_postgres_data | ~537 Mo |
| jobbingtrack-preprod_postgres_data | ~465 Mo |
| cloudity_postgres_data | ~49 Mo |

### Comment réduire RAM / CPU / disque

1. **Éteindre JobbingTrack preprod** hors besoins (double flotte de microservices = gros gaspillage).  
2. Limiter les tags d’images API conservés (≤ 5 versions « chaudes » hors prod).  
3. Ne pas fusionner les stacks en un monolithe (risque + pas d’économie magique sur les volumes data).  
4. Purge images dangling / Watchtower **filtré par stack**.  
5. YTMusic : garder le fonctionnement actuel ; le volume 20 Go est du cache/data utile — backup, pas suppression.

L’intégration « dans Cloudity » **n’économise pas** automatiquement la RAM tant que prod+preprod JT tournent tous les deux.

---

## 5. Mises à jour communes vs individuelles

| Mode | Description |
|------|-------------|
| Individuel (actuel) | Portainer Git / webhook par produit — **à conserver** |
| Commun (cible légère) | Script ou Watchtower avec **labels** `com.cloudity.product=…` ; ne met à jour qu’un produit |
| API multi-versions | Max ~5 tags actifs sur le serveur ; sinon purge ; exception si cache user &gt; 1 Go/user → réduire |

---

## 6. Apports croisés (sans tout fusionner)

| Produit | Ce qu’on garde / apporte |
|---------|--------------------------|
| JobbingTrack | Monitoring, dual env, Flutter, triage mail → brancher plus tard sur Cloudity Mail |
| Gasoil | GPS / conso → layer Cloudity Maps |
| PLM | Offline / player — **ne pas régresser** ; SSO plus tard |
| Cloudity | SSO, hub, design system |

---

## 7. Prochaines manips (après ce PDF)

1. Ouvrir `Cloudity.code-workspace` et vérifier JT.  
2. Décider si le clone `/Perso/JobbingTrack` reste ou devient alias.  
3. Quand prêt : submodule Gasoil puis PLM (même modèle).  
4. Script backup volumes VPS.  
5. identity-sdk + tuile hub (opt-in).  
6. Maps MVP (OSM) — Waze = deep link only.

---

## 8. Décisions encore à trancher

Naming Cloudity+clairs vs -ity ; meta-repo GitHub ou non ; premier SSO ; Maps in-repo vs repo solo ; preprod JT 24/7 ou à la demande ; F-Droid Maps.

---

## 9. Liens Git

- Cloudity (dev) : restructure + submodule  
- JobbingTrack `docs/CURSOR-BRIEF-CLOUDITY-SUITE.md` sur `dev`  
- GasoilTracking idem sur `dev`  
- YTMusic : PR brief Cursor

*— Fin du guide PDF —*
