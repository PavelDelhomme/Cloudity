import json
import os
import shutil
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import Tenant, User
from schemas import (
    ContainerPerformanceSample,
    DashboardStats,
    HostPerformanceSample,
    PerformanceOverview,
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


@router.get("/performance/overview", response_model=PerformanceOverview)
async def get_performance_overview():
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
