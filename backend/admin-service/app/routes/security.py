"""API admin — analyse CVE / OSV (dépendances du dépôt monté en CVE_SCAN_REPO_ROOT)."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas import CveFinding, CveReportResponse, CveVulnEntry
from app.services.cve_scanner import build_report_payload

router = APIRouter(prefix="/admin", tags=["security"])


def _cache_hours() -> int:
    raw = os.getenv("CVE_SCAN_CACHE_HOURS", "24").strip()
    try:
        return max(1, min(int(raw), 168))
    except ValueError:
        return 24


def _table_ready(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1 FROM cloudity_cve_snapshots LIMIT 1")).first()
        return True
    except (ProgrammingError, OperationalError):
        db.rollback()
        return False


def _latest_fresh_snapshot(db: Session, max_age: timedelta) -> dict[str, Any] | None:
    if not _table_ready(db):
        return None
    try:
        row = db.execute(
            text(
                """
                SELECT id, recorded_at, source, package_count, vuln_count, summary, payload
                FROM cloudity_cve_snapshots
                WHERE recorded_at >= :since
                ORDER BY recorded_at DESC
                LIMIT 1
                """
            ),
            {"since": datetime.now(timezone.utc) - max_age},
        ).mappings().first()
    except (ProgrammingError, OperationalError):
        db.rollback()
        return None
    return dict(row) if row else None


def _findings_models(findings_raw: Any) -> list[CveFinding]:
    out: list[CveFinding] = []
    if not isinstance(findings_raw, list):
        return out
    for f in findings_raw:
        if not isinstance(f, dict):
            continue
        vulns: list[CveVulnEntry] = []
        for v in f.get("vulns") or []:
            if not isinstance(v, dict):
                continue
            vulns.append(
                CveVulnEntry(
                    osv_id=str(v.get("osv_id", "")),
                    summary=v.get("summary") if isinstance(v.get("summary"), str) else None,
                    details=v.get("details") if isinstance(v.get("details"), str) else None,
                    modified=v.get("modified") if isinstance(v.get("modified"), str) else None,
                    aliases=[str(x) for x in (v.get("aliases") or []) if isinstance(x, str)],
                    cve_aliases=[str(x) for x in (v.get("cve_aliases") or []) if isinstance(x, str)],
                    severity=v.get("severity") if isinstance(v.get("severity"), str) else None,
                    fixed_versions=[str(x) for x in (v.get("fixed_versions") or []) if isinstance(x, str)],
                    affected_ranges=[str(x) for x in (v.get("affected_ranges") or []) if isinstance(x, str)],
                )
            )
        out.append(
            CveFinding(
                ecosystem=str(f.get("ecosystem", "")),
                package=str(f.get("package", "")),
                version=str(f.get("version", "")),
                vulns=vulns,
            )
        )
    return out


def _response_from_payload(
    payload: dict[str, Any],
    *,
    scanned_at: str,
    from_cache: bool,
    snapshot_id: int | None,
    row_package_count: int | None = None,
    row_vuln_count: int | None = None,
) -> CveReportResponse:
    findings = _findings_models(payload.get("findings"))
    pkg_scanned = row_package_count if row_package_count is not None else int(payload.get("packages_scanned", 0))
    vuln_total = row_vuln_count if row_vuln_count is not None else int(payload.get("vuln_entries_total", 0))
    summ = payload.get("summary")
    if not isinstance(summ, dict):
        summ = {}
    notes = [str(x) for x in (payload.get("notes") or []) if isinstance(x, str)]
    err = payload.get("error") if isinstance(payload.get("error"), str) else None
    manifests = payload.get("manifests") if isinstance(payload.get("manifests"), dict) else {}
    ecosystem_package_counts = (
        payload.get("ecosystem_package_counts") if isinstance(payload.get("ecosystem_package_counts"), dict) else {}
    )
    return CveReportResponse(
        scanned_at=scanned_at,
        source=str(payload.get("source", "osv.dev")),
        packages_scanned=pkg_scanned,
        packages_with_vulns=int(payload.get("packages_with_vulns", len(findings))),
        vuln_entries_total=vuln_total,
        findings=findings,
        notes=notes,
        summary=summ,
        manifests=manifests,
        ecosystem_package_counts=ecosystem_package_counts,
        error=err,
        from_cache=from_cache,
        snapshot_id=snapshot_id,
    )


def _save_snapshot(db: Session, payload: dict[str, Any]) -> int:
    pkg_n = int(payload.get("packages_scanned", 0))
    vuln_n = int(payload.get("vuln_entries_total", 0))
    summ = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    row = db.execute(
        text(
            """
            INSERT INTO cloudity_cve_snapshots (source, package_count, vuln_count, summary, payload)
            VALUES (:source, :pc, :vc, CAST(:summary AS jsonb), CAST(:payload AS jsonb))
            RETURNING id
            """
        ),
        {
            "source": str(payload.get("source", "osv.dev"))[:255],
            "pc": pkg_n,
            "vc": vuln_n,
            "summary": json.dumps(summ),
            "payload": json.dumps(payload),
        },
    ).one()
    db.commit()
    return int(row[0])


@router.get("/security/cve-report", response_model=CveReportResponse)
async def get_cve_report(
    refresh: bool = Query(False, description="Forcer un scan OSV (ignore le cache DB récent)."),
    db: Session = Depends(get_db),
):
    max_age = timedelta(hours=_cache_hours())
    if not refresh:
        snap = _latest_fresh_snapshot(db, max_age)
        if snap:
            pl = snap["payload"]
            if isinstance(pl, str):
                pl = json.loads(pl)
            if not isinstance(pl, dict):
                pl = {}
            scanned = snap["recorded_at"]
            scanned_at = scanned.isoformat() if hasattr(scanned, "isoformat") else str(scanned)
            merged = {**pl, "packages_scanned": snap.get("package_count", pl.get("packages_scanned"))}
            return _response_from_payload(
                merged,
                scanned_at=scanned_at,
                from_cache=True,
                snapshot_id=int(snap["id"]),
                row_package_count=int(snap["package_count"] or 0),
                row_vuln_count=int(snap["vuln_count"] or 0),
            )

    payload = build_report_payload()
    now_iso = datetime.now(timezone.utc).isoformat()
    payload["scanned_at"] = now_iso
    payload["packages_with_vulns"] = len(payload.get("findings", []))

    snap_id: int | None = None
    if _table_ready(db):
        try:
            snap_id = _save_snapshot(db, payload)
        except Exception:
            db.rollback()

    return _response_from_payload(payload, scanned_at=now_iso, from_cache=False, snapshot_id=snap_id)


@router.post("/security/cve-report/refresh", response_model=CveReportResponse)
async def post_cve_report_refresh(db: Session = Depends(get_db)):
    return await get_cve_report(refresh=True, db=db)
