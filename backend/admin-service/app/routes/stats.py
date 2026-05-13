import json
import os
import shutil
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Tenant, User
from app.schemas import (
    BudgetStatusResponse,
    BudgetViolation,
    ContainerPerformanceSample,
    DashboardStats,
    HostPerformanceSample,
    PerformanceHistoryItem,
    PerformanceHistoryResponse,
    PerformanceOverview,
    PerformanceSnapshotRecordResponse,
    PipelineRunCreatedResponse,
    PipelineRunIngest,
    PipelineRunItem,
    PipelineRunsResponse,
)

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


def _read_text(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return None


def _read_int(path: str) -> int | None:
    raw = _read_text(path)
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _read_cgroup_cpu_stat() -> tuple[int | None, int | None, int | None]:
    usage = user = system = None
    raw = _read_text("/sys/fs/cgroup/cpu.stat")
    if not raw:
        return usage, user, system
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        k, v = parts
        try:
            n = int(v)
        except ValueError:
            continue
        if k == "usage_usec":
            usage = n
        elif k == "user_usec":
            user = n
        elif k == "system_usec":
            system = n
    return usage, user, system


def _read_cgroup_io_stat() -> tuple[int | None, int | None]:
    read_b = 0
    write_b = 0
    found = False
    raw = _read_text("/sys/fs/cgroup/io.stat")
    if not raw:
        return None, None
    for line in raw.splitlines():
        for token in line.split():
            if token.startswith("rbytes="):
                found = True
                try:
                    read_b += int(token.split("=", 1)[1])
                except ValueError:
                    pass
            elif token.startswith("wbytes="):
                found = True
                try:
                    write_b += int(token.split("=", 1)[1])
                except ValueError:
                    pass
    if not found:
        return None, None
    return read_b, write_b


def _collect_host_sample() -> HostPerformanceSample:
    la1 = la5 = la15 = None
    try:
        la1, la5, la15 = os.getloadavg()
    except Exception:
        pass
    usage, user, system = _read_cgroup_cpu_stat()
    io_r, io_w = _read_cgroup_io_stat()
    return HostPerformanceSample(
        loadavg_1m=la1,
        loadavg_5m=la5,
        loadavg_15m=la15,
        cgroup_cpu_usage_usec=usage,
        cgroup_cpu_user_usec=user,
        cgroup_cpu_system_usec=system,
        cgroup_memory_current_bytes=_read_int("/sys/fs/cgroup/memory.current"),
        cgroup_memory_peak_bytes=_read_int("/sys/fs/cgroup/memory.peak"),
        cgroup_io_read_bytes=io_r,
        cgroup_io_write_bytes=io_w,
    )


def _parse_docker_stats_json_lines(raw: str) -> list[ContainerPerformanceSample]:
    items: list[ContainerPerformanceSample] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        cpu_percent = None
        memory_percent = None
        for key in ("CPUPerc", "CPU", "CPUPERCENT", "cpu_percent"):
            if key in row:
                v = str(row[key]).replace("%", "").strip()
                try:
                    cpu_percent = float(v)
                except ValueError:
                    pass
                break
        for key in ("MemPerc", "MemoryPerc", "mem_percent"):
            if key in row:
                v = str(row[key]).replace("%", "").strip()
                try:
                    memory_percent = float(v)
                except ValueError:
                    pass
                break
        pids = None
        if "PIDs" in row:
            try:
                pids = int(str(row["PIDs"]).strip())
            except ValueError:
                pass
        items.append(
            ContainerPerformanceSample(
                name=str(row.get("Name") or row.get("Container") or row.get("ID") or "unknown"),
                cpu_percent=cpu_percent,
                memory_percent=memory_percent,
                net_io=str(row.get("NetIO") or row.get("Net I/O") or ""),
                block_io=str(row.get("BlockIO") or row.get("Block I/O") or ""),
                pids=pids,
            )
        )
    return items


def build_performance_overview() -> PerformanceOverview:
    notes: list[str] = []
    containers: list[ContainerPerformanceSample] = []
    source = "cgroup"
    host = _collect_host_sample()

    docker_bin = shutil.which("docker")
    if docker_bin:
        try:
            cmd = [
                docker_bin,
                "stats",
                "--no-stream",
                "--format",
                "{{ json . }}",
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=8, check=False)
            if proc.returncode == 0 and proc.stdout.strip():
                containers = _parse_docker_stats_json_lines(proc.stdout)
                source = "docker+ cgroup"
            else:
                notes.append("docker stats indisponible (code non nul ou sortie vide)")
        except Exception as exc:
            notes.append(f"docker stats erreur: {exc}")
    else:
        notes.append("binaire docker non disponible dans ce runtime")

    if not containers:
        notes.append("snapshot conteneurs vide: fallback sur métriques cgroup de ce service")

    return PerformanceOverview(
        timestamp_utc=datetime.now(timezone.utc).isoformat(),
        source=source,
        host=host,
        containers=containers,
        notes=notes,
    )


def _perf_storage_ready(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1 FROM cloudity_performance_snapshots LIMIT 1")).first()
        return True
    except (ProgrammingError, OperationalError):
        db.rollback()
        return False


def _env_float(name: str) -> float | None:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _overview_dict(overview: PerformanceOverview) -> dict:
    return overview.model_dump(mode="json")


def _fetch_latest_snapshot_payload(db: Session) -> dict | None:
    if not _perf_storage_ready(db):
        return None
    try:
        row = db.execute(
            text(
                "SELECT payload FROM cloudity_performance_snapshots ORDER BY recorded_at DESC LIMIT 1"
            )
        ).mappings().first()
    except (ProgrammingError, OperationalError):
        db.rollback()
        return None
    if not row:
        return None
    p = row["payload"]
    if isinstance(p, dict):
        return p
    if isinstance(p, str):
        try:
            return json.loads(p)
        except json.JSONDecodeError:
            return None
    return None


def _evaluate_budgets(overview: PerformanceOverview) -> tuple[list[BudgetViolation], dict[str, float | str]]:
    violations: list[BudgetViolation] = []
    budgets: dict[str, float | str] = {}
    d = _overview_dict(overview)
    host = d.get("host") or {}
    containers = d.get("containers") or []

    thr = _env_float("PERF_BUDGET_LOADAVG_1M")
    if thr is not None:
        budgets["PERF_BUDGET_LOADAVG_1M"] = thr
        la = host.get("loadavg_1m")
        if la is not None and float(la) > thr:
            violations.append(
                BudgetViolation(
                    key="loadavg_1m",
                    threshold=thr,
                    observed=float(la),
                    message=f"Charge 1m ({la}) dépasse le budget ({thr})",
                )
            )

    thr_mem = _env_float("PERF_BUDGET_MEMORY_MB")
    if thr_mem is not None:
        budgets["PERF_BUDGET_MEMORY_MB"] = thr_mem
        cur = host.get("cgroup_memory_current_bytes")
        if cur is not None:
            mb = float(cur) / (1024 * 1024)
            if mb > thr_mem:
                violations.append(
                    BudgetViolation(
                        key="cgroup_memory_mb",
                        threshold=thr_mem,
                        observed=round(mb, 2),
                        message=f"Mémoire cgroup ({mb:.1f} MiB) dépasse le budget ({thr_mem} MiB)",
                    )
                )

    thr_cpu = _env_float("PERF_BUDGET_CONTAINER_CPU_PCT")
    if thr_cpu is not None:
        budgets["PERF_BUDGET_CONTAINER_CPU_PCT"] = thr_cpu
        max_cpu: float | None = None
        max_name = ""
        for c in containers:
            cpu = c.get("cpu_percent") if isinstance(c, dict) else None
            if cpu is None:
                continue
            try:
                v = float(cpu)
            except (TypeError, ValueError):
                continue
            if max_cpu is None or v > max_cpu:
                max_cpu = v
                max_name = str(c.get("name") or "?")
        if max_cpu is not None and max_cpu > thr_cpu:
            violations.append(
                BudgetViolation(
                    key="container_cpu_max",
                    threshold=thr_cpu,
                    observed=max_cpu,
                    message=f"CPU conteneur max ({max_name}: {max_cpu}%) dépasse le budget ({thr_cpu}%)",
                )
            )

    thr_io = _env_float("PERF_BUDGET_IO_READ_MB")
    if thr_io is not None:
        budgets["PERF_BUDGET_IO_READ_MB"] = thr_io
        rbytes = host.get("cgroup_io_read_bytes")
        if rbytes is not None:
            mb = float(rbytes) / (1024 * 1024)
            if mb > thr_io:
                violations.append(
                    BudgetViolation(
                        key="cgroup_io_read_mb",
                        threshold=thr_io,
                        observed=round(mb, 2),
                        message=f"IO lecture cgroup ({mb:.1f} MiB) dépasse le budget ({thr_io} MiB)",
                    )
                )

    thr_iow = _env_float("PERF_BUDGET_IO_WRITE_MB")
    if thr_iow is not None:
        budgets["PERF_BUDGET_IO_WRITE_MB"] = thr_iow
        wbytes = host.get("cgroup_io_write_bytes")
        if wbytes is not None:
            mb = float(wbytes) / (1024 * 1024)
            if mb > thr_iow:
                violations.append(
                    BudgetViolation(
                        key="cgroup_io_write_mb",
                        threshold=thr_iow,
                        observed=round(mb, 2),
                        message=f"IO écriture cgroup ({mb:.1f} MiB) dépasse le budget ({thr_iow} MiB)",
                    )
                )

    return violations, budgets


async def require_perf_ingest_token(
    x_cloudity_perf_ingest: str | None = Header(default=None, alias="X-Cloudity-Perf-Ingest"),
) -> None:
    expected = os.getenv("PERFORMANCE_INGEST_TOKEN", "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="PERFORMANCE_INGEST_TOKEN non configuré sur admin-service (ingestion performance désactivée)",
        )
    if not x_cloudity_perf_ingest or x_cloudity_perf_ingest != expected:
        raise HTTPException(
            status_code=401,
            detail="Jeton d'ingestion performance manquant ou invalide (X-Cloudity-Perf-Ingest)",
        )


@router.get("/performance/overview", response_model=PerformanceOverview)
async def get_performance_overview():
    return build_performance_overview()


@router.post("/performance/record", response_model=PerformanceSnapshotRecordResponse)
async def post_performance_record(db: Session = Depends(get_db)):
    if not _perf_storage_ready(db):
        raise HTTPException(
            status_code=503,
            detail="Tables performance absentes — lancer db-migrate (migration 33-cloudity-performance-metrics.sql)",
        )
    overview = build_performance_overview()
    payload_json = json.dumps(_overview_dict(overview))
    try:
        row = db.execute(
            text(
                """
                INSERT INTO cloudity_performance_snapshots (source, payload)
                VALUES (:source, CAST(:payload AS jsonb))
                RETURNING id, recorded_at
                """
            ),
            {"source": overview.source, "payload": payload_json},
        ).one()
        db.commit()
    except (ProgrammingError, OperationalError) as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Enregistrement snapshot impossible: {exc}") from exc
    return PerformanceSnapshotRecordResponse(id=int(row[0]), recorded_at=row[1])


@router.get("/performance/history", response_model=PerformanceHistoryResponse)
async def get_performance_history(
    db: Session = Depends(get_db),
    limit: int = Query(default=24, ge=1, le=200),
):
    if not _perf_storage_ready(db):
        return PerformanceHistoryResponse(items=[], storage_ready=False)
    try:
        rows = db.execute(
            text(
                """
                SELECT id, recorded_at, source, payload
                FROM cloudity_performance_snapshots
                ORDER BY recorded_at DESC
                LIMIT :lim
                """
            ),
            {"lim": limit},
        ).mappings().all()
    except (ProgrammingError, OperationalError):
        db.rollback()
        return PerformanceHistoryResponse(items=[], storage_ready=False)

    items: list[PerformanceHistoryItem] = []
    for r in rows:
        pl = r["payload"]
        if isinstance(pl, str):
            try:
                pl = json.loads(pl)
            except json.JSONDecodeError:
                pl = {}
        elif not isinstance(pl, dict):
            pl = {}
        ts = pl.get("timestamp_utc")
        cont = pl.get("containers") or []
        cnt = len(cont) if isinstance(cont, list) else 0
        items.append(
            PerformanceHistoryItem(
                id=int(r["id"]),
                recorded_at=r["recorded_at"],
                source=str(r["source"]),
                overview_timestamp_utc=str(ts) if ts else None,
                containers_count=cnt,
            )
        )
    return PerformanceHistoryResponse(items=items, storage_ready=True)


@router.post(
    "/performance/pipeline-run",
    response_model=PipelineRunCreatedResponse,
    dependencies=[Depends(require_perf_ingest_token)],
)
async def post_pipeline_run(body: PipelineRunIngest, db: Session = Depends(get_db)):
    if not _perf_storage_ready(db):
        raise HTTPException(
            status_code=503,
            detail="Tables performance absentes — lancer db-migrate",
        )
    meta_json = json.dumps(body.meta or {})
    try:
        row = db.execute(
            text(
                """
                INSERT INTO cloudity_performance_pipeline_runs
                    (pipeline_kind, run_id, success, duration_ms, cpu_pct_max, mem_peak_mb, meta)
                VALUES
                    (:pipeline_kind, :run_id, :success, :duration_ms, :cpu_pct_max, :mem_peak_mb, CAST(:meta AS jsonb))
                RETURNING id, recorded_at
                """
            ),
            {
                "pipeline_kind": body.pipeline_kind,
                "run_id": body.run_id,
                "success": body.success,
                "duration_ms": body.duration_ms,
                "cpu_pct_max": body.cpu_pct_max,
                "mem_peak_mb": body.mem_peak_mb,
                "meta": meta_json,
            },
        ).one()
        db.commit()
    except (ProgrammingError, OperationalError) as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Ingestion pipeline impossible: {exc}") from exc
    return PipelineRunCreatedResponse(id=int(row[0]), recorded_at=row[1])


@router.get("/performance/pipeline-runs", response_model=PipelineRunsResponse)
async def get_pipeline_runs(
    db: Session = Depends(get_db),
    limit: int = Query(default=40, ge=1, le=200),
):
    if not _perf_storage_ready(db):
        return PipelineRunsResponse(items=[], storage_ready=False)
    try:
        rows = db.execute(
            text(
                """
                SELECT id, recorded_at, pipeline_kind, run_id, success, duration_ms,
                       cpu_pct_max, mem_peak_mb, meta
                FROM cloudity_performance_pipeline_runs
                ORDER BY recorded_at DESC
                LIMIT :lim
                """
            ),
            {"lim": limit},
        ).mappings().all()
    except (ProgrammingError, OperationalError):
        db.rollback()
        return PipelineRunsResponse(items=[], storage_ready=False)

    items: list[PipelineRunItem] = []
    for r in rows:
        meta = r["meta"]
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except json.JSONDecodeError:
                meta = {}
        elif meta is None:
            meta = {}
        elif not isinstance(meta, dict):
            meta = {}
        items.append(
            PipelineRunItem(
                id=int(r["id"]),
                recorded_at=r["recorded_at"],
                pipeline_kind=str(r["pipeline_kind"]),
                run_id=r["run_id"],
                success=r["success"],
                duration_ms=r["duration_ms"],
                cpu_pct_max=float(r["cpu_pct_max"]) if r["cpu_pct_max"] is not None else None,
                mem_peak_mb=float(r["mem_peak_mb"]) if r["mem_peak_mb"] is not None else None,
                meta=meta,
            )
        )
    return PipelineRunsResponse(items=items, storage_ready=True)


@router.get("/performance/budget-status", response_model=BudgetStatusResponse)
async def get_performance_budget_status(db: Session = Depends(get_db)):
    evaluated = datetime.now(timezone.utc).isoformat()
    snap_label = "live"
    overview: PerformanceOverview | None = None
    payload = _fetch_latest_snapshot_payload(db)
    if payload:
        try:
            overview = PerformanceOverview.model_validate(payload)
            snap_row = db.execute(
                text("SELECT id FROM cloudity_performance_snapshots ORDER BY recorded_at DESC LIMIT 1")
            ).first()
            if snap_row:
                snap_label = f"db:{snap_row[0]}"
        except Exception:
            overview = None
    if overview is None:
        overview = build_performance_overview()
        snap_label = "live"

    violations, budgets = _evaluate_budgets(overview)
    return BudgetStatusResponse(
        evaluated_at=evaluated,
        source_snapshot=snap_label,
        violations=violations,
        budgets=budgets,
    )
