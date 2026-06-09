from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import require_admin_actor
from app.models import User
from app.schemas import AdminTwoFAResetRequest, AdminTwoFAResetResponse, UserResponse, UserUpdate
from app.services.two_fa_admin import reset_user_2fa

router = APIRouter(prefix="/admin", tags=["users"])


@router.get("/tenants/{tenant_id}/users", response_model=List[UserResponse])
async def list_users(tenant_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    users = db.query(User).filter(User.tenant_id == tenant_id).offset(skip).limit(limit).all()
    return users


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email déjà utilisé pour ce tenant")
    db.refresh(user)
    return user


@router.post("/users/{user_id}/2fa/reset", response_model=AdminTwoFAResetResponse)
async def admin_reset_user_two_fa(
    user_id: int,
    payload: AdminTwoFAResetRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: tuple[int, int] = Depends(require_admin_actor),
):
    admin_id, tenant_id = actor
    client_ip = request.client.host if request.client else None
    result = reset_user_2fa(
        db,
        target_user_id=user_id,
        admin_id=admin_id,
        tenant_id=tenant_id,
        admin_totp_code=payload.admin_totp_code,
        reason=payload.reason,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
    )
    return AdminTwoFAResetResponse(**result)
