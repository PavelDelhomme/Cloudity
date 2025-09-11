
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
            os.getenv("DATABASE_URL", "postgresql://cloudity_admin:cloudity_secure_2024@localhost:5432/cloudity"),
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

# === SERVICES DOCKER ===
@app.get("/api/v1/admin/services/detailed")
async def get_services_detailed():
    """État détaillé de tous les services Docker"""
    
    services_config = [
        {"name": "auth-service", "container": "cloudity-auth-service", "port": 8081},
        {"name": "api-gateway", "container": "cloudity-api-gateway", "port": 8000},
        {"name": "admin-service", "container": "cloudity-admin-service", "port": 8082},
        {"name": "postgres", "container": "cloudity-postgres", "port": 5432},
        {"name": "redis", "container": "cloudity-redis", "port": 6379},
    ]
    
    detailed_status = []
    
    for service in services_config:
        try:
            # Vérifier si le container existe
            result = subprocess.run([
                'docker', 'inspect', service['container'], 
                '--format', '{{.State.Status}}'
            ], capture_output=True, text=True, timeout=5)
            
            if result.returncode == 0:
                status = result.stdout.strip()
            else:
                status = "not_found"
                
            detailed_status.append({
                "name": service['name'],
                "container": service['container'],
                "status": status,
                "port": service['port'],
                "url": f"http://localhost:{service['port']}",
                "uptime": "N/A",
                "image": "N/A",
                "started_at": "N/A"
            })
                
        except Exception as e:
            logger.error(f"Service check error {service['name']}: {e}")
            detailed_status.append({
                "name": service['name'],
                "container": service['container'],
                "status": "error",
                "port": service['port'],
                "url": f"http://localhost:{service['port']}",
                "uptime": "N/A",
                "image": "N/A", 
                "started_at": "N/A",
                "error": str(e)
            })
    
    return JSONResponse({"services": detailed_status})

# === CONTRÔLE SERVICES ===
@app.post("/api/v1/admin/services/{service_name}/{action}")
async def control_service(service_name: str, action: str):
    """Start/Stop/Restart Docker services"""
    
    allowed_actions = ['start', 'stop', 'restart']
    allowed_services = ['auth-service', 'api-gateway', 'admin-service', 'postgres', 'redis']
    
    if action not in allowed_actions or service_name not in allowed_services:
        raise HTTPException(status_code=400, detail="Invalid action or service")
    
    try:
        cmd = ['docker', 'compose', action, service_name]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            return JSONResponse({
                "message": f"Service {service_name} {action} successful",
                "output": result.stdout
            })
        else:
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to {action} service: {result.stderr}"
            )
            
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=500, 
            detail=f"Timeout while trying to {action} {service_name}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

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

# === LOGS ===
@app.get("/api/v1/admin/logs/{service_name}")
async def get_service_logs(service_name: str, lines: int = Query(default=50, le=1000)):
    """Logs d'un service Docker"""
    
    try:
        result = subprocess.run(
            ['docker', 'logs', f'cloudity-{service_name}', '--tail', str(lines)],
            capture_output=True, text=True, timeout=10
        )
        
        logs = result.stdout.split('\n') + result.stderr.split('\n')
        logs = [log for log in logs if log.strip()]
        
        return JSONResponse({
            "service": service_name,
            "logs": logs[-lines:],  # Limiter le nombre de lignes
            "total_lines": len(logs),
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Logs error for {service_name}: {e}")
        return JSONResponse({
            "service": service_name,
            "logs": [f"Error getting logs: {str(e)}"],
            "total_lines": 0,
            "timestamp": datetime.now().isoformat()
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