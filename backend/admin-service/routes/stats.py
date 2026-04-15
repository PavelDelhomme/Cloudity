from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import Tenant, User
from schemas import DashboardStats

router = APIRouter(prefix="/admin", tags=["stats"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: Session = Depends(get_db)):
    active_tenants = db.query(Tenant).filter(Tenant.is_active == True).count()
    total_users = db.query(User).count()
    try:
        row = db.execute(
            text(
                "SELECT COUNT(*) AS n FROM audit_logs WHERE (created_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date"
            )
        ).fetchone()
        api_calls_today = row[0] if row else 0
    except Exception:
        api_calls_today = 0
    return DashboardStats(
        active_tenants=active_tenants,
        total_users=total_users,
        api_calls_today=api_calls_today,
    )
