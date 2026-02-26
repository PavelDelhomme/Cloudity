"""Tests for GET /admin/stats (dashboard statistics)."""
import pytest
import os
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
