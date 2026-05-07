"""Tests for GET /admin/stats (dashboard statistics)."""
import os

import pytest
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/cloudity")

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_stats_returns_200():
    r = client.get("/admin/stats")
    assert r.status_code == 200


def test_stats_returns_json_with_required_fields():
    r = client.get("/admin/stats")
    assert r.status_code == 200
    data = r.json()
    assert "active_tenants" in data
    assert "total_users" in data
    assert "api_calls_today" in data
    assert isinstance(data["active_tenants"], int)
    assert isinstance(data["total_users"], int)
    assert isinstance(data["api_calls_today"], int)


def test_stats_counts_non_negative():
    r = client.get("/admin/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["active_tenants"] >= 0
    assert data["total_users"] >= 0
    assert data["api_calls_today"] >= 0


def test_performance_overview_returns_200_and_shape():
    r = client.get("/admin/performance/overview")
    assert r.status_code == 200
    data = r.json()
    assert "timestamp_utc" in data
    assert "source" in data
    assert "host" in data
    assert "containers" in data
    assert "notes" in data
    assert isinstance(data["host"], dict)
    assert isinstance(data["containers"], list)
    assert isinstance(data["notes"], list)


def test_performance_budget_status_returns_200_and_shape():
    r = client.get("/admin/performance/budget-status")
    assert r.status_code == 200
    data = r.json()
    assert "evaluated_at" in data
    assert "source_snapshot" in data
    assert "violations" in data
    assert "budgets" in data
    assert isinstance(data["violations"], list)
    assert isinstance(data["budgets"], dict)


def test_performance_history_returns_200_and_shape():
    r = client.get("/admin/performance/history")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "storage_ready" in data
    assert isinstance(data["items"], list)


def test_pipeline_runs_list_returns_200_and_shape():
    r = client.get("/admin/performance/pipeline-runs")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "storage_ready" in data


def test_pipeline_ingest_rejects_when_token_configured(monkeypatch):
    monkeypatch.setenv("PERFORMANCE_INGEST_TOKEN", "test-secret-token")
    r = client.post("/admin/performance/pipeline-run", json={"pipeline_kind": "make_test"})
    assert r.status_code == 401
    r_ok = client.post(
        "/admin/performance/pipeline-run",
        json={"pipeline_kind": "make_test", "success": True, "duration_ms": 1},
        headers={"X-Cloudity-Perf-Ingest": "test-secret-token"},
    )
    assert r_ok.status_code in (200, 503)


def test_performance_record_returns_503_or_200():
    r = client.post("/admin/performance/record")
    assert r.status_code in (200, 503)


def test_performance_record_persists_when_storage_ready():
    hist = client.get("/admin/performance/history").json()
    if not hist.get("storage_ready"):
        pytest.skip("Tables cloudity_performance_* absentes (migration 33 non appliquée sur cette DB)")
    r = client.post("/admin/performance/record")
    assert r.status_code == 200
    data = r.json()
    assert "id" in data and "recorded_at" in data


def test_pipeline_ingest_persists_when_storage_ready(monkeypatch):
    monkeypatch.delenv("PERFORMANCE_INGEST_TOKEN", raising=False)
    hist = client.get("/admin/performance/history").json()
    if not hist.get("storage_ready"):
        pytest.skip("Tables cloudity_performance_* absentes")
    r = client.post(
        "/admin/performance/pipeline-run",
        json={"pipeline_kind": "pytest", "success": True, "duration_ms": 42},
    )
    assert r.status_code == 200
    data = r.json()
    assert "id" in data and "recorded_at" in data
