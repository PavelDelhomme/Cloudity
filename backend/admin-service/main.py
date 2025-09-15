from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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

# Configuration logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cloudity Admin Service",
    description="API d'administration multi-tenant avec gestion complète",
    version="2.0.0"
)

# CORS très permissif pour développement
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class ServiceStatus(BaseModel):
    name: str
    container: str
    status: str
    port: int
    url: str
    uptime: Optional[str] = None
    image: Optional[str] = None
    started_at: Optional[str] = None

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
    """Statistiques globales du système - Version sécurisée"""
    try:
        cur = db.cursor()
        
        # Requêtes sécurisées avec gestion d'erreur
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
            
        stats.active_sessions = 0  # Placeholder
        stats.storage_used = 0.0   # Placeholder
        stats.uptime = "Running"
        
        return JSONResponse(stats.dict())
        
    except Exception as e:
        logger.error(f"Stats error: {e}")
        # Retourner des stats par défaut en cas d'erreur
        return JSONResponse(SystemStats().dict())

# === SERVICES DOCKER - VERSION MOCK ===
@app.get("/api/v1/admin/services/detailed")
async def get_services_detailed():
    """État détaillé de tous les services Docker - Version Mock"""
    
    # ✅ Version Mock qui fonctionne SANS Docker CLI
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
    
    logger.info("✅ Services status retrieved (mock data)")
    return JSONResponse({"services": services_mock})

# === CONTRÔLE SERVICES - VERSION MOCK ===
@app.post("/api/v1/admin/services/{service_name}/{action}")
async def control_service(service_name: str, action: str):
    """Start/Stop/Restart Docker services - Version Mock"""
    
    allowed_actions = ['start', 'stop', 'restart']
    allowed_services = ['auth-service', 'api-gateway', 'admin-service', 'postgres', 'redis']
    
    if action not in allowed_actions or service_name not in allowed_services:
        raise HTTPException(status_code=400, detail="Invalid action or service")
    
    # ✅ Version Mock - Simule le contrôle des services
    logger.info(f"🔧 Mock {action} for service: {service_name}")
    
    return JSONResponse({
        "message": f"Service {service_name} {action} successful (mock)",
        "output": f"Mock: {service_name} has been {action}ed successfully",
        "timestamp": datetime.now().isoformat()
    })

# === UTILISATEURS ===
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

# === TENANTS ===
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

# === CRÉER TENANT ===
@app.post("/api/v1/admin/tenants")
async def create_tenant(tenant_data: dict, db=Depends(get_db)):
    """Créer un nouveau tenant"""
    try:
        cur = db.cursor()
        
        # Génération d'un UUID simple
        import uuid
        tenant_id = str(uuid.uuid4())
        
        cur.execute("""
            INSERT INTO tenants (id, name, subdomain, status, max_users, max_storage_gb, created_at)
            VALUES (%s, %s, %s, 'active', %s, %s, NOW())
            RETURNING *
        """, (
            tenant_id,
            tenant_data.get('name'),
            tenant_data.get('subdomain'), 
            tenant_data.get('max_users', 10),
            tenant_data.get('max_storage_gb', 100)
        ))
        
        new_tenant = cur.fetchone()
        db.commit()
        
        return JSONResponse({
            "id": str(new_tenant['id']),
            "name": new_tenant['name'],
            "subdomain": new_tenant['subdomain'],
            "status": new_tenant['status'],
            "max_users": new_tenant['max_users'],
            "max_storage_gb": new_tenant['max_storage_gb'],
            "created_at": new_tenant['created_at'].isoformat()
        })
        
    except Exception as e:
        logger.error(f"Create tenant error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create tenant: {str(e)}")

# === LOGS - VERSION MOCK ===
@app.get("/api/v1/admin/logs/{service_name}")
async def get_service_logs(service_name: str, lines: int = Query(default=50, le=1000)):
    """Logs d'un service Docker - Version Mock"""
    
    # ✅ Version Mock - Simule les logs
    mock_logs = [
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] INFO: {service_name} started successfully",
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] INFO: {service_name} listening on port...",
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] INFO: {service_name} ready to accept connections",
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] DEBUG: {service_name} processing requests",
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] INFO: {service_name} health check OK"
    ]
    
    return JSONResponse({
        "service": service_name,
        "logs": mock_logs[-lines:],
        "total_lines": len(mock_logs),
        "timestamp": datetime.now().isoformat(),
        "note": "Mock logs data - Docker CLI not available in container"
    })

# === CATCHALL POUR DEBUG ===
@app.get("/{path:path}")
async def catch_all(path: str):
    """Endpoint pour débugger les 404"""
    return JSONResponse({
        "error": "Endpoint not found",
        "path": path,
        "available_endpoints": [
            "/health",
            "/api/v1/admin/stats", 
            "/api/v1/admin/services/detailed",
            "/api/v1/admin/users",
            "/api/v1/admin/tenants"
        ]
    }, status_code=404)

if __name__ == "__main__":
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8082, 
        reload=True,
        log_level="info"
    )