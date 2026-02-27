from fastapi import FastAPI, Depends, HTTPException, Header, status
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql import func
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime
import os
import uvicorn

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@postgres/cloudity")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

app = FastAPI(
    title="Cloudity Admin Service",
    description="Multi-tenant administration API",
    version="1.0.0"
)
# CORS géré par l'api-gateway uniquement (éviter doublon Access-Control-Allow-Origin)

# Models
class Tenant(Base):
    __tablename__ = "tenants"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    domain = Column(String(255), nullable=False, unique=True, index=True)
    database_url = Column(String(500), nullable=False)
    is_active = Column(Boolean, default=True)
    config = Column(JSON, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    password_hash = Column(String(512), nullable=False)  # non exposé dans l'API
    totp_secret = Column(String(255), nullable=True)     # non exposé
    is_2fa_enabled = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    role = Column(String(50), default="user")
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


Base.metadata.create_all(bind=engine)

# Pydantic schemas
class TenantBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    domain: str = Field(..., min_length=1, max_length=255)
    database_url: str
    is_active: bool = True
    config: Dict = {}

class TenantCreate(TenantBase):
    pass

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    database_url: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[Dict] = None

class TenantResponse(TenantBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# User schemas (sans password_hash / totp_secret)
class UserResponse(BaseModel):
    id: int
    tenant_id: int
    email: str
    is_2fa_enabled: bool
    is_active: bool
    role: str
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = Field(None, min_length=1, max_length=50)


# Dependencies
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_tenant(x_tenant_id: Optional[str] = Header(None)):
    if not x_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant ID required"
        )
    return x_tenant_id

# Endpoints
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "admin-service"}

@app.get("/admin/tenants", response_model=List[TenantResponse])
async def get_tenants(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    tenants = db.query(Tenant).offset(skip).limit(limit).all()
    return tenants

@app.post("/admin/tenants", response_model=TenantResponse)
async def create_tenant(
    tenant: TenantCreate,
    db: Session = Depends(get_db)
):
    db_tenant = Tenant(**tenant.model_dump())
    db.add(db_tenant)
    db.commit()
    db.refresh(db_tenant)
    return db_tenant

@app.get("/admin/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: int,
    db: Session = Depends(get_db)
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant

@app.put("/admin/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    tenant: TenantUpdate,
    db: Session = Depends(get_db)
):
    db_tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not db_tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    for key, value in tenant.model_dump(exclude_unset=True).items():
        setattr(db_tenant, key, value)
    
    db.commit()
    db.refresh(db_tenant)
    return db_tenant

@app.delete("/admin/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: int,
    db: Session = Depends(get_db)
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    db.delete(tenant)
    db.commit()
    return {"message": "Tenant deleted successfully"}


# --- Users CRUD (lecture + mise à jour rôle / is_active) ---

@app.get("/admin/tenants/{tenant_id}/users", response_model=List[UserResponse])
async def list_users(
    tenant_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    users = db.query(User).filter(User.tenant_id == tenant_id).offset(skip).limit(limit).all()
    return users


@app.get("/admin/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.patch("/admin/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


# --- Dashboard stats ---

class DashboardStats(BaseModel):
    active_tenants: int
    total_users: int
    api_calls_today: int


@app.get("/admin/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: Session = Depends(get_db)):
    active_tenants = db.query(Tenant).filter(Tenant.is_active == True).count()
    total_users = db.query(User).count()
    # api_calls_today: optional count from audit_logs; 0 if table/column not used
    try:
        from sqlalchemy import text
        row = db.execute(
            text("SELECT COUNT(*) AS n FROM audit_logs WHERE (created_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date")
        ).fetchone()
        api_calls_today = row[0] if row else 0
    except Exception:
        api_calls_today = 0
    return DashboardStats(
        active_tenants=active_tenants,
        total_users=total_users,
        api_calls_today=api_calls_today,
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8082, reload=True)