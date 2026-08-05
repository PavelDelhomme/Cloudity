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

# Cycle de vie Pilotage (dev → préprod → prod)
# Conservé aussi : ok/partial/rework/blocked/deferred pour rétrocompat.
STATUS_META: dict[str, dict[str, str]] = {
    "open": {"decision": "A_FAIRE", "label": "À faire", "group": "travail"},
    "in_progress": {"decision": "EN_COURS", "label": "En cours", "group": "travail"},
    "waiting": {"decision": "EN_ATTENTE", "label": "En attente", "group": "travail"},
    "partial": {"decision": "PARTIEL", "label": "Partiel", "group": "travail"},
    "to_validate": {"decision": "A_VALIDER", "label": "À valider", "group": "validation"},
    "ok": {"decision": "OK", "label": "Validé", "group": "validation"},
    "recheck": {"decision": "A_REVERIFIER", "label": "À re-vérifier", "group": "validation"},
    "rework": {"decision": "A_CORRIGER", "label": "À corriger", "group": "validation"},
    "ko": {"decision": "KO", "label": "KO", "group": "validation"},
    "tested": {"decision": "TESTEE", "label": "Testée", "group": "tests"},
    "to_test_prod": {"decision": "A_TESTER_PROD", "label": "À tester en prod", "group": "tests"},
    "prod_ok": {"decision": "PROD_OK", "label": "Prod validée", "group": "tests"},
    "done": {"decision": "TERMINEE", "label": "Terminée", "group": "cloture"},
    "blocked": {"decision": "BLOQUE", "label": "Bloqué", "group": "cloture"},
    "deferred": {"decision": "PLUS_TARD", "label": "Plus tard", "group": "cloture"},
}

SURFACE_KEYS = (
    ("backend", "Backend API"),
    ("frontend_web", "Frontend web"),
    ("backoffice", "Back-office"),
    ("mobile", "Mobile"),
)


def default_surfaces(keys: list[str] | None = None) -> dict[str, Any]:
    want = keys or [k for k, _ in SURFACE_KEYS]
    return {k: {"done": False, "label": dict(SURFACE_KEYS).get(k, k)} for k in want}


def status_from_decision(decision: str) -> TaskStatus:
    d = (decision or "").upper().replace(" ", "_").replace("-", "_")
    aliases = {
        "OK": "ok",
        "VALIDE": "ok",
        "VALIDEE": "ok",
        "KO": "ko",
        "PARTIEL": "partial",
        "PLUS_TARD": "deferred",
        "REWORK": "rework",
        "A_REPRENDRE": "rework",
        "A_CORRIGER": "rework",
        "BLOQUE": "blocked",
        "BLOCKED": "blocked",
        "A_FAIRE": "open",
        "TODO": "open",
        "EN_COURS": "in_progress",
        "EN_ATTENTE": "waiting",
        "WAITING": "waiting",
        "A_VALIDER": "to_validate",
        "VALIDER": "to_validate",
        "A_REVERIFIER": "recheck",
        "RECHECK": "recheck",
        "TESTEE": "tested",
        "TESTED": "tested",
        "A_TESTER_PROD": "to_test_prod",
        "TESTER_PROD": "to_test_prod",
        "PROD_OK": "prod_ok",
        "PROD_VALIDEE": "prod_ok",
        "TERMINEE": "done",
        "FAITS": "done",
        "DONE": "done",
    }
    return aliases.get(d, "open")


def decision_from_status(status: TaskStatus) -> DecisionStamp | None:
    meta = STATUS_META.get(status)
    return meta["decision"] if meta else None


def label_from_status(status: TaskStatus) -> str:
    meta = STATUS_META.get(status)
    return meta["label"] if meta else status


def decisions_catalog() -> list[dict[str, str]]:
    """Liste ordonnée pour l’UI (groupes travail / validation / tests / clôture)."""
    order = [
        "open",
        "in_progress",
        "waiting",
        "partial",
        "to_validate",
        "ok",
        "recheck",
        "rework",
        "ko",
        "tested",
        "to_test_prod",
        "prod_ok",
        "done",
        "blocked",
        "deferred",
    ]
    out = []
    for st in order:
        m = STATUS_META[st]
        out.append({"status": st, "decision": m["decision"], "label": m["label"], "group": m["group"]})
    return out


