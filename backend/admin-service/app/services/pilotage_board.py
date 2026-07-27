"""Seed + logique du board Pilotage (catalogue JSON + sync Markdown)."""
from __future__ import annotations

import json
import os
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

TaskStatus = str
DecisionStamp = str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def status_from_decision(decision: str) -> TaskStatus:
    d = (decision or "").upper().replace(" ", "_")
    return {
        "OK": "ok",
        "KO": "ko",
        "PARTIEL": "partial",
        "PLUS_TARD": "deferred",
        "REWORK": "rework",
    }.get(d, "open")


def decision_from_status(status: TaskStatus) -> DecisionStamp | None:
    return {
        "ok": "OK",
        "ko": "KO",
        "partial": "PARTIEL",
        "deferred": "PLUS_TARD",
        "rework": "REWORK",
    }.get(status)


def checklist_progress(task: dict[str, Any]) -> dict[str, Any]:
    items = task.get("checklist") or []
    total = len(items)
    done = sum(1 for c in items if c.get("done"))
    return {
        "done": done,
        "total": total,
        "allDone": total == 0 or done == total,
        "anyDone": done > 0,
    }


def derive_cycle_status(tasks: list[dict[str, Any]]) -> str:
    if not tasks:
        return "open"
    if all(t.get("status") == "ok" for t in tasks):
        return "ok"
    if any(t.get("status") in ("ko", "rework") for t in tasks):
        return "rework"
    if all(t.get("status") == "deferred" for t in tasks):
        return "deferred"
    if any(t.get("status") != "open" for t in tasks):
        return "partial"
    return "open"


def build_cycle_views(board: dict[str, Any]) -> list[dict[str, Any]]:
    views: list[dict[str, Any]] = []
    tasks_map: dict[str, Any] = board.get("tasks") or {}
    for cycle in board.get("cycles") or []:
        ids = cycle.get("itemIds") or []
        tasks = [tasks_map[i] for i in ids if i in tasks_map]
        ok_count = sum(1 for t in tasks if t.get("status") == "ok")
        status = derive_cycle_status(tasks)
        views.append(
            {
                **cycle,
                "status": status,
                "okCount": ok_count,
                "total": len(tasks),
                "progressLabel": f"{ok_count}/{len(tasks)} OK",
            }
        )
    return views


def docs_root() -> Path:
    raw = (
        os.getenv("PILOTAGE_DOCS_ROOT")
        or os.getenv("CVE_SCAN_REPO_ROOT")
        or ""
    ).strip()
    if raw:
        return Path(raw)
    # Dev hors Docker : remonter depuis admin-service/app/services
    here = Path(__file__).resolve()
    for p in [here.parents[i] for i in range(3, 8)]:
        if (p / "TODOS.md").is_file() and (p / "docs" / "operations").is_dir():
            return p
    return Path("/cloudity-repo")


def catalog_path() -> Path:
    return docs_root() / "docs" / "operations" / "pilotage-catalog.json"


def _check(label: str, done: bool = False) -> dict[str, Any]:
    return {"id": f"c-{uuid4().hex[:10]}", "label": label, "done": done}


def _task_from_catalog_entry(entry: dict[str, Any]) -> dict[str, Any]:
    labels = entry.get("checklistLabels") or ["Critère principal atteint"]
    status = entry.get("status") or "open"
    checklist = [_check(lab, done=(status == "ok")) for lab in labels]
    return {
        "id": entry["id"],
        "cycleId": entry.get("cycleId"),
        "section": entry.get("section") or "",
        "label": entry.get("label") or entry["id"],
        "description": entry.get("description") or "",
        "expected": entry.get("expected") or "",
        "status": status,
        "order": int(entry.get("order") or 0),
        "checklist": checklist,
        "porteurNote": "",
        "history": [],
        "source": entry.get("source") or "catalog",
    }


def load_catalog_file() -> dict[str, Any] | None:
    path = catalog_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or not data.get("cycles"):
        return None
    return data


def build_seed_board() -> dict[str, Any]:
    """Board depuis pilotage-catalog.json (155+ tâches) ; fallback minimal si absent."""
    cat = load_catalog_file()
    if not cat:
        return _minimal_fallback_seed()
    tasks: dict[str, Any] = {}
    for entry in cat.get("tasks") or []:
        if not isinstance(entry, dict) or not entry.get("id"):
            continue
        tasks[entry["id"]] = _task_from_catalog_entry(entry)
    cycles = cat.get("cycles") or []
    # Réaligner itemIds si besoin
    by_cycle: dict[str, list[str]] = {c["id"]: [] for c in cycles if c.get("id")}
    for tid, t in tasks.items():
        cid = t.get("cycleId")
        if cid in by_cycle:
            by_cycle[cid].append(tid)
    for c in cycles:
        if c.get("id") in by_cycle and not c.get("itemIds"):
            c["itemIds"] = by_cycle[c["id"]]
    return {
        "version": int(cat.get("version") or 2),
        "updatedAt": _now(),
        "cycles": cycles,
        "tasks": tasks,
        "catalogVersion": cat.get("updatedAt"),
    }


