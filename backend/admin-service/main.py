from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras
import os
from datetime import datetime
from typing import List, Dict, Optional
from pydantic import BaseModel
import uvicorn

app = FastAPI(
    title="Cloudity Admin Service",
    description="Multi-tenant administration API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
def get_db():
    conn = psycopg2.connect(
        os.getenv("DATABASE_URL"),
        cursor_factory=psycopg2.extras.RealDictCursor
    )
    try:
        yield conn
    finally:
        conn.close()

# Pydantic models
class TenantResponse(BaseModel):
    id: str
    name: str
    subdomain: Optional[str]
    status: str
    max_users: int
    max_storage_gb: int
    created_at: Optional[str]

class UserResponse(BaseModel):
    id: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    role: str
    is_active: bool
    tenant_name: str
    created_at: Optional[str]

class CreateTenantRequest(BaseModel):
    name: str
    subdomain: str
    max_users: int = 10
    max_storage_gb: int = 100

class CreateUserRequest(BaseModel):
    tenant_id: str
    email: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: str = "user"

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "admin-service",
        "timestamp": datetime.utcnow().isoformat()
    }

# Tenants endpoints
@app.get("/api/v1/admin/tenants", response_model=List[TenantResponse])
async def get_tenants(db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("""
        SELECT id, name, subdomain, status, max_users, max_storage_gb, created_at 
        FROM tenants 
        ORDER BY created_at DESC
    """)
    tenants = []
    for row in cur.fetchall():
        tenants.append(TenantResponse(
            id=str(row['id']),
            name=row['name'],
            subdomain=row['subdomain'],
            status=row['status'],
            max_users=row['max_users'],
            max_storage_gb=row['max_storage_gb'],
            created_at=row['created_at'].isoformat() if row['created_at'] else None
        ))
    return tenants

@app.post("/api/v1/admin/tenants")
async def create_tenant(tenant: CreateTenantRequest, db=Depends(get_db)):
    cur = db.cursor()
    try:
        cur.execute("""
            INSERT INTO tenants (name, subdomain, max_users, max_storage_gb, status)
            VALUES (%s, %s, %s, %s, 'active')
            RETURNING id, name, subdomain, status, max_users, max_storage_gb, created_at
        """, (tenant.name, tenant.subdomain, tenant.max_users, tenant.max_storage_gb))
        
        result = cur.fetchone()
        db.commit()
        
        return {
            "id": str(result['id']),
            "name": result['name'],
            "subdomain": result['subdomain'],
            "status": result['status'],
            "max_users": result['max_users'],
            "max_storage_gb": result['max_storage_gb'],
            "created_at": result['created_at'].isoformat()
        }
    except psycopg2.Error as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")

# Users endpoints
@app.get("/api/v1/admin/users", response_model=List[UserResponse])
async def get_users(db=Depends(get_db)):
    cur = db.cursor()
    cur.execute("""
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, 
               u.is_active, u.created_at, t.name as tenant_name
        FROM users u 
        JOIN tenants t ON u.tenant_id = t.id 
        ORDER BY u.created_at DESC
    """)
    users = []
    for row in cur.fetchall():
        users.append(UserResponse(
            id=str(row['id']),
            email=row['email'],
            first_name=row['first_name'],
            last_name=row['last_name'],
            role=row['role'],
            is_active=row['is_active'],
            tenant_name=row['tenant_name'],
            created_at=row['created_at'].isoformat() if row['created_at'] else None
        ))
    return users

@app.post("/api/v1/admin/users")
async def create_user(user: CreateUserRequest, db=Depends(get_db)):
    import bcrypt
    
    cur = db.cursor()
    try:
        # Hash password
        hashed_password = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        cur.execute("""
            INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, true)
            RETURNING id, email, first_name, last_name, role, is_active, created_at
        """, (user.tenant_id, user.email, hashed_password, user.first_name, user.last_name, user.role))
        
        result = cur.fetchone()
        db.commit()
        
        return {
            "id": str(result['id']),
            "email": result['email'],
            "first_name": result['first_name'],
            "last_name": result['last_name'],
            "role": result['role'],
            "is_active": result['is_active'],
            "created_at": result['created_at'].isoformat()
        }
    except psycopg2.Error as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")

# Services status endpoint
@app.get("/api/v1/admin/services")
async def get_services_status():
    import requests
    
    services = [
        {"name": "auth-service", "url": "http://auth-service:8081/health", "port": 8081},
        {"name": "api-gateway", "url": "http://api-gateway:8000/health", "port": 8000},
        {"name": "admin-service", "url": "http://localhost:8082/health", "port": 8082},
    ]
    
    status_list = []
    for service in services:
        try:
            response = requests.get(service["url"], timeout=2)
            status = "healthy" if response.status_code == 200 else "unhealthy"
        except:
            status = "offline"
        
        status_list.append({
            "name": service["name"],
            "status": status,
            "port": service["port"],
            "url": f"http://localhost:{service['port']}"
        })
    
    return {"services": status_list}

# Services Control Endpoints
@app.post("/api/v1/admin/services/{service_name}/{action}")
async def control_service(service_name: str, action: str):
    """Start/Stop/Restart Docker services"""
    import subprocess
    
    allowed_actions = ['start', 'stop', 'restart']
    allowed_services = ['auth-service', 'api-gateway', 'admin-service']
    
    if action not in allowed_actions or service_name not in allowed_services:
        raise HTTPException(status_code=400, detail="Invalid action or service")
    
    try:
        if action == 'restart':
            subprocess.run(['docker', 'compose', 'restart', service_name], check=True)
        elif action == 'stop':
            subprocess.run(['docker', 'compose', 'stop', service_name], check=True)
        elif action == 'start':
            subprocess.run(['docker', 'compose', 'start', service_name], check=True)
            
        return {"message": f"Service {service_name} {action} successful"}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to {action} service: {str(e)}")

# Database Management
@app.get("/api/v1/admin/database/tables")
async def get_database_tables(db=Depends(get_db)):
    """Liste toutes les tables de la base"""
    cur = db.cursor()
    cur.execute("""
        SELECT table_name, table_rows, data_length 
        FROM information_schema.tables 
        WHERE table_schema = 'cloudity'
    """)
    
    tables = []
    for row in cur.fetchall():
        tables.append({
            "name": row,
            "rows": row,
            "size": row
        })
    
    return {"tables": tables}

@app.get("/api/v1/admin/database/query")
async def execute_query(query: str, db=Depends(get_db)):
    """Exécuter une requête SQL"""
    if not query.upper().startswith('SELECT'):
        raise HTTPException(status_code=400, detail="Only SELECT queries allowed")
    
    cur = db.cursor()
    try:
        cur.execute(query)
        results = cur.fetchall()
        columns = [desc for desc in cur.description]
        
        return {
            "columns": columns,
            "rows": results
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Logs en temps réel
@app.get("/api/v1/admin/logs/{service_name}")
async def get_service_logs(service_name: str, lines: int = 100):
    """Récupérer les logs d'un service"""
    import subprocess
    
    try:
        result = subprocess.run(
            ['docker', 'logs', f'cloudity-{service_name}', '--tail', str(lines)],
            capture_output=True, text=True, check=True
        )
        
        return {
            "service": service_name,
            "logs": result.stdout.split('\n')
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8082, reload=True)