WORKABLE_STATUSES = frozenset(
    {
        "open",
        "in_progress",
        "waiting",
        "partial",
        "to_validate",
        "recheck",
        "rework",
        "tested",
        "to_test_prod",
    }
)

DONEISH_STATUSES = frozenset({"ok", "done", "prod_ok", "tested"})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    if all(t.get("status") in DONEISH_STATUSES for t in tasks):
        return "ok"
    if any(t.get("status") in ("ko", "rework", "blocked", "recheck") for t in tasks):
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
    checklist = [_check(lab, done=(status in DONEISH_STATUSES)) for lab in labels]
    surfaces_raw = entry.get("surfaces")
    if isinstance(surfaces_raw, list):
        surfaces = default_surfaces([str(x) for x in surfaces_raw])
    elif isinstance(surfaces_raw, dict):
        surfaces = surfaces_raw
    else:
        surfaces = default_surfaces(entry.get("surfaceKeys"))
    if status in DONEISH_STATUSES:
        for s in surfaces.values():
            s["done"] = True
    note = ""
    if status in DONEISH_STATUSES:
        note = (entry.get("completionNote") or entry.get("note") or "").strip()
        if not note:
            note = f"Marqué terminé dans le catalogue / Markdown ({status}). Sync docs."
    return {
        "id": entry["id"],
        "cycleId": entry.get("cycleId"),
        "section": entry.get("section") or "",
        "label": entry.get("label") or entry["id"],
        "description": entry.get("description") or "",
        "expected": entry.get("expected") or "",
        "status": status,
        "order": int(entry.get("order") or 0),
        "kind": entry.get("kind") or "task",
        "parentId": entry.get("parentId"),
        "blockedBy": list(entry.get("blockedBy") or []),
        "logSnippets": list(entry.get("logSnippets") or []),
        "howToSteps": list(entry.get("howToSteps") or []),
        "docLinks": list(entry.get("docLinks") or []),
        "surfaces": surfaces,
        "checklist": checklist,
        "porteurNote": note,
        "history": [],
        "source": entry.get("source") or "catalog",
        "completionNote": entry.get("completionNote") or "",
    }


