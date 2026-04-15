"""Modèles ORM (tenants, users)."""
from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String
from sqlalchemy.sql import func

from database import Base


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
    password_hash = Column(String(512), nullable=False)
    totp_secret = Column(String(255), nullable=True)
    is_2fa_enabled = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    role = Column(String(50), default="user")
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
