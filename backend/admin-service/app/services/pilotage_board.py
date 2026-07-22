"""Seed + logique du board Pilotage (aligné JobbingTrack validation-board)."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

TaskStatus = str  # open|partial|ok|ko|deferred|rework
DecisionStamp = str  # OK|KO|PARTIEL|PLUS_TARD|REWORK


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


def _task(
    tid: str,
    *,
    cycle_id: str,
    section: str,
    label: str,
    description: str,
    expected: str,
    status: TaskStatus = "open",
    order: int = 0,
    checklist: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": tid,
        "cycleId": cycle_id,
        "section": section,
        "label": label,
        "description": description,
        "expected": expected,
        "status": status,
        "order": order,
        "checklist": checklist or [],
        "porteurNote": "",
        "history": [],
    }


def _check(label: str, done: bool = False) -> dict[str, Any]:
    return {"id": f"c-{uuid4().hex[:10]}", "label": label, "done": done}


def build_seed_board() -> dict[str, Any]:
    """Tâches initiales alignées TODOS.md / BACKLOG.md (session 2026-07-22)."""
    cycles = [
        {
            "id": "cycle-now",
            "label": "À faire maintenant",
            "description": "Priorités courtes (hors mail prod)",
            "itemIds": ["H14", "H19", "DEPLOY-DNS-01", "QA-SMOKE"],
        },
        {
            "id": "cycle-mobile",
            "label": "Mobile & suite",
            "description": "Apps Flutter, auth, gateway",
            "itemIds": ["H6b", "H6c", "H15", "H18"],
        },
        {
            "id": "cycle-deploy",
            "label": "Déploiement Portainer",
            "description": "Env, DNS, stacks — outillage env déjà livré",
            "itemIds": ["DEPLOY-ENV-01", "DEPLOY-SUIVI-01", "DEPLOY-PORTAINER-02"],
        },
        {
            "id": "cycle-later",
            "label": "Plus tard",
            "description": "Après stabilisation prefs / OTA",
            "itemIds": ["ADM-UPDATE-01", "MAIL-PROD-PAUSE"],
        },
    ]

    tasks = {
        "H14": _task(
            "H14",
            cycle_id="cycle-now",
            section="Mobile",
            label="H14 — Gateway mobile HTTPS prod",
            description="Valider CLOUDITY_MOBILE_GATEWAY_URL via make sync-public-urls / env-prod sur téléphone (HTTPS réel + CORS).",
            expected="Login Mail/Drive/Photos/Pass OK contre gateway HTTPS public.",
            order=1,
            checklist=[
                _check("sync-public-urls / env-prod renseignés"),
                _check("App mobile pointe vers HTTPS gateway"),
                _check("Login + sync smoke OK"),
            ],
        ),
        "H19": _task(
            "H19",
            cycle_id="cycle-now",
            section="Mobile",
            label="H19 — Auth mobile sans duplication",
            description="Extraire SessionStore / LoginScreen dans cloudity_shared (au lieu de copies par app).",
            expected="Une seule base auth partagée ; apps Mail/Drive/Photos/Pass branchées.",
            order=2,
            checklist=[
                _check("Package / module partagé créé"),
                _check("Au moins 2 apps migrées"),
                _check("Tests flutter verts"),
            ],
        ),
        "DEPLOY-DNS-01": _task(
            "DEPLOY-DNS-01",
            cycle_id="cycle-now",
            section="Déploiement",
            label="DEPLOY-DNS-01 — DNS api.cloudity + NPM",
            description="Enregistrements DNS + Proxy Hosts NPM ; appliquer .env.prod généré (make env-prod).",
            expected="https://api.cloudity.<domaine> et https://cloudity.<domaine> joignables.",
            order=3,
            checklist=[
                _check("DNS A/AAAA en place"),
                _check("NPM proxy hosts + TLS"),
                _check("make portainer-env collé dans Portainer"),
            ],
        ),
        "QA-SMOKE": _task(
            "QA-SMOKE",
            cycle_id="cycle-now",
            section="Qualité",
            label="QA — Smoke admin + apps locales",
            description="Après sync URLs / seed admin : /4dm1n, /app, make status.",
            expected="Dashboard admin charge ; login seed OK ; pas d’erreur module front.",
            order=4,
            checklist=[
                _check("make status OK"),
                _check("/4dm1n Dashboard OK"),
                _check("/app hub OK"),
            ],
        ),
        "H6b": _task(
            "H6b",
            cycle_id="cycle-mobile",
            section="Mobile",
            label="H6b — Auth suite mobile (broker)",
            description="Broker Android cloudity_auth_broker : continuer avec ce compte, reprise session.",
            expected="Partage de session entre apps sur appareil réel.",
            order=1,
            status="partial",
            checklist=[_check("Broker Android"), _check("iOS Keychain group")],
        ),
        "H6c": _task(
            "H6c",
            cycle_id="cycle-mobile",
            section="Mobile",
            label="H6c — Sécurité mobile transverse",
            description="Checklist MOBILE-SECURITY ; logout purge broker ; reste sanitization erreurs + TLS prod.",
            expected="Checklist verte + messages d’erreur sains.",
            order=2,
            status="partial",
            checklist=[
                _check("Checklist security ☑", True),
                _check("Logout purge broker", True),
                _check("Sanitization erreurs Mail"),
                _check("TLS prod téléphone"),
            ],
        ),
        "H15": _task(
            "H15",
            cycle_id="cycle-mobile",
            section="Photos",
            label="H15 — Sauvegarde galerie robuste",
            description="Backup arrière-plan, dossiers téléphone, matching cloud↔local.",
            expected="Validation E2E cross-appareil (Samsung).",
            order=3,
            status="partial",
            checklist=[_check("Matching fingerprints", True), _check("E2E Samsung")],
        ),
        "H18": _task(
            "H18",
            cycle_id="cycle-mobile",
            section="Admin mobile",
            label="H18 — admin_app production-ready",
            description="Gateway dart-define ; login admin + 2FA ; liste tenants.",
            expected="App admin mobile utilisable en préprod.",
            order=4,
            checklist=[_check("Login admin"), _check("2FA"), _check("Liste tenants")],
        ),
        "DEPLOY-ENV-01": _task(
            "DEPLOY-ENV-01",
            cycle_id="cycle-deploy",
            section="Ops",
            label="DEPLOY-ENV-01 — Hôte public + .env.prod",
            description="CLOUDITY_PUBLIC_* · make sync-public-urls · env-prod · portainer-env.",
            expected="Une IP/domaine change tout ; Portainer collable.",
            order=1,
            status="ok",
            checklist=[
                _check("sync-public-urls", True),
                _check("env-prod / portainer-env", True),
                _check("Doc ENV-GENERATION", True),
            ],
        ),
        "DEPLOY-SUIVI-01": _task(
            "DEPLOY-SUIVI-01",
            cycle_id="cycle-deploy",
            section="Ops",
            label="DEPLOY-SUIVI-01 — Feuille de route A→C",
            description="Suivre DEPLOIEMENT-SUIVI.md : local → CI → Portainer.",
            expected="Phases A/B/C cochées sur VPS réel.",
            order=2,
            checklist=[_check("Phase A locale"), _check("Phase B CI"), _check("Phase C Portainer")],
        ),
        "DEPLOY-PORTAINER-02": _task(
            "DEPLOY-PORTAINER-02",
            cycle_id="cycle-deploy",
            section="Ops",
            label="DEPLOY-PORTAINER-02 — Update stack GHCR",
            description="Doc/script pull tag GHCR + redeploy semi-auto.",
            expected="Update stack documenté et testé.",
            order=3,
            checklist=[_check("Doc update"), _check("Essai redeploy")],
        ),
        "ADM-UPDATE-01": _task(
            "ADM-UPDATE-01",
            cycle_id="cycle-later",
            section="Admin",
            label="ADM-UPDATE — Mises à jour visibles /4dm1n",
            description="Indicateurs GHCR/web/APK + actions maj — après REL + prefs.",
            expected="Page ou section Dashboard « Mises à jour ».",
            order=1,
            status="deferred",
            checklist=[_check("UI indicateurs"), _check("Actions update")],
        ),
        "MAIL-PROD-PAUSE": _task(
            "MAIL-PROD-PAUSE",
            cycle_id="cycle-later",
            section="Mail",
            label="Mail prod (pause) — OVH / VPS / MTA",
            description="Ne pas toucher tant que l’utilisateur ne dit pas « on retourne sur la partie mail ».",
            expected="Reprise explicite uniquement.",
            order=2,
            status="deferred",
            checklist=[_check("Signal utilisateur « retour mail »")],
        ),
    }

    return {
        "version": 1,
        "updatedAt": _now(),
        "cycles": cycles,
        "tasks": tasks,
    }


def enrich_board(board: dict[str, Any]) -> dict[str, Any]:
    """Ajoute cycleViews + compteurs pour l’UI."""
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
    # File active : première open/partial du cycle-now
    active = None
    now_ids = next((c.get("itemIds") or [] for c in out.get("cycles") or [] if c.get("id") == "cycle-now"), [])
    for tid in now_ids:
        t = (out.get("tasks") or {}).get(tid)
        if t and t.get("status") in ("open", "partial", "rework"):
            active = {"id": tid, "label": t.get("label"), "status": t.get("status")}
            break
    out["active"] = active
    recent = sorted(
        [t for t in tasks if t.get("status") == "ok"],
        key=lambda t: (t.get("history") or [{}])[-1].get("at", "") if t.get("history") else "",
        reverse=True,
    )[:8]
    out["recentDone"] = [{"id": t["id"], "label": t.get("label"), "status": "ok"} for t in recent]
    return out


def apply_board_action(board: dict[str, Any], body: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Applique une action et retourne (board, message)."""
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
            msg = "Checklist incomplète → enregistré en PARTIEL (force OK après avoir tout coché)."
        else:
            msg = f"Décision {decision} enregistrée."
        task["status"] = new_status
        if note:
            task["porteurNote"] = note
        hist = task.setdefault("history", [])
        hist.append({"at": _now(), "action": f"decide:{decision}", "note": note or None})
        # Déplacer vers cycle-later si PLUS_TARD
        if new_status == "deferred":
            _move_task_cycle(board, item_id, "cycle-later")
        elif new_status == "ok":
            # rester dans son cycle ; recentDone dérivé
            pass

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
        new_task = _task(
            tid,
            cycle_id=cycle_id,
            section=str(body.get("section") or "Perso"),
            label=label,
            description=str(body.get("description") or ""),
            expected=str(body.get("expected") or "Critères à préciser."),
            order=99,
            checklist=[_check(c) for c in (body.get("checklistLabels") or [])] or [_check("Faire / valider")],
        )
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
    board["version"] = int(board.get("version") or 1)
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
