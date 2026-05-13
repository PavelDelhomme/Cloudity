"""Tests du endpoint /health (sans DB)."""
import os

import pytest
from fastapi.testclient import TestClient

# Import de l'app après éventuel réglage d'env (éviter import side-effect en prod)
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/cloudity")

from app.main import app  # noqa: E402  — env défini juste au-dessus

client = TestClient(app)


def test_health_returns_200():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "healthy"
    assert "admin-service" in data.get("service", "")


def test_health_returns_json():
    r = client.get("/health")
    assert r.headers.get("content-type", "").startswith("application/json")


def test_health_has_status_field():
    r = client.get("/health")
    assert "status" in r.json()


def test_health_post_not_allowed_or_405():
    r = client.post("/health", json={})
    assert r.status_code in (405, 200)
