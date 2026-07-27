# Pilotage projet Cloudity (back-office)

**Rôle** : suivre et valider **tout** le chantier Cloudity depuis `/4dm1n/pilotage` (modèle JobbingTrack).

**UI** : http://localhost:6001/4dm1n/pilotage

---

## 1. Sources de vérité

| Source | Rôle |
|--------|------|
| **`docs/operations/pilotage-catalog.json`** | Catalogue (~170 tâches, 12 cycles) — seed du board |
| **`TODOS.md` / `BACKLOG.md`** | Statuts lus au **Sync docs** (☑/🟡/☐ et `- [x]`) |
| **Postgres `cloudity_pilotage_board`** | État interactif (checklists, notes, décisions, historique, inbox) |

Les Markdown restent pour les agents ; le **board admin** est ce que tu coches au quotidien.

---

## 2. Ordre de travail (règle)

1. Cycle **À faire maintenant** : ordre de haut en bas.
2. Si un **problème** apparaît sur une tâche (ex. H14 HTTPS) → **Signaler un problème** :
   - crée une tâche `kind=problem` en **tête** de file ;
   - passe le parent en **`blocked`** ;
   - le focus bascule sur le problème.
3. Tu traites **d’abord** le problème (critères + logs).
4. **Problème résolu** → parent repasse en **`partial`**, focus repris sur le parent.
5. Ensuite tu continues la tâche d’origine.

**Inbox** : notes / logs mobile / logs conteneur à la volée → à promouvoir en problème ou à revoir dans **PREPROD-10**.

**Pré-prod** : cycle `PREPROD-01`…`10` — revalidation ordonnée avant prod complète.

**Versions** : `releases` (v0.1 MVP local → v0.2 préprod HTTPS → v1.0 prod).

**Signaux ops** : `GET /admin/pilotage/ops-signals` — logs Docker via **socket** monté sur admin-service + crashes lus dans `/mobile-crashes` (plus d’appel fragile `/mobile/crashes` depuis le board). Attacher à la tâche ou inbox.

**H14** : runbook **[H14-GATEWAY-MOBILE.md](H14-GATEWAY-MOBILE.md)** · HTTPS VPS via **[ZoneForge](ZONEFORGE-CLOUDITY.md)** (`ZF-03`) · fallback manuel **[DEPLOY-PORTAINER-NPM-CLOUDITY.md](DEPLOY-PORTAINER-NPM-CLOUDITY.md)**.

**CLI local** : `make logs` · `make status-watch` · `make portainer-env` (entrée ZoneForge / interim).


---

## 3. Cycles

| Cycle | Contenu |
|-------|---------|
| **À faire maintenant** | H14 (en tête), H19, H6b/c, QA, DNS… + problèmes créés |
| **Problèmes** | Vue dérivée `openProblems` (pas un cycle catalogue) |
| **Pré-prod** | `PREPROD-01`…`10` revalidation apps / HTTPS / DNS / tests |
| **Mobile & OTA** | REL-01..03, Pass édition, Samsung… |
| **Apps web & UX** | UI-DS, Calendar, Drive web, refactor FE, SYNC |
| **Desktop Drive sync** | `DRIVE-DESKTOP-01`…`05` |
| **Mail local** | M7, alias local, AS-* (sans OVH) |
| **Mail prod (pause)** | Deferred jusqu’à signal explicite |
| **Pass** | L2/L3, Safari, QA Pass |
| **Qualité & tests** | QA-MATRIX, perf, Q4/Q7 |
| **Déploiement & infra** | Portainer, mTLS, homelab (interim manuel) |
| **ZoneForge — deploy VPS** | Control plane OVH+NPM+Portainer — `ZF-01`…`05` · **[ZONEFORGE-CLOUDITY.md](ZONEFORGE-CLOUDITY.md)** · [repo](https://github.com/PavelDelhomme/ZoneForge) |
| **Admin / mises à jour** | ADM-UPDATE, OTA admin |
| **Terminées** | H1–H13, DEPLOY-ENV, PILOTAGE… |

---

## 4. API

| Méthode | Route | Effet |
|---------|-------|-------|
| `GET` | `/admin/pilotage/board` | Board (+ auto-upgrade si < 40 tâches) |
| `POST` | `/admin/pilotage/board/action` | decide / checklist / note / reorder / move / create / **report_problem** / **resolve_problem** / **inbox_note** / **promote_inbox** / **attach_log** / **set_focus** / **release_status** |
| `POST` | `/admin/pilotage/board/sync-docs` | Catalogue + MD → merge (garde tes décisions) |
| `POST` | `/admin/pilotage/board/reset-seed?confirm=true` | Reset destructif puis sync |
| `GET` | `/admin/pilotage/events` | Audit |
| `GET` | `/admin/pilotage/ops-signals` | Derniers logs conteneurs (docker) |

Statuts tâche : `open` · `partial` · `blocked` · `ok` · `ko` · `rework` · `deferred`.

---

## 5. Rituel

1. Ouvre `/4dm1n/pilotage` → **Sync docs** après édition catalogue / TODOS.
2. Travaille la tâche **active** (bandeau).
3. Dès qu’un bug bloque : **Signaler un problème** (+ coller log).
4. Après fix : **Problème résolu** → reprendre le parent.
5. Avant prod : cocher **Pré-prod** dans l’ordre ; vider / promouvoir l’**inbox**.

---

## 6. Fichiers

- UI : `frontend/apps/cloudity-web/src/pages/admin/PilotagePage.tsx`
- API : `backend/admin-service/app/routes/pilotage.py`
- Logique : `backend/admin-service/app/services/pilotage_board.py`
- Catalogue : `docs/operations/pilotage-catalog.json`
