"""Tests route admin mail-accounts (lecture seule)."""

from datetime import datetime, timezone

from app.schemas import TenantMailAccountSummary


def test_tenant_mail_account_summary_schema():
    row = TenantMailAccountSummary(
        id=1,
        user_id=2,
        email="candidatures@example.com",
        label="Recrutement",
        alias_count=3,
        created_at=datetime.now(timezone.utc),
    )
    assert row.user_id == 2
    assert row.alias_count == 3
