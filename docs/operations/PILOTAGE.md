# Pilotage projet Cloudity (back-office)

**Rôle** : suivre et valider **tout** le chantier Cloudity depuis `/4dm1n/pilotage` (modèle JobbingTrack).

**UI** : http://localhost:6001/4dm1n/pilotage

---

## 1. Sources de vérité

| Source | Rôle |
|--------|------|
| **`docs/operations/pilotage-catalog.json`** | Catalogue complet (~155 tâches, 10 cycles) — seed du board |
| **`TODOS.md` / `BACKLOG.md`** | Statuts lus au **Sync docs** (☑/🟡/☐ et `- [x]`) |
| **Postgres `cloudity_pilotage_board`** | État interactif (checklists, notes, décisions, historique) |

Les Markdown restent pour les agents ; le **board admin** est ce que tu coches au quotidien.

---

## 2. Cycles

| Cycle | Contenu |
|-------|---------|
| **À faire maintenant** | H14 (en tête), H19, H6b/c, QA, DNS… |
| **Mobile & OTA** | REL-01..03, Pass édition, Samsung… |
| **Apps web & UX** | UI-DS, Calendar, Drive, refactor FE, SYNC |
| **Mail local** | M7, alias local, AS-* (sans OVH) |
| **Mail prod (pause)** | Deferred jusqu’à signal explicite |
| **Pass** | L2/L3, Safari, QA Pass |
| **Qualité & tests** | QA-MATRIX, perf, Q4/Q7 |
| **Déploiement & infra** | Portainer, mTLS, homelab |
| **Admin / mises à jour** | ADM-UPDATE, OTA admin |
| **Terminées** | H1–H13, DEPLOY-ENV, PILOTAGE… |

---

## 3. API

| Méthode | Route | Effet |
|---------|-------|--------|
| `GET` | `/admin/pilotage/board` | Board (+ auto-upgrade si < 40 tâches) |
| `POST` | `/admin/pilotage/board/action` | decide / checklist / note / reorder / move / create |
| `POST` | `/admin/pilotage/board/sync-docs` | Catalogue + MD → merge (garde tes décisions) |
| `POST` | `/admin/pilotage/board/reset-seed?confirm=true` | Reset destructif puis sync |
| `GET` | `/admin/pilotage/events` | Audit |

Écriture prod : `CLOUDITY_PILOTAGE_WRITE=1`.  
Docs montées : `CVE_SCAN_REPO_ROOT=/cloudity-repo` (déjà dans compose) ou `PILOTAGE_DOCS_ROOT`.

---

## 4. Usage

1. Ouvre **Pilotage** → tu dois voir **~150 tâches** (sinon clique **Sync docs**).
2. Travaille **H14** (active) : coche critères → **OK** / Partiel.
3. Après édition de `TODOS.md` / `pilotage-catalog.json` : **Sync docs**.
4. Pour ajouter une tâche hors catalogue : champ « Nouvelle tâche » (cycle maintenant).

Enrichir le catalogue : éditer `docs/operations/pilotage-catalog.json` puis Sync docs.

---

## 5. Fichiers

- UI : `frontend/apps/cloudity-web/src/pages/admin/PilotagePage.tsx`
- API : `backend/admin-service/app/routes/pilotage.py`
- Logique : `backend/admin-service/app/services/pilotage_board.py`
- Catalogue : `docs/operations/pilotage-catalog.json`
