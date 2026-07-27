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


def test_h14_is_first_openish_in_cycle_now():
    board = enrich_board(build_seed_board())
    assert board["active"]["id"] == "H14"


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