def default_releases() -> list[dict[str, Any]]:
    return [
        {
            "id": "rel-mvp-local",
            "label": "v0.1 — MVP local",
            "status": "partial",
            "summary": "Stack make up : Mail/Drive/Photos/Pass web + mobiles de base.",
            "features": ["Auth JWT", "Drive MVP", "Mail IMAP", "Photos", "Pass vault", "Pilotage"],
        },
        {
            "id": "rel-preprod-https",
            "label": "v0.2 — Préprod HTTPS",
            "status": "open",
            "summary": "Gateway HTTPS, CORS, DNS/NPM, login mobile réel (H14).",
            "features": ["H14 gateway HTTPS", "DEPLOY-DNS", "CORS prod", "Mobile broker"],
        },
        {
            "id": "rel-prod-full",
            "label": "v1.0 — Prod complète",
            "status": "open",
            "summary": "Toutes les gates pré-prod OK + OTA + Drive desktop sync.",
            "features": ["Gates PREPROD-*", "REL OTA", "DRIVE-DESKTOP", "Mail prod"],
        },
    ]


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
        "releases": cat.get("releases") or default_releases(),
        "inbox": [],
        "focusTaskId": None,
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
                "kind": "task",
                "parentId": None,
                "blockedBy": [],
                "logSnippets": [],
            }
        },
        "releases": default_releases(),
        "inbox": [],
        "focusTaskId": tid,
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
        for key in ("kind", "parentId", "blockedBy", "logSnippets", "surfaces", "completionNote"):
            if old.get(key) is not None:
                cur[key] = deepcopy(old[key]) if isinstance(old.get(key), (list, dict)) else old[key]
        # howTo/doc toujours depuis catalogue
        if cur.get("howToSteps") is None:
            cur["howToSteps"] = []
        if cur.get("docLinks") is None:
            cur["docLinks"] = []
        if not cur.get("surfaces"):
            cur["surfaces"] = default_surfaces()
        # Note catalogue si tâche OK sans note utilisateur
        if (
            not (old.get("porteurNote") or "").strip()
            and (cur.get("status") in DONEISH_STATUSES)
            and (cur.get("completionNote") or "")
        ):
            cur["porteurNote"] = cur["completionNote"]
        # Checklist : merge by label
        old_by_label = {
            (c.get("label") or ""): c for c in (old.get("checklist") or []) if c.get("label")
        }
        # Si le catalogue a changé les labels, garder done seulement sur labels identiques
        new_cl = []
        for c in cur.get("checklist") or []:
            lab = c.get("label") or ""
            if lab in old_by_label and old_by_label[lab].get("done"):
                c = {**c, "done": True, "id": old_by_label[lab].get("id") or c.get("id")}
            elif lab in old_by_label:
                c = {**c, "id": old_by_label[lab].get("id") or c.get("id")}
            new_cl.append(c)
        cur["checklist"] = new_cl
        # Statut : garder décision utilisateur si plus « avancée » que le seed
        old_st = old.get("status") or "open"
        seed_st = cur.get("status") or "open"
        rank = {
            "open": 0,
            "in_progress": 1,
            "waiting": 2,
            "partial": 3,
            "to_validate": 4,
            "recheck": 5,
            "rework": 6,
            "blocked": 7,
            "tested": 8,
            "to_test_prod": 9,
            "deferred": 10,
            "ko": 11,
            "ok": 12,
            "prod_ok": 13,
            "done": 14,
        }
        # Si l'utilisateur a une history decide, privilégier old
        has_decide = any(
            str(h.get("action", "")).startswith("decide:") for h in (old.get("history") or [])
        )
        if has_decide or rank.get(old_st, 0) >= rank.get(seed_st, 0):
            cur["status"] = old_st
        out_tasks[tid] = cur

    # Préserver inbox / focus / releases éditées
    if existing.get("inbox"):
        out["inbox"] = deepcopy(existing["inbox"])
    else:
        out.setdefault("inbox", [])
    if existing.get("focusTaskId"):
        out["focusTaskId"] = existing["focusTaskId"]
    if existing.get("releases"):
        # Merge by id : garder status/notes utilisateur
        seed_rel = {r["id"]: r for r in (out.get("releases") or []) if r.get("id")}
        merged_rel = []
        seen = set()
        for old_r in existing["releases"]:
            rid = old_r.get("id")
            if not rid:
                continue
            seen.add(rid)
            base = deepcopy(seed_rel.get(rid) or {})
            base.update({k: v for k, v in old_r.items() if v is not None})
            merged_rel.append(base)
        for rid, r in seed_rel.items():
            if rid not in seen:
                merged_rel.append(deepcopy(r))
        out["releases"] = merged_rel
    else:
        out.setdefault("releases", default_releases())

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
        if st in DONEISH_STATUSES:
            for c in t.get("checklist") or []:
                c["done"] = True
            for s in (t.get("surfaces") or {}).values():
                if isinstance(s, dict):
                    s["done"] = True
            if not (t.get("porteurNote") or "").strip():
                t["porteurNote"] = (
                    (t.get("completionNote") or "").strip()
                    or f"Terminé d’après TODOS.md / BACKLOG.md (sync docs). Statut catalogue → {st}."
                )
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
    out.setdefault("inbox", [])
    out.setdefault("releases", default_releases())
    out.setdefault("focusTaskId", None)
    out["cycleViews"] = build_cycle_views(out)
    tasks = list((out.get("tasks") or {}).values())
    out["counts"] = {
        "open": sum(1 for t in tasks if t.get("status") == "open"),
        "in_progress": sum(1 for t in tasks if t.get("status") == "in_progress"),
        "partial": sum(1 for t in tasks if t.get("status") == "partial"),
        "to_validate": sum(1 for t in tasks if t.get("status") == "to_validate"),
        "ok": sum(1 for t in tasks if t.get("status") in ("ok", "done", "prod_ok")),
        "ko": sum(1 for t in tasks if t.get("status") in ("ko", "rework", "recheck")),
        "blocked": sum(1 for t in tasks if t.get("status") == "blocked"),
        "deferred": sum(1 for t in tasks if t.get("status") in ("deferred", "waiting")),
        "total": len(tasks),
        "problems": sum(
            1
            for t in tasks
            if t.get("kind") == "problem"
            and t.get("status") in WORKABLE_STATUSES | {"blocked"}
        ),
        "inbox": len(out.get("inbox") or []),
    }
    out["decisionsCatalog"] = decisions_catalog()
    tasks_map = out.get("tasks") or {}
    now_ids = next(
        (c.get("itemIds") or [] for c in out.get("cycles") or [] if c.get("id") == "cycle-now"),
        [],
    )

    def _is_workable(t: dict[str, Any] | None) -> bool:
        if not t:
            return False
        if t.get("status") == "blocked":
            return False
        return t.get("status") in WORKABLE_STATUSES

    active = None
    # 1) Focus explicite s'il est workable
    focus_id = out.get("focusTaskId")
    if focus_id and _is_workable(tasks_map.get(focus_id)):
        t = tasks_map[focus_id]
        active = {
            "id": focus_id,
            "label": t.get("label"),
            "status": t.get("status"),
            "kind": t.get("kind"),
            "statusLabel": label_from_status(t.get("status") or "open"),
        }
    # 2) Problèmes ouverts en tête du cycle immédiat (bloquent le parent)
    if not active:
        for tid in now_ids:
            t = tasks_map.get(tid)
            if t and t.get("kind") == "problem" and _is_workable(t):
                active = {
                    "id": tid,
                    "label": t.get("label"),
                    "status": t.get("status"),
                    "kind": "problem",
                    "parentId": t.get("parentId"),
                    "statusLabel": label_from_status(t.get("status") or "open"),
                }
                break
    # 3) Première tâche workable (non bloquée) dans l'ordre — préfère in_progress
    if not active:
        for prefer in ("in_progress", None):
            for tid in now_ids:
                t = tasks_map.get(tid)
                if not _is_workable(t):
                    continue
                if prefer and t.get("status") != prefer:
                    continue
                active = {
                    "id": tid,
                    "label": t.get("label"),
                    "status": t.get("status"),
                    "kind": t.get("kind") or "task",
                    "statusLabel": label_from_status(t.get("status") or "open"),
                }
                break
            if active:
                break
    # Info blocage si la première du cycle est blocked
    blocked_hint = None
    for tid in now_ids:
        t = tasks_map.get(tid)
        if t and t.get("status") == "blocked":
            blockers = [
                {"id": bid, "label": (tasks_map.get(bid) or {}).get("label") or bid}
                for bid in (t.get("blockedBy") or [])
                if bid in tasks_map
            ]
            blocked_hint = {
                "taskId": tid,
                "label": t.get("label"),
                "blockedBy": blockers,
                "resumeHint": "Résous le problème lié puis reprends cette tâche.",
            }
            break
    out["active"] = active
    out["blockedHint"] = blocked_hint
    out["openProblems"] = [
        {
            "id": t["id"],
            "label": t.get("label"),
            "parentId": t.get("parentId"),
            "status": t.get("status"),
        }
        for t in tasks
        if t.get("kind") == "problem" and t.get("status") in WORKABLE_STATUSES
    ]
    # À valider (file de revue)
    out["toValidate"] = [
        {"id": t["id"], "label": t.get("label"), "status": t.get("status")}
        for t in tasks
        if t.get("status") in ("to_validate", "recheck")
    ]
    preprod = next((c for c in out.get("cycleViews") or [] if c.get("id") == "cycle-preprod"), None)
    out["preprodProgress"] = {
        "okCount": (preprod or {}).get("okCount") or 0,
        "total": (preprod or {}).get("total") or 0,
        "progressLabel": (preprod or {}).get("progressLabel") or "0/0 OK",
    }
    recent = [t for t in tasks if t.get("status") in DONEISH_STATUSES]
    recent.sort(
        key=lambda t: (t.get("history") or [{}])[-1].get("at", "") if t.get("history") else "",
        reverse=True,
    )
    out["recentDone"] = [
        {"id": t["id"], "label": t.get("label"), "status": t.get("status")} for t in recent[:12]
    ]
    out["docsRoot"] = str(docs_root())
    out["catalogPath"] = str(catalog_path())
    out["catalogLoaded"] = catalog_path().is_file()
    return out


