#!/usr/bin/env python3
"""Tests unitaires logique pilotage (catalogue + sync)."""
import os
from pathlib import Path

# Racine dépôt : env, volume Docker /cloudity-repo, ou parents locaux
_CANDIDATES = [
    os.environ.get("PILOTAGE_DOCS_ROOT"),
    os.environ.get("CVE_SCAN_REPO_ROOT"),
    "/cloudity-repo",
]
_REPO = None
for c in _CANDIDATES:
    if c and (Path(c) / "docs" / "operations" / "pilotage-catalog.json").is_file():
        _REPO = Path(c)
        break
if _REPO is None:
    here = Path(__file__).resolve()
    for i in range(2, 8):
        if i >= len(here.parents):
            break
        p = here.parents[i]
        if (p / "docs" / "operations" / "pilotage-catalog.json").is_file():
            _REPO = p
            break
assert _REPO is not None, "pilotage-catalog.json introuvable"
os.environ["PILOTAGE_DOCS_ROOT"] = str(_REPO)

from app.services.pilotage_board import (  # noqa: E402
    apply_board_action,
    build_seed_board,
    enrich_board,
    merge_boards,
    parse_md_statuses,
    sync_from_docs,
)


def test_catalog_seed_has_many_tasks():
    board = build_seed_board()
    assert len(board["tasks"]) >= 100
    assert "H14" in board["tasks"]
    assert board["tasks"]["H14"]["cycleId"] == "cycle-now"
    assert any(c["id"] == "cycle-deploy" for c in board["cycles"])


def test_first_openish_in_cycle_now_is_structure_priority():
    """cycle-now priorise FE-HUB / multi-apps avant H14 HTTPS (voir MULTI-APPS-WEB-MOBILE)."""
    board = enrich_board(build_seed_board())
    assert board["active"]["id"] == "FE-HUB-01"
    assert board["active"]["cycleId"] == "cycle-now"
    assert "H14" in board["tasks"]


def test_decide_ok_incomplete_checklist_partial():
    board = build_seed_board()
    new_board, msg = apply_board_action(
        board, {"type": "decide", "itemId": "H14", "decision": "OK"}
    )
    assert new_board["tasks"]["H14"]["status"] == "partial"
    assert "PARTIEL" in msg.upper() or "partiel" in msg.lower()


def test_merge_preserves_note():
    seed = build_seed_board()
    existing = enrich_board(seed)
    existing["tasks"]["H14"]["porteurNote"] = "note test"
    existing["tasks"]["H14"]["history"] = [{"at": "x", "action": "decide:PARTIEL"}]
    existing["tasks"]["H14"]["status"] = "partial"
    merged = merge_boards(existing, seed)
    assert merged["tasks"]["H14"]["porteurNote"] == "note test"
    assert merged["tasks"]["H14"]["status"] == "partial"


def test_parse_md_statuses_finds_h_items():
    statuses = parse_md_statuses(_REPO)
    assert "H14" in statuses or "H19" in statuses
    assert len(statuses) >= 10


def test_sync_from_docs():
    board, msg = sync_from_docs(None)
    assert "Sync" in msg or "tâches" in msg
    assert len(board["tasks"]) >= 100


def test_report_problem_blocks_parent_and_becomes_active():
    board = build_seed_board()
    board, msg = apply_board_action(
        board,
        {
            "type": "report_problem",
            "itemId": "H14",
            "note": "CORS HTTPS mobile KO",
            "logText": "Access-Control-Allow-Origin missing",
            "logSource": "mobile_log",
        },
    )
    assert "bloqué" in msg.lower() or "problème" in msg.lower()
    assert board["tasks"]["H14"]["status"] == "blocked"
    blockers = board["tasks"]["H14"]["blockedBy"]
    assert len(blockers) == 1
    pid = blockers[0]
    assert board["tasks"][pid]["kind"] == "problem"
    assert board["tasks"][pid]["parentId"] == "H14"
    assert board["focusTaskId"] == pid
    enriched = enrich_board(board)
    assert enriched["active"]["id"] == pid
    assert enriched["active"]["kind"] == "problem"

    board2, msg2 = apply_board_action(
        board, {"type": "resolve_problem", "itemId": pid, "note": "CORS fixé"}
    )
    assert board2["tasks"][pid]["status"] == "ok"
    assert board2["tasks"]["H14"]["status"] == "partial"
    assert board2["tasks"]["H14"]["blockedBy"] == []
    assert board2["focusTaskId"] == "H14"
    assert "reprise" in msg2.lower() or "H14" in msg2


def test_decide_partial_stays_partial_even_if_checklist_complete():
    board = build_seed_board()
    for c in board["tasks"]["H14"]["checklist"]:
        c["done"] = True
    new_board, msg = apply_board_action(
        board, {"type": "decide", "itemId": "H14", "decision": "PARTIEL"}
    )
    assert new_board["tasks"]["H14"]["status"] == "partial"
    assert "partiel" in msg.lower()


def test_checklist_does_not_auto_promote_to_validate():
    board = build_seed_board()
    board["tasks"]["H14"]["status"] = "partial"
    for c in board["tasks"]["H14"]["checklist"]:
        c["done"] = False
    last = board["tasks"]["H14"]["checklist"][-1]
    # cocher tout sauf un, puis le dernier
    for c in board["tasks"]["H14"]["checklist"][:-1]:
        c["done"] = True
    new_board, msg = apply_board_action(
        board,
        {
            "type": "checklist",
            "itemId": "H14",
            "checklistItemId": last["id"],
            "done": True,
        },
    )
    assert new_board["tasks"]["H14"]["status"] == "partial"
    assert "à valider" not in msg.lower()


def test_checklist_bulk_lan_to_partial():
    board = build_seed_board()
    lan_ids = [
        c["id"]
        for c in board["tasks"]["H14"]["checklist"]
        if str(c.get("label", "")).startswith(("1.", "2.", "3a."))
    ]
    assert len(lan_ids) >= 1
    new_board, msg = apply_board_action(
        board,
        {
            "type": "checklist_bulk",
            "itemId": "H14",
            "checklistItemIds": lan_ids,
            "done": True,
            "decision": "PARTIEL",
            "note": "LAN OK",
        },
    )
    t = new_board["tasks"]["H14"]
    assert t["status"] == "partial"
    assert t["porteurNote"] == "LAN OK"
    for c in t["checklist"]:
        if c["id"] in lan_ids:
            assert c["done"] is True
    assert "partiel" in msg.lower() or "critère" in msg.lower()


def test_inbox_note_and_preprod_in_catalog():
    board = build_seed_board()
    assert any(c["id"] == "cycle-preprod" for c in board["cycles"])
    assert "PREPROD-01" in board["tasks"]
    assert board.get("releases")
    board, _ = apply_board_action(
        board, {"type": "inbox_note", "itemId": "H14", "note": "logcat boom", "kind": "mobile_log"}
    )
    assert len(board["inbox"]) >= 1
    assert board["inbox"][0]["kind"] == "mobile_log"
