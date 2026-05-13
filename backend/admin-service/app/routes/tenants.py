from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Tenant, User
from app.schemas import TenantCreate, TenantResponse, TenantUpdate

router = APIRouter(prefix="/admin", tags=["tenants"])

DEFAULT_TENANT_ID = 1


@router.get("/tenants", response_model=List[TenantResponse])
async def get_tenants(
    skip: int = 0,
    limit: int = 100,
    domain_contains: Optional[str] = Query(None, description="Filtre insensible à la casse sur le domaine (ILIKE %valeur%)"),
    db: Session = Depends(get_db),
):
    q = db.query(Tenant)
    if domain_contains and domain_contains.strip():
        needle = f"%{domain_contains.strip()}%"
        q = q.filter(Tenant.domain.ilike(needle))
    tenants = q.offset(skip).limit(limit).all()
    return tenants


@router.post("/tenants", response_model=TenantResponse)
async def create_tenant(tenant: TenantCreate, db: Session = Depends(get_db)):
    db_tenant = Tenant(**tenant.model_dump())
    db.add(db_tenant)
    db.commit()
    db.refresh(db_tenant)
    return db_tenant


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(tenant_id: int, tenant: TenantUpdate, db: Session = Depends(get_db)):
    db_tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not db_tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    for key, value in tenant.model_dump(exclude_unset=True).items():
        setattr(db_tenant, key, value)

    db.commit()
    db.refresh(db_tenant)
    return db_tenant


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: int, db: Session = Depends(get_db)):
    if tenant_id == DEFAULT_TENANT_ID:
        raise HTTPException(status_code=403, detail="Cannot delete default tenant")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    db.query(User).filter(User.tenant_id == tenant_id).delete(synchronize_session=False)
    db.delete(tenant)
    db.commit()
    return {"message": "Tenant deleted successfully"}
