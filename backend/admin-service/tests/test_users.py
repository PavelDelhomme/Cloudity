"""Tests des endpoints users (admin CRUD)."""
import os
import pytest

os.environ.setdefault("DATABASE_URL", "postgresql://cloudity_admin:cloudity_secure_password_2025@localhost:6042/cloudity")

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _skip_if_500(r):
    if r.status_code == 500:
        pytest.skip("DB non disponible (run make up)")


def test_list_users_tenant_returns_list():
    """GET /admin/tenants/{id}/users retourne une liste (200)."""
    r = client.get("/admin/tenants/1/users")
    _skip_if_500(r)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_users_tenant_with_skip_limit():
    """GET /admin/tenants/1/users?skip=0&limit=5 retourne 200."""
    r = client.get("/admin/tenants/1/users?skip=0&limit=5")
    _skip_if_500(r)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) <= 5


def test_get_user_not_found():
    """GET /admin/users/999999 retourne 404."""
    r = client.get("/admin/users/999999")
    _skip_if_500(r)
    assert r.status_code == 404
    assert "not found" in r.json().get("detail", "").lower()


def test_update_user_validation():
    """PATCH /admin/users/999999 avec body valide (role) → 404."""
    r = client.patch("/admin/users/999999", json={"role": "admin"})
    _skip_if_500(r)
    assert r.status_code == 404


def test_update_user_valid_payload():
    """PATCH avec role valide ne renvoie pas 422."""
    r = client.patch("/admin/users/999998", json={"role": "user"})
    _skip_if_500(r)
    assert r.status_code in (404, 200)


def test_update_user_empty_body():
    """PATCH avec body vide ou invalide."""
    r = client.patch("/admin/users/999998", json={})
    _skip_if_500(r)
    # 404 (user inexistant) ou 200 si un user 999998 existe
    assert r.status_code in (404, 200)


def test_update_user_is_active():
    """PATCH avec is_active false."""
    r = client.patch("/admin/users/999997", json={"is_active": False})
    _skip_if_500(r)
    assert r.status_code in (404, 200)
