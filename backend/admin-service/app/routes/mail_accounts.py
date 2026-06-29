"""Vue admin : boîtes mail liées (user_email_accounts) — distinctes des comptes de connexion."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas import TenantMailAccountSummary

router = APIRouter(prefix="/admin", tags=["mail-accounts"])


@router.get(
    "/tenants/{tenant_id}/mail-accounts",
    response_model=List[TenantMailAccountSummary],
)
async def list_tenant_mail_accounts(tenant_id: int, db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT
                uea.id,
                uea.user_id,
                uea.email,
                uea.label,
                uea.created_at,
                (SELECT COUNT(*)::int FROM user_email_aliases mua WHERE mua.account_id = uea.id) AS alias_count
            FROM user_email_accounts uea
            WHERE uea.tenant_id = :tenant_id
            ORDER BY uea.user_id ASC, lower(uea.email) ASC
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()
    return [TenantMailAccountSummary(**dict(r)) for r in rows]
