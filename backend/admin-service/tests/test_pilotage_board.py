#!/usr/bin/env python3
"""Tests unitaires logique pilotage (sans DB)."""
from app.services.pilotage_board import apply_board_action, build_seed_board, enrich_board


def test_seed_has_cycles_and_tasks():
    board = build_seed_board()
    assert board["cycles"]
    assert "H14" in board["tasks"]
    assert board["tasks"]["DEPLOY-ENV-01"]["status"] == "ok"


def test_decide_ok_with_incomplete_checklist_becomes_partial():
    board = build_seed_board()
    # H14 has unchecked items
    new_board, msg = apply_board_action(
        board, {"type": "decide", "itemId": "H14", "decision": "OK"}
    )
    assert new_board["tasks"]["H14"]["status"] == "partial"
    assert "PARTIEL" in msg.upper() or "partiel" in msg.lower()


def test_checklist_then_ok():
    board = build_seed_board()
    task = board["tasks"]["QA-SMOKE"]
    for c in task["checklist"]:
        board, _ = apply_board_action(
            board,
            {
                "type": "checklist",
                "itemId": "QA-SMOKE",
                "checklistItemId": c["id"],
                "done": True,
            },
        )
    board, msg = apply_board_action(
        board, {"type": "decide", "itemId": "QA-SMOKE", "decision": "OK"}
    )
    assert board["tasks"]["QA-SMOKE"]["status"] == "ok"
    assert "OK" in msg


def test_enrich_counts():
    board = enrich_board(build_seed_board())
    assert board["counts"]["total"] >= 10
    assert board["cycleViews"]
    assert board["counts"]["ok"] >= 1
