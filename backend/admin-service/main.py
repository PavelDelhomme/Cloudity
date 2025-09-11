# ADMIN SERVICE AMÉLIORÉ - Version complète
# Ajouter ces améliorations à ton admin-service actuel

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras
import os
import json
import subprocess
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, EmailStr
import uvicorn
import logging

# Configuration logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cloudity Admin Service",
    description="Multi-tenant administration API with full management capabilities",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === NOUVEAUX MODÈLES PYDANTIC ===

class ServiceStatus(BaseModel):
    name: str
    status: str
    port: int
    url: str
    uptime: Optional[str] = None
    memory_usage: Optional[str] = None
    cpu_usage: Optional[str] = None

class EmailConfig(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    use_tls: bool = True
    use_ssl: bool = False

class UserGroup(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    permissions: List[str]
    tenant_id: str

class SystemStats(BaseModel):
    total_users: int
    total_tenants: int
    active_sessions: int
    storage_used: float
    database_size: str
    uptime: str

# === TABLES SUPPLÉMENTAIRES ===

async def init_additional_tables(db):
    """Créer les tables supplémentaires"""
    cur = db.cursor()
    
    # Table groupes utilisateurs
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_groups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            permissions JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tenant_id, name)
        );
    """)
    
    # Table configuration email
    cur.execute("""
        CREATE TABLE IF NOT EXISTS email_configs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            smtp_host VARCHAR(255) NOT NULL,
            smtp_port INTEGER DEFAULT 587,
            smtp_user VARCHAR(255) NOT NULL,
            smtp_password VARCHAR(255) NOT NULL,
            use_tls BOOLEAN DEFAULT TRUE,
            use_ssl BOOLEAN DEFAULT FALSE,
            from_email VARCHAR(255),
            from_name VARCHAR(255),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tenant_id)
        );
    """)
    
    # Table sessions actives
    cur.execute("""
        CREATE TABLE IF NOT EXISTS active_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash VARCHAR(255) NOT NULL,
            ip_address INET,
            user_agent TEXT,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # Ajouter colonne group_id à users
    cur.execute("""
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES user_groups(id);
    """)
    
    db.commit()

# === ENDPOINTS AMÉLIORÉS ===

