"""Réinitialisation 2FA utilisateur par un admin (U9) — step-up TOTP + audit."""
from __future__ import annotations

import json
from typing import Any

import pyotp
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import User


def _count_active_admins_with_2fa(db: Session, tenant_id: int, *, exclude_user_id: int | None = None) -> int:
    q = db.query(User).filter(
        User.tenant_id == tenant_id,
        User.role == "admin",
        User.is_active.is_(True),
        User.is_2fa_enabled.is_(True),
    )
    if exclude_user_id is not None:
        q = q.filter(User.id != exclude_user_id)
    return q.count()


def _verify_admin_step_up(db: Session, admin_id: int, tenant_id: int, totp_code: str) -> User:
    admin = (
        db.query(User)
        .filter(User.id == admin_id, User.tenant_id == tenant_id, User.is_active.is_(True))
        .first()
    )
    if admin is None:
        raise HTTPException(status_code=403, detail="Administrateur introuvable")
    if admin.role != "admin":
        raise HTTPException(status_code=403, detail="Rôle admin requis")
    if not admin.is_2fa_enabled or not admin.totp_secret:
        raise HTTPException(
            status_code=403,
            detail="L'administrateur doit avoir la 2FA activée pour réinitialiser celle d'un utilisateur",
        )
    code = (totp_code or "").strip().replace(" ", "")
    if not code:
        raise HTTPException(status_code=400, detail="Code TOTP admin requis")
    if not pyotp.TOTP(admin.totp_secret).verify(code, valid_window=1):
        raise HTTPException(status_code=401, detail="Code TOTP admin invalide")
    return admin


def reset_user_2fa(
    db: Session,
    *,
    target_user_id: int,
    admin_id: int,
    tenant_id: int,
    admin_totp_code: str,
    reason: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    admin = _verify_admin_step_up(db, admin_id, tenant_id, admin_totp_code)

    target = db.query(User).filter(User.id == target_user_id, User.tenant_id == tenant_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Utilisez Paramètres pour gérer votre propre 2FA (pas de reset admin sur soi-même)",
        )
    if not target.is_2fa_enabled:
        raise HTTPException(status_code=400, detail="La 2FA n'est pas activée pour cet utilisateur")

    if target.role == "admin" and _count_active_admins_with_2fa(db, tenant_id, exclude_user_id=target.id) == 0:
        raise HTTPException(
            status_code=409,
            detail="Impossible de désactiver la 2FA du dernier administrateur actif avec 2FA sur ce tenant",
        )

    db.execute(text("DELETE FROM recovery_codes WHERE user_id = :uid"), {"uid": target.id})
    target.totp_secret = None
    target.is_2fa_enabled = False

    details = {
        "target_email": target.email,
        "target_user_id": target.id,
        "performed_by_admin_id": admin.id,
        "reason": (reason or "").strip() or None,
    }
    db.execute(
        text(
            """
            INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
            VALUES (:tenant_id, :user_id, 'admin.2fa.reset', 'user', :resource_id, CAST(:details AS jsonb), :ip, :ua)
            """
        ),
        {
            "tenant_id": tenant_id,
            "user_id": admin.id,
            "resource_id": str(target.id),
            "details": json.dumps(details),
            "ip": ip_address,
            "ua": user_agent,
        },
    )
    db.commit()
    db.refresh(target)
    return {
        "ok": True,
        "user_id": target.id,
        "email": target.email,
        "is_2fa_enabled": target.is_2fa_enabled,
        "message": "2FA réinitialisée. L'utilisateur devra réactiver TOTP et régénérer des codes de récupération.",
    }