def _minimal_fallback_seed() -> dict[str, Any]:
    tid = "H14"
    return {
        "version": 1,
        "updatedAt": _now(),
        "cycles": [
            {
                "id": "cycle-now",
                "label": "À faire maintenant",
                "description": "Catalogue JSON manquant — make sync / monter /cloudity-repo",
                "itemIds": [tid],
            }
        ],
        "tasks": {
            tid: {
                "id": tid,
                "cycleId": "cycle-now",
                "section": "Mobile",
                "label": "H14 — Gateway mobile HTTPS prod",
                "description": "Valider gateway mobile.",
                "expected": "Login mobile OK.",
                "status": "partial",
                "order": 1,
                "checklist": [_check("Smoke gateway")],
                "porteurNote": "",
                "history": [],
            }
        },
    }


def merge_boards(existing: dict[str, Any] | None, seed: dict[str, Any]) -> dict[str, Any]:
    """Fusionne seed (catalogue) + board existant : préserve notes, checklist, historique, décisions."""
    if not existing or not (existing.get("tasks") or existing.get("cycles")):
        return deepcopy(seed)
    out = deepcopy(seed)
    out_tasks: dict[str, Any] = out.setdefault("tasks", {})
    old_tasks: dict[str, Any] = existing.get("tasks") or {}

    for tid, old in old_tasks.items():
        if tid not in out_tasks:
            # Tâche créée manuellement : conserver
            out_tasks[tid] = deepcopy(old)
            cid = old.get("cycleId")
            if cid:
                for c in out.get("cycles") or []:
                    if c.get("id") == cid:
                        ids = list(c.get("itemIds") or [])
                        if tid not in ids:
                            ids.append(tid)
                        c["itemIds"] = ids
            continue
        cur = out_tasks[tid]
        # Préserver progression utilisateur
        if old.get("porteurNote"):
            cur["porteurNote"] = old["porteurNote"]
        if old.get("history"):
            cur["history"] = deepcopy(old["history"])
        # Checklist : merge by label
        old_by_label = {
            (c.get("label") or ""): c for c in (old.get("checklist") or []) if c.get("label")
        }
        new_cl = []
        for c in cur.get("checklist") or []:
            lab = c.get("label") or ""
            if lab in old_by_label and old_by_label[lab].get("done"):
                c = {**c, "done": True, "id": old_by_label[lab].get("id") or c.get("id")}
            else:
                # preserve id if same label existed
                if lab in old_by_label:
                    c = {**c, "id": old_by_label[lab].get("id") or c.get("id")}
            new_cl.append(c)
        cur["checklist"] = new_cl
        # Statut : garder décision utilisateur si plus « avancée » que le seed
        old_st = old.get("status") or "open"
        seed_st = cur.get("status") or "open"
        rank = {"open": 0, "partial": 1, "rework": 2, "deferred": 3, "ko": 4, "ok": 5}
        # Si l'utilisateur a une history decide, privilégier old
        has_decide = any(
            str(h.get("action", "")).startswith("decide:") for h in (old.get("history") or [])
        )
        if has_decide or rank.get(old_st, 0) >= rank.get(seed_st, 0):
            cur["status"] = old_st
        out_tasks[tid] = cur

    out["updatedAt"] = _now()
    return out


_STATUS_MARK = {
    "☑": "ok",
    "✅": "ok",
    "☐": "open",
    "🟡": "partial",
    "⏸️": "deferred",
    "ℹ️": "open",
}


