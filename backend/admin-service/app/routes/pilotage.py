"""API admin — Pilotage projet (board type JobbingTrack)."""
from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.pilotage_board import (
    apply_board_action,
    build_seed_board,
    enrich_board,
    sync_from_docs,
)

router = APIRouter(prefix="/admin", tags=["pilotage"])


class PilotageActionBody(BaseModel):
    type: str = Field(
        ...,
        description=(
            "decide|checklist|checklist_bulk|note|reorder|move|create|"
            "report_problem|resolve_problem|inbox_note|promote_inbox|"
            "attach_log|set_focus|release_status|surface"
        ),
    )
    itemId: str = ""
    decision: str | None = None
    note: str | None = None
    checklistItemId: str | None = None
    checklistItemIds: list[str] | None = None
    done: bool | None = None
    direction: str | None = None
    cycleId: str | None = None
    label: str | None = None
    description: str | None = None
    expected: str | None = None
    section: str | None = None
    checklistLabels: list[str] | None = None
    parentId: str | None = None
    problemId: str | None = None
    logText: str | None = None
    logSource: str | None = None
    inboxId: str | None = None
    kind: str | None = None
    releaseId: str | None = None
    status: str | None = None
    surfaceKey: str | None = None


def _runtime_env() -> str:
    return (
        os.getenv("CLOUDITY_RUNTIME_ENV")
        or os.getenv("GO_ENV")
        or os.getenv("NODE_ENV")
        or "development"
    ).strip().lower()


def _can_write() -> bool:
    """Écriture autorisée hors production stricte (aligné JobbingTrack env gate)."""
    env = _runtime_env()
    if env in ("production", "prod"):
        # En prod Portainer : autoriser si CLOUDITY_PILOTAGE_WRITE=1 (ops explicite)
        return os.getenv("CLOUDITY_PILOTAGE_WRITE", "").strip() in ("1", "true", "yes")
    return True


