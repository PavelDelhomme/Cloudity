"""Schémas Pydantic (entrées / sorties API)."""
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    email: Optional[str] = Field(None, min_length=3, max_length=255)
    is_active: Optional[bool] = None
    role: Optional[str] = Field(None, min_length=1, max_length=50)


class DashboardStats(BaseModel):
    active_tenants: int
    total_users: int
    api_calls_today: int
