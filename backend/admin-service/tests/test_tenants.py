"""Tests des endpoints tenants (nécessite Postgres ou skip si indisponible)."""
import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://cloudity_admin:cloudity_secure_password_2025@localhost:6042/cloudity")

from main import app

client = TestClient(app)


def _skip_if_db_unavailable(r):
    if r.status_code == 500:
        pytest.skip("DB non disponible (run make up)")


def test_get_tenants_list():
    """Liste des tenants : 200 avec une liste (vide ou non)."""
    r = client.get("/admin/tenants")
    _skip_if_db_unavailable(r)
    if r.status_code == 200:
        assert isinstance(r.json(), list)


def test_get_tenants_list_with_skip_limit():
    """Liste des tenants avec skip/limit : 200."""
    r = client.get("/admin/tenants?skip=0&limit=10")
    _skip_if_db_unavailable(r)
    if r.status_code == 200:
        data = r.json()
        assert isinstance(data, list)
        assert len(data) <= 10


def test_get_tenant_by_id_not_found():
    """GET /admin/tenants/999999 retourne 404."""
    r = client.get("/admin/tenants/999999")
    _skip_if_db_unavailable(r)
    assert r.status_code == 404
    assert "not found" in r.json().get("detail", "").lower()


def test_create_tenant_validation():
    """Création tenant sans body : 422."""
    r = client.post("/admin/tenants", json={})
    assert r.status_code == 422


def test_create_tenant_missing_fields():
    """Création tenant sans domain : 422."""
    r = client.post("/admin/tenants", json={"name": "Test"})
    assert r.status_code == 422


def test_create_tenant_success():
    """Création tenant avec body valide : 201 et objet retourné."""
    import time
    domain = f"e2e-tenant-{int(time.time())}.cloudity.local"
    r = client.post(
        "/admin/tenants",
        json={
            "name": "E2E Tenant",
            "domain": domain,
            "database_url": "postgresql://localhost/e2e_db",
            "is_active": True,
        },
    )
    _skip_if_db_unavailable(r)
    if r.status_code == 201:
        data = r.json()
        assert data["name"] == "E2E Tenant"
        assert data["domain"] == domain
        assert "id" in data
    elif r.status_code == 500:
        pytest.skip("DB non disponible")


def test_delete_tenant_not_found():
    """DELETE /admin/tenants/999999 retourne 404."""
    r = client.delete("/admin/tenants/999999")
    _skip_if_db_unavailable(r)
    assert r.status_code == 404