def parse_md_statuses(root: Path | None = None) -> dict[str, TaskStatus]:
    """Extrait id → status depuis TODOS.md (tables H*) et BACKLOG.md (cases - [x])."""
    root = root or docs_root()
    found: dict[str, TaskStatus] = {}

    todos = root / "TODOS.md"
    if todos.is_file():
        text = todos.read_text(encoding="utf-8", errors="replace")
        # | **H14** | ... | 🟡 |
        for m in re.finditer(
            r"\|\s*\*\*([A-Z][A-Z0-9_-]+)\*\*\s*\|[^|]*\|[^|]*\|\s*([☑✅☐🟡⏸️ℹ️xX✓])",
            text,
        ):
            tid, mark = m.group(1), m.group(2)
            found[tid] = _STATUS_MARK.get(mark, "open")
        # | **H14** | ... | ✅ |  (3-col MAINTENANT)
        for m in re.finditer(
            r"\|\s*\*\*([A-Z][A-Z0-9_-]+)\*\*\s*\|[^|]*\|[^|]*\|\s*([☑✅☐🟡⏸️])\s*\|",
            text,
        ):
            tid, mark = m.group(1), m.group(2)
            found[tid] = _STATUS_MARK.get(mark, found.get(tid, "open"))
        # Sujet | État tables sessions : | **`foo`** | ☑ |
        for m in re.finditer(
            r"\|\s*\*\*`?([^`|*]+)`?\*\*\s*\|\s*([☑✅☐🟡⏸️])\s*\|",
            text,
        ):
            label = m.group(1).strip()
            mark = m.group(2)
            # map known keys in label
            for key in ("H14", "H19", "DEPLOY-ENV", "PILOTAGE"):
                if key in label.upper().replace(" ", ""):
                    pass

    backlog = root / "BACKLOG.md"
    if backlog.is_file():
        text = backlog.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(
            r"^- \[( |x|X)\]\s+\*\*([A-Z0-9][A-Z0-9_-]+)\b",
            text,
            re.MULTILINE,
        ):
            done = m.group(1).lower() == "x"
            tid = m.group(2)
            # Prefer explicit backlog for DEPLOY/REL/MAIL/AS/MP/PERF
            found[tid] = "ok" if done else found.get(tid, "open")

    return found


def apply_md_statuses(board: dict[str, Any], statuses: dict[str, TaskStatus]) -> dict[str, Any]:
    """Applique les statuts MD sans écraser une décision decide: plus récente."""
    board = deepcopy(board)
    tasks = board.get("tasks") or {}
    for tid, st in statuses.items():
        if tid not in tasks:
            continue
        t = tasks[tid]
        has_decide = any(
            str(h.get("action", "")).startswith("decide:") for h in (t.get("history") or [])
        )
        if has_decide:
            continue
        t["status"] = st
        if st == "ok":
            for c in t.get("checklist") or []:
                c["done"] = True
    board["updatedAt"] = _now()
    return board


def sync_from_docs(existing: dict[str, Any] | None) -> tuple[dict[str, Any], str]:
    """Recharge catalogue + merge + statuts Markdown."""
    seed = build_seed_board()
    merged = merge_boards(existing, seed)
    statuses = parse_md_statuses()
    merged = apply_md_statuses(merged, statuses)
    n = len(merged.get("tasks") or {})
    msg = f"Sync docs OK — {n} tâches, {len(statuses)} statuts lus depuis Markdown."
    return merged, msg