@app.on_event("startup")
async def startup_event():
    """Initialiser les tables au démarrage"""
    try:
        conn = psycopg2.connect(
            os.getenv("DATABASE_URL"),
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        await init_additional_tables(conn)
        conn.close()
        logger.info("✅ Tables supplémentaires initialisées")
    except Exception as e:
        logger.error(f"❌ Erreur initialisation tables: {e}")

# === STATISTIQUES SYSTÈME ===

@app.get("/api/v1/admin/stats", response_model=SystemStats)
async def get_system_stats(db=Depends(get_db)):
    """Statistiques globales du système"""
    cur = db.cursor()
    
    # Total utilisateurs
    cur.execute("SELECT COUNT(*) FROM users WHERE is_active = true")
    total_users = cur.fetchone()[0]
    
    # Total tenants
    cur.execute("SELECT COUNT(*) FROM tenants WHERE is_active = true")
    total_tenants = cur.fetchone()[0]
    
    # Sessions actives (dernière heure)
    cur.execute("""
        SELECT COUNT(*) FROM active_sessions 
        WHERE last_activity > NOW() - INTERVAL '1 hour'
    """)
    active_sessions = cur.fetchone()[0] or 0
    
    # Taille base de données
    cur.execute("""
        SELECT pg_size_pretty(pg_database_size(current_database()))
    """)
    database_size = cur.fetchone()[0]
    
    return SystemStats(
        total_users=total_users,
        total_tenants=total_tenants,
        active_sessions=active_sessions,
        storage_used=0.0,  # À calculer selon ton système
        database_size=database_size,
        uptime="N/A"  # À calculer depuis le démarrage
    )

# === GESTION GROUPES UTILISATEURS ===

@app.get("/api/v1/admin/groups")
async def get_user_groups(tenant_id: str = Query(None), db=Depends(get_db)):
    """Liste des groupes utilisateurs"""
    cur = db.cursor()
    
    query = "SELECT * FROM user_groups"
    params = []
    
    if tenant_id:
        query += " WHERE tenant_id = %s"
        params.append(tenant_id)
    
    query += " ORDER BY name"
    cur.execute(query, params)
    
    groups = []
    for row in cur.fetchall():
        groups.append({
            "id": str(row['id']),
            "tenant_id": str(row['tenant_id']),
            "name": row['name'],
            "description": row['description'],
            "permissions": row['permissions'],
            "created_at": row['created_at'].isoformat()
        })
    
    return {"groups": groups}

@app.post("/api/v1/admin/groups")
async def create_user_group(group: UserGroup, db=Depends(get_db)):
    """Créer un groupe utilisateurs"""
    cur = db.cursor()
    try:
        cur.execute("""
            INSERT INTO user_groups (tenant_id, name, description, permissions)
            VALUES (%s, %s, %s, %s)
            RETURNING id, name, description, permissions, created_at
        """, (group.tenant_id, group.name, group.description, json.dumps(group.permissions)))
        
        result = cur.fetchone()
        db.commit()
        
        return {
            "id": str(result['id']),
            "name": result['name'],
            "description": result['description'],
            "permissions": result['permissions'],
            "created_at": result['created_at'].isoformat()
        }
    except psycopg2.Error as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Erreur création groupe: {str(e)}")

# === CONFIGURATION EMAIL ===

@app.get("/api/v1/admin/email-config/{tenant_id}")
async def get_email_config(tenant_id: str, db=Depends(get_db)):
    """Configuration email d'un tenant"""
    cur = db.cursor()
    cur.execute("""
        SELECT smtp_host, smtp_port, smtp_user, use_tls, use_ssl, 
               from_email, from_name, is_active
        FROM email_configs 
        WHERE tenant_id = %s
    """, (tenant_id,))
    
    result = cur.fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Configuration email non trouvée")
    
    return {
        "smtp_host": result['smtp_host'],
        "smtp_port": result['smtp_port'],
        "smtp_user": result['smtp_user'],
        "use_tls": result['use_tls'],
        "use_ssl": result['use_ssl'],
        "from_email": result['from_email'],
        "from_name": result['from_name'],
        "is_active": result['is_active']
    }

@app.put("/api/v1/admin/email-config/{tenant_id}")
async def update_email_config(tenant_id: str, config: EmailConfig, db=Depends(get_db)):
    """Mettre à jour la configuration email"""
    cur = db.cursor()
    try:
        cur.execute("""
            INSERT INTO email_configs (
                tenant_id, smtp_host, smtp_port, smtp_user, smtp_password,
                use_tls, use_ssl, is_active
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, true)
            ON CONFLICT (tenant_id) 
            DO UPDATE SET 
                smtp_host = EXCLUDED.smtp_host,
                smtp_port = EXCLUDED.smtp_port,
                smtp_user = EXCLUDED.smtp_user,
                smtp_password = EXCLUDED.smtp_password,
                use_tls = EXCLUDED.use_tls,
                use_ssl = EXCLUDED.use_ssl,
                updated_at = CURRENT_TIMESTAMP
        """, (tenant_id, config.smtp_host, config.smtp_port, 
              config.smtp_user, config.smtp_password, config.use_tls, config.use_ssl))
        
        db.commit()
        return {"message": "Configuration email mise à jour avec succès"}
    except psycopg2.Error as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Erreur mise à jour: {str(e)}")

# === SERVICES AVANCÉS ===

@app.get("/api/v1/admin/services/detailed")
async def get_services_detailed():
    """État détaillé de tous les services"""
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
            # Vérifier si le container existe et tourne
            result = subprocess.run([
                'docker', 'inspect', service['container'], 
                '--format', '{{.State.Status}},{{.State.StartedAt}},{{.Config.Image}}'
            ], capture_output=True, text=True, timeout=5)
            
            if result.returncode == 0:
                status_info = result.stdout.strip().split(',')
                status = status_info[0]
                started_at = status_info[1] if len(status_info) > 1 else "N/A"
                image = status_info[2] if len(status_info) > 2 else "N/A"
                
                # Calculer uptime
                uptime = "N/A"
                if status == "running" and started_at != "N/A":
                    try:
                        start_time = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
                        uptime_delta = datetime.now() - start_time.replace(tzinfo=None)
                        uptime = str(uptime_delta).split('.')[0]  # Sans microsecondes
                    except:
                        uptime = "N/A"
                
                detailed_status.append({
                    "name": service['name'],
                    "container": service['container'],
                    "status": status,
                    "port": service['port'],
                    "url": f"http://localhost:{service['port']}",
                    "uptime": uptime,
                    "image": image,
                    "started_at": started_at
                })
            else:
                detailed_status.append({
                    "name": service['name'],
                    "container": service['container'],
                    "status": "not_found",
                    "port": service['port'],
                    "url": f"http://localhost:{service['port']}",
                    "uptime": "N/A",
                    "image": "N/A",
                    "started_at": "N/A"
                })
                
        except Exception as e:
            logger.error(f"Erreur vérification service {service['name']}: {e}")
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
    
    return {"services": detailed_status}

# === LOGS EN TEMPS RÉEL AMÉLIORÉS ===

@app.get("/api/v1/admin/logs/{service_name}/stream")
async def stream_service_logs(service_name: str, lines: int = 50, follow: bool = False):
    """Logs en streaming d'un service"""
    try:
        cmd = ['docker', 'logs', f'cloudity-{service_name}', '--tail', str(lines)]
        if follow:
            cmd.append('-f')
            
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        logs = result.stdout.split('\n') + result.stderr.split('\n')
        logs = [log for log in logs if log.strip()]  # Supprimer lignes vides
        
        return {
            "service": service_name,
            "logs": logs,
            "total_lines": len(logs),
            "timestamp": datetime.now().isoformat()
        }
    except subprocess.TimeoutExpired:
        return {
            "service": service_name,
            "logs": ["Timeout - logs trop volumineux"],
            "total_lines": 0,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération logs: {str(e)}")

# === BASE DE DONNÉES AVANCÉE ===

@app.get("/api/v1/admin/database/schema")
async def get_database_schema(db=Depends(get_db)):
    """Schéma complet de la base de données"""
    cur = db.cursor()
    
    # Tables et colonnes
    cur.execute("""
        SELECT 
            t.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default
        FROM information_schema.tables t
        JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = 'public'
        ORDER BY t.table_name, c.ordinal_position
    """)
    
    schema = {}
    for row in cur.fetchall():
        table = row['table_name']
        if table not in schema:
            schema[table] = {
                "columns": [],
                "row_count": 0
            }
        
        schema[table]["columns"].append({
            "name": row['column_name'],
            "type": row['data_type'],
            "nullable": row['is_nullable'] == 'YES',
            "default": row['column_default']
        })
    
    # Compter les lignes de chaque table
    for table in schema.keys():
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            schema[table]["row_count"] = cur.fetchone()[0]
        except:
            schema[table]["row_count"] = 0
    
    return {"schema": schema}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8082, reload=True)