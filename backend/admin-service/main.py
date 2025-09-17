from fastapi.responses import JSONResponse
import psycopg2
import psycopg2.extras
import os
import json
import subprocess
from datetime import datetime
from typing import List, Dict, Optional, Any
from pydantic import BaseModel
import uvicorn
import logging
import uuid
from fastapi import FastAPI, Depends, HTTPException

# Configuration logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cloudity Admin Service",
    description="API d'administration multi-tenant avec gestion complète",
    version="2.0.0"
)

# ❌ PAS DE CORS - API Gateway s'en charge

# Base de données
def get_db():
    try:
        conn = psycopg2.connect(
            os.getenv("DATABASE_URL", "postgresql://cloudity_admin:cloudity@localhost:5432/cloudity"),
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        yield conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")
    finally:
        if conn:
            conn.close()

# Modèles Pydantic
class SystemStats(BaseModel):
    total_users: int = 0
    total_tenants: int = 0
    active_sessions: int = 0
    storage_used: float = 0.0
    database_size: str = "N/A"
    uptime: str = "N/A"

class TenantCreate(BaseModel):
    name: str
    subdomain: str
    max_users: int = 10
    max_storage_gb: int = 100
    
class TenantUpdate(BaseModel):
    name: Optional[str] = None
    subdomain: Optional[str] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    status: Optional[str] = None

class UserCreate(BaseModel):
    email: str
    first_name: str
    last_name: str
    role: str = "user"
    tenant_id: str
    password: str

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

# === HEALTH CHECK ===
@app.get("/health")
async def health_check():
    return JSONResponse({
        "status": "healthy",
        "service": "admin-service",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0"
    })

# === STATISTIQUES SYSTÈME ===
@app.get("/api/v1/admin/stats")
async def get_system_stats(db=Depends(get_db)):
    """Statistiques globales du système"""
    try:
        cur = db.cursor()
        stats = SystemStats()
        
        try:
            cur.execute("SELECT COUNT(*) FROM users WHERE is_active = true")
            result = cur.fetchone()
            stats.total_users = result[0] if result else 0
        except:
            stats.total_users = 0
            
        try:
            cur.execute("SELECT COUNT(*) FROM tenants")
            result = cur.fetchone()
            stats.total_tenants = result[0] if result else 0
        except:
            stats.total_tenants = 0
            
        try:
            cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
            result = cur.fetchone()
            stats.database_size = result[0] if result else "N/A"
        except:
            stats.database_size = "N/A"
            
        stats.active_sessions = 0
        stats.storage_used = 0.0
        stats.uptime = "Running"
        
        return JSONResponse(stats.dict())
        
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return JSONResponse(SystemStats().dict())

# === SERVICES DOCKER - MOCK ===
@app.get("/api/v1/admin/services/detailed")
async def get_services_detailed():
    """État détaillé des services - Mock"""
    services_mock = [
        {
            "name": "auth-service",
            "container": "cloudity-auth-service",
            "status": "running",
            "port": 8081,
            "url": "http://localhost:8081",
            "uptime": "Running",
            "image": "cloudity-auth-service:dev",
            "started_at": "2025-09-15T20:00:00Z"
        },
        {
            "name": "api-gateway",
            "container": "cloudity-api-gateway",
            "status": "running",
            "port": 8000,
            "url": "http://localhost:8000",
            "uptime": "Running",
            "image": "cloudity-api-gateway:dev",
            "started_at": "2025-09-15T20:00:00Z"
        },
        {
            "name": "admin-service",
            "container": "cloudity-admin-service",
            "status": "running",
            "port": 8082,
            "url": "http://localhost:8082",
            "uptime": "Running",
            "image": "cloudity-admin-service:dev",
            "started_at": "2025-09-15T20:00:00Z"
        },
        {
            "name": "postgres",
            "container": "cloudity-postgres",
            "status": "running",
            "port": 5432,
            "url": "http://localhost:5432",
            "uptime": "Running",
            "image": "postgres:15-alpine",
            "started_at": "2025-09-15T20:00:00Z"
        },
        {
            "name": "redis",
            "container": "cloudity-redis",
            "status": "running",
            "port": 6379,
            "url": "http://localhost:6379",
            "uptime": "Running",
            "image": "redis:7-alpine",
            "started_at": "2025-09-15T20:00:00Z"
        }
    ]
    
    return JSONResponse({"services": services_mock})

# === TENANTS CRUD ===
@app.get("/api/v1/admin/tenants")
async def get_tenants(db=Depends(get_db)):
    """Liste des tenants"""
    try:
        cur = db.cursor()
        cur.execute("""
            SELECT id, name, subdomain, status, max_users, max_storage_gb, created_at 
            FROM tenants 
            ORDER BY created_at DESC
            LIMIT 100
        """)
        
        tenants = []
        for row in cur.fetchall():
            tenants.append({
                "id": str(row['id']),
                "name": row['name'],
                "subdomain": row['subdomain'],
                "status": row['status'],
                "max_users": row['max_users'] or 0,
                "max_storage_gb": row['max_storage_gb'] or 0,
                "created_at": row['created_at'].isoformat() if row['created_at'] else None
            })
        
        return JSONResponse(tenants)
        
    except Exception as e:
        logger.error(f"Tenants error: {e}")
        return JSONResponse([])

@app.post("/api/v1/admin/tenants")
async def create_tenant(tenant_data: TenantCreate, db=Depends(get_db)):
    """Créer un nouveau tenant"""
    try:
        cur = db.cursor()
        tenant_id = str(uuid.uuid4())
        
        cur.execute("""
            INSERT INTO tenants (id, name, subdomain, status, max_users, max_storage_gb, created_at)
            VALUES (%s, %s, %s, 'active', %s, %s, NOW())
            RETURNING *
        """, (
            tenant_id,
            tenant_data.name,
            tenant_data.subdomain,
            tenant_data.max_users,
            tenant_data.max_storage_gb
        ))
        
        new_tenant = cur.fetchone()
        db.commit()
        
        # Créer la base de données pour ce tenant (simulation)
        logger.info(f"🏢 Created tenant: {tenant_data.name} (DB: {tenant_data.subdomain})")
        
        return JSONResponse({
            "id": str(new_tenant['id']),
            "name": new_tenant['name'],
            "subdomain": new_tenant['subdomain'],
            "status": new_tenant['status'],
            "max_users": new_tenant['max_users'],
            "max_storage_gb": new_tenant['max_storage_gb'],
            "created_at": new_tenant['created_at'].isoformat()
        }, status_code=201)
        
    except Exception as e:
        logger.error(f"Create tenant error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create tenant: {str(e)}")

@app.put("/api/v1/admin/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, tenant_data: TenantUpdate, db=Depends(get_db)):
    """Mettre à jour un tenant"""
    try:
        cur = db.cursor()
        
        # Construire la requête dynamiquement
        updates = []
        values = []
        
        if tenant_data.name is not None:
            updates.append("name = %s")
            values.append(tenant_data.name)
        if tenant_data.subdomain is not None:
            updates.append("subdomain = %s")
            values.append(tenant_data.subdomain)
        if tenant_data.max_users is not None:
            updates.append("max_users = %s")
            values.append(tenant_data.max_users)
        if tenant_data.max_storage_gb is not None:
            updates.append("max_storage_gb = %s")
            values.append(tenant_data.max_storage_gb)
        if tenant_data.status is not None:
            updates.append("status = %s")
            values.append(tenant_data.status)
            
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
            
        values.append(tenant_id)
        
        query = f"""
            UPDATE tenants 
            SET {', '.join(updates)}
            WHERE id = %s 
            RETURNING *
        """
        
        cur.execute(query, values)
        updated_tenant = cur.fetchone()
        
        if not updated_tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
            
        db.commit()
        
        return JSONResponse({
            "id": str(updated_tenant['id']),
            "name": updated_tenant['name'],
            "subdomain": updated_tenant['subdomain'],
            "status": updated_tenant['status'],
            "max_users": updated_tenant['max_users'],
            "max_storage_gb": updated_tenant['max_storage_gb'],
            "created_at": updated_tenant['created_at'].isoformat()
        })
        
    except Exception as e:
        logger.error(f"Update tenant error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update tenant: {str(e)}")

@app.delete("/api/v1/admin/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, db=Depends(get_db)):
    """Supprimer un tenant"""
    try:
        cur = db.cursor()
        
        cur.execute("DELETE FROM tenants WHERE id = %s RETURNING name", (tenant_id,))
        deleted_tenant = cur.fetchone()
        
        if not deleted_tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
            
        db.commit()
        
        logger.info(f"🗑️ Deleted tenant: {deleted_tenant['name']}")
        
        return JSONResponse({
            "message": f"Tenant '{deleted_tenant['name']}' deleted successfully"
        })
        
    except Exception as e:
        logger.error(f"Delete tenant error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete tenant: {str(e)}")

# === USERS CRUD ===
@app.get("/api/v1/admin/users")
async def get_users(db=Depends(get_db)):
    """Liste des utilisateurs"""
    try:
        cur = db.cursor()
        cur.execute("""
            SELECT u.id, u.email, u.first_name, u.last_name, u.role, 
                   u.is_active, u.created_at, t.name as tenant_name
            FROM users u 
            LEFT JOIN tenants t ON u.tenant_id = t.id 
            ORDER BY u.created_at DESC
            LIMIT 100
        """)
        
        users = []
        for row in cur.fetchall():
            users.append({
                "id": str(row['id']),
                "email": row['email'],
                "first_name": row['first_name'],
                "last_name": row['last_name'],
                "role": row['role'],
                "is_active": row['is_active'],
                "tenant_name": row['tenant_name'] or 'Unknown',
                "created_at": row['created_at'].isoformat() if row['created_at'] else None
            })
        
        return JSONResponse(users)
        
    except Exception as e:
        logger.error(f"Users error: {e}")
        return JSONResponse([])

@app.post("/api/v1/admin/users")
async def create_user(user_data: UserCreate, db=Depends(get_db)):
    """Créer un nouvel utilisateur"""
    try:
        cur = db.cursor()
        user_id = str(uuid.uuid4())
        
        # Hash du mot de passe (simulation - en production utiliser bcrypt)
        import hashlib
        password_hash = hashlib.sha256(user_data.password.encode()).hexdigest()
        
        cur.execute("""
            INSERT INTO users (id, email, first_name, last_name, role, tenant_id, password_hash, is_active, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, true, NOW())
            RETURNING *
        """, (
            user_id,
            user_data.email,
            user_data.first_name,
            user_data.last_name,
            user_data.role,
            user_data.tenant_id,
            password_hash
        ))
        
        new_user = cur.fetchone()
        db.commit()
        
        return JSONResponse({
            "id": str(new_user['id']),
            "email": new_user['email'],
            "first_name": new_user['first_name'],
            "last_name": new_user['last_name'],
            "role": new_user['role'],
            "is_active": new_user['is_active'],
            "created_at": new_user['created_at'].isoformat()
        }, status_code=201)
        
    except Exception as e:
        logger.error(f"Create user error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@app.put("/api/v1/admin/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, db=Depends(get_db)):
    """Mettre à jour un utilisateur"""
    try:
        cur = db.cursor()
        
        updates = []
        values = []
        
        if user_data.first_name is not None:
            updates.append("first_name = %s")
            values.append(user_data.first_name)
        if user_data.last_name is not None:
            updates.append("last_name = %s")
            values.append(user_data.last_name)
        if user_data.role is not None:
            updates.append("role = %s")
            values.append(user_data.role)
        if user_data.is_active is not None:
            updates.append("is_active = %s")
            values.append(user_data.is_active)
            
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
            
        values.append(user_id)
        
        query = f"""
            UPDATE users 
            SET {', '.join(updates)}
            WHERE id = %s 
            RETURNING *
        """
        
        cur.execute(query, values)
        updated_user = cur.fetchone()
        
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")
            
        db.commit()
        
        return JSONResponse({
            "id": str(updated_user['id']),
            "email": updated_user['email'],
            "first_name": updated_user['first_name'],
            "last_name": updated_user['last_name'],
            "role": updated_user['role'],
            "is_active": updated_user['is_active'],
            "created_at": updated_user['created_at'].isoformat()
        })
        
    except Exception as e:
        logger.error(f"Update user error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

@app.delete("/api/v1/admin/users/{user_id}")
async def delete_user(user_id: str, db=Depends(get_db)):
    """Supprimer un utilisateur"""
    try:
        cur = db.cursor()
        
        cur.execute("DELETE FROM users WHERE id = %s RETURNING email", (user_id,))
        deleted_user = cur.fetchone()
        
        if not deleted_user:
            raise HTTPException(status_code=404, detail="User not found")
            
        db.commit()
        
        return JSONResponse({
            "message": f"User '{deleted_user['email']}' deleted successfully"
        })
        
    except Exception as e:
        logger.error(f"Delete user error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

# === BASE DE DONNÉES MANAGEMENT ===
@app.get("/api/v1/admin/databases")
async def get_databases():
    """Liste des bases de données par tenant - Mock"""
    databases = [
        {
            "id": "db-admin-001",
            "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
            "tenant_name": "Admin",
            "database_name": "cloudity_admin",
            "status": "active",
            "size": "45.2 MB",
            "connections": 3,
            "last_backup": "2025-09-15T10:00:00Z"
        },
        {
            "id": "db-acme-001", 
            "tenant_id": "550e8400-e29b-41d4-a716-446655440001",
            "tenant_name": "ACME Corp",
            "database_name": "cloudity_acme",
            "status": "active",
            "size": "12.8 MB",
            "connections": 1,
            "last_backup": "2025-09-15T09:00:00Z"
        }
    ]
    
    return JSONResponse(databases)

@app.post("/api/v1/admin/databases/{tenant_id}/backup")
async def backup_database(tenant_id: str):
    """Créer un backup pour un tenant - Mock"""
    backup_id = str(uuid.uuid4())
    
    return JSONResponse({
        "backup_id": backup_id,
        "tenant_id": tenant_id,
        "status": "started",
        "message": f"Backup started for tenant {tenant_id}",
        "timestamp": datetime.now().isoformat()
    })

# === CATCHALL DEBUG ===
@app.get("/{path:path}")
async def catch_all(path: str):
    """Debug 404"""
    return JSONResponse({
        "error": "Endpoint not found",
        "path": path,
        "available_endpoints": [
            "/health",
            "/api/v1/admin/stats",
            "/api/v1/admin/services/detailed",
            "/api/v1/admin/tenants",
            "/api/v1/admin/users",
            "/api/v1/admin/databases"
        ]
    }, status_code=404)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8082, reload=True, log_level="info")