def enrich_board(board: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(board)
    out["cycleViews"] = build_cycle_views(out)
    tasks = list((out.get("tasks") or {}).values())
    out["counts"] = {
        "open": sum(1 for t in tasks if t.get("status") == "open"),
        "partial": sum(1 for t in tasks if t.get("status") == "partial"),
        "ok": sum(1 for t in tasks if t.get("status") == "ok"),
        "ko": sum(1 for t in tasks if t.get("status") in ("ko", "rework")),
        "deferred": sum(1 for t in tasks if t.get("status") == "deferred"),
        "total": len(tasks),
    }
    active = None
    now_ids = next(
        (c.get("itemIds") or [] for c in out.get("cycles") or [] if c.get("id") == "cycle-now"),
        [],
    )
    for tid in now_ids:
        t = (out.get("tasks") or {}).get(tid)
        if t and t.get("status") in ("open", "partial", "rework"):
            active = {"id": tid, "label": t.get("label"), "status": t.get("status")}
            break
    out["active"] = active
    recent = [t for t in tasks if t.get("status") == "ok"]
    recent.sort(
        key=lambda t: (t.get("history") or [{}])[-1].get("at", "") if t.get("history") else "",
        reverse=True,
    )
    out["recentDone"] = [{"id": t["id"], "label": t.get("label"), "status": "ok"} for t in recent[:12]]
    out["docsRoot"] = str(docs_root())
    out["catalogPath"] = str(catalog_path())
    out["catalogLoaded"] = catalog_path().is_file()
    return out


def apply_board_action(board: dict[str, Any], body: dict[str, Any]) -> tuple[dict[str, Any], str]:
    board = deepcopy(board)
    tasks: dict[str, Any] = board.setdefault("tasks", {})
    action = body.get("type") or ""
    item_id = body.get("itemId") or ""
    task = tasks.get(item_id)
    if not task and action != "create":
        raise ValueError(f"Tâche inconnue : {item_id}")

    msg = "OK"

    if action == "decide":
        decision = (body.get("decision") or "").upper()
        note = (body.get("note") or "").strip()
        new_status = status_from_decision(decision)
        progress = checklist_progress(task)
        if new_status == "ok" and not progress["allDone"] and progress["total"] > 0:
            new_status = "partial"
            decision = "PARTIEL"
            msg = "Checklist incomplète → PARTIEL (coche tout puis OK)."
        else:
            msg = f"Décision {decision} enregistrée."
        task["status"] = new_status
        if note:
            task["porteurNote"] = note
        task.setdefault("history", []).append(
            {"at": _now(), "action": f"decide:{decision}", "note": note or None}
        )
        # PLUS_TARD : statut deferred, cycle inchangé (filtre UI)

    elif action == "checklist":
        cid = body.get("checklistItemId") or ""
        done = bool(body.get("done"))
        found = False
        for c in task.get("checklist") or []:
            if c.get("id") == cid:
                c["done"] = done
                found = True
                break
        if not found:
            raise ValueError("Critère checklist introuvable")
        progress = checklist_progress(task)
        if task.get("status") == "ok" and not progress["allDone"]:
            task["status"] = "partial"
        task.setdefault("history", []).append(
            {"at": _now(), "action": f"checklist:{cid}={'1' if done else '0'}"}
        )
        msg = "Checklist mise à jour."

    elif action == "note":
        task["porteurNote"] = (body.get("note") or "").strip()
        task.setdefault("history", []).append({"at": _now(), "action": "note"})
        msg = "Note enregistrée."

    elif action == "reorder":
        direction = body.get("direction") or "up"
        cycle_id = task.get("cycleId")
        cycle = next((c for c in board.get("cycles") or [] if c.get("id") == cycle_id), None)
        if not cycle:
            raise ValueError("Cycle introuvable")
        ids: list[str] = list(cycle.get("itemIds") or [])
        if item_id not in ids:
            raise ValueError("Tâche absente du cycle")
        i = ids.index(item_id)
        j = i - 1 if direction == "up" else i + 1
        if j < 0 or j >= len(ids):
            msg = "Déjà en bout de liste."
        else:
            ids[i], ids[j] = ids[j], ids[i]
            cycle["itemIds"] = ids
            for idx, tid in enumerate(ids):
                if tid in tasks:
                    tasks[tid]["order"] = idx + 1
            msg = "Ordre mis à jour."

    elif action == "move":
        target = body.get("cycleId")
        _move_task_cycle(board, item_id, target)
        msg = f"Déplacé vers {target or 'aucun cycle'}."

    elif action == "create":
        tid = (body.get("itemId") or "").strip() or f"T-{uuid4().hex[:8]}"
        if tid in tasks:
            raise ValueError("ID déjà utilisé")
        cycle_id = body.get("cycleId") or "cycle-now"
        label = (body.get("note") or body.get("label") or tid).strip()
        new_task = {
            "id": tid,
            "cycleId": cycle_id,
            "section": str(body.get("section") or "Perso"),
            "label": label,
            "description": str(body.get("description") or ""),
            "expected": str(body.get("expected") or "Critères à préciser."),
            "status": "open",
            "order": 99,
            "checklist": [_check(c) for c in (body.get("checklistLabels") or [])]
            or [_check("Faire / valider")],
            "porteurNote": "",
            "history": [{"at": _now(), "action": "create"}],
            "source": "manual",
        }
        tasks[tid] = new_task
        cycle = next((c for c in board.get("cycles") or [] if c.get("id") == cycle_id), None)
        if cycle is not None:
            ids = list(cycle.get("itemIds") or [])
            if tid not in ids:
                ids.append(tid)
            cycle["itemIds"] = ids
        msg = f"Tâche {tid} créée."

    else:
        raise ValueError(f"Action inconnue : {action}")

    board["updatedAt"] = _now()
    board["version"] = int(board.get("version") or 2)
    return board, msg


def _move_task_cycle(board: dict[str, Any], item_id: str, target_cycle: str | None) -> None:
    tasks = board.get("tasks") or {}
    task = tasks.get(item_id)
    if not task:
        return
    for cycle in board.get("cycles") or []:
        ids = list(cycle.get("itemIds") or [])
        if item_id in ids:
            ids.remove(item_id)
            cycle["itemIds"] = ids
    if target_cycle:
        cycle = next((c for c in board.get("cycles") or [] if c.get("id") == target_cycle), None)
        if cycle is not None:
            ids = list(cycle.get("itemIds") or [])
            if item_id not in ids:
                ids.append(item_id)
            cycle["itemIds"] = ids
            task["cycleId"] = target_cycle
        else:
            task["cycleId"] = None
    else:
        task["cycleId"] = None
