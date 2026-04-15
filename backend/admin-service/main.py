"""Point d'entrée FastAPI — enregistre les routers et crée les tables si besoin."""
import uvicorn
from fastapi import FastAPI

from database import engine
from models import Base, Tenant, User  # noqa: F401 — enregistre les modèles sur Base.metadata
from routes import health, stats, tenants, users

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Cloudity Admin Service",
    description="Multi-tenant administration API",
    version="1.0.0",
)
# CORS géré par l'api-gateway uniquement (éviter doublon Access-Control-Allow-Origin)

app.include_router(health.router)
app.include_router(tenants.router)
app.include_router(users.router)
app.include_router(stats.router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8082, reload=True)
