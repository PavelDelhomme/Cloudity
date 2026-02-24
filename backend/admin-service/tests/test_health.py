"""Tests du endpoint /health (sans DB)."""
import pytest
from fastapi.testclient import TestClient

# Import de l'app après éventuel réglage d'env (éviter import side-effect en prod)
import os
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/cloudity")

from main import app

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