def _table_ready(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1 FROM cloudity_pilotage_board LIMIT 1")).first()
        return True
    except (ProgrammingError, OperationalError):
        db.rollback()
        return False


def _load_payload(db: Session) -> dict[str, Any] | None:
    if not _table_ready(db):
        return None
    try:
        row = db.execute(
            text("SELECT payload FROM cloudity_pilotage_board WHERE id = 1")
        ).mappings().first()
    except (ProgrammingError, OperationalError):
        db.rollback()
        return None
    if not row:
        return None
    payload = row["payload"]
    if isinstance(payload, str):
        return json.loads(payload)
    if isinstance(payload, dict):
        return payload
    return None


def _save_payload(db: Session, board: dict[str, Any]) -> None:
    db.execute(
        text(
            """
            INSERT INTO cloudity_pilotage_board (id, version, updated_at, payload)
            VALUES (1, :version, NOW(), CAST(:payload AS jsonb))
            ON CONFLICT (id) DO UPDATE SET
              version = EXCLUDED.version,
              updated_at = NOW(),
              payload = EXCLUDED.payload
            """
        ),
        {
            "version": int(board.get("version") or 1),
            "payload": json.dumps(board),
        },
    )
    db.commit()


def _log_event(
    db: Session,
    *,
    task_id: str,
    action: str,
    decision: str | None,
    note: str | None,
    actor: str | None,
) -> None:
    if not _table_ready(db):
        return
    try:
        db.execute(
            text(
                """
                INSERT INTO cloudity_pilotage_events (task_id, action, decision, note, actor_email)
                VALUES (:task_id, :action, :decision, :note, :actor)
                """
            ),
            {
                "task_id": task_id,
                "action": action,
                "decision": decision,
                "note": note,
                "actor": actor,
            },
        )
        db.commit()
    except (ProgrammingError, OperationalError):
        db.rollback()


def _ensure_board(db: Session) -> dict[str, Any]:
    existing = _load_payload(db)
    if existing and (existing.get("tasks") or existing.get("cycles")):
        # Auto-upgrade si ancien seed miniature (< 40 tâches)
        n = len((existing.get("tasks") or {}))
        if n < 40 and catalog_loaded():
            board, _ = sync_from_docs(existing)
            _save_payload(db, board)
            return board
        return existing
    board, _ = sync_from_docs(None)
    if _table_ready(db):
        _save_payload(db, board)
    return board


def catalog_loaded() -> bool:
    from app.services.pilotage_board import catalog_path

    return catalog_path().is_file()

@router.get("/pilotage/board")
def get_pilotage_board(db: Session = Depends(get_db)) -> dict[str, Any]:
    if not _table_ready(db):
        # Tables absentes : renvoyer seed en lecture seule (avant migrate)
        board = enrich_board(build_seed_board())
        return {
            "success": True,
            "storageReady": False,
            "interactive": True,
            "canWrite": False,
            "runtimeEnv": _runtime_env(),
            "message": "Migration 48 absente — lance make migrate. Board seed en lecture seule.",
            "board": board,
        }
    board = enrich_board(_ensure_board(db))
    return {
        "success": True,
        "storageReady": True,
        "interactive": True,
        "canWrite": _can_write(),
        "runtimeEnv": _runtime_env(),
        "board": board,
    }


@router.post("/pilotage/board/action")
def post_pilotage_action(
    body: PilotageActionBody,
    db: Session = Depends(get_db),
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
) -> dict[str, Any]:
    if not _can_write():
        raise HTTPException(
            status_code=403,
            detail="Écriture pilotage désactivée en production (CLOUDITY_PILOTAGE_WRITE=1 pour forcer).",
        )
    if not _table_ready(db):
        raise HTTPException(status_code=503, detail="Tables pilotage absentes — make migrate")
    board = _ensure_board(db)
    try:
        new_board, message = apply_board_action(board, body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    _save_payload(db, new_board)
    _log_event(
        db,
        task_id=body.itemId or "?",
        action=body.type,
        decision=body.decision,
        note=body.note,
        actor=x_user_email,
    )
    return {
        "success": True,
        "message": message,
        "canWrite": True,
        "runtimeEnv": _runtime_env(),
        "board": enrich_board(new_board),
    }


@router.post("/pilotage/board/sync-docs")
def sync_pilotage_docs(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Recharge pilotage-catalog.json + merge + statuts TODOS/BACKLOG (préserve décisions UI)."""
    if not _can_write():
        raise HTTPException(status_code=403, detail="Écriture désactivée")
    if not _table_ready(db):
        raise HTTPException(status_code=503, detail="Tables pilotage absentes — make migrate")
    existing = _load_payload(db)
    try:
        new_board, message = sync_from_docs(existing)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e
    _save_payload(db, new_board)
    return {
        "success": True,
        "message": message,
        "canWrite": True,
        "runtimeEnv": _runtime_env(),
        "board": enrich_board(new_board),
    }


@router.post("/pilotage/board/reset-seed")
def reset_pilotage_seed(
    db: Session = Depends(get_db),
    confirm: bool = False,
) -> dict[str, Any]:
    """Réinitialise depuis le catalogue (perd les notes/checklists — préférer sync-docs)."""
    if not _can_write():
        raise HTTPException(status_code=403, detail="Écriture désactivée")
    if not confirm:
        raise HTTPException(status_code=400, detail="Passer confirm=true")
    if not _table_ready(db):
        raise HTTPException(status_code=503, detail="Tables pilotage absentes — make migrate")
    seed = build_seed_board()
    seed, _ = sync_from_docs(None)
    _save_payload(db, seed)
    return {
        "success": True,
        "message": "Board réinitialisé depuis le catalogue + Markdown.",
        "board": enrich_board(seed),
    }


@router.get("/pilotage/events")
def list_pilotage_events(
    db: Session = Depends(get_db),
    limit: int = 40,
) -> dict[str, Any]:
    if not _table_ready(db):
        return {"success": True, "items": [], "storageReady": False}
    lim = max(1, min(limit, 200))
    try:
        rows = db.execute(
            text(
                """
                SELECT id, task_id, action, decision, note, actor_email, created_at
                FROM cloudity_pilotage_events
                ORDER BY created_at DESC
                LIMIT :lim
                """
            ),
            {"lim": lim},
        ).mappings().all()
    except (ProgrammingError, OperationalError):
        db.rollback()
        return {"success": True, "items": [], "storageReady": False}
    items = []
    for r in rows:
        items.append(
            {
                "id": r["id"],
                "taskId": r["task_id"],
                "action": r["action"],
                "decision": r["decision"],
                "note": r["note"],
                "actorEmail": r["actor_email"],
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            }
        )
    return {"success": True, "storageReady": True, "items": items}


@router.get("/pilotage/ops-signals")
def pilotage_ops_signals(
    services: str = "api-gateway,auth-service,admin-service",
    tail: int = 60,
) -> dict[str, Any]:
    """Remonte logs Docker (socket) + crashes mobile (fichiers partagés)."""
    from app.services.pilotage_ops import list_container_logs, list_mobile_crashes

    lim = max(10, min(int(tail or 60), 200))
    names = [s.strip() for s in (services or "").split(",") if s.strip()][:8]
    available, notes, containers = list_container_logs(names, tail=lim)
    crashes = list_mobile_crashes(20)
    notes = list(notes) + list(crashes.get("notes") or [])
    return {
        "success": True,
        "available": available,
        "notes": notes,
        "containers": containers,
        "mobileCrashes": crashes.get("items") or [],
        "mobileCrashesDir": crashes.get("dir"),
        "hint": (
            "Attache un extrait à la tâche active, ou note-le dans l’inbox "
            "(mobile_log / container_log). Crashes vides = aucune app n’a encore posté."
        ),
    }


@router.get("/pilotage/mobile-crashes/{crash_id}")
def pilotage_mobile_crash_detail(crash_id: str) -> dict[str, Any]:
    from app.services.pilotage_ops import read_mobile_crash

    data = read_mobile_crash(crash_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Crash introuvable")
    return {"success": True, "crash": data}
