# Pilotage projet Cloudity (back-office)

**Rôle** : suivre et valider les chantiers **depuis** `/4dm1n/pilotage`, sur le modèle JobbingTrack (board + checklists + décisions OK / PARTIEL / KO / REWORK / Plus tard).

**UI** : [http://localhost:6001/4dm1n/pilotage](http://localhost:6001/4dm1n/pilotage) (après `make up` + `make seed-admin`).

---

## 1. Principe

| Élément | Stockage |
|---------|----------|
| Board (cycles, tâches, checklists, notes, historique) | Postgres `cloudity_pilotage_board` (JSONB) |
| Audit décisions | `cloudity_pilotage_events` |
| Seed initial | Aligné **TODOS.md** / **BACKLOG.md** (H14, DEPLOY-*, ADM-UPDATE…) |

Les fichiers Markdown racine restent la doc agents ; **la vérité opérationnelle du suivi porteur** = le board admin (mis à jour en live).

---

## 2. API

| Méthode | Route | Effet |
|---------|-------|--------|
| `GET` | `/admin/pilotage/board` | Board enrichi (`cycleViews`, `counts`, `active`, `recentDone`) |
| `POST` | `/admin/pilotage/board/action` | `decide` · `checklist` · `note` · `reorder` · `move` · `create` |
| `POST` | `/admin/pilotage/board/reset-seed?confirm=true` | Réinitialise au seed (destructif) |
| `GET` | `/admin/pilotage/events` | Historique récent |

Écriture : autorisée en `development` / `preprod` ; en `production` seulement si `CLOUDITY_PILOTAGE_WRITE=1`.

---

## 3. Migration

```bash
make migrate   # applique 48-cloudity-pilotage.sql
# recreate admin-service si besoin
docker compose up -d --build admin-service
```

---

## 4. UX

1. Sidebar **Pilotage** ou carte depuis le Dashboard.
2. Sections : **À faire maintenant** · **Cycles** · **Récemment terminées**.
3. Clic tâche → panneau détail : critères à cocher, note, boutons de décision, Monter/Descendre, changer de cycle.
4. OK avec checklist incomplète → forcé **PARTIEL** (comme JobbingTrack).
5. « Nouvelle tâche » pour ajouter un item perso dans le cycle immédiat.

---

## 5. Liens

- Code UI : `frontend/apps/cloudity-web/src/pages/admin/PilotagePage.tsx`
- API : `backend/admin-service/app/routes/pilotage.py`
- Logique : `backend/admin-service/app/services/pilotage_board.py`
- Suivi court : **[TODOS.md](../../TODOS.md)** · **[BACKLOG.md](../../BACKLOG.md)**
