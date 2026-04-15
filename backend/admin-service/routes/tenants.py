from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Tenant
from schemas import TenantCreate, TenantResponse, TenantUpdate

router = APIRouter(prefix="/admin", tags=["tenants"])


@router.get("/tenants", response_model=List[TenantResponse])
async def get_tenants(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    tenants = db.query(Tenant).offset(skip).limit(limit).all()
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
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    db.delete(tenant)
    db.commit()
    return {"message": "Tenant deleted successfully"}
