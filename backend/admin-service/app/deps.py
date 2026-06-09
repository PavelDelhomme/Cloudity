"""Dépendances FastAPI partagées (identité admin propagée par la gateway)."""
from fastapi import Header, HTTPException


def require_admin_actor(
    x_user_id: str | None = Header(None, alias="X-User-ID"),
    x_tenant_id: str | None = Header(None, alias="X-Tenant-ID"),
) -> tuple[int, int]:
    if not x_user_id or not x_tenant_id:
        raise HTTPException(status_code=401, detail="admin actor required")
    try:
        admin_id = int(x_user_id)
        tenant_id = int(x_tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="invalid admin actor headers") from exc
    if admin_id < 1 or tenant_id < 1:
        raise HTTPException(status_code=401, detail="invalid admin actor headers")
    return admin_id, tenant_id
