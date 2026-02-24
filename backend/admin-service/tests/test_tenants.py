"""Tests des endpoints tenants (nécessite Postgres ou skip si indisponible)."""
import pytest
from fastapi.testclient import TestClient

import os
os.environ.setdefault("DATABASE_URL", "postgresql://cloudity_admin:cloudity_secure_password_2025@localhost:6042/cloudity")

from main import app

client = TestClient(app)


def test_get_tenants_list():
    """Liste des tenants : 200 avec une liste (vide ou non)."""
    r = client.get("/admin/tenants")
    # Si la DB n'est pas dispo, on peut avoir 500
    if r.status_code == 200:
        assert isinstance(r.json(), list)
    elif r.status_code == 500:
        pytest.skip("DB non disponible (run make up)")


def test_create_tenant_validation():
    """Création tenant sans body : 422."""
    r = client.post("/admin/tenants", json={})
    assert r.status_code == 422
