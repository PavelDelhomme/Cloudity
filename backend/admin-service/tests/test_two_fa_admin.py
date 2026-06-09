"""Tests logique reset 2FA admin (U9) — mocks sans DB obligatoire."""
import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock, patch

from app.services import two_fa_admin as svc


def _user(**kwargs):
    u = MagicMock()
    defaults = {
        "id": 1,
        "tenant_id": 1,
        "email": "u@test.com",
        "role": "user",
        "is_active": True,
        "is_2fa_enabled": True,
        "totp_secret": "JBSWY3DPEHPK3PXP",
    }
    defaults.update(kwargs)
    for k, v in defaults.items():
        setattr(u, k, v)
    return u


def test_reset_requires_admin_2fa_enabled():
    db = MagicMock()
    admin = _user(id=10, role="admin", is_2fa_enabled=False, totp_secret=None)
    db.query.return_value.filter.return_value.first.return_value = admin
    with pytest.raises(HTTPException) as exc:
        svc.reset_user_2fa(db, target_user_id=2, admin_id=10, tenant_id=1, admin_totp_code="123456")
    assert exc.value.status_code == 403


@patch("app.services.two_fa_admin.pyotp.TOTP")
def test_reset_rejects_invalid_admin_totp(mock_totp):
    db = MagicMock()
    admin = _user(id=10, role="admin")
    db.query.return_value.filter.return_value.first.return_value = admin
    mock_totp.return_value.verify.return_value = False
    with pytest.raises(HTTPException) as exc:
        svc.reset_user_2fa(db, target_user_id=2, admin_id=10, tenant_id=1, admin_totp_code="000000")
    assert exc.value.status_code == 401


@patch("app.services.two_fa_admin.pyotp.TOTP")
def test_reset_rejects_self_target(mock_totp):
    db = MagicMock()
    admin = _user(id=10, role="admin")
    db.query.return_value.filter.return_value.first.side_effect = [admin, admin]
    mock_totp.return_value.verify.return_value = True
    with pytest.raises(HTTPException) as exc:
        svc.reset_user_2fa(db, target_user_id=10, admin_id=10, tenant_id=1, admin_totp_code="123456")
    assert exc.value.status_code == 400


@patch("app.services.two_fa_admin._count_active_admins_with_2fa", return_value=0)
@patch("app.services.two_fa_admin.pyotp.TOTP")
def test_reset_blocks_last_admin_with_2fa(mock_totp, _mock_count):
    db = MagicMock()
    admin = _user(id=10, role="admin")
    target = _user(id=11, role="admin")
    db.query.return_value.filter.return_value.first.side_effect = [admin, target]
    mock_totp.return_value.verify.return_value = True
    with pytest.raises(HTTPException) as exc:
        svc.reset_user_2fa(db, target_user_id=11, admin_id=10, tenant_id=1, admin_totp_code="123456")
    assert exc.value.status_code == 409
