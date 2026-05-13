"""Schémas Pydantic (entrées / sorties API)."""
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TenantBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    domain: str = Field(..., min_length=1, max_length=255)
    database_url: str
    is_active: bool = True
    config: Dict = {}


class TenantCreate(TenantBase):
    pass


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    database_url: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[Dict] = None


class TenantResponse(TenantBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: int
    tenant_id: int
    email: str
    is_2fa_enabled: bool
    is_active: bool
    role: str
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    email: Optional[str] = Field(None, min_length=3, max_length=255)
    is_active: Optional[bool] = None
    role: Optional[str] = Field(None, min_length=1, max_length=50)


class DashboardStats(BaseModel):
    active_tenants: int
    total_users: int
    api_calls_today: int


class ContainerPerformanceSample(BaseModel):
    name: str
    cpu_percent: float | None = None
    memory_usage_bytes: int | None = None
    memory_limit_bytes: int | None = None
    memory_percent: float | None = None
    net_io: str | None = None
    block_io: str | None = None
    pids: int | None = None


class HostPerformanceSample(BaseModel):
    loadavg_1m: float | None = None
    loadavg_5m: float | None = None
    loadavg_15m: float | None = None
    cgroup_cpu_usage_usec: int | None = None
    cgroup_cpu_user_usec: int | None = None
    cgroup_cpu_system_usec: int | None = None
    cgroup_memory_current_bytes: int | None = None
    cgroup_memory_peak_bytes: int | None = None
    cgroup_io_read_bytes: int | None = None
    cgroup_io_write_bytes: int | None = None


class PerformanceOverview(BaseModel):
    timestamp_utc: str
    source: str
    host: HostPerformanceSample
    containers: list[ContainerPerformanceSample] = []
    notes: list[str] = []


class PerformanceHistoryItem(BaseModel):
    id: int
    recorded_at: datetime
    source: str
    overview_timestamp_utc: str | None = None
    containers_count: int = 0


class PerformanceHistoryResponse(BaseModel):
    items: list[PerformanceHistoryItem]
    storage_ready: bool


class PerformanceSnapshotRecordResponse(BaseModel):
    id: int
    recorded_at: datetime


class PipelineRunIngest(BaseModel):
    pipeline_kind: str = Field(..., min_length=1, max_length=64)
    run_id: str | None = Field(None, max_length=256)
    success: bool | None = None
    duration_ms: int | None = Field(None, ge=0)
    cpu_pct_max: float | None = None
    mem_peak_mb: float | None = None
    meta: Dict = Field(default_factory=dict)


class PipelineRunItem(BaseModel):
    id: int
    recorded_at: datetime
    pipeline_kind: str
    run_id: str | None = None
    success: bool | None = None
    duration_ms: int | None = None
    cpu_pct_max: float | None = None
    mem_peak_mb: float | None = None
    meta: Dict = Field(default_factory=dict)


class PipelineRunsResponse(BaseModel):
    items: list[PipelineRunItem]
    storage_ready: bool


class PipelineRunCreatedResponse(BaseModel):
    id: int
    recorded_at: datetime


class BudgetViolation(BaseModel):
    key: str
    threshold: float | str
    observed: float | str
    message: str


class BudgetStatusResponse(BaseModel):
    evaluated_at: str
    source_snapshot: str
    violations: list[BudgetViolation]
    budgets: dict[str, float | str]


class CveVulnEntry(BaseModel):
    osv_id: str
    summary: str | None = None
    modified: str | None = None
    cve_aliases: list[str] = Field(default_factory=list)


class CveFinding(BaseModel):
    ecosystem: str
    package: str
    version: str
    vulns: list[CveVulnEntry]


class CveReportResponse(BaseModel):
    """Rapport agrégé OSV (aligné CVE) pour le panneau admin."""

    scanned_at: str
    source: str = "osv.dev"
    packages_scanned: int = 0
    packages_with_vulns: int = 0
    vuln_entries_total: int = 0
    findings: list[CveFinding] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    summary: Dict = Field(default_factory=dict)
    error: str | None = None
    from_cache: bool = False
    snapshot_id: int | None = None
