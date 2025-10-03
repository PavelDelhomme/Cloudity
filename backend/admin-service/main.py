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

# === SERVICES DOCKER ===


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
async def get_databases(db=Depends(get_db)):
    """Liste des bases de données et tables"""
    try:
        cur = db.cursor()
        
        # Obtenir la liste des tables
        cur.execute("""
            SELECT table_name, table_type 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
        tables = cur.fetchall()
        
        # Obtenir les statistiques des tables
        table_stats = []
        for table in tables:
            table_name = table['table_name']
            
            # Compter les lignes
            cur.execute(f"SELECT COUNT(*) as count FROM {table_name}")
            count_result = cur.fetchone()
            row_count = count_result['count'] if count_result else 0
            
            # Obtenir la taille
            cur.execute(f"""
                SELECT pg_size_pretty(pg_total_relation_size('{table_name}')) as size
            """)
            size_result = cur.fetchone()
            table_size = size_result['size'] if size_result else '0 bytes'
            
            table_stats.append({
                "name": table_name,
                "type": table['table_type'],
                "rows": row_count,
                "size": table_size
            })
        
        # Statistiques générales de la base
        cur.execute("SELECT pg_size_pretty(pg_database_size(current_database())) as db_size")
        db_size_result = cur.fetchone()
        db_size = db_size_result['db_size'] if db_size_result else '0 bytes'
        
        cur.execute("SELECT current_database() as db_name")
        db_name_result = cur.fetchone()
        db_name = db_name_result['db_name'] if db_name_result else 'cloudity'
        
        return JSONResponse({
            "database": db_name,
            "size": db_size,
            "tables": table_stats,
            "total_tables": len(tables)
        })
        
    except Exception as e:
        logger.error(f"Database info error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get database info: {str(e)}")

@app.get("/api/v1/admin/database/schema")
async def get_database_schema(db=Depends(get_db)):
    """Schéma de la base de données"""
    try:
        cur = db.cursor()
        
        # Obtenir les colonnes de toutes les tables
        cur.execute("""
            SELECT 
                t.table_name,
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                c.character_maximum_length
            FROM information_schema.tables t
            JOIN information_schema.columns c ON t.table_name = c.table_name
            WHERE t.table_schema = 'public'
            ORDER BY t.table_name, c.ordinal_position
        """)
        columns = cur.fetchall()
        
        # Organiser par table
        schema = {}
        for col in columns:
            table_name = col['table_name']
            if table_name not in schema:
                schema[table_name] = []
            
            schema[table_name].append({
                "column": col['column_name'],
                "type": col['data_type'],
                "nullable": col['is_nullable'] == 'YES',
                "default": col['column_default'],
                "max_length": col['character_maximum_length']
            })
        
        return JSONResponse({"schema": schema})
        
    except Exception as e:
        logger.error(f"Schema error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get schema: {str(e)}")

@app.get("/api/v1/admin/database/query")
async def execute_query(query: str, db=Depends(get_db)):
    """Exécuter une requête SQL (lecture seule)"""
    try:
        # Sécurité: seulement les requêtes SELECT
        if not query.strip().upper().startswith('SELECT'):
            raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
        
        cur = db.cursor()
        cur.execute(query)
        
        # Limiter les résultats
        results = cur.fetchmany(1000)  # Maximum 1000 lignes
        
        return JSONResponse({
            "query": query,
            "results": results,
            "count": len(results)
        })
        
    except Exception as e:
        logger.error(f"Query error: {e}")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

@app.post("/api/v1/admin/databases/{table_name}/backup")
async def backup_table(table_name: str, db=Depends(get_db)):
    """Sauvegarder une table"""
    try:
        cur = db.cursor()
        
        # Vérifier que la table existe
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = %s
        """, (table_name,))
        
        if cur.fetchone()['count'] == 0:
            raise HTTPException(status_code=404, detail="Table not found")
        
        # Exporter les données
        cur.execute(f"SELECT * FROM {table_name}")
        data = cur.fetchall()
        
        # Créer un fichier de sauvegarde
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"/app/storage/backups/{table_name}_backup_{timestamp}.json"
        
        import json
        with open(backup_filename, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        
        return JSONResponse({
            "success": True,
            "message": f"Table {table_name} backed up successfully",
            "filename": backup_filename,
            "rows": len(data)
        })
        
    except Exception as e:
        logger.error(f"Backup error: {e}")
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")

# ═══════════════════════════════════════════════════════════════
# GESTION DES SERVICES DOCKER
# ═══════════════════════════════════════════════════════════════

class ServiceAction(BaseModel):
    action: str  # start, stop, restart
    service: str

@app.get("/api/v1/admin/services")
async def get_all_services():
    """Récupérer la liste de tous les services avec leur statut"""
    try:
        # Utiliser l'API Gateway pour obtenir les informations des services
        import requests
        
        try:
            response = requests.get("http://api-gateway:8000/health", timeout=5)
            if response.status_code == 200:
                gateway_data = response.json()
                gateway_services = gateway_data.get("services", {})
            else:
                gateway_services = {}
        except Exception as e:
            logger.warning(f"Could not reach API Gateway: {e}")
            gateway_services = {}
        
        # Définition complète des services (actuels et futurs)
        all_services = {
            # Infrastructure
            "postgres": {"type": "infrastructure", "port": "5432", "description": "PostgreSQL Database", "category": "database"},
            "redis": {"type": "infrastructure", "port": "6379", "description": "Redis Cache", "category": "cache"},
            "adminer": {"type": "infrastructure", "port": "8083", "description": "Adminer - DB Management", "category": "tools"},
            "redis-commander": {"type": "infrastructure", "port": "8084", "description": "Redis Commander - Redis Management", "category": "tools"},
            
            # Backend Core
            "auth-service": {"type": "backend-core", "port": "8081", "description": "Authentication Service", "category": "core"},
            "api-gateway": {"type": "backend-core", "port": "8000", "description": "API Gateway", "category": "core"},
            "admin-service": {"type": "backend-core", "port": "8082", "description": "Admin Service", "category": "core"},
            
            # Backend Email
            "email-service": {"type": "backend-email", "port": "8091", "description": "Email Service", "category": "email"},
            "alias-service": {"type": "backend-email", "port": "8092", "description": "Alias Service", "category": "email"},
            
            # Backend Password
            "password-service": {"type": "backend-password", "port": "8093", "description": "Password Service", "category": "security"},
            
            # Backend Futurs
            "2fa-service": {"type": "backend-2fa", "port": "8096", "description": "2FA Service", "category": "security"},
            "calendar-service": {"type": "backend-calendar", "port": "8097", "description": "Calendar Service", "category": "productivity"},
            "drive-service": {"type": "backend-drive", "port": "8098", "description": "Drive Service", "category": "storage"},
            "office-service": {"type": "backend-office", "port": "8099", "description": "Office Service", "category": "productivity"},
            "gallery-service": {"type": "backend-gallery", "port": "8100", "description": "Gallery Service", "category": "media"},
            
            # Frontend Applications
            "admin-dashboard": {"type": "frontend", "port": "3000", "description": "Admin Dashboard", "category": "admin"},
            "email-app": {"type": "frontend", "port": "8094", "description": "Email Application", "category": "email"},
            "password-app": {"type": "frontend", "port": "8095", "description": "Password Application", "category": "security"},
            "2fa-app": {"type": "frontend", "port": "3001", "description": "2FA Application", "category": "security"},
            "calendar-app": {"type": "frontend", "port": "3002", "description": "Calendar Application", "category": "productivity"},
            "drive-app": {"type": "frontend", "port": "3003", "description": "Drive Application", "category": "storage"},
            "office-app": {"type": "frontend", "port": "3004", "description": "Office Application", "category": "productivity"},
            "gallery-app": {"type": "frontend", "port": "3005", "description": "Gallery Application", "category": "media"},
        }
        
        complete_services = []
        for service_name, service_def in all_services.items():
            # Récupérer le statut depuis l'API Gateway si disponible
            gateway_service = gateway_services.get(service_name, {})
            status = gateway_service.get("status", "unknown")
            
            # Mapper les statuts
            if status == "healthy":
                status = "running"
            elif status == "unreachable":
                status = "stopped"
            elif status == "unknown":
                status = "unknown"
            
            service_info = {
                "name": service_name,
                "status": status,
                "container": f"cloudity-{service_name}",
                "url": f"http://localhost:{service_def['port']}",
                "uptime": "Running" if status == "running" else "Stopped",
                "image": f"cloudity-{service_name}:dev",
                "started_at": "2025-09-15T20:00:00Z" if status == "running" else None,
                **service_def
            }
            complete_services.append(service_info)
        
        return JSONResponse({
            "services": complete_services,
            "total": len(complete_services),
            "running": len([s for s in complete_services if s["status"] == "running"]),
            "stopped": len([s for s in complete_services if s["status"] == "stopped"]),
            "unknown": len([s for s in complete_services if s["status"] == "unknown"])
        })
        
    except Exception as e:
        logger.error(f"Error getting services: {e}")
        return JSONResponse({
            "error": "Failed to get services",
            "message": str(e)
        }, status_code=500)

@app.post("/api/v1/admin/services/{service_name}/{action}")
async def control_service(service_name: str, action: str):
    """Contrôler un service Docker (start/stop/restart)"""
    if action not in ["start", "stop", "restart"]:
        raise HTTPException(status_code=400, detail="Action must be start, stop, or restart")
    
    try:
        # Pour l'instant, retourner les instructions pour utiliser les commandes make
        # Car l'admin-service n'a pas accès au docker socket
        make_command = f"make service-{action}-{service_name}"
        
        return JSONResponse({
            "success": True,
            "message": f"Pour {action} le service {service_name}, utilisez la commande : {make_command}",
            "command": make_command,
            "note": "Le contrôle direct depuis l'interface nécessite l'accès au docker socket",
            "timestamp": datetime.now().isoformat()
        })
            
    except Exception as e:
        logger.error(f"Service action error: {e}")
        return JSONResponse({
            "success": False,
            "error": str(e),
            "message": "Service action failed"
        }, status_code=500)

@app.get("/api/v1/admin/services/{service_name}/logs")
async def get_service_logs(service_name: str, lines: int = 100):
    """Obtenir les logs d'un service"""
    try:
        return JSONResponse({
            "service": service_name,
            "logs": f"📋 Logs pour {service_name}\n\n⚠️  Fonctionnalité en cours d'implémentation.\n\nPour voir les logs actuellement, utilisez :\nmake service-logs-{service_name}\n\nOu directement :\ndocker compose logs -f {service_name}",
            "lines": lines,
            "timestamp": datetime.now().isoformat(),
            "note": "Docker socket access needed for real-time logs"
        })
            
    except Exception as e:
        logger.error(f"Error getting logs for {service_name}: {e}")
        return JSONResponse({
            "error": "Failed to get service logs",
            "message": str(e)
        }, status_code=500)

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
            "/api/v1/admin/services",
            "/api/v1/admin/services/action",
            "/api/v1/admin/services/{service_name}/logs",
            "/api/v1/admin/tenants",
            "/api/v1/admin/users",
            "/api/v1/admin/databases"
        ]
    }, status_code=404)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8082, reload=True, log_level="info")