def _prepend_cycle_now(board: dict[str, Any], tid: str) -> None:
    for cycle in board.get("cycles") or []:
        if cycle.get("id") != "cycle-now":
            continue
        ids = [i for i in (cycle.get("itemIds") or []) if i != tid]
        ids.insert(0, tid)
        cycle["itemIds"] = ids
        for idx, i in enumerate(ids):
            if i in (board.get("tasks") or {}):
                board["tasks"][i]["order"] = idx + 1
        return


def apply_board_action(board: dict[str, Any], body: dict[str, Any]) -> tuple[dict[str, Any], str]:
    board = deepcopy(board)
    tasks: dict[str, Any] = board.setdefault("tasks", {})
    board.setdefault("inbox", [])
    board.setdefault("releases", default_releases())
    action = body.get("type") or ""
    item_id = body.get("itemId") or ""
    task = tasks.get(item_id)
    if not task and action not in ("create", "inbox_note", "release_status"):
        raise ValueError(f"Tâche inconnue : {item_id}")

    msg = "OK"

    if action == "decide":
        decision = (body.get("decision") or "").upper().replace(" ", "_").replace("-", "_")
        note = (body.get("note") or "").strip()
        new_status = status_from_decision(decision)
        progress = checklist_progress(task)
        # OK / Terminée / Prod OK exigent checklist complète → sinon Partiel
        # Partiel reste Partiel même si tout est coché (À valider = clic explicite).
        if (
            new_status in ("ok", "done", "prod_ok", "tested")
            and not progress["allDone"]
            and progress["total"] > 0
        ):
            new_status = "partial"
            decision = "PARTIEL"
            msg = "Checklist incomplète → Partiel (coche tout, puis Validé / À valider)."
        else:
            msg = f"Décision {label_from_status(new_status)} enregistrée."
        task["status"] = new_status
        if note:
            task["porteurNote"] = note
        if new_status == "in_progress":
            board["focusTaskId"] = item_id
            _prepend_cycle_now(board, item_id)
        task.setdefault("history", []).append(
            {"at": _now(), "action": f"decide:{decision}", "note": note or None}
        )
        if new_status in ("ok", "done") and task.get("kind") == "problem":
            _resolve_problem_side_effects(board, item_id, note)
            msg = f"Problème {item_id} résolu — parent repris si plus de bloqueurs."

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
        # Ne jamais auto-promouvoir en À valider : l’utilisateur clique la décision.
        if task.get("status") in DONEISH_STATUSES and not progress["allDone"]:
            task["status"] = "partial"
        task.setdefault("history", []).append(
            {"at": _now(), "action": f"checklist:{cid}={'1' if done else '0'}"}
        )
        if msg == "OK":
            msg = "Checklist mise à jour."

    elif action == "checklist_bulk":
        # Cocher plusieurs critères + décision optionnelle (ex. LAN → Partiel) en une requête.
        ids_raw = body.get("checklistItemIds") or body.get("checklistIds") or []
        if not isinstance(ids_raw, list) or not ids_raw:
            raise ValueError("checklistItemIds requis (liste non vide)")
        id_set = {str(x) for x in ids_raw}
        done = bool(body.get("done", True))
        matched = 0
        for c in task.get("checklist") or []:
            if str(c.get("id")) in id_set:
                c["done"] = done
                matched += 1
        if matched == 0:
            raise ValueError("Aucun critère correspondant")
        note = (body.get("note") or "").strip()
        decision_raw = (body.get("decision") or "").strip()
        if decision_raw:
            decision = decision_raw.upper().replace(" ", "_").replace("-", "_")
            new_status = status_from_decision(decision)
            progress = checklist_progress(task)
            if (
                new_status in ("ok", "done", "prod_ok", "tested")
                and not progress["allDone"]
                and progress["total"] > 0
            ):
                new_status = "partial"
                decision = "PARTIEL"
            task["status"] = new_status
            if note:
                task["porteurNote"] = note
            if new_status == "in_progress":
                board["focusTaskId"] = item_id
                _prepend_cycle_now(board, item_id)
            task.setdefault("history", []).append(
                {
                    "at": _now(),
                    "action": f"checklist_bulk:{matched}:{decision}",
                    "note": note or None,
                }
            )
            msg = f"{matched} critère(s) + {label_from_status(new_status)}."
        else:
            progress = checklist_progress(task)
            if task.get("status") in DONEISH_STATUSES and not progress["allDone"]:
                task["status"] = "partial"
            if note:
                task["porteurNote"] = note
            task.setdefault("history", []).append(
                {"at": _now(), "action": f"checklist_bulk:{matched}:{'1' if done else '0'}"}
            )
            msg = f"{matched} critère(s) mis à jour."

    elif action == "surface":
        key = (body.get("surfaceKey") or body.get("section") or "").strip()
        if not key:
            raise ValueError("surfaceKey requis")
        surfaces = task.setdefault("surfaces", default_surfaces())
        if key not in surfaces:
            surfaces[key] = {"done": False, "label": dict(SURFACE_KEYS).get(key, key)}
        surfaces[key]["done"] = bool(body.get("done"))
        task.setdefault("history", []).append(
            {"at": _now(), "action": f"surface:{key}={'1' if body.get('done') else '0'}"}
        )
        msg = f"Surface {key} mise à jour."

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
            "kind": body.get("kind") or "task",
            "parentId": body.get("parentId"),
            "blockedBy": [],
            "logSnippets": [],
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

    elif action == "report_problem":
        # Bloque la tâche courante, crée un problème enfant en tête de cycle-now
        parent = task
        note = (body.get("note") or body.get("label") or "Problème signalé").strip()
        log_text = (body.get("logText") or "").strip()
        pid = (body.get("problemId") or "").strip() or f"P-{uuid4().hex[:8]}"
        if pid in tasks:
            raise ValueError("ID problème déjà utilisé")
        problem = {
            "id": pid,
            "cycleId": "cycle-now",
            "section": "Problème",
            "label": f"Problème · {note[:80]}",
            "description": note,
            "expected": "Corriger le blocage puis marquer OK pour reprendre la tâche parente.",
            "status": "open",
            "order": 0,
            "kind": "problem",
            "parentId": item_id,
            "blockedBy": [],
            "logSnippets": (
                [{"at": _now(), "source": body.get("logSource") or "manual", "text": log_text[:8000]}]
                if log_text
                else []
            ),
            "checklist": [
                _check("Reproduire / confirmer le symptôme"),
                _check("Corriger (code, config, infra)"),
                _check("Vérifier que le parent peut reprendre"),
            ],
            "porteurNote": log_text[:2000] if log_text else "",
            "history": [{"at": _now(), "action": "report_problem", "note": note}],
            "source": "manual",
        }
        tasks[pid] = problem
        parent["status"] = "blocked"
        blockers = list(parent.get("blockedBy") or [])
        if pid not in blockers:
            blockers.append(pid)
        parent["blockedBy"] = blockers
        parent.setdefault("history", []).append(
            {"at": _now(), "action": f"blocked_by:{pid}", "note": note}
        )
        _prepend_cycle_now(board, pid)
        board["focusTaskId"] = pid
        msg = f"Problème {pid} créé — {item_id} bloqué. Traite le problème d’abord."

    elif action == "resolve_problem":
        note = (body.get("note") or "").strip()
        task["status"] = "ok"
        for c in task.get("checklist") or []:
            c["done"] = True
        task.setdefault("history", []).append(
            {"at": _now(), "action": "resolve_problem", "note": note or None}
        )
        msg = _resolve_problem_side_effects(board, item_id, note)

    elif action == "inbox_note":
        text = (body.get("note") or body.get("label") or "").strip()
        if not text:
            raise ValueError("Note vide")
        kind = body.get("kind") or "problem"  # problem | mobile_log | container_log | test
        entry = {
            "id": f"IN-{uuid4().hex[:8]}",
            "at": _now(),
            "kind": kind,
            "text": text[:8000],
            "linkedTaskId": body.get("itemId") or body.get("parentId") or None,
            "promoted": False,
        }
        board.setdefault("inbox", []).insert(0, entry)
        board["inbox"] = board["inbox"][:80]
        msg = "Note inbox enregistrée (tests / problèmes à la volée)."

    elif action == "promote_inbox":
        iid = body.get("inboxId") or body.get("itemId") or ""
        inbox = board.get("inbox") or []
        entry = next((e for e in inbox if e.get("id") == iid), None)
        if not entry:
            raise ValueError("Entrée inbox introuvable")
        parent_id = body.get("parentId") or entry.get("linkedTaskId") or board.get("focusTaskId")
        entry["promoted"] = True
        if parent_id and parent_id in tasks:
            # Inline report_problem against parent
            note = (entry.get("text") or "depuis inbox").strip()
            log_text = note if entry.get("kind") in ("mobile_log", "container_log") else ""
            pid = f"P-{uuid4().hex[:8]}"
            problem = {
                "id": pid,
                "cycleId": "cycle-now",
                "section": "Problème",
                "label": f"Problème · {note[:80]}",
                "description": note,
                "expected": "Corriger le blocage puis marquer OK pour reprendre la tâche parente.",
                "status": "open",
                "order": 0,
                "kind": "problem",
                "parentId": parent_id,
                "blockedBy": [],
                "logSnippets": (
                    [{"at": _now(), "source": entry.get("kind") or "inbox", "text": log_text[:8000]}]
                    if log_text
                    else []
                ),
                "checklist": [
                    _check("Reproduire / confirmer le symptôme"),
                    _check("Corriger (code, config, infra)"),
                    _check("Vérifier que le parent peut reprendre"),
                ],
                "porteurNote": "",
                "history": [{"at": _now(), "action": "promote_inbox", "note": note}],
                "source": "manual",
            }
            tasks[pid] = problem
            parent = tasks[parent_id]
            parent["status"] = "blocked"
            blockers = list(parent.get("blockedBy") or [])
            if pid not in blockers:
                blockers.append(pid)
            parent["blockedBy"] = blockers
            _prepend_cycle_now(board, pid)
            board["focusTaskId"] = pid
            msg = f"Inbox → problème {pid} (parent {parent_id} bloqué)."
        else:
            tid = f"T-{uuid4().hex[:8]}"
            tasks[tid] = {
                "id": tid,
                "cycleId": "cycle-now",
                "section": "Inbox",
                "label": (entry.get("text") or tid)[:80],
                "description": entry.get("text") or "",
                "expected": "Traiter puis OK.",
                "status": "open",
                "order": 0,
                "kind": "problem" if entry.get("kind") == "problem" else "task",
                "parentId": None,
                "blockedBy": [],
                "logSnippets": [],
                "checklist": [_check("Traiter")],
                "porteurNote": "",
                "history": [{"at": _now(), "action": "promote_inbox"}],
                "source": "manual",
            }
            _prepend_cycle_now(board, tid)
            board["focusTaskId"] = tid
            msg = f"Inbox promue en tâche {tid}."

    elif action == "attach_log":
        text = (body.get("note") or body.get("logText") or "").strip()
        if not text:
            raise ValueError("Log vide")
        snippets = list(task.get("logSnippets") or [])
        snippets.insert(
            0,
            {
                "at": _now(),
                "source": body.get("logSource") or "manual",
                "text": text[:8000],
            },
        )
        task["logSnippets"] = snippets[:20]
        task.setdefault("history", []).append(
            {"at": _now(), "action": f"attach_log:{(body.get('logSource') or 'manual')}"}
        )
        msg = "Log attaché à la tâche."

    elif action == "set_focus":
        if item_id and item_id not in tasks:
            raise ValueError("Tâche inconnue")
        board["focusTaskId"] = item_id or None
        if item_id:
            _prepend_cycle_now(board, item_id)
        msg = f"Focus → {item_id or 'aucun'}."

    elif action == "release_status":
        rid = body.get("releaseId") or item_id
        raw = body.get("decision") or body.get("status") or "open"
        st = str(raw).lower()
        if st.upper() in ("OK", "KO", "PARTIEL", "PLUS_TARD", "REWORK", "BLOQUE"):
            st = status_from_decision(str(raw))
        if st not in ("ok", "partial", "open", "deferred", "ko", "rework", "blocked"):
            st = "open"
        found = False
        for rel in board.get("releases") or []:
            if rel.get("id") == rid:
                rel["status"] = st
                if body.get("note"):
                    rel["note"] = body.get("note")
                found = True
                break
        if not found:
            raise ValueError("Release inconnue")
        msg = f"Release {rid} → {st}."

    else:
        raise ValueError(f"Action inconnue : {action}")

    board["updatedAt"] = _now()
    board["version"] = int(board.get("version") or 2)
    return board, msg


def _resolve_problem_side_effects(board: dict[str, Any], problem_id: str, note: str = "") -> str:
    tasks = board.get("tasks") or {}
    task = tasks.get(problem_id)
    if not task:
        return "Problème introuvable."
    parent_id = task.get("parentId")
    if parent_id and parent_id in tasks:
        parent = tasks[parent_id]
        blockers = [b for b in (parent.get("blockedBy") or []) if b != problem_id]
        parent["blockedBy"] = blockers
        if not blockers and parent.get("status") == "blocked":
            parent["status"] = "partial"
            parent.setdefault("history", []).append(
                {"at": _now(), "action": "unblocked", "note": f"Reprise après {problem_id}"}
            )
            board["focusTaskId"] = parent_id
            _prepend_cycle_now(board, parent_id)
            return f"Problème résolu — reprise de {parent_id}."
        return f"Problème résolu — reste {len(blockers)} bloqueur(s) sur {parent_id}."
    return "Problème marqué résolu."